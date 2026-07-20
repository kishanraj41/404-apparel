// Stores waitlist / newsletter emails in KV so they appear on the dashboard.
const SUBS_KEY = "insights:subscribers";
const SUBS_RECENT = "insights:subscribers-recent";

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

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "method_not_allowed" }); }
  const body = parseBody(req);
  const email = (body.email || "").trim().toLowerCase();
  if (!email || email.indexOf("@") < 1) return res.status(400).json({ ok: false, error: "invalid_email" });
  if (!kvReady()) return res.status(202).json({ ok: false, disabled: true });
  try {
    const rec = JSON.stringify({ email: email, source: body.source || "waitlist", timestamp: new Date().toISOString() });
    await kvPipeline([
      ["SADD", SUBS_KEY, email],
      ["LPUSH", SUBS_RECENT, rec],
      ["LTRIM", SUBS_RECENT, "0", "99"]
    ]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
