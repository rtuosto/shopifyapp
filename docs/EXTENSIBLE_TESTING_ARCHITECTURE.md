# Extensible Testing Architecture

## Overview
The Shoptimizer testing system is designed to support three levels of optimization sophistication:

1. **Product-Level A/B Tests** (MVP - Current)
2. **Template-Level Tests** (Future)
3. **Advanced Optimization** (Bayesian & Multi-Armed Bandits - Future)

## Database Schema

### Test Scope & Targeting

```typescript
scope: "product" | "template" | "page" | "global"
productId: nullable // Required for product tests, null for template tests
targetSelector: nullable // CSS selector for template tests
```

**Use Cases:**

- **Product-level test**: `scope: "product"`, `productId: "123"`, `targetSelector: null`
  - Example: Test Product A's title change
  
- **Template-level test**: `scope: "template"`, `productId: null`, `targetSelector: ".product-card"`
  - Example: Test product card layout across all product listings
  
- **Page-level test**: `scope: "page"`, `productId: null`, `targetSelector: ".hero-section"`
  - Example: Test homepage hero image

### Optimization Strategy

```typescript
allocationStrategy: "fixed" | "bayesian" | "bandit"
controlAllocation: decimal(5,2) // Percentage 0-100
variantAllocation: decimal(5,2) // Percentage 0-100
```

**Strategies Explained:**

#### 1. Fixed Allocation (Current MVP)
```
controlAllocation: 50
variantAllocation: 50
allocationStrategy: "fixed"
```
- Simple 50/50 split
- Traffic allocation never changes
- Best for: Clear A/B tests with sufficient traffic

#### 2. Bayesian Optimization (Future)
```
allocationStrategy: "bayesian"
controlAllocation: 60 (dynamically adjusted)
variantAllocation: 40 (dynamically adjusted)
bayesianConfig: {
  priorAlpha: 1,
  priorBeta: 1,
  updateInterval: 60 // minutes
}
```
- Starts with equal traffic
- Continuously updates allocation based on performance
- Shifts more traffic to winning variant over time
- Best for: High-traffic stores, risk mitigation

**How it works:**
1. Collect conversion data for both variants
2. Update Beta distribution posteriors every `updateInterval`
3. Calculate probability that variant beats control
4. Adjust allocation to favor the likely winner
5. Continue until confidence threshold reached

#### 3. Multi-Armed Bandit (Future)
```
allocationStrategy: "bandit"
controlAllocation: 70 (dynamically adjusted)
variantAllocation: 30 (dynamically adjusted)
minSampleSize: 100
```
- Aggressive optimization strategy
- Minimizes opportunity cost (lost revenue from showing losing variant)
- Rapidly shifts traffic to winner
- Best for: High-traffic stores, multiple variants

**How it works:**
1. Exploration phase: Equal allocation until `minSampleSize` reached
2. Exploitation phase: Use Thompson Sampling or UCB1 algorithm
3. Continuously adjust allocation based on conversion rates
4. Can extend to test 3+ variants simultaneously

### Statistical Configuration

```typescript
confidenceThreshold: decimal(3,2) // Default 0.95 (95% confidence)
minSampleSize: integer // Default 100 samples per variant
```

- `confidenceThreshold`: Statistical significance required to declare winner
- `minSampleSize`: Minimum impressions before optimization algorithms activate

## Attribution & Spillover Effects

### Product-Level Tests
**What we measure:**
- Direct attribution: Product A variant → Product A purchase ✅

**What we DON'T measure:**
- Spillover: Product A variant influences Product B purchase ❌

**Example:**
```
Customer journey:
1. Views Product A with variant title: "Premium Mountain Board - Pro Quality"
2. Perceives brand as high-end
3. Buys Product B at full price (no discount needed)

Attribution: ❌ We don't attribute Product B's sale to Product A's test
Reality: ✅ Product A's variant may have influenced the purchase
```

**Industry Standard:** This is an accepted limitation. Most A/B testing platforms only measure direct impact.

### Template-Level Tests
**What we measure:**
- All products shown with the variant template

**Spillover is INCLUDED:**
- Changing product page layout affects all products
- We measure overall revenue lift across all affected products

**Example:**
```
Template test: Product page layout change
- Scope: "template"
- ProductId: null (affects all products)
- TargetSelector: ".product-page-layout"

Attribution: ✅ Any product purchase counts toward the variant if they saw the variant layout
```

## Implementation Roadmap

### Phase 1: MVP (Current)
- ✅ Product-level tests only
- ✅ Fixed 50/50 allocation
- ✅ Per-variant metrics tracking
- ✅ ARPU as primary metric

### Phase 2: Template Tests (Next)
- [ ] Storefront JavaScript: Detect test scope
- [ ] Apply CSS/DOM changes for template tests
- [ ] Attribution: Track page-level impressions
- [ ] UI: Template test creation flow

### Phase 3: Bayesian Optimization
- [ ] Background job: Calculate Bayesian posteriors
- [ ] Dynamic allocation adjustment
- [ ] UI: Show confidence intervals
- [ ] Auto-stop tests when winner is clear

### Phase 4: Multi-Armed Bandits
- [ ] Thompson Sampling algorithm
- [ ] Support 3+ variants per test
- [ ] Exploration-exploitation balance
- [ ] Real-time allocation updates

## Technical Considerations

### Client-Side Implementation (Future)
```javascript
// public/shoptimizer.js
function getTestVariant(test) {
  if (test.scope === 'product') {
    // Current implementation: Product-level bucketing
    return hashProductVariant(test.id, test.productId);
  } else if (test.scope === 'template') {
    // Future: Template-level bucketing
    return hashTemplateVariant(test.id, test.targetSelector);
  }
}

function applyTestVariant(test, variant) {
  if (test.scope === 'product') {
    // Modify product data (title, price, etc.)
    applyProductChanges(test, variant);
  } else if (test.scope === 'template') {
    // Modify template/layout via CSS/DOM
    applyTemplateChanges(test, variant);
  }
}
```

### Conversion Attribution (Future)
```typescript
// Webhook handler for ORDERS_CREATE
function attributeConversion(order, customerSession) {
  const activeTests = await getActiveTests();
  
  for (const test of activeTests) {
    if (test.scope === 'product') {
      // Product-level: Check if ordered product was in test
      const orderedProductIds = order.line_items.map(i => i.product_id);
      if (orderedProductIds.includes(test.productId)) {
        // Attribute to the variant they saw
        const variant = getSessionVariant(customerSession, test.id);
        await recordConversion(test, variant, order.total_price);
      }
    } else if (test.scope === 'template') {
      // Template-level: All orders during session count
      const variant = getSessionVariant(customerSession, test.id);
      await recordConversion(test, variant, order.total_price);
    }
  }
}
```

## Summary

✅ **Current MVP**: Product-level tests with fixed 50/50 allocation
✅ **Schema Ready**: Supports template tests, Bayesian, and bandits
✅ **Acknowledged**: Spillover effects in product-level tests (industry standard limitation)
⏳ **Future**: Template tests will capture spillover by measuring all affected products
⏳ **Future**: Bayesian/Bandit strategies will minimize opportunity cost and maximize revenue

The architecture is extensible without breaking changes. All new features can be added by:
1. Setting `scope` to "template" or "page"
2. Changing `allocationStrategy` to "bayesian" or "bandit"
3. Implementing corresponding client-side and server-side logic
