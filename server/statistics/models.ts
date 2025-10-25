/**
 * Bayesian Models for ARPU Optimization
 * Implements Beta-LogNormal model for conversion probability and order value
 */

import { XorShift32, sampleBeta, sampleNormal, sampleInverseGamma } from './sampling';

/**
 * Incidence model: Beta(α, β) for conversion probability
 */
export interface IncidencePosterior {
  alpha: number; // Success count + prior
  beta: number;  // Failure count + prior
}

/**
 * Order value model: LogNormal with Normal-Inverse-Gamma conjugate prior
 * Models log(V) where V is order value
 */
export interface ValuePosterior {
  mu: number;      // Mean of log-values
  kappa: number;   // Precision parameter
  alphaV: number;  // Inverse-Gamma shape
  betaV: number;   // Inverse-Gamma scale
}

/**
 * Complete ARPU model for one arm
 */
export interface ARPUModel {
  incidence: IncidencePosterior;
  value: ValuePosterior;
}

/**
 * Default conservative priors for ARPU model
 * These are production-safe defaults that work across most e-commerce stores
 */
export function createDefaultARPUPrior(params?: {
  conversionRate?: number;
  avgOrderValue?: number;
}): ARPUModel {
  const cr = params?.conversionRate || 0.02; // 2% default conversion rate
  const aov = params?.avgOrderValue || 50;   // $50 default AOV

  // Beta prior for conversion (weak prior: α+β = 10)
  const incidence: IncidencePosterior = {
    alpha: cr * 10,      // e.g., 0.2 for 2% CR
    beta: (1 - cr) * 10, // e.g., 9.8
  };

  // LogNormal prior for order value
  // We model log(V), so mu ≈ log(AOV) - ½σ²
  // For conservative prior, use higher variance (σ² ≈ 0.5)
  const logAOV = Math.log(aov);
  const value: ValuePosterior = {
    mu: logAOV - 0.25,  // Adjust for E[V] = exp(μ + ½σ²)
    kappa: 1,           // Weak prior strength
    alphaV: 2,          // Weak prior on variance
    betaV: 1,           // Corresponds to σ² ≈ 0.5
  };

  return { incidence, value };
}

/**
 * Update incidence posterior with new conversion data
 * @param prior Current posterior (or initial prior)
 * @param conversions Number of new conversions
 * @param sessions Number of new sessions
 */
export function updateIncidencePosterior(
  prior: IncidencePosterior,
  conversions: number,
  sessions: number
): IncidencePosterior {
  return {
    alpha: prior.alpha + conversions,
    beta: prior.beta + (sessions - conversions),
  };
}

/**
 * Update value posterior with new order value data
 * @param prior Current posterior (or initial prior)
 * @param orderValues Array of order values (only from conversions)
 */
export function updateValuePosterior(
  prior: ValuePosterior,
  orderValues: number[]
): ValuePosterior {
  if (orderValues.length === 0) {
    return prior;
  }

  const n = orderValues.length;
  const logValues = orderValues.map(v => Math.log(v));
  const sampleMean = logValues.reduce((sum, x) => sum + x, 0) / n;
  const sampleVariance = logValues.reduce((sum, x) => sum + Math.pow(x - sampleMean, 2), 0) / n;

  // Conjugate update formulas for Normal-Inverse-Gamma
  const kappaNew = prior.kappa + n;
  const muNew = (prior.kappa * prior.mu + n * sampleMean) / kappaNew;
  const alphaNew = prior.alphaV + n / 2;
  const betaNew = prior.betaV +
    0.5 * n * sampleVariance +
    0.5 * (prior.kappa * n / kappaNew) * Math.pow(sampleMean - prior.mu, 2);

  return {
    mu: muNew,
    kappa: kappaNew,
    alphaV: alphaNew,
    betaV: betaNew,
  };
}

/**
 * Sample ARPU using Thompson Sampling
 * @param model ARPU model (incidence + value posteriors)
 * @param rng Deterministic RNG
 * @returns Sampled ARPU value
 */
export function sampleARPU(model: ARPUModel, rng: XorShift32): number {
  // Sample conversion probability: p ~ Beta(α, β)
  const p = sampleBeta(model.incidence.alpha, model.incidence.beta, rng);

  // Sample variance: σ² ~ Inverse-Gamma(α_v, β_v)
  const sigma2 = sampleInverseGamma(model.value.alphaV, model.value.betaV, rng);

  // Sample mean: μ | σ² ~ Normal(μ₀, σ²/κ₀)
  const mu = sampleNormal(model.value.mu, sigma2 / model.value.kappa, rng);

  // Expected order value: E[V] = exp(μ + ½σ²)
  const expectedValue = Math.exp(mu + 0.5 * sigma2);

  // ARPU = conversion probability × expected order value
  return p * expectedValue;
}

/**
 * Calculate mean ARPU from model (analytical)
 * Useful for display purposes
 */
export function calculateMeanARPU(model: ARPUModel): number {
  // Mean conversion rate from Beta
  const meanP = model.incidence.alpha / (model.incidence.alpha + model.incidence.beta);

  // Mean order value from LogNormal
  // E[V] = exp(μ + ½ E[σ²])
  // E[σ²] = β_v / (α_v - 1) for α_v > 1
  const meanSigma2 = model.value.alphaV > 1
    ? model.value.betaV / (model.value.alphaV - 1)
    : 1; // Fallback for weak priors
  const meanValue = Math.exp(model.value.mu + 0.5 * meanSigma2);

  return meanP * meanValue;
}

/**
 * Calculate probability that variant > control
 * @param control Control arm model
 * @param variant Variant arm model
 * @param numSamples Number of Monte Carlo samples (default 2048)
 * @param seed RNG seed for reproducibility
 */
export function calculateProbabilityVariantWins(
  control: ARPUModel,
  variant: ARPUModel,
  numSamples: number = 2048,
  seed?: number
): number {
  const rng = new XorShift32(seed);
  let wins = 0;

  for (let i = 0; i < numSamples; i++) {
    const controlARPU = sampleARPU(control, rng);
    const variantARPU = sampleARPU(variant, rng);
    if (variantARPU > controlARPU) {
      wins++;
    }
  }

  return wins / numSamples;
}

/**
 * Calculate probability of meaningful lift (e.g., lift >= 5%)
 * @param control Control arm model
 * @param variant Variant arm model
 * @param minLiftPct Minimum lift percentage (e.g., 5 for 5%)
 * @param numSamples Number of Monte Carlo samples
 * @param seed RNG seed
 */
export function calculateProbabilityMeaningfulLift(
  control: ARPUModel,
  variant: ARPUModel,
  minLiftPct: number,
  numSamples: number = 2048,
  seed?: number
): number {
  const rng = new XorShift32(seed);
  let count = 0;

  for (let i = 0; i < numSamples; i++) {
    const controlARPU = sampleARPU(control, rng);
    const variantARPU = sampleARPU(variant, rng);
    const lift = (variantARPU - controlARPU) / controlARPU * 100;
    if (lift >= minLiftPct) {
      count++;
    }
  }

  return count / numSamples;
}
