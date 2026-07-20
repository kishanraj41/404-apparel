const EVENTS_KEY = "insights:events";
const COUNTS_KEY = "insights:event-counts";
const PRODUCTS_KEY = "insights:product-counts";
const PAGES_KEY = "insights:path-counts";
const ORDERS_KEY = "insights:orders";
const SUBS_KEY = "insights:subscribers";
const SUBS_RECENT = "insights:subscribers-recent";

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

function parseHash(result) {
  if (!Array.isArray(result)) return [];
  const entries = [];
  for (let i = 0; i < result.length; i += 2) {
    entries.push({ key: result[i], value: Number(result[i + 1] || 0) });
  }
  return entries.sort((a, b) => b.value - a.value);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!isReady()) {
    return res.status(200).json({
      ok: true,
      enabled: false,
      setup: [
        "Create a Vercel KV database in the Vercel dashboard.",
        "Add KV_REST_API_URL and KV_REST_API_TOKEN as project environment variables.",
        "Redeploy the site so the live dashboard can read stored events."
      ]
    });
  }

  try {
    const [eventsRes, countsRes, productsRes, pagesRes, visitorsRes, ordersRes, subsRecentRes, subsCountRes] = await kvPipeline([
      ["LRANGE", EVENTS_KEY, "0", "49"],
      ["HGETALL", COUNTS_KEY],
      ["HGETALL", PRODUCTS_KEY],
      ["HGETALL", PAGES_KEY],
      ["SCARD", dayKey("insights:visitors")],
      ["LRANGE", ORDERS_KEY, "0", "9"],
      ["LRANGE", SUBS_RECENT, "0", "9"],
      ["SCARD", SUBS_KEY]
    ]);

    const events = Array.isArray(eventsRes.result)
      ? eventsRes.result.map((entry) => {
          try { return JSON.parse(entry); } catch (e) { return null; }
        }).filter(Boolean)
      : [];
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const activeNow = new Set(events.filter((event) => Date.parse(event.timestamp) >= fiveMinutesAgo).map((event) => event.visitorId)).size;

    const parseList = (r) => (r && Array.isArray(r.result)) ? r.result.map((e) => { try { return JSON.parse(e); } catch (_) { return null; } }).filter(Boolean) : [];
    const recentOrders = parseList(ordersRes);
    const subscribersRecent = parseList(subsRecentRes);
    const subscriberCount = Number(subsCountRes.result || 0);

    return res.status(200).json({
      ok: true,
      enabled: true,
      summary: {
        visitorsToday: Number(visitorsRes.result || 0),
        activeNow: activeNow,
        totalEventsTracked: parseHash(countsRes.result).reduce((sum, entry) => sum + entry.value, 0),
        orders: recentOrders.length,
        subscribers: subscriberCount
      },
      recentEvents: events,
      eventCounts: parseHash(countsRes.result).slice(0, 10),
      topProducts: parseHash(productsRes.result).slice(0, 10),
      topPages: parseHash(pagesRes.result).slice(0, 10),
      recentOrders: recentOrders,
      subscribers: { count: subscriberCount, recent: subscribersRecent },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ ok: false, enabled: true, error: error.message });
  }
}