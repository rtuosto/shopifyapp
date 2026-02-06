# System Architecture

## Multi-Tenant Design

All data is scoped by a `shop` column (the Shopify store domain, e.g. `mystore.myshopify.com`). The `shops` table serves as the primary tenant table with `shop` as its primary key. Every other data table includes a `shop` column and composite unique constraints prevent cross-tenant data collisions.

```typescript
// Example: products table has a composite unique constraint
shopProductUnique: unique("products_shop_shopify_product_id_unique")
  .on(table.shop, table.shopifyProductId)
```

The storage layer (`IStorage` interface in `server/storage.ts`) enforces tenant isolation by requiring a `shop` parameter on every method:

```typescript
getProduct(shop: string, id: string): Promise<Product | undefined>;
getProducts(shop: string): Promise<Product[]>;
createOptimization(shop: string, data: InsertOptimization): Promise<Optimization>;
```

## Frontend Architecture

The frontend is a React SPA embedded in Shopify Admin via App Bridge. It runs inside an iframe with the admin dashboard as the parent frame.

**Routing** uses Wouter (lightweight alternative to React Router):

| Path | Page | Description |
|------|------|-------------|
| `/` | Dashboard | Overview metrics, active optimizations, setup guide |
| `/optimizations` | Optimizations | List, create, manage A/B optimizations |
| `/recommendations` | AI Recommendations | AI-generated optimization suggestions |
| `/simulator` | Simulator | Traffic and conversion simulation tool |
| `/billing` | Plans & Billing | Subscription management via Shopify Billing API |
| `/settings` | Settings | Webhook status, product sync, app configuration |

**Data fetching** uses TanStack Query v5 with a default fetcher configured in `client/src/lib/queryClient.ts`. Queries auto-refetch and use object-form syntax:

```typescript
const { data, isLoading } = useQuery({
  queryKey: ['/api/optimizations', id],
});
```

## Backend Architecture

Express.js server with the following middleware chain:

1. **Session middleware** - PostgreSQL-backed sessions via `connect-pg-simple`
2. **Body parsing** - JSON with raw body preservation for webhook HMAC verification
3. **Security headers** - `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`
4. **CSP** - `frame-ancestors` allows `https://admin.shopify.com` and `https://*.myshopify.com`
5. **CORS** - Applied to storefront and App Proxy endpoints (`/api/storefront/*`, `/apps/cro-proxy/*`)
6. **Authentication** - `requireShopifySessionOrDev` middleware on protected routes

### Storage Interface Pattern

All data access goes through the `IStorage` interface (`server/storage.ts`), implemented by `DatabaseStorage` (`server/db-storage.ts`):

```
Routes (server/routes.ts)
    ↓
IStorage interface (server/storage.ts)
    ↓
DatabaseStorage (server/db-storage.ts)
    ↓
Drizzle ORM (server/db.ts)
    ↓
PostgreSQL (Neon)
```

## Data Flow

The complete lifecycle of an optimization:

```
1. OAuth Install
   └→ Store Shopify session in database
   └→ Register ORDERS_CREATE webhook
   └→ Trigger background product sync

2. Product Sync (POST /api/sync/products)
   └→ Fetch products via Shopify Admin GraphQL API
   └→ Upsert into local products table

3. AI Recommendations (POST /api/recommendations/generate-all)
   └→ Score products (recommendation-engine.ts)
   └→ Filter out products with active optimizations
   └→ Call OpenAI GPT-5-mini for optimization suggestions
   └→ Store recommendations in database

4. Optimization Creation (POST /api/optimizations)
   └→ Create draft optimization with control/variant data

5. Activation (POST /api/optimizations/:id/activate)
   └→ Conflict check (no duplicate active optimizations for same product+type)
   └→ For price optimizations: deploy variant prices to Shopify via Admin API
   └→ Initialize Bayesian state (priors, safety budget)
   └→ Set status to "active" with 50/50 allocation

6. Traffic Allocation
   └→ Storefront SDK assigns visitors to control/variant
   └→ Impressions tracked via POST /api/storefront/impression

7. Conversion Tracking (Webhooks)
   └→ Shopify sends ORDERS_CREATE webhook
   └→ HMAC verification
   └→ Match order line items to products with active optimizations
   └→ Look up session assignment to attribute to correct variant
   └→ Update per-variant metrics (conversions, revenue)

8. Statistical Analysis (POST /api/optimizations/:id/update-allocation)
   └→ Update Bayesian posteriors with new data
   └→ Compute TTTS allocation
   └→ Apply CVaR throttling and allocation constraints
   └→ Update traffic split

9. Promotion/Rollback (POST /api/optimizations/:id/check-promotion)
   └→ Check promotion criteria (min samples, probability of lift, EOC)
   └→ If met: promote variant to 100%, mark completed
   └→ If safety budget exhausted: cancel optimization
   └→ For price optimizations: restore original prices on deactivation
```

## Two Experiment Types

### 1. Product Optimizations

Product optimizations modify product attributes (title, price, description) via the Shopify Admin API. This is a **sequential testing model** where only one variant of each attribute is live at a time.

- **Activation**: Mutates the product in Shopify (e.g., updates variant prices)
- **Deactivation**: Rolls back to original values stored in `controlData`
- **Tracking**: Storefront SDK tracks impressions; webhooks track conversions
- **Attribution**: Session assignments map visitor sessions to variants

### 2. Slot Experiments

Slot experiments use the Theme App Extension to inject content into designated containers on the storefront. This is a **true split testing model** where both variants are served simultaneously to different visitors.

- **Rendering**: `runtime.js` fetches experiment config from App Proxy, buckets visitors deterministically via `hash(visitorId + experimentId)`, renders the assigned variant's HTML/text into the `<div data-cro-slot="...">` container
- **Tracking**: `runtime.js` sends `slot_view`, `add_to_cart`, and `purchase` events to the App Proxy event endpoint
- **No DOM manipulation**: Content is only injected into owned App Block containers

## Security Model

| Mechanism | Purpose |
|-----------|---------|
| CSP `frame-ancestors` | Restricts embedding to Shopify Admin and store domains |
| HMAC-SHA256 webhook verification | Validates webhook authenticity using `SHOPIFY_API_SECRET` |
| Session-scoped API access | `requireShopifySessionOrDev` loads and validates Shopify session |
| App Proxy HMAC validation | Validates storefront requests via Shopify's signed query params |
| No PII storage | No customer names, emails, addresses, or payment data stored |
| Raw body preservation | `express.json({ verify })` preserves raw body for HMAC computation |
| Timing-safe comparison | `crypto.timingSafeEqual` for HMAC signature verification |
