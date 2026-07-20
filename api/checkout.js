// Creates a checkout: records the order intent in KV (so it shows on the dashboard)
// and, if STRIPE_SECRET_KEY is set, creates a Stripe Checkout Session and returns its URL.
// PAYMENT SETUP (your part): add STRIPE_SECRET_KEY in Vercel env vars, OR paste a
// Stripe Payment Link into CONFIG.STRIPE_PAYMENT_LINK in app.js. Nothing else needed.

const ORDERS_KEY = "insights:orders";
const COUNTS_KEY = "insights:event-counts";

function kvConfig() {
  return { url: process.env.KV_REST_API_URL || "", token: process.env.KV_REST_API_TOKEN || "" };
}
function kvReady() { const c = kvConfig(); return Boolean(c.url && c.token); }
async function kvPipeline(commands) {
  const c = kvConfig();
  const r = await fetch(c.url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + c.token, "Content-Type": "application/json" },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error("KV pipeline failed " + r.status);
  return r.json();
}
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return req.body;
}

async function createStripeSession(items, email, origin, orderId) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const p = new URLSearchParams();
  p.append("mode", "payment");
  if (orderId) { p.append("client_reference_id", orderId); p.append("metadata[orderId]", orderId); }
  p.append("success_url", origin + "/?checkout=success");
  p.append("cancel_url", origin + "/?checkout=cancel");
  if (email) p.append("customer_email", email);
  p.append("shipping_address_collection[allowed_countries][0]", "US");
  p.append("shipping_address_collection[allowed_countries][1]", "CA");
  p.append("shipping_address_collection[allowed_countries][2]", "GB");
  items.forEach((it, i) => {
    const label = it.name + (it.size ? " (" + it.size + " / " + it.color + ")" : "");
    p.append("line_items[" + i + "][price_data][currency]", "usd");
    p.append("line_items[" + i + "][price_data][product_data][name]", label);
    p.append("line_items[" + i + "][price_data][unit_amount]", String(Math.round(Number(it.price) * 100)));
    p.append("line_items[" + i + "][quantity]", String(Number(it.qty) || 1));
  });
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString()
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || "stripe_error");
  return data.url;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "method_not_allowed" }); }
  const body = parseBody(req);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return res.status(400).json({ ok: false, error: "empty_cart" });

  const orderId = "ord_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const total = items.reduce((s, i) => s + Number(i.price) * (Number(i.qty) || 1), 0);
  const order = {
    id: orderId, items: items, total: total, email: (body.email || "").toLowerCase(),
    visitorId: body.visitorId || "anon", status: "checkout_started",
    timestamp: new Date().toISOString(),
    country: req.headers["x-vercel-ip-country"] || ""
  };

  // record the order intent (best-effort — never blocks checkout)
  if (kvReady()) {
    try {
      await kvPipeline([
        ["LPUSH", ORDERS_KEY, JSON.stringify(order)],
        ["LTRIM", ORDERS_KEY, "0", "99"],
        ["SET", "insights:order:" + orderId, JSON.stringify(order), "EX", "2592000"],
        ["HINCRBY", COUNTS_KEY, "checkout_started", "1"]
      ]);
    } catch (e) {}
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const origin = proto + "://" + (req.headers["host"] || "");
  try {
    const url = await createStripeSession(items, order.email, origin, orderId);
    if (url) return res.status(200).json({ ok: true, orderId: orderId, url: url, configured: true });
    return res.status(200).json({ ok: true, orderId: orderId, configured: false, message: "payment_not_configured" });
  } catch (err) {
    return res.status(200).json({ ok: true, orderId: orderId, configured: false, error: err.message });
  }
}
