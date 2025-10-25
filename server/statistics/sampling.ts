/**
 * Statistical Sampling Library
 * Implements deterministic RNG and probability distribution samplers for Bayesian A/B testing
 */

/**
 * XorShift32 - Deterministic pseudo-random number generator
 * Provides reproducible random sequences for simulation and testing
 */
export class XorShift32 {
  private state: number;

  constructor(seed: number = 1) {
    // Ensure seed is a valid 32-bit unsigned integer
    this.state = seed >>> 0 || 1;
  }

  /**
   * Generate next random number in [0, 1)
   */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return (this.state >>> 0) / 0x100000000;
  }

  /**
   * Reset RNG to a specific seed
   */
  setSeed(seed: number): void {
    this.state = seed >>> 0 || 1;
  }
}

/**
 * Sample from Beta(α, β) distribution using Cheng's method
 * Used for modeling conversion probability (incidence)
 */
export function sampleBeta(alpha: number, beta: number, rng: XorShift32): number {
  if (alpha <= 0 || beta <= 0) {
    throw new Error(`Invalid Beta parameters: alpha=${alpha}, beta=${beta}`);
  }

  // Special case: Beta(1,1) is uniform
  if (alpha === 1 && beta === 1) {
    return rng.next();
  }

  // Use gamma sampling: if X ~ Gamma(α) and Y ~ Gamma(β), then X/(X+Y) ~ Beta(α,β)
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  return x / (x + y);
}

/**
 * Sample from Gamma(α, 1) distribution using Marsaglia and Tsang's method
 * Used internally for Beta sampling
 */
function sampleGamma(alpha: number, rng: XorShift32): number {
  if (alpha < 1) {
    // For alpha < 1, use transformation: Gamma(α) = Gamma(α+1) * U^(1/α)
    const sample = sampleGamma(alpha + 1, rng);
    return sample * Math.pow(rng.next(), 1 / alpha);
  }

  // Marsaglia and Tsang's method for alpha >= 1
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = sampleNormal(0, 1, rng);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = rng.next();
    const x2 = x * x;

    // Accept/reject
    if (u < 1 - 0.0331 * x2 * x2) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Sample from Normal(μ, σ²) distribution using Box-Muller transform
 * Used for LogNormal order value modeling
 */
export function sampleNormal(mu: number, sigma2: number, rng: XorShift32): number {
  // Box-Muller transform
  const u1 = rng.next();
  const u2 = rng.next();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + Math.sqrt(sigma2) * z0;
}

/**
 * Sample from Inverse-Gamma(α, β) distribution
 * Used for variance modeling in LogNormal order values
 * 
 * If X ~ Gamma(α, β), then 1/X ~ Inverse-Gamma(α, β)
 */
export function sampleInverseGamma(alpha: number, beta: number, rng: XorShift32): number {
  if (alpha <= 0 || beta <= 0) {
    throw new Error(`Invalid Inverse-Gamma parameters: alpha=${alpha}, beta=${beta}`);
  }

  // Sample from Gamma(α, 1) and scale by β
  const gammaSample = sampleGamma(alpha, rng);
  return beta / gammaSample;
}

/**
 * Generate multiple samples from a distribution
 */
export function generateSamples(
  count: number,
  sampler: (rng: XorShift32) => number,
  seed?: number
): number[] {
  const rng = new XorShift32(seed);
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    samples.push(sampler(rng));
  }
  return samples;
}
