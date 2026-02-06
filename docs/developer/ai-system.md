# AI Recommendation Engine

## Overview

The AI system generates optimization recommendations for Shopify products. It uses a two-stage pipeline: first selecting which products to analyze (scoring algorithm), then generating specific recommendations via OpenAI.

## Product Selection Algorithm

**File:** `server/recommendation-engine.ts`

### Stage 1: Conflict Prevention

Products with active optimizations are filtered out before scoring. This prevents generating recommendations that would conflict with running experiments.

```typescript
function selectTopProducts(
  products: Product[],
  activeProductIds: string[],
  limit: number = 25
): ProductScore[] {
  const eligibleProducts = products.filter(p => !activeProductIds.includes(p.id));
  // ... score and rank
}
```

### Stage 2: Product Scoring

Each eligible product is scored across four dimensions:

```
Total Score = Profit(40%) + Sales(30%) + Gaps(20%) + Price(10%)
```

#### Profit Score (40% weight)

Evaluates profit potential based on margin and absolute profit per unit.

```typescript
function calculateProfitScore(product: Product): number {
  // If no cost data: use price × 0.5 (assume 50% margin)
  // If cost data available:
  //   profit = price - cost
  //   marginMultiplier = min(margin / 50, 2)  // Cap at 2x for 50%+ margins
  //   return profit × marginMultiplier
}
```

#### Sales Score (30% weight)

Evaluates recent sales activity and velocity.

```typescript
function calculateSalesScore(product: Product): number {
  let score = revenue30d;  // Base: last 30 days revenue
  // Boost 1.5x if sold in last 7 days
  // Boost 1.2x if sold in last 30 days
  // Add sqrt(totalSold) × 0.1 for volume bonus
}
```

#### Gap Score (20% weight)

Identifies products with clear improvement opportunities.

| Gap | Points |
|-----|--------|
| Missing or short description (< 100 chars) | +50 |
| Short title (< 30 chars) | +20 |
| Many variants (> 5) without compare-at price | +30 |
| Missing or few images (< 2) | +15 |

#### Price Score (10% weight)

Prioritizes premium products where optimization has higher revenue impact.

```typescript
function calculatePriceScore(product: Product, products: Product[]): number {
  const percentile = /* price percentile within catalog */;
  if (percentile > 0.7) return price * 1.5;  // Top 30%: premium boost
  if (percentile > 0.5) return price;        // Mid-range: neutral
  return price * 0.5;                        // Bottom 50%: lower priority
}
```

## AI Service

**File:** `server/ai-service.ts`

Uses OpenAI GPT-5-mini via the `openai` npm package. The API key and base URL are configured via Replit's AI integration environment variables:

```typescript
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
```

### Single Product: `generateOptimizationRecommendations()`

Generates 2-3 recommendations for a single product.

**Input:**
```typescript
interface ProductData {
  title: string;
  description: string;
  price: number;
  category?: string;
  variants?: Array<{ id: string; price: string; title?: string }>;
  variantCount?: number;
  imageCount?: number;
}
```

**Output:** Array of `OptimizationRecommendation`:
```typescript
interface OptimizationRecommendation {
  title: string;                        // Brief recommendation title
  description: string;                  // Why this change will work
  optimizationType: "title" | "price" | "description" | "image";
  proposedChanges: Record<string, any>; // Actual new values
  insights: Array<{
    type: "psychology" | "competitor" | "seo" | "data";
    title: string;
    description: string;
  }>;
  impactScore?: number;                 // 1-10 revenue impact score
}
```

### Batch: `generateBatchRecommendations()`

Analyzes multiple products in a single AI call, returning the top N highest-impact recommendations across the entire store.

**Input:** Array of `BatchProductData` (extends ProductData with id, margin, revenue30d, totalSold)

**Output:** Array of recommendations with `productId` linking each to its source product.

### Anti-Hallucination Rules

The prompt includes explicit rules to prevent the AI from fabricating information:

1. NEVER invent product specifications (materials, dimensions, features)
2. NEVER invent warranty, return, or shipping policies
3. NEVER invent variant details unless explicitly provided
4. NEVER make up customer reviews or testimonials
5. For descriptions: suggest STRUCTURE and APPROACH only, not invented specs
6. For prices: base on the actual price provided, not imaginary competitors
7. Only reference information explicitly provided in the prompt

### Response Format

The AI is instructed to return JSON with `response_format: { type: "json_object" }`:

```json
{
  "recommendations": [
    {
      "optimizationType": "title",
      "title": "Optimize Title for SEO",
      "description": "Adding descriptive keywords improves search visibility...",
      "proposedChanges": {
        "title": "Premium Snowboard - Professional Quality Powder Board"
      },
      "insights": [
        {
          "type": "seo",
          "title": "Keyword Optimization",
          "description": "Adding 'Premium' and 'Professional' improves search ranking..."
        }
      ],
      "impactScore": 7
    }
  ]
}
```

### Fallback Recommendations

If the AI call fails (network error, rate limit, etc.), the system returns a static fallback recommendation:

```typescript
return [{
  title: "Optimize Product Title for SEO",
  description: "Enhance your product title with relevant keywords...",
  optimizationType: "title",
  proposedChanges: {
    title: `Premium ${product.title} - Professional Quality`,
  },
  insights: [
    { type: "seo", title: "Keyword Optimization", description: "..." },
    { type: "psychology", title: "Power Words", description: "..." },
  ],
  impactScore: 5,
}];
```

## Quota Management

Quota tracking lives in the `shops` table:

| Column | Description |
|--------|-------------|
| `recommendation_quota` | Monthly limit (default: 20) |
| `recommendations_used` | Used this billing cycle |
| `quota_reset_date` | When the quota resets |

The quota system is currently unlimited during beta. When enforced, the flow is:

1. Check if `recommendationsUsed < recommendationQuota`
2. Reserve quota before making the AI call (increment `recommendationsUsed`)
3. If the AI call fails, roll back the quota (decrement `recommendationsUsed`)
4. Quota resets monthly based on `quotaResetDate`

Quota can be manually reset via `POST /api/admin/reset-quota`.

## Conflict Prevention

Two layers prevent conflicting optimizations:

### Layer 1: Proactive (During Generation)

When generating recommendations for a product, the system queries active optimizations for that product and filters out recommendations for already-optimized attribute types:

```typescript
const activeOptimizations = await storage.getActiveOptimizationsByProduct(shop, product.id);
const activeTypes = new Set(activeOptimizations.map(t => t.optimizationType));

const availableRecommendations = aiRecommendations.filter(rec =>
  !activeTypes.has(rec.optimizationType)
);
```

### Layer 2: Defensive (During Activation)

When activating an optimization, the system checks for conflicting active optimizations on the same product with the same optimization type:

```typescript
const conflicts = await storage.getActiveOptimizationsByProduct(
  shop, optimization.productId, optimization.optimizationType
);
if (conflicts.length > 0) {
  return res.status(409).json({
    error: `Cannot activate: This product already has an active ${type} optimization.`,
    conflictingOptimizationId: conflicts[0].id,
  });
}
```
