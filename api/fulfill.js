// Stripe webhook -> Printful fulfilment.
// When a checkout is paid, we re-fetch the session from Stripe (with the secret key, so forged
// webhooks can't pass), look up the stored order in KV, build the recipient from Stripe's
// shipping details, and create a Printful order. Draft by default so the operator confirms in
// Printful; set PRINTFUL_AUTO_CONFIRM=true to auto-confirm. Idempotent per order.
//
// OPERATOR SETUP:
//   Vercel env: PRINTFUL_TOKEN, STRIPE_SECRET_KEY  (optional: PRINTFUL_STORE_ID,
//               PRINTFUL_AUTO_CONFIRM=true, PRINTFUL_VARIANT_MAP as JSON)
//   Stripe: add a webhook endpoint -> https://4o4apparel.com/api/fulfill  for the event
//           "checkout.session.completed".
//   Variant map: run GET /api/printful-variants to list your sync variant ids, then fill
//   VARIANT_MAP below (or set PRINTFUL_VARIANT_MAP env) as  "productId|SIZE" -> sync_variant_id.

// "productId|SIZE" -> Printful sync_variant_id  (fill from /api/printful-variants)
const VARIANT_MAP = {
  // "sleep|S": 0, "sleep|M": 0, "sleep|L": 0, "sleep|XL": 0, "sleep|2XL": 0, "sleep|3XL": 0,
};

function variantMap() {
  if (process.env.PRINTFUL_VARIANT_MAP) {
    try { return JSON.parse(process.env.PRINTFUL_VARIANT_MAP); } catch (e) {}
  }
  return VARIANT_MAP;
}

function kvConfig() { return { url: process.env.KV_REST_API_URL || "", token: process.env.KV_REST_API_TOKEN || "" }; }
function kvReady() { const c = kvConfig(); return Boolean(c.url && c.token); }
async function kvPipeline(commands) {
  const c = kvConfig();
  const r = await fetch(c.url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error("KV pipeline " + r.status);
  return r.json();
}
async function getOrder(orderId) {
  if (!kvReady()) return null;
  const res = await kvPipeline([["GET", "insights:order:" + orderId]]);
  const raw = res && res[0] && res[0].result;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
async function saveOrder(order) {
  if (!kvReady()) return;
  await kvPipeline([["SET", "insights:order:" + order.id, JSON.stringify(order), "EX", "2592000"]]);
}

async function getStripeSession(sessionId) {
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + sessionId, {
    headers: { Authorization: "Bearer " + process.env.STRIPE_SECRET_KEY }
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || "stripe_retrieve_error");
  return data;
}

async function createPrintfulOrder(recipient, items) {
  const confirm = String(process.env.PRINTFUL_AUTO_CONFIRM || "").toLowerCase() === "true" ? "1" : "0";
  const headers = { Authorization: "Bearer " + process.env.PRINTFUL_TOKEN, "Content-Type": "application/json" };
  if (process.env.PRINTFUL_STORE_ID) headers["X-PF-Store-Id"] = process.env.PRINTFUL_STORE_ID;
  const r = await fetch("https://api.printful.com/orders?confirm=" + confirm, {
    method: "POST", headers, body: JSON.stringify({ recipient, items })
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || ("printful_error_" + r.status));
  return data.result;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "method_not_allowed" }); }
  const event = parseBody(req);
  const type = event && event.type;
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return res.status(200).json({ ok: true, ignored: type || "unknown" });
  }
  const sessionId = event.data && event.data.object && event.data.object.id;
  if (!sessionId) return res.status(200).json({ ok: true, error: "no_session_id" });

  let session, order;
  try {
    session = await getStripeSession(sessionId);          // transient errors -> 500 so Stripe retries
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }

  if (session.payment_status !== "paid") return res.status(200).json({ ok: true, skipped: "not_paid" });
  const orderId = (session.metadata && session.metadata.orderId) || session.client_reference_id;

  try { order = orderId ? await getOrder(orderId) : null; }
  catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  if (!order) return res.status(200).json({ ok: true, error: "order_not_found", orderId: orderId });
  if (order.status === "printful_submitted" || order.status === "fulfilled")
    return res.status(200).json({ ok: true, already: true });

  const ship = session.shipping_details || {};
  const cust = session.customer_details || {};
  const addr = ship.address || cust.address || {};
  const recipient = {
    name: ship.name || cust.name || "",
    email: cust.email || order.email || "",
    phone: cust.phone || "",
    address1: addr.line1 || "", address2: addr.line2 || "",
    city: addr.city || "", state_code: addr.state || "",
    country_code: addr.country || "", zip: addr.postal_code || ""
  };

  const map = variantMap();
  const pfItems = [], unmapped = [];
  (order.items || []).forEach((it) => {
    const svid = map[it.id + "|" + it.size];
    if (svid) pfItems.push({ sync_variant_id: Number(svid), quantity: Number(it.qty) || 1 });
    else unmapped.push(it.id + "|" + it.size);
  });

  order.paid = true;
  order.stripe_session = sessionId;

  if (!process.env.PRINTFUL_TOKEN || !pfItems.length) {
    order.status = "paid_awaiting_fulfilment";
    order.fulfilment_note = !process.env.PRINTFUL_TOKEN ? "PRINTFUL_TOKEN not set" : ("no mapped variants: " + unmapped.join(", "));
    try { await saveOrder(order); } catch (e) {}
    return res.status(200).json({ ok: true, fulfilled: false, reason: order.fulfilment_note, unmapped: unmapped });
  }

  try {
    const pf = await createPrintfulOrder(recipient, pfItems);
    order.status = "printful_submitted";
    order.printful_order_id = pf && pf.id;
    if (unmapped.length) order.unmapped = unmapped;
    await saveOrder(order);
    return res.status(200).json({ ok: true, fulfilled: true, printful_order_id: pf && pf.id, unmapped: unmapped });
  } catch (e) {
    order.status = "fulfilment_failed";
    order.fulfilment_note = e.message;
    try { await saveOrder(order); } catch (_) {}
    return res.status(200).json({ ok: false, fulfilled: false, error: e.message }); // logged for operator; no retry storm
  }
}
