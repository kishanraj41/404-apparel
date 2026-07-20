const EVENTS_KEY = "insights:events";
const COUNTS_KEY = "insights:event-counts";
const PRODUCTS_KEY = "insights:product-counts";
const PAGES_KEY = "insights:path-counts";

function kvConfig() {
  return {
    url: process.env.KV_REST_API_URL || "",
    token: process.env.KV_REST_API_TOKEN || ""
  };
}

function isReady() {
  const cfg = kvConfig();
  return Boolean(cfg.url && cfg.token);
}

async function kvPipeline(commands) {
  const cfg = kvConfig();
  const response = await fetch(cfg.url + "/pipeline", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + cfg.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });
  if (!response.ok) {
    throw new Error("KV pipeline failed with status " + response.status);
  }
  return response.json();
}

function dayKey(prefix) {
  return prefix + ":" + new Date().toISOString().slice(0, 10);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isReady()) {
    return res.status(202).json({ ok: false, disabled: true, error: "missing_kv_env" });
  }

  try {
    const body = parseBody(req);
    const eventName = body.event || "unknown_event";
    const payload = {
      id: Math.random().toString(36).slice(2, 10),
      event: eventName,
      path: body.path || "/",
      params: body.params || {},
      visitorId: body.visitorId || "anon",
      referrer: body.referrer || "direct",
      timestamp: body.timestamp || new Date().toISOString(),
      country: req.headers["x-vercel-ip-country"] || "",
      city: req.headers["x-vercel-ip-city"] || "",
      userAgent: req.headers["user-agent"] || ""
    };
    const commands = [
      ["LPUSH", EVENTS_KEY, JSON.stringify(payload)],
      ["LTRIM", EVENTS_KEY, "0", "199"],
      ["HINCRBY", COUNTS_KEY, eventName, "1"],
      ["HINCRBY", PAGES_KEY, payload.path, "1"],
      ["SADD", dayKey("insights:visitors"), payload.visitorId],
      ["EXPIRE", dayKey("insights:visitors"), "604800"]
    ];
    if (payload.params.item_id) {
      commands.push(["HINCRBY", PRODUCTS_KEY, payload.params.item_id, "1"]);
    }
    await kvPipeline(commands);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}