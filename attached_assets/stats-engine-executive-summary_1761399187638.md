## CRO Autopilot Statistics Engine – Executive Summary

Audience: Business owners and technical stakeholders. This paper explains what the engine does in plain language, then specifies the statistical formulation precisely so expert readers can validate the approach.

### Business summary (what the engine does)

- **Goal**: Increase average revenue per user (ARPU) while minimizing downside risk during experiments.
- **How**: We show two experiences (A = control, B = variant) to shoppers. We start cautiously, allocate most traffic to control, then shift traffic toward the better option when evidence becomes strong. We only promote a winner to 100% traffic after strict safety checks.
- **Safety**: We throttle risky variants, enforce control-first floors, and stop early if the experiment’s expected opportunity cost consumes a small safety budget.

### What we optimize: ARPU

We model ARPU as the product of two parts:

- Incidence probability p: probability a session converts
- Order value V: revenue if a conversion happens

ARPU = p × E[V]

We estimate p and V separately and then combine them, which is both robust and interpretable.

### Bayesian model (precise)

- Incidence p uses a Beta prior/posterior: p ~ Beta(α, β)
- Order value V is modeled as LogNormal with Normal–Inverse-Gamma conjugacy over log-values:
  - σ² ~ Inv-Gamma(α_v, β_v)
  - μ | σ² ~ Normal(μ₀, σ²/κ₀)
  - Then E[V] = exp(μ + ½σ²)

Posterior updates come from the observed conversions (for p) and observed order values (for V) on each arm. The library exposes `updateIncidencePosterior`, `updateValuePosterior`, and a safe `createDefaultARPUPrior` initialized to reasonable, conservative priors.

### Thompson sampling for ARPU

For decision-making we draw ARPU samples via Thompson sampling:

1. Sample p ~ Beta(α, β)
2. Sample σ² ~ Inv-Gamma(α_v, β_v)
3. Sample μ ~ Normal(μ, σ²/κ)
4. Compute a sample ARPU = p × exp(μ + ½σ²)

We use a deterministic, seeded RNG (XorShift32) for reproducibility in simulation and testing.

### Allocation policy: Top-Two Thompson Sampling (TTTS)

- We draw one ARPU sample per arm, sort arms by sampled ARPU, and allocate:
  - (1 − ε) to the best arm, ε to the second-best arm
- ε depends on risk mode (cautious/balanced/aggressive) and is small in cautious mode.
- We normalize allocations to sum to 1, and apply an exploration-cap to prevent over-exposure to non-best arms under uncertainty.

### Risk controls

1. **CVaR throttle vs control**
   - We Monte Carlo sample ARPU for each arm and compute CVaR at q = 5% (lower tail average).
   - If an arm’s CVaR is worse than control, we throttle that arm down to a minimum traffic share (default throttleMin ≈ 2%).

2. **Control-first floors and measured ramp**
   - We enforce a control floor (default `controlFloor = 0.75`).
   - The variant has a small starting floor (`variantStart = 0.05`) and may increase via a ramp schedule based on the probability the variant beats control.
   - Default ramp schedule:
     - P(variant > control) ≥ 0.60 → variant floor ≥ 0.10
     - ≥ 0.80 → ≥ 0.20
     - ≥ 0.90 → ≥ 0.35
     - ≥ 0.95 → ≥ 0.50
   - Floors are applied before normalization; with the default control floor, the effective pre‑promotion variant exposure typically stays low (starting ~5%) and only rises meaningfully with strong evidence. At the highest step, normalization yields approximately 40% variant exposure pre‑promotion.

3. **Expected Opportunity Cost (EOC) safety budget**
   - We estimate EOC per 1,000 sessions with a conservative Monte Carlo estimator.
   - We accumulate a small revenue “safety budget” (default ≈ $50). If the cumulative expected opportunity cost exceeds this budget without meeting promotion criteria, we stop the experiment.

