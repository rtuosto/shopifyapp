# Shopify Integration

## OAuth Flow

**File:** `server/shopify.ts`

The app uses the standard Shopify OAuth flow via `@shopify/shopify-api`:

```typescript
export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: ["read_products", "write_products", "read_orders"],
  hostName: process.env.REPLIT_DEV_DOMAIN || "localhost:5000",
  hostScheme: process.env.REPLIT_DEV_DOMAIN ? "https" : "http",
  apiVersion: ApiVersion.October24,
  isEmbeddedApp: true,
});
```

### OAuth Endpoints

1. **`GET /api/auth?shop=mystore.myshopify.com`** — Initiates OAuth by calling `shopify.auth.begin()`, which redirects to Shopify's consent screen
2. **`GET /api/auth/callback`** — Handles the callback via `shopify.auth.callback()`, stores the session, registers webhooks, triggers product sync, and redirects to the app

### Session Storage

Sessions are stored in a custom PostgreSQL table (`shopify_sessions`) with the following operations:

| Method | Description |
|--------|-------------|
| `storeSession(session)` | Upserts session with all fields |
| `loadSession(id)` | Loads session by ID |
| `deleteSession(id)` | Deletes a single session |
| `findSessionsByShop(shop)` | Finds all sessions for a shop |
| `getSessionByShop(shop)` | Gets the most recent session for a shop |

The session table is created automatically on startup via `initSessionTable()`.

## Admin GraphQL API

**API Version:** October 2024 (`ApiVersion.October24`)

### Product Queries

```graphql
query ($cursor: String) {
  products(first: 50, after: $cursor) {
    edges {
      node {
        id
        handle
        title
        description
        priceRangeV2 { minVariantPrice { amount currencyCode } }
        variants(first: 100) {
          edges {
            node {
              id
              price
              inventoryItem { unitCost { amount } }
              title
            }
          }
        }
        images(first: 5) { edges { node { url } } }
      }
      cursor
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

Products are fetched with cursor-based pagination (50 per page).

### Product Mutations

**Product update** (title, description):
```graphql
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id title descriptionHtml }
    userErrors { field message }
  }
}
```

**Variant price update** (bulk):
```graphql
mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id price }
    userErrors { field message }
  }
}
```

Price changes are deployed to Shopify when a price optimization is activated and rolled back when deactivated.

## Webhooks

### ORDERS_CREATE

Registered during OAuth callback. Used for conversion attribution.

**Registration:**
```graphql
mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id topic }
    userErrors { field message }
  }
}
```

**Verification:** Webhooks are verified using `shopify.webhooks.validate()` which checks the `X-Shopify-Hmac-Sha256` header against the raw request body.

**Attribution flow:**
1. Extract `shopify_product_ids` from order line items
2. Match against local products table
3. Extract `_shoptimizer_session` from order `note_attributes`
4. Look up session assignments for the session ID
5. Attribute conversions and revenue to the correct variant (control or variant)
6. Update per-variant metrics on the optimization

### Webhook Status

`GET /api/webhooks/status` queries existing webhook subscriptions:
```graphql
query {
  webhookSubscriptions(first: 25) {
    edges {
      node { id topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } }
    }
  }
}
```

`POST /api/webhooks/register` manually registers the ORDERS_CREATE webhook if not already present.

## Billing API

### Plans

| Plan | Price | Trial |
|------|-------|-------|
| Growth | $29.99/mo | 14 days |
| Pro | $79.99/mo | 14 days |

### Subscription Creation

```graphql
mutation appSubscriptionCreate(
  $name: String!, $lineItems: [AppSubscriptionLineItemInput!]!,
  $returnUrl: URL!, $trialDays: Int, $test: Boolean
) {
  appSubscriptionCreate(
    name: $name, returnUrl: $returnUrl, lineItems: $lineItems,
    trialDays: $trialDays, test: $test
  ) {
    confirmationUrl
    appSubscription { id status }
    userErrors { field message }
  }
}
```

The `test` parameter is automatically set to `true` in non-production environments.

### Active Subscription Query

```graphql
query {
  currentAppInstallation {
    activeSubscriptions {
      id name status createdAt trialDays currentPeriodEnd test
      lineItems { plan { pricingDetails { ... on AppRecurringPricing { price { amount currencyCode } interval } } } }
    }
  }
}
```

### Subscription Cancellation

```graphql
mutation appSubscriptionCancel($id: ID!) {
  appSubscriptionCancel(id: $id) {
    appSubscription { id status }
    userErrors { field message }
  }
}
```

## App Proxy

Shopify App Proxy routes storefront requests through `https://{shop}/apps/cro-proxy/` to the app backend.

### HMAC Validation

```typescript
function validateAppProxySignature(query: Record<string, any>) {
  const signature = query.signature;
  // In dev mode: skip validation if shop param present
  // Build sorted query string (excluding 'signature')
  // Compute HMAC-SHA256 of sorted params using SHOPIFY_API_SECRET
  // Compare against provided signature
}
```

### Registered Proxy Routes

| Route | Description |
|-------|-------------|
| `GET /apps/cro-proxy/config` | Returns LIVE experiment configs |
| `GET /apps/cro-proxy/preview/:token` | Returns preview experiment config |
| `POST /apps/cro-proxy/event` | Receives tracking events |

## GDPR Webhooks

Required for Shopify App Store listing. All three endpoints verify HMAC signatures using manual `crypto.createHmac` with `crypto.timingSafeEqual`.

| Endpoint | GDPR Article | Action |
|----------|-------------|--------|
| `POST /api/webhooks/customers/data_request` | Article 15 (Right of Access) | Returns 200 — no PII stored |
| `POST /api/webhooks/customers/redact` | Article 17 (Right to Erasure) | Returns 200 — no PII to delete |
| `POST /api/webhooks/shop/redact` | App Uninstall | Calls `storage.deleteAllShopData(shop)` to purge all data |

**HMAC Verification (manual):**
```typescript
function verifyShopifyWebhookHmac(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256");
  const rawBody = req.rawBody as Buffer;
  const generatedHmac = createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');
  return timingSafeEqual(
    Buffer.from(hmac, 'base64'),
    Buffer.from(generatedHmac, 'base64')
  );
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_API_KEY` | Yes | Shopify app API key |
| `SHOPIFY_API_SECRET` | Yes | Shopify app API secret (used for OAuth, HMAC verification) |
| `SHOPIFY_APP_URL` | Production | Full app URL (e.g., `https://your-app.replit.app`) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Yes | OpenAI API key (managed by Replit integration) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Yes | OpenAI API base URL (managed by Replit integration) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session secret (must be stable across restarts) |
| `REPLIT_DEV_DOMAIN` | Auto | Automatically set by Replit in dev mode |
| `NODE_ENV` | Auto | `"development"` or `"production"` |
