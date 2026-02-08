# Deployment & Environment Setup

## Development

### Starting the Dev Server

```bash
npm run dev
```

This starts a single Express server on port 5000 that serves both the Vite-compiled frontend and the API backend. The Vite dev server is integrated via middleware (`server/vite.ts`).

### Dev Mode Behavior

The app uses `APP_URL` for host and webhook URLs (no trailing slash). In development, set `APP_URL=http://localhost:5000` or use your tunnel URL.

When `NODE_ENV === "development"`:
- The `requireShopifySessionOrDev` middleware falls back to `"default-shop"` if no shop parameter is provided
- Billing subscription creation is blocked (returns error)
- Shopify Billing API uses `test: true` for non-production environments
- App Proxy HMAC validation is skipped if `shop` parameter is present

### Testing with a Shopify Dev Store

See `docs/SHOPIFY_DEV_STORE_TESTING.md` for detailed setup instructions.

## Database

### PostgreSQL (Neon)

The database is PostgreSQL hosted on Neon, accessed via the `DATABASE_URL` environment variable.

### Schema Management

All schema is defined in `shared/schema.ts` using Drizzle ORM. There are no hand-written SQL migrations.

```bash
# Push schema changes to the database
npm run db:push

# Force push (accepts data-loss warnings for breaking changes)
npm run db:push --force
```

### Session Table

The `shopify_sessions` table is created automatically by `server/shopify.ts` on startup:

```sql
CREATE TABLE IF NOT EXISTS shopify_sessions (
  id VARCHAR(255) PRIMARY KEY,
  shop VARCHAR(255) NOT NULL,
  state VARCHAR(255) NOT NULL,
  is_online BOOLEAN NOT NULL DEFAULT false,
  scope VARCHAR(1024),
  expires TIMESTAMP,
  access_token VARCHAR(255),
  ...
);
```

The `session` table (for Express sessions) is created automatically by `connect-pg-simple`.

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (e.g. from Neon or Railway) |
| `SESSION_SECRET` | Stable secret for Express session cookies |
| `SHOPIFY_API_KEY` | From Shopify Partner Dashboard → App → API credentials |
| `SHOPIFY_API_SECRET` | From Shopify Partner Dashboard → App → API credentials |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API key |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI base URL (optional override) |

### Production Only

| Variable | Description |
|----------|-------------|
| `APP_URL` | Full public URL of the app (e.g., `https://your-app.railway.app`), no trailing slash |
| `NODE_ENV` | Set to `"production"` |

## Production Checklist

### App Configuration

- [ ] `APP_URL` is set to your deployed app URL (e.g. Railway)
- [ ] `SESSION_SECRET` is set to a stable, random value
- [ ] `NODE_ENV` is set to `"production"`

### Shopify Partner Dashboard

- [ ] App URL updated to production URL
- [ ] Allowed redirection URLs include `{SHOPIFY_APP_URL}/api/auth/callback`
- [ ] GDPR webhook URLs configured:
  - Customer data request: `{SHOPIFY_APP_URL}/api/webhooks/customers/data_request`
  - Customer erasure: `{SHOPIFY_APP_URL}/api/webhooks/customers/redact`
  - Shop erasure: `{SHOPIFY_APP_URL}/api/webhooks/shop/redact`
- [ ] App Proxy configured:
  - Subpath prefix: `apps`
  - Subpath: `cro-proxy`
  - Proxy URL: `{SHOPIFY_APP_URL}/apps/cro-proxy`

### Webhooks

- [ ] ORDERS_CREATE webhook registered (auto-registered during OAuth, verify via Settings page)
- [ ] Webhook callback URL points to `{SHOPIFY_APP_URL}/api/webhooks/orders/create`

### Billing

- [ ] `returnUrl` in billing subscribe uses `SHOPIFY_APP_URL`
- [ ] Test mode is disabled in production (`test: false`)

### Database

- [ ] Schema is pushed to production database (`npm run db:push`)
- [ ] Session tables exist (`shopify_sessions`, `session`)

## Shopify App Store Submission

### Required Compliance

| Requirement | Implementation |
|-------------|---------------|
| GDPR webhooks | `customers/data_request`, `customers/redact`, `shop/redact` all implemented |
| Billing API | `appSubscriptionCreate`, `currentAppInstallation`, `appSubscriptionCancel` |
| Theme App Extension | Uses App Embed + App Block. No DOM manipulation outside owned containers |
| Privacy policy | `docs/privacy-policy.md` — no PII stored |
| Embedded app | `isEmbeddedApp: true`, CSP frame-ancestors configured |

### Theme Extension Requirements

- Content renders ONLY inside owned `<div data-cro-slot="...">` containers
- No modification of theme Liquid files required
- `runtime.js` loads via `defer` attribute (non-blocking)
- Fallback content via `<noscript>` tags
- No external script dependencies

## Monitoring

### Health Check

```
GET /api/health
Response: { "status": "ok" }
```

### Webhook Status

```
GET /api/webhooks/status
Response: {
  "ordersWebhook": { "id": "...", "topic": "ORDERS_CREATE", ... },
  "status": "registered",
  "message": "Order webhook is registered"
}
```

### Logging

The application uses `console.log` with prefixed tags for structured logging:

| Prefix | Module |
|--------|--------|
| `[OAuth]` | OAuth flow |
| `[Shopify API]` | Admin GraphQL API calls |
| `[Webhook]` | Order webhook processing |
| `[GDPR Webhook]` | GDPR compliance webhooks |
| `[App Proxy]` | Storefront proxy requests |
| `[AI]` / `[AI Service]` | AI recommendation generation |
| `[Sync]` | Product sync |
| `[Bayesian Update]` | Allocation updates |
| `[Simulation]` / `[Simulator Stream]` | Traffic/order simulation |
| `[Session Storage]` | Shopify session management |
| `[Billing]` | Subscription management |
| `[Safety Budget]` | Risk management budget tracking |
| `[Migration]` | Legacy data migration |
| `[Auto-Promotion]` | Automatic variant promotion |
| `[CRO]` | Storefront runtime (browser console) |
