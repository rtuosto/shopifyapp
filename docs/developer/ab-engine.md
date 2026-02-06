# Bayesian A/B Testing Engine

## Architecture

The statistical engine lives in `server/statistics/` with four modules:

| File | Responsibility |
|------|---------------|
| `sampling.ts` | XorShift32 deterministic RNG, Beta/Gamma/Normal/InverseGamma samplers |
| `models.ts` | Beta-LogNormal ARPU model, posterior updates, probability calculations |
| `policy.ts` | Top-Two Thompson Sampling allocation policy |
| `risk.ts` | CVaR throttling, safety budget, promotion criteria, EOC calculation |
| `allocation-service.ts` | Orchestration: ties models + policy + risk into a single update function |

## Statistical Model

### ARPU Decomposition

The engine models **Average Revenue Per User (ARPU)** as:

```
ARPU = P(conversion) × E[order_value | conversion]
```

Each arm (control and variant) has its own ARPU model consisting of two conjugate sub-models.

### Incidence Model: Beta(α, β)

Models conversion probability (did the visitor buy?).

```typescript
interface IncidencePosterior {
  alpha: number; // Successes + prior
  beta: number;  // Failures + prior
}
```

**Update rule:**
```typescript
function updateIncidencePosterior(prior, conversions, sessions) {
  return {
    alpha: prior.alpha + conversions,
    beta: prior.beta + (sessions - conversions),
  };
}
```

**Default prior:** `Beta(0.2, 9.8)` — equivalent to 2% conversion rate with strength of 10 pseudo-observations.

### Value Model: Normal-Inverse-Gamma

Models `log(order_value)` using a Normal-Inverse-Gamma conjugate prior. This captures both the mean and variance of order values.

```typescript
interface ValuePosterior {
  mu: number;      // Mean of log-values
  kappa: number;   // Precision parameter (strength of mean prior)
  alphaV: number;  // Inverse-Gamma shape (variance prior)
  betaV: number;   // Inverse-Gamma scale (variance prior)
}
```

**Update rule:** Standard Normal-Inverse-Gamma conjugate update with sample mean, sample variance, and prior-data interaction terms.

**Default prior:** `mu ≈ log(50) - 0.25`, `kappa = 1`, `alphaV = 2`, `betaV = 1` — weak prior centered on $50 AOV.

### ARPU Sampling

To sample an ARPU value (used in Thompson Sampling):

```typescript
function sampleARPU(model: ARPUModel, rng: XorShift32): number {
  // 1. Sample conversion probability: p ~ Beta(α, β)
  const p = sampleBeta(model.incidence.alpha, model.incidence.beta, rng);

  // 2. Sample variance: σ² ~ Inverse-Gamma(αᵥ, βᵥ)
  const sigma2 = sampleInverseGamma(model.value.alphaV, model.value.betaV, rng);

  // 3. Sample mean: μ | σ² ~ Normal(μ₀, σ²/κ₀)
  const mu = sampleNormal(model.value.mu, sigma2 / model.value.kappa, rng);

  // 4. Expected order value: E[V] = exp(μ + ½σ²)
  const expectedValue = Math.exp(mu + 0.5 * sigma2);

  // 5. ARPU = conversion probability × expected order value
  return p * expectedValue;
}
```

## Thompson Sampling: TTTS

The engine uses **Top-Two Thompson Sampling (TTTS)**, which allocates most traffic to the arm that samples highest while maintaining minimum exploration to the second-best arm.

### Algorithm

```
1. Sample ARPU for control and variant from their posteriors
2. Identify the best arm (highest sampled ARPU)
3. Allocate (1 - ε) to the best arm
4. Allocate ε to the second-best arm
5. ε is fixed at 1% (minimal floor for statistical validity)
```

**Implementation** (`policy.ts`):

```typescript
function computeTTTSAllocation(controlModel, variantModel, params, seed) {
  const epsilon = 0.01; // 1% exploration to second-best
  const rng = new XorShift32(seed);

  const controlSample = sampleARPU(controlModel, rng);
  const variantSample = sampleARPU(variantModel, rng);

  if (controlSample >= variantSample) {
    return { control: 1 - epsilon, variant: epsilon };
  } else {
    return { control: epsilon, variant: 1 - epsilon };
  }
}
```

### Allocation Constraints

After TTTS computes the raw allocation, `applyAllocationConstraints` enforces floor values:

```typescript
function applyAllocationConstraints(rawAllocation, controlFloor, variantFloor) {
  // Enforce control floor first (safety priority)
  // Then enforce variant floor
  // Normalize to sum to 1.0
}
```

Both floors default to **1%**, allowing up to 99/1 splits when the engine is confident.

## Allocation Flow

The complete allocation update pipeline (`allocation-service.ts`):

