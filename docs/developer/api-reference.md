# API Reference

## Authentication

Most endpoints use `requireShopifySessionOrDev` middleware. This middleware:
- In production: Loads the Shopify session from the database using the `shop` query parameter or `x-shopify-shop` header. Returns 401 if no valid session exists.
- In development: Falls back to `"default-shop"` if no shop parameter is provided, bypassing session validation.

Storefront and App Proxy endpoints use CORS (`origin: '*'`) and HMAC signature validation instead of session auth.

---

## Authentication Endpoints

### `GET /api/auth`

Initiates the Shopify OAuth flow.

| Field | Value |
|-------|-------|
| Auth | None |
| Query | `shop` (required) - Shopify store domain |
| Response | Redirects to Shopify OAuth consent screen |

### `GET /api/auth/callback`

Handles the OAuth callback from Shopify.

| Field | Value |
|-------|-------|
| Auth | None (Shopify provides HMAC) |
| Response | Stores session, registers webhooks, triggers product sync, redirects to `/?shop={shop}` |

---

## Shop

### `GET /api/shop`

Returns the authenticated shop identifier.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "shop": "mystore.myshopify.com" }` |

---

## Products

### `GET /api/products`

Returns all synced products for the authenticated shop.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `Product[]` |

### `GET /api/products/:id`

Returns a single product by internal ID.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Params | `id` - Internal product UUID |
| Response | `Product` or 404 |

---

## Sync

### `POST /api/sync/products`

Fetches products from Shopify Admin API and upserts them into the local database.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "success": true, "syncedCount": 42, "message": "..." }` |
| Notes | In dev mode without a Shopify session, returns `syncedCount: 0` with a helpful message |

---

## Recommendations

### `GET /api/recommendations`

Returns AI-generated recommendations for the authenticated shop.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Query | `status` (optional) - Filter by status: `"pending"`, `"dismissed"`, `"active"` |
| Response | `Recommendation[]` |

### `POST /api/recommendations/generate/:productId`

Generates 2-3 AI recommendations for a specific product.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Params | `productId` - Internal product UUID |
| Response | `Recommendation[]` (newly created) |
| Notes | Filters out recommendations for optimization types that already have active optimizations on this product |

### `POST /api/recommendations/generate-all`

Generates AI recommendations for all products in the store. Deletes existing pending recommendations before regenerating.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "message": "...", "count": 15 }` |

### `POST /api/recommendations/store-analysis`

Runs a comprehensive store-wide AI analysis. Scores all products using the recommendation engine, selects the top candidates, and generates batch recommendations via GPT-5-mini.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "message": "...", "recommendations": Recommendation[], "count": 10 }` |
| Notes | Uses the two-stage product selection algorithm (filter active → score → top N). Quota is reserved before AI call and rolled back on failure. |

### `POST /api/recommendations/product/:productId/generate`

Alternative endpoint for generating AI recommendations for a specific product with quota management.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Params | `productId` - Internal product UUID |
| Response | `Recommendation[]` |

### `GET /api/quota`

