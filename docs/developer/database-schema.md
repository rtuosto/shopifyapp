# Database Schema

All tables are defined in `shared/schema.ts` using Drizzle ORM. The database is PostgreSQL hosted on Neon.

## Schema Push

```bash
# Push schema changes to database
npm run db:push

# Force push (accepts data loss warnings)
npm run db:push --force
```

There are no manual SQL migrations. Drizzle's `db:push` command diffs the schema definition against the live database and applies changes directly.

---

## Tables

### `shops`

Primary tenant table. One row per installed Shopify store.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `shop` | `varchar` | **PK** | Shopify store domain (e.g., `mystore.myshopify.com`) |
| `plan_tier` | `varchar` | NOT NULL, default `"basic"` | Internal tier identifier. Schema defines `"basic"`, `"pro"`, `"enterprise"`. Note: The Billing UI maps these to user-facing plan names: Free (basic), Growth (pro), Pro (enterprise). The billing system currently returns `"beta"` status with all features unlocked. |
| `recommendation_quota` | `integer` | NOT NULL, default `20` | Monthly AI recommendation quota |
| `recommendations_used` | `integer` | NOT NULL, default `0` | Recommendations used this billing cycle |
| `quota_reset_date` | `timestamp` | NOT NULL, default `now()` | When the quota resets |
| `created_at` | `timestamp` | NOT NULL | Row creation time |
| `updated_at` | `timestamp` | NOT NULL | Last update time |

---

### `products`

Synced from Shopify via the Admin GraphQL API.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default `gen_random_uuid()` | Internal UUID |
| `shop` | `varchar` | NOT NULL | Tenant scope |
| `shopify_product_id` | `text` | NOT NULL | Shopify GID (e.g., `gid://shopify/Product/123`) |
| `handle` | `text` | NOT NULL | URL-friendly slug |
| `title` | `text` | NOT NULL | Product title |
| `description` | `text` | | Product description |
| `price` | `decimal(10,2)` | NOT NULL | Minimum variant price |
| `compare_at_price` | `decimal(10,2)` | | Compare-at price |
| `cost` | `decimal(10,2)` | | Cost of goods (COGS) |
| `margin` | `decimal(5,2)` | | Calculated margin percentage |
| `variants` | `jsonb` | NOT NULL, default `[]` | Array of `{ id, price, cost?, title? }` |
| `images` | `jsonb` | NOT NULL, default `[]` | Array of image URL strings |
| `rating` | `decimal(3,2)` | | Average rating |
| `review_count` | `integer` | default `0` | Number of reviews |
| `total_sold` | `integer` | default `0` | Lifetime units sold |
| `revenue_30d` | `decimal(12,2)` | default `"0"` | Revenue from last 30 days |
| `last_sale_date` | `timestamp` | | Most recent sale |
| `created_at` | `timestamp` | NOT NULL | |
| `updated_at` | `timestamp` | NOT NULL | |

**Unique constraint**: `(shop, shopify_product_id)`

---

### `recommendations`

AI-generated optimization suggestions, linked to products.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `shop` | `varchar` | NOT NULL | Tenant scope |
| `product_id` | `varchar` | NOT NULL, **FK** → `products.id` (CASCADE) | |
| `title` | `text` | NOT NULL | Short recommendation title |
| `description` | `text` | NOT NULL | Why this optimization will work |
| `optimization_type` | `text` | NOT NULL | `"title"`, `"price"`, `"description"`, or `"image"` |
| `proposed_changes` | `jsonb` | NOT NULL | Actual new values, e.g., `{ "title": "New Title" }` |
| `insights` | `jsonb` | NOT NULL | Array of `{ type, title, description }` |
| `impact_score` | `integer` | NOT NULL, default `5` | AI-assigned 1-10 revenue impact score |
| `status` | `text` | NOT NULL, default `"pending"` | `"pending"`, `"dismissed"`, `"active"`, `"completed"` |
| `dismissed_at` | `timestamp` | | When recommendation was dismissed |
| `created_at` | `timestamp` | NOT NULL | |

---

### `optimizations`