```
updateBayesianState(currentState, metrics)
    │
    ├→ Update control incidence posterior
    ├→ Update control value posterior
    ├→ Update variant incidence posterior
    └→ Update variant value posterior
         │
         ↓
computeAllocationUpdate(updatedState, metrics)
    │
    ├→ Build ARPUModel for each arm
    ├→ Calculate P(variant wins) via Monte Carlo (2048 samples)
    ├→ Calculate mean ARPU for each arm
    ├→ Check CVaR throttle
    │     └→ If variant downside risk > control: cap variant at 2%
    ├→ Compute TTTS allocation
    ├→ Apply allocation constraints (1% floors)
    ├→ Calculate cost of waiting (exploration regret)
    ├→ Update safety budget
    │     └→ Deduct cost_of_waiting × new_impressions
    ├→ Check promotion criteria
    └→ Return AllocationUpdateResult
```

## Risk Management

### CVaR Throttling

**Conditional Value at Risk (CVaR)** at the 5th percentile provides downside protection. If the variant's worst-case ARPU is worse than the control's worst-case:

```typescript
function shouldThrottleVariant(controlModel, variantModel, cvarQuantile = 0.05) {
  // Generate 2048 ARPU samples for each arm
  // Calculate CVaR (average of bottom 5% of samples)
  // Throttle if variant CVaR < control CVaR
}
```

When throttled, the variant allocation is capped at 2%.

### Safety Budget

Each optimization starts with a safety budget (default $50). The **cost of waiting** (exploration regret per session) is deducted for each new impression:

```
safetyBudgetRemaining -= costOfWaitingPerSession × newImpressions
```

If the budget reaches zero without meeting promotion criteria, the optimization is stopped to limit revenue loss.

**Safeguards:**
- Budget resets if it becomes unreasonably negative (< -$1000) due to migration bugs
- Pathological cost values (NaN, Infinity) trigger immediate budget exhaustion
- Only new impressions since the last update are charged (delta tracking via `lastTotalImpressions`)

### Cost of Waiting

The cost of waiting measures the per-session regret of not sending 100% traffic to the best arm:

```typescript
function calculateCostOfWaiting(controlModel, variantModel, currentAllocation) {
  // For each Monte Carlo sample:
  //   maxARPU = max(controlARPU, variantARPU)
  //   currentARPU = allocation.control × controlARPU + allocation.variant × variantARPU
  //   regret = maxARPU - currentARPU
  // Return average regret per session
}
```

## Promotion Criteria

An optimization is promoted when **all three criteria** are met simultaneously:

| Criterion | Default Threshold | Description |
|-----------|-------------------|-------------|
| Minimum samples | 2,000 per arm | Ensures sufficient data for reliable conclusions |
| P(meaningful lift ≥ 5%) | ≥ 95% | Probability that the variant provides at least 5% ARPU lift |
| EOC per 1,000 sessions | ≤ $1.00 | Expected opportunity cost of promoting the wrong arm |

```typescript
const DEFAULT_PROMOTION_CRITERIA = {
  minSamplesPerArm: 2000,
  minLiftPercent: 5,
  minProbabilityMeaningfulLift: 0.95,
  maxEOCPer1000Sessions: 1.00,
};
```

### Expected Opportunity Cost (EOC)

EOC measures the lock-in risk of promoting the wrong arm:

```typescript
function calculateEOC(controlModel, variantModel, numSamples = 4096) {
  // For each Monte Carlo sample:
  //   Sample both arms
  //   Current winner = arm with higher sampled ARPU
  //   Regret = max(both) - winner
  // Return average regret × 1000
}
```

## Deterministic RNG

All Monte Carlo sampling uses a **XorShift32** seeded PRNG for reproducibility:

```typescript
class XorShift32 {
  private state: number;

  constructor(seed: number = 1) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return (this.state >>> 0) / 0x100000000;
  }
}
```

**Distribution samplers built on XorShift32:**

| Sampler | Method | Used For |
|---------|--------|----------|
| `sampleBeta(α, β)` | Gamma ratio method | Conversion probability |
| `sampleGamma(α)` | Marsaglia-Tsang method | Internal (for Beta sampling) |
| `sampleNormal(μ, σ²)` | Box-Muller transform | Log order value mean |
| `sampleInverseGamma(α, β)` | `β / Gamma(α)` | Log order value variance |

## Probability Calculations

### P(variant wins)

```typescript
function calculateProbabilityVariantWins(control, variant, numSamples = 2048) {
  // Sample ARPU from both posteriors numSamples times
  // Count how often variant > control
  // Return fraction
}
```

### P(meaningful lift ≥ X%)

```typescript
function calculateProbabilityMeaningfulLift(control, variant, minLiftPct, numSamples = 2048) {
  // Sample ARPU from both posteriors
  // Calculate lift = (variantARPU - controlARPU) / controlARPU × 100
  // Count how often lift ≥ minLiftPct
  // Return fraction
}
```