Returns the current AI recommendation quota status for the shop.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "quota": 20, "used": 5, "remaining": 15, "planTier": "basic", "resetDate": "..." }` |

### `PATCH /api/recommendations/:id`

Updates a recommendation (e.g., status change).

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Body | Partial recommendation fields |
| Response | Updated `Recommendation` |

### `POST /api/recommendations/:id/dismiss`

Dismisses a recommendation (sets `status: "dismissed"`, records `dismissedAt`).

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | Updated `Recommendation` |

### `GET /api/recommendations/archived`

Returns dismissed recommendations.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `Recommendation[]` (where status = "dismissed") |

### `POST /api/recommendations/:id/restore`

Restores a dismissed recommendation back to pending.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | Updated `Recommendation` |

---

## Optimizations

### `GET /api/optimizations`

Returns all optimizations for the authenticated shop.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `Optimization[]` |

### `GET /api/optimizations/:id`

Returns a single optimization with enriched metrics and Bayesian state.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | Optimization with `productName`, `metrics` (per-variant breakdown), `bayesianState` |

```json
{
  "id": "...",
  "productName": "Premium Snowboard",
  "metrics": {
    "control": {
      "impressions": 500,
      "conversions": 12,
      "revenue": 1200.00,
      "arpu": 100.00,
      "conversionRate": 2.4
    },
    "variant": { "..." }
  },
  "bayesianState": { "..." }
}
```

### `GET /api/optimizations/:id/evolution`

Returns evolution snapshots for charting optimization performance over time.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `OptimizationEvolutionSnapshot[]` |

### `POST /api/optimizations`

Creates a new optimization in draft status.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Body | `InsertOptimization` (validated via Zod schema) |
| Response | Created `Optimization` |

### `PATCH /api/optimizations/:id`

Updates an existing optimization.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Body | Partial optimization fields |
| Response | Updated `Optimization` |

### `POST /api/optimizations/:id/activate`

Activates a draft optimization. Initializes Bayesian state, deploys changes to Shopify for price optimizations.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Preconditions | Status must be `"draft"`, no conflicting active optimization for same product+type |
| Response | `{ "success": true, "optimization": {...}, "message": "..." }` |
| Side effects | For price optimizations: updates variant prices in Shopify |

### `POST /api/optimizations/:id/deactivate`

Stops an active optimization and rolls back changes.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Preconditions | Status must be `"active"` |
| Response | `{ "success": true, "optimization": {...} }` |
| Side effects | For price optimizations: restores original variant prices from `controlData` |

### `POST /api/optimizations/:id/pause`

Pauses an active optimization without rolling back. Data is preserved.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Preconditions | Status must be `"active"` |
| Response | `{ "success": true, "optimization": {...} }` |

### `POST /api/optimizations/:id/resume`

Resumes a paused optimization.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Preconditions | Status must be `"paused"` |
| Response | `{ "success": true, "optimization": {...} }` |

### `POST /api/optimizations/:id/update-allocation`

Recalculates traffic allocation using the Bayesian engine.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Preconditions | Status must be `"active"` |
| Response | `{ "optimization": {...}, "allocation": {...}, "metrics": {...}, "promotionCheck": {...}, "shouldStop": false, "reasoning": "..." }` |

### `POST /api/optimizations/:id/check-promotion`

Checks if the optimization is ready for promotion and auto-promotes if criteria are met.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "promoted": true/false, "stopped": true/false, "winner": "variant", "promotionCheck": {...}, "reasoning": "..." }` |
| Side effects | If promoted: sets 100% variant allocation, marks completed. If safety budget exhausted: cancels optimization |

---

## Billing

### `GET /api/billing/status`

Returns current subscription status.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "plan": "beta"/"free"/"growth"/"pro", "status": "active"/"inactive", "subscription": {...} }` |

### `POST /api/billing/subscribe`

Creates a new Shopify app subscription.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Body | `{ "plan": "growth" \| "pro" }` |
| Response | `{ "confirmationUrl": "https://...", "subscriptionId": "..." }` |
| Plans | Growth: $29.99/mo (14-day trial), Pro: $79.99/mo (14-day trial) |

### `POST /api/billing/cancel`

Cancels an active subscription.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Body | `{ "subscriptionId": "gid://shopify/AppSubscription/..." }` |
| Response | `{ "success": true }` |

---

## Metrics

### `GET /api/metrics`

Returns all daily metrics for the authenticated shop.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `Metric[]` |

### `GET /api/metrics/latest`

Returns the most recent daily metric.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `Metric` or `null` |

### `GET /api/dashboard`

Returns aggregated dashboard data including active optimization count, recent metrics, and summary statistics.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | Dashboard summary object with metrics, active optimization count, and recent performance data |

---

## Simulation

### `POST /api/simulate/traffic`

Simulates product page impressions for an active optimization.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Body | `{ "optimizationId": "...", "impressions": 100 }` |
| Response | `{ "success": true, "impressions": { "total": 100, "control": 50, "variant": 50 } }` |

### `POST /api/simulate/orders`

Simulates order conversions for an active optimization.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Body | `{ "optimizationId": "...", "orders": 10, "avgOrderValue": 50, "conversionRate": 0.03 }` |
| Response | Detailed per-variant conversion results with Bayesian allocation update |

### `POST /api/simulate/batch`

Runs a complete batch simulation (non-streaming) for an optimization.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Body | `{ "optimizationId": "...", "visitors": 1000, "controlCR": 0.03, "variantCR": 0.035 }` |
| Response | Complete simulation results with per-visitor breakdown and final allocation |

### `GET /api/simulate/batch-stream`

Server-Sent Events (SSE) endpoint for streaming batch simulation results.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Query | `optimizationId`, `visitors`, `controlCR`, `variantCR` |
| Response | SSE stream with events: `start`, `progress` (every 100 visitors), `complete`, `error` |
| Notes | Updates Bayesian allocation after simulation completes |

---

## Preview

### `POST /api/preview/sessions`

Creates a preview session for previewing recommendations on the storefront.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Body | `{ "recommendationId": "..." }` |
| Response | `{ "token": "...", "previewUrl": "https://shop/products/handle?shoptimizer_preview=TOKEN", "session": {...} }` |

### `GET /api/preview/proxy/:token`

Returns preview session data for the storefront preview iframe.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | Preview session with control/variant data |

### `GET /preview/:token`

Renders a full-page HTML preview with side-by-side comparison.

| Field | Value |
|-------|-------|
| Auth | None (token-based) |
| Response | HTML page with control and variant iframes |

---

## Webhooks

### `GET /api/webhooks/status`

Checks if the ORDERS_CREATE webhook is registered.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "ordersWebhook": {...}, "status": "registered"/"not_registered" }` |