### EOC: promotion “lock‑in” risk vs. cost of waiting

- Plain English
  - EOC (what we gate on for promotion) prices the risk of locking in the current winner now if it isn’t truly the best. We only promote when that expected loss is tiny.
  - Cost of waiting is different: it’s the “tuition” you pay while still testing (because not 100% of traffic goes to the eventual best arm yet). We control that with cautious ramping and a small budget.

- Statistical definitions
  - Promotion EOC (lock‑in risk): \( \mathbb{E}\big[\max_i \mathrm{ARPU}_i - \mathrm{ARPU}_{\text{winner}}\big] \).
    - When evidence is strong and the winner equals the true best arm, this goes to ~0 ⇒ safe to promote.
  - Cost of waiting (exploration regret): the per‑session gap you incur while continuing to learn instead of sending 100% to the best. We do not use this to trigger promotion; we cap it with ramp + budget.

- How this protects revenue
  - Early (uncertain): EOC is larger (non‑trivial chance the apparent winner is wrong) ⇒ don’t lock in; keep exploring with a low variant floor.
  - Later (confident): EOC shrinks toward 0; the ramp has already moved substantial traffic to the better arm, limiting waiting cost; promotion proceeds once all gates pass.

- Controls in practice
  - Promotion gate (lock‑in risk): require small EOC/1k, large samples (≥ 2,000 per arm), and high confidence in meaningful lift (e.g., \(P(\text{lift} \ge 5\%) \ge 95\%\)).
  - Waiting cost cap: we translate EOC/1k to per‑session, accumulate it as a small “safety budget,” and stop if it’s exceeded before promotion.

### Promotion criteria (robust and conservative)

We promote the statistically best arm to 100% traffic only when ALL are true:

- Minimum sample size: per‑arm sessions ≥ 2,000
- Confidence in meaningful lift: P(relative lift ≥ 5%) ≥ 95%
- Risk gate: EOC per 1,000 sessions ≤ $1.00 (very strict)

When the gates pass, the winner is determined by the EOC‑calibrated criterion and receives 100% traffic; otherwise, we keep testing under guardrails.

### Why this maximizes revenue and minimizes risk

- Thompson sampling (and TTTS) naturally concentrates traffic on high‑ARPU arms while still exploring alternatives.
- CVaR throttling prevents over‑allocating to variants with bad downside tails.
- Control‑first floors and a measured ramp keep exposure low until the variant shows strong, sustained evidence.
- The promotion gates are intentionally strict (sample size, probability, lift, and EOC), ensuring upgrades are both statistically and economically justified.

### Defaults (production‑safe)

- Risk mode: cautious
- Control floor: 0.75; variant start: 0.05; ramp thresholds as above
- CVaR quantile: 5%; throttleMin ≈ 0.02
- EOC gate: ≤ $1.00 per 1,000 sessions
- Min sessions per arm: 2,000
- Safety budget: ≈ $50 expected opportunity cost
- Monte Carlo: 2,048 draws/arm (higher for promotion checks)
- Deterministic RNG: seeded XorShift32

### Practical implications for merchants

- Early in a test, almost all traffic remains on control, limiting risk while learning.
- As the variant consistently outperforms control, it receives more traffic—but still within strict guardrails.
- Only after strong statistical and economic evidence do we automatically promote the winner to 100% traffic.
- If the expected opportunity cost grows too high, we stop the test automatically.

### Technical pointers (code)

- Allocation policy: `lib/statistics/policy.js` (TTTS, normalization, exploration cap)
- Risk & promotion gates: `lib/statistics/risk.js` (CVaR throttle, EOC estimator, promotion logic)
- Sampling & RNG: `lib/statistics/sampling.js` (seeded RNG, Beta/Normal/Inv‑Gamma samplers)
- Simulation demo: `lib/routes/simulate-revenue.js` (default parameters and live state)

### Limitations and assumptions