Core A/B optimization table. Represents active and historical experiments.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `shop` | `varchar` | NOT NULL | Tenant scope |
| `scope` | `text` | NOT NULL, default `"product"` | `"product"`, `"template"`, `"page"`, `"global"` |
| `product_id` | `varchar` | **FK** → `products.id` (CASCADE) | Nullable for non-product scopes |
| `recommendation_id` | `varchar` | **FK** → `recommendations.id` (SET NULL) | Source recommendation |
| `optimization_type` | `text` | NOT NULL | `"title"`, `"price"`, `"description"`, etc. |
| `target_selector` | `text` | | CSS selector for template optimizations |
| `status` | `text` | NOT NULL, default `"draft"` | `"draft"`, `"active"`, `"paused"`, `"completed"`, `"cancelled"` |
| `control_data` | `jsonb` | NOT NULL | Original product state (used for rollback) |
| `variant_data` | `jsonb` | NOT NULL | Proposed variant values |
| `allocation_strategy` | `text` | NOT NULL, default `"bayesian"` | Always `"bayesian"` |
| `control_allocation` | `decimal(5,2)` | default `"50"` | Control traffic percentage (0-100) |
| `variant_allocation` | `decimal(5,2)` | default `"50"` | Variant traffic percentage (0-100) |
| `confidence_threshold` | `decimal(3,2)` | default `"0.95"` | Statistical confidence threshold |
| `min_sample_size` | `integer` | default `100` | Minimum samples before optimization |
| `bayesian_config` | `jsonb` | | Full Bayesian state (see below) |
| `control_impressions` | `integer` | default `0` | |
| `variant_impressions` | `integer` | default `0` | |
| `control_conversions` | `integer` | default `0` | |
| `variant_conversions` | `integer` | default `0` | |
| `control_revenue` | `decimal(10,2)` | default `"0"` | |
| `variant_revenue` | `decimal(10,2)` | default `"0"` | |
| `arpu` | `decimal(10,2)` | default `"0"` | Legacy aggregate ARPU |
| `arpu_lift` | `decimal(5,2)` | default `"0"` | Legacy aggregate lift |
| `impressions` | `integer` | default `0` | Legacy aggregate impressions |
| `conversions` | `integer` | default `0` | Legacy aggregate conversions |
| `revenue` | `decimal(10,2)` | default `"0"` | Legacy aggregate revenue |
| `start_date` | `timestamp` | | When activated |
| `end_date` | `timestamp` | | When completed/cancelled |
| `created_at` | `timestamp` | NOT NULL | |
| `updated_at` | `timestamp` | NOT NULL | |

**`bayesian_config` JSONB structure:**

```typescript
{
  control: {
    incidence: { alpha: number; beta: number };     // Beta posterior
    value: { mu: number; kappa: number; alphaV: number; betaV: number }; // NIG posterior
    orderValues?: number[];
  };
  variant: { /* same structure */ };
  safetyBudgetRemaining?: number;  // Dollars remaining
  safetyBudgetTotal?: number;      // Initial budget (default $50)
  riskMode?: 'cautious' | 'balanced' | 'aggressive';
  controlFloor?: number;           // Minimum control allocation
  variantStart?: number;           // Initial variant allocation
  lastAllocationUpdate?: string;   // ISO timestamp
  promotionCheckCount?: number;
  lastTotalImpressions?: number;   // For delta calculation
}
```

---

### `metrics`

Daily aggregated performance metrics per shop.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `shop` | `varchar` | NOT NULL | |
| `date` | `timestamp` | NOT NULL | Metric date |
| `conversion_rate` | `decimal(5,2)` | NOT NULL | |
| `avg_order_value` | `decimal(10,2)` | NOT NULL | |
| `revenue` | `decimal(10,2)` | NOT NULL | |
| `revenue_lift` | `decimal(10,2)` | default `"0"` | |
| `active_optimizations` | `integer` | default `0` | |
| `created_at` | `timestamp` | NOT NULL | |

---

### `session_assignments`