### `POST /api/webhooks/register`

Manually registers the ORDERS_CREATE webhook.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "success": true, "callbackUrl": "..." }` |

### `POST /api/webhooks/orders/create`

Receives Shopify order webhooks for conversion attribution.

| Field | Value |
|-------|-------|
| Auth | HMAC-SHA256 verification via `X-Shopify-Hmac-Sha256` header |
| Headers | `X-Shopify-Topic`, `X-Shopify-Shop-Domain`, `X-Shopify-Hmac-Sha256` |
| Body | Shopify order payload |
| Flow | Verify HMAC → Extract product IDs → Find session assignments → Attribute conversions to correct variant → Update per-variant metrics |

---

## GDPR Webhooks

All GDPR endpoints verify HMAC signatures and return 200. Shoptimizer stores no customer PII, so data requests and redactions are acknowledged without action. Shop redaction triggers full data deletion.

### `POST /api/webhooks/customers/data_request`

Customer data export request (GDPR Article 15). Returns 200 acknowledging no PII is stored.

### `POST /api/webhooks/customers/redact`

Customer data deletion request (GDPR Article 17). Returns 200 acknowledging no PII to delete.

### `POST /api/webhooks/shop/redact`

Shop data deletion (sent 48 hours after app uninstall). Deletes all shop-scoped data via `storage.deleteAllShopData()`.

---

## App Proxy (Storefront)

These endpoints are called from the storefront via Shopify's App Proxy. Authentication is via HMAC signature on query parameters.

### `GET /apps/cro-proxy/config`

Returns LIVE slot experiments for the requesting shop.

| Field | Value |
|-------|-------|
| Auth | App Proxy HMAC signature |
| Query | `shop`, `signature`, and other Shopify-provided params |
| Response | `{ "experiments": [...], "timestamp": 1234567890 }` |

### `GET /apps/cro-proxy/preview/:token`

Returns forced experiment config for preview mode.

| Field | Value |
|-------|-------|
| Auth | App Proxy HMAC signature |
| Params | `token` - Preview session token |
| Response | Forced experiment configuration or preview data |

### `POST /apps/cro-proxy/event`

Tracks experiment events from the storefront runtime.

| Field | Value |
|-------|-------|
| Auth | App Proxy HMAC signature |
| Body | `{ "experiment_id": "...", "variant": "A"/"B", "event_type": "slot_view"/"add_to_cart"/"purchase", "cro_vid": "...", "path": "/...", "revenue": 49.99 }` |
| Validation | Experiment must exist for the authenticated shop, variant must be A or B, event type must be in allowlist, timestamps must be within 5 minutes |

---

## Storefront API

Public endpoints called from the storefront JavaScript SDK. No session auth required; shop is passed as a parameter.

### `GET /api/storefront/optimizations`

Returns all active product optimizations for a shop.

| Field | Value |
|-------|-------|
| Auth | None (CORS enabled) |
| Query | `shop` (required) |
| Response | `{ "optimizations": [{ "id", "shopifyProductId", "optimizationType", "controlData", "variantData", "scope" }] }` |

### `POST /api/storefront/assign`

Records a persistent variant assignment for a visitor session.

| Field | Value |
|-------|-------|
| Auth | None (CORS enabled) |
| Body | `{ "sessionId": "...", "optimizationId": "...", "variant": "control"/"variant", "shop": "..." }` |
| Notes | Creates a 90-day session assignment |

### `GET /api/storefront/assignments/:sessionId`

Returns all variant assignments for a session.

| Field | Value |
|-------|-------|
| Auth | None (CORS enabled) |
| Query | `shop` (required) |
| Response | `{ "assignments": SessionAssignment[] }` (expired assignments filtered out) |

### `POST /api/storefront/impression`

Tracks a product page impression for an active optimization.

| Field | Value |
|-------|-------|
| Auth | None (CORS enabled) |
| Body | `{ "optimizationId": "...", "variant": "control"/"variant", "sessionId": "...", "shop": "..." }` |

---

## Admin

### `GET /api/health`

Health check endpoint.

| Field | Value |
|-------|-------|
| Auth | None |
| Response | `{ "status": "ok" }` |

### `POST /api/admin/reset-quota`

Resets the recommendation quota for the authenticated shop.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | Updated `Shop` |

### `POST /api/migrate/bayesian`

Migrates legacy fixed-allocation optimizations to Bayesian allocation.

| Field | Value |
|-------|-------|
| Auth | `requireShopifySessionOrDev` |
| Response | `{ "success": true, "migrated": 5, "message": "..." }` |
