## 404 Apparel

### Live insights dashboard

This repo includes a near real-time dashboard at `/dashboard.html`.

It shows:
- visitors today
- active visitors in the last 5 minutes
- recent event feed
- top clicked products
- top pages
- top event types

### Required Vercel setup

To make the live dashboard work, add a Vercel KV database and set these environment variables in your Vercel project:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

After setting them, redeploy the site.

### How it works

- the storefront posts events to `/api/track`
- events are stored in Vercel KV
- `/api/events` returns dashboard data
- `dashboard.html` polls every 2 seconds for updates


## Fulfilment (Stripe → Printful, no Shopify)

When a customer pays, Stripe calls **`/api/fulfill`**, which verifies the session with Stripe,
looks up the stored order, and creates a **Printful** order (a draft by default so the operator
confirms it). This is the whole custom fulfilment path — no Shopify.

**Operator setup (one time):**
1. In Vercel → Project → Settings → **Environment Variables**, add:
   - `STRIPE_SECRET_KEY` (already needed for checkout)
   - `PRINTFUL_TOKEN` — a private token from Printful → Settings → API
   - *(optional)* `PRINTFUL_STORE_ID` if the token can see multiple stores
   - *(optional)* `PRINTFUL_AUTO_CONFIRM=true` to auto-confirm+charge Printful instead of leaving a draft
2. In **Stripe** → Developers → Webhooks → **Add endpoint**:
   - URL: `https://4o4apparel.com/api/fulfill`
   - Event: **`checkout.session.completed`**
3. **Build the variant map** (maps each design+size to the Printful variant to print):
   - After your products exist in Printful and `PRINTFUL_TOKEN` is set, open
     `https://4o4apparel.com/api/printful-variants` — it lists every product's `sync_variant_id`.
   - Fill `VARIANT_MAP` in `api/fulfill.js` as `"productId|SIZE": sync_variant_id`
     (e.g. `"sleep|M": 123456789`), **or** set `PRINTFUL_VARIANT_MAP` env to that JSON.
   - `productId` = the design id in `products.js` (`sleep`, `motivation`, …); `SIZE` = `S…3XL`.
   - You can delete `api/printful-variants.js` once the map is built.

Until the token + map are in place, paid orders are safely recorded in KV as
`paid_awaiting_fulfilment` (visible on the dashboard) so nothing is lost — you can fulfil those
manually in Printful. Everything is idempotent (Stripe won't double-submit an order).