Maps visitor sessions to optimization variants for consistent assignment and conversion attribution.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `shop` | `varchar` | NOT NULL | |
| `session_id` | `varchar` | NOT NULL | Browser-generated UUID (stored in localStorage) |
| `optimization_id` | `varchar` | NOT NULL, **FK** → `optimizations.id` (CASCADE) | |
| `variant` | `text` | NOT NULL | `"control"` or `"variant"` |
| `assigned_at` | `timestamp` | NOT NULL | |
| `expires_at` | `timestamp` | NOT NULL | Default: 90 days from assignment |

---

### `optimization_impressions`

Individual impression events (one per page view per session).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `optimization_id` | `varchar` | NOT NULL, **FK** → `optimizations.id` (CASCADE) | |
| `session_id` | `varchar` | NOT NULL | |
| `variant` | `text` | NOT NULL | `"control"` or `"variant"` |
| `created_at` | `timestamp` | NOT NULL | |

---

### `optimization_conversions`

Individual conversion events with revenue.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `optimization_id` | `varchar` | NOT NULL, **FK** → `optimizations.id` (CASCADE) | |
| `session_id` | `varchar` | NOT NULL | |
| `variant` | `text` | NOT NULL | `"control"` or `"variant"` |
| `revenue` | `decimal(10,2)` | NOT NULL | Order revenue attributed to this conversion |
| `created_at` | `timestamp` | NOT NULL | |

---

### `optimization_evolution_snapshots`

Periodic metric snapshots for evolution charts. Created every 100 impressions during simulation or periodically during live traffic.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `optimization_id` | `varchar` | NOT NULL, **FK** → `optimizations.id` (CASCADE) | |
| `impressions` | `integer` | NOT NULL | Cumulative total impressions |
| `control_impressions` | `integer` | NOT NULL | |
| `variant_impressions` | `integer` | NOT NULL | |
| `control_conversions` | `integer` | NOT NULL | |
| `variant_conversions` | `integer` | NOT NULL | |
| `control_revenue` | `decimal(10,2)` | NOT NULL | |
| `variant_revenue` | `decimal(10,2)` | NOT NULL | |
| `control_rpv` | `decimal(10,2)` | NOT NULL | Revenue Per Visitor |
| `variant_rpv` | `decimal(10,2)` | NOT NULL | |
| `control_allocation` | `decimal(5,2)` | NOT NULL | Traffic percentage |
| `variant_allocation` | `decimal(5,2)` | NOT NULL | |
| `created_at` | `timestamp` | NOT NULL | |

---

### `preview_sessions`

Short-lived sessions for storefront preview of recommendations before activation.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `token` | `varchar` | NOT NULL, **UNIQUE** | URL-safe opaque token |
| `shop` | `varchar` | NOT NULL | |
| `product_id` | `varchar` | **FK** → `products.id` (CASCADE) | Optional for slot experiments |
| `recommendation_id` | `varchar` | **FK** → `recommendations.id` (SET NULL) | |
| `preview_type` | `text` | NOT NULL, default `"product"` | `"product"` or `"slot"` |
| `storefront_url` | `text` | | Full URL on the live storefront |
| `control_data` | `jsonb` | | Current product state |
| `variant_data` | `jsonb` | | Proposed changes |
| `changes` | `jsonb` | | Array of changed field names |
| `insights` | `jsonb` | | AI reasoning for changes |
| `experiment_config` | `jsonb` | | Forced variant config for slot experiments |
| `expires_at` | `timestamp` | NOT NULL | 15 minutes from creation |
| `completed_at` | `timestamp` | | When user approved/dismissed |
| `approved` | `text` | | `"yes"`, `"no"`, or `null` |
| `created_at` | `timestamp` | NOT NULL | |

---

### `theme_positioning_rules`

DOM positioning rules extracted from theme analysis. One set per shop.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `shop` | `varchar` | NOT NULL, **UNIQUE** | One rule set per shop |
| `theme_id` | `varchar` | NOT NULL | Shopify theme ID |
| `theme_name` | `text` | | Human-readable theme name |
| `rules` | `jsonb` | NOT NULL | DOM selectors and insertion rules |
| `clone_product_id` | `text` | | Shopify product ID of analysis template |
| `analyzed_at` | `timestamp` | NOT NULL | |
| `created_at` | `timestamp` | NOT NULL | |
| `updated_at` | `timestamp` | NOT NULL | |

