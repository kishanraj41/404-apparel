// GET /api/printful-variants  -> lists your Printful store's sync products + variants so you can
// build the VARIANT_MAP in api/fulfill.js. Requires PRINTFUL_TOKEN. (Optional: PRINTFUL_STORE_ID.)
// It also returns a ready-to-paste "suggestedMap" keyed by size (you set the productId prefix).
function pfHeaders() {
  const h = { Authorization: "Bearer " + process.env.PRINTFUL_TOKEN };
  if (process.env.PRINTFUL_STORE_ID) h["X-PF-Store-Id"] = process.env.PRINTFUL_STORE_ID;
  return h;
}
async function pf(path) {
  const r = await fetch("https://api.printful.com" + path, { headers: pfHeaders() });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || ("printful_" + r.status));
  return data.result;
}

export default async function handler(req, res) {
  if (!process.env.PRINTFUL_TOKEN) return res.status(200).json({ ok: false, error: "PRINTFUL_TOKEN not set" });
  try {
    const products = await pf("/store/products");
    const out = [];
    for (const p of products) {
      const detail = await pf("/store/products/" + p.id);
      const variants = (detail.sync_variants || []).map((v) => ({
        sync_variant_id: v.id, name: v.name, size: v.size, color: v.color, sku: v.sku
      }));
      out.push({ sync_product_id: p.id, name: p.name, variants });
    }
    res.status(200).json({ ok: true, note: "Fill VARIANT_MAP in api/fulfill.js as \"productId|SIZE\": sync_variant_id", products: out });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
}