- Stationarity: The model assumes stable behavior within an experiment window. Large non‑stationarities (e.g., flash sales) may require re‑seeding/restarts or time‑aware models.
- Two‑arm presentation: Current guardrails are tuned for A/B (two arms). Multi‑arm support exists in the engine, but safety floors should be revisited if testing >2 arms concurrently.
- Prior calibration: Default priors are conservative; power users can tune priors for their vertical (e.g., typical AOV distributions).

### Summary

This engine balances revenue growth and safety using Bayesian ARPU modeling, TTTS allocation, tail‑risk throttling (CVaR), and strict promotion gates that consider both statistical confidence and economic impact (EOC). The defaults are deliberately conservative to protect merchants while converging efficiently to higher‑revenue experiences.

### Appendix: Time‑to‑Impact & Revenue Impact Estimators

This appendix provides quick, back‑of‑envelope estimators for sales, success, and customer success teams to qualify stores and set expectations.

- Definitions
  - S: eligible sessions per day on the tested surface (e.g., PDP).
  - r: baseline ARPU per session (≈ conversion rate × AOV).
  - L: expected revenue lift if the variant is truly better (e.g., 5–10%).
  - avgShare_variant: average pre‑promotion variant share while ramping (≈ 0.20 conservative; up to ≈ 0.30 when evidence is strong).

- Time to promotion (sessions gate dominates)
  - Per‑arm minimum sessions: 2,000 (strict).
  - Variant sessions/day ≈ avgShare_variant × S.
  - Days to reach 2,000 variant sessions ≈ 2000 / (avgShare_variant × S).
    - Conservative (avgShare_variant = 0.20): days ≈ 10000 / S.
    - If variant looks clearly superior (≈ 0.30): days ≈ 6667 / S.
  - Add ~0–7 days to clear probability/lift/EOC gates depending on effect size and variance.

- Quick guide (rule‑of‑thumb)
  - S = 1,000/day → ~7–10 days to floor; ~1–2 weeks to promotion.
  - S = 500/day → ~13–20 days to floor; ~2–3 weeks to promotion.
  - S = 300/day → ~22–33 days to floor; ~3–4.5 weeks to promotion (borderline for 1‑month goal).
  - S = 200/day → ~33–50 days to floor; typically >1 month unless you broaden the surface area.

- Revenue Impact Estimator
  - ARPU form: incremental ≈ S × r × L × Days × ExposureFactor.
    - ExposureFactor ≈ 0.3–0.6 pre‑promotion (only a fraction of traffic on the variant), → 1.0 post‑promotion.
  - CR/AOV form (equivalent): incremental ≈ S × CR × AOV × L × Days × ExposureFactor.
  - Correct, grounded examples (CR = 1%, AOV = $50, L = 5%)
    - S = 300/day, 30 days, pre‑promotion ExposureFactor ≈ 0.5:
      - Baseline r = 0.01 × 50 = $0.50 per session; incremental/day ≈ 300 × 0.50 × 0.05 × 0.5 = $3.75.
      - ~30 days ≈ $112.50 pre‑promotion. If promotion occurs late in month, total ≈ $100–$400 depending on timing.
    - S = 500/day, 30 days, promote mid‑month (15 days pre at 0.5 exposure, 15 days post at 1.0 exposure):
      - Pre: 500 × 0.50 × 0.05 × 0.5 × 15 = $93.75; Post: 500 × 0.50 × 0.05 × 1.0 × 15 = $187.50; Total ≈ $281.25.
    - S = 1,000/day, promote after ~10 days: month‑one increments commonly land in the high hundreds to low thousands depending on effect size and timing.

- Qualification threshold (for month‑one win)
  - Aim for S ≥ 300/day on the tested surface for a reasonable chance to promote and show noticeable uplift within a month; ≥ 500/day is comfortable.
  - If S < 300/day, broaden the surface (more pages) or target higher‑traffic segments first.