---

### `editor_sessions`

Live editing sessions with heartbeat for storefront live editing.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `token` | `varchar` | NOT NULL, **UNIQUE** | Session token |
| `shop` | `varchar` | NOT NULL | |
| `last_heartbeat` | `timestamp` | NOT NULL | Last activity |
| `expires_at` | `timestamp` | NOT NULL | 20 minutes, renewable via heartbeat |
| `created_at` | `timestamp` | NOT NULL | |

---

### `slot_experiments`

Theme App Extension experiments using app block slots.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `shop` | `varchar` | NOT NULL | |
| `name` | `text` | NOT NULL | Human-readable experiment name |
| `slot_id` | `text` | NOT NULL, default `"pdp"` | `"pdp"`, `"home"`, or `"collection"` |
| `status` | `text` | NOT NULL, default `"DRAFT"` | `"DRAFT"`, `"LIVE"`, `"PAUSED"`, `"COMPLETED"` |
| `allocation` | `decimal(3,2)` | default `"0.50"` | Percentage for variant B (0.00-1.00) |
| `variant_a` | `jsonb` | NOT NULL, default `{}` | `{ html?, text?, styles?, display? }` |
| `variant_b` | `jsonb` | NOT NULL, default `{}` | `{ html?, text?, styles?, display? }` |
| `product_id` | `varchar` | **FK** → `products.id` (CASCADE) | Optional product linkage |
| `views_a` | `integer` | default `0` | |
| `views_b` | `integer` | default `0` | |
| `conversions_a` | `integer` | default `0` | |
| `conversions_b` | `integer` | default `0` | |
| `revenue_a` | `decimal(10,2)` | default `"0"` | |
| `revenue_b` | `decimal(10,2)` | default `"0"` | |
| `start_date` | `timestamp` | | |
| `end_date` | `timestamp` | | |
| `created_at` | `timestamp` | NOT NULL | |
| `updated_at` | `timestamp` | NOT NULL | |

---

### `experiment_events`

Storefront events from `runtime.js` sent via the App Proxy.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `varchar` | **PK**, default UUID | |
| `shop` | `varchar` | NOT NULL | |
| `experiment_id` | `varchar` | NOT NULL | Links to `slot_experiments.id` |
| `visitor_id` | `varchar` | NOT NULL | `cro_vid` from browser localStorage |
| `variant` | `text` | NOT NULL | `"A"` or `"B"` |
| `event_type` | `text` | NOT NULL | `"slot_view"`, `"add_to_cart"`, or `"purchase"` |
| `path` | `text` | | Page path where event occurred |
| `metadata` | `jsonb` | default `{}` | Additional event data |
| `revenue` | `decimal(10,2)` | | Only for purchase events |
| `created_at` | `timestamp` | NOT NULL | |

---

## Drizzle ORM Patterns

### Schema Definition

Tables are defined using `pgTable` with typed JSONB columns:

```typescript
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  variants: jsonb("variants").$type<Array<{ id: string; price: string }>>()
    .notNull().default(sql`'[]'::jsonb`),
}, (table) => ({
  shopProductUnique: unique("products_shop_shopify_product_id_unique")
    .on(table.shop, table.shopifyProductId),
}));
```

### Insert Schemas (Zod)

Each table has a corresponding Zod insert schema generated via `drizzle-zod`:

```typescript
export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  shop: true,     // Added by storage layer
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
```

### Storage Layer

The `IStorage` interface always takes `shop` as the first parameter. The `DatabaseStorage` implementation uses Drizzle's query builder:

```typescript
async getProducts(shop: string): Promise<Product[]> {
  return db.select().from(products).where(eq(products.shop, shop));
}

async getActiveOptimizationsByProduct(
  shop: string, productId: string, optimizationType?: string
): Promise<Optimization[]> {
  return db.select().from(optimizations).where(
    and(
      eq(optimizations.shop, shop),
      eq(optimizations.productId, productId),
      eq(optimizations.status, "active"),
      optimizationType ? eq(optimizations.optimizationType, optimizationType) : undefined,
    )
  );
}
```
