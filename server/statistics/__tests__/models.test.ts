import { describe, it, expect } from 'vitest';
import {
  createDefaultARPUPrior,
  updateIncidencePosterior,
  updateValuePosterior,
  sampleARPU,
  calculateMeanARPU,
  calculateProbabilityVariantWins,
  calculateProbabilityMeaningfulLift,
} from '../models';
import type { IncidencePosterior, ValuePosterior, ARPUModel } from '../models';
import { XorShift32 } from '../sampling';

describe('Default ARPU Prior', () => {
  it('should create weak priors with default parameters', () => {
    const prior = createDefaultARPUPrior();
    
    // Default is 2% CR
    expect(prior.incidence.alpha).toBeCloseTo(0.2, 2);
    expect(prior.incidence.beta).toBeCloseTo(9.8, 2);
    
    // Should have reasonable value prior
    expect(prior.value.mu).toBeGreaterThan(0);
    expect(prior.value.kappa).toBe(1); // Weak prior
  });

  it('should accept custom conversion rate and AOV', () => {
    const prior = createDefaultARPUPrior({
      conversionRate: 0.05, // 5%
      avgOrderValue: 100,
    });
    
    // 5% CR with prior strength 10
    expect(prior.incidence.alpha).toBeCloseTo(0.5, 2);
    expect(prior.incidence.beta).toBeCloseTo(9.5, 2);
    
    // AOV of 100 should influence mu
    expect(prior.value.mu).toBeCloseTo(Math.log(100) - 0.25, 1);
  });
});

describe('Incidence Posterior Updates', () => {
  it('should correctly update with new conversion data', () => {
    const prior: IncidencePosterior = { alpha: 2, beta: 8 }; // Prior: ~20% CR
    
    // Observe 5 conversions out of 100 sessions (5% CR)
    const posterior = updateIncidencePosterior(prior, 5, 100);
    
    expect(posterior.alpha).toBe(7); // 2 + 5
    expect(posterior.beta).toBe(103); // 8 + (100 - 5)
  });

  it('should handle zero conversions', () => {
    const prior: IncidencePosterior = { alpha: 1, beta: 1 };
    
    // Observe 0 conversions out of 50 sessions
    const posterior = updateIncidencePosterior(prior, 0, 50);
    
    expect(posterior.alpha).toBe(1); // 1 + 0
    expect(posterior.beta).toBe(51); // 1 + 50
  });

  it('should handle perfect conversion (all convert)', () => {
    const prior: IncidencePosterior = { alpha: 1, beta: 1 };
    
    // Observe 20 conversions out of 20 sessions
    const posterior = updateIncidencePosterior(prior, 20, 20);
    
    expect(posterior.alpha).toBe(21); // 1 + 20
    expect(posterior.beta).toBe(1); // 1 + 0
  });

  it('should maintain mean approximately with many updates', () => {
    let posterior: IncidencePosterior = { alpha: 10, beta: 90 }; // ~10% CR
    
    // Simulate 10 batches of 100 sessions with true 10% CR
    for (let i = 0; i < 10; i++) {
      posterior = updateIncidencePosterior(posterior, 10, 100);
    }
    
    // Posterior mean should still be close to 10%
    const mean = posterior.alpha / (posterior.alpha + posterior.beta);
    expect(mean).toBeCloseTo(0.1, 2);
  });
});

describe('Value Posterior Updates', () => {
  it('should correctly update with new order values', () => {
    const prior: ValuePosterior = {
      mu: 4.0,
      kappa: 1,
      alphaV: 2,
      betaV: 1,
    };
    
    // Add order values around $50-60
    const orderValues = [50, 55, 60, 52, 58];
    const posterior = updateValuePosterior(prior, orderValues);
    
    // Posterior should have more data
    expect(posterior.kappa).toBe(6); // 1 + 5
    expect(posterior.alphaV).toBe(4.5); // 2 + 5/2
    
    // mu should shift toward sample mean
    const sampleLogMean = orderValues.map(Math.log).reduce((a, b) => a + b, 0) / 5;
    expect(posterior.mu).toBeGreaterThan(prior.mu);
    expect(posterior.mu).toBeLessThan(sampleLogMean);
  });

  it('should return prior when no order values provided', () => {
    const prior: ValuePosterior = {
      mu: 4.0,
      kappa: 1,
      alphaV: 2,
      betaV: 1,
    };
    
    const posterior = updateValuePosterior(prior, []);
    
    expect(posterior).toEqual(prior);
  });

  it('should handle single order value', () => {
    const prior: ValuePosterior = {
      mu: 4.0,
      kappa: 1,
      alphaV: 2,
      betaV: 1,
    };
    
    const posterior = updateValuePosterior(prior, [100]);
    
    expect(posterior.kappa).toBe(2); // 1 + 1
    expect(posterior.alphaV).toBe(2.5); // 2 + 0.5
  });

  it('should increase precision with more data', () => {
    let posterior: ValuePosterior = {
      mu: 4.0,
      kappa: 1,
      alphaV: 2,
      betaV: 1,
    };
    
    // Add many consistent order values
    const manyOrders = Array(100).fill(55);
    posterior = updateValuePosterior(posterior, manyOrders);
    
    // Precision (kappa) should increase dramatically
    expect(posterior.kappa).toBe(101); // 1 + 100
    expect(posterior.alphaV).toBe(52); // 2 + 50
  });
});

describe('ARPU Calculations', () => {
  it('should calculate mean ARPU from model', () => {
    const model: ARPUModel = {
      incidence: { alpha: 10, beta: 90 }, // ~10% CR
      value: { mu: 4.0, kappa: 10, alphaV: 10, betaV: 10 },
    };
    
    const meanARPU = calculateMeanARPU(model);
    
    // CR ~0.1, E[V] ~ exp(4 + variance/2) ~ $60-70
    // ARPU ~ 0.1 × $60-70 ~ $6-7
    expect(meanARPU).toBeGreaterThan(0);
    expect(meanARPU).toBeLessThan(20);
  });

  it('should handle edge case with very low conversion rate', () => {
    const model: ARPUModel = {
      incidence: { alpha: 1, beta: 999 }, // ~0.1% CR
      value: { mu: 4.0, kappa: 10, alphaV: 10, betaV: 10 },
    };
    
    const meanARPU = calculateMeanARPU(model);
    
    // Very low CR should result in very low ARPU
    expect(meanARPU).toBeGreaterThan(0);
    expect(meanARPU).toBeLessThan(1);
  });
});

describe('Probability Calculations', () => {
  it('should calculate probability variant wins when variant is clearly better', () => {
    const control: ARPUModel = {
      incidence: { alpha: 50, beta: 950 }, // ~5% CR
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 100, beta: 900 }, // ~10% CR (2x better!)
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const prob = calculateProbabilityVariantWins(control, variant, 5000, 12345);
    
    // Variant should win with very high probability
    expect(prob).toBeGreaterThan(0.9);
  });

  it('should calculate ~50% when control and variant are equal', () => {
    const control: ARPUModel = {
      incidence: { alpha: 50, beta: 50 }, // ~50% CR
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 50, beta: 50 }, // Also ~50% CR
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const prob = calculateProbabilityVariantWins(control, variant, 5000, 54321);
    
    // Should be approximately 50%
    expect(prob).toBeGreaterThan(0.4);
    expect(prob).toBeLessThan(0.6);
  });

  it('should be deterministic with same seed', () => {
    const control: ARPUModel = {
      incidence: { alpha: 50, beta: 950 },
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 60, beta: 940 },
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const prob1 = calculateProbabilityVariantWins(control, variant, 1000, 99999);
    const prob2 = calculateProbabilityVariantWins(control, variant, 1000, 99999);
    
    expect(prob1).toBe(prob2);
  });
});

describe('Meaningful Lift Probability', () => {
  it('should detect high probability of meaningful lift', () => {
    const control: ARPUModel = {
      incidence: { alpha: 100, beta: 900 }, // ~10% CR
      value: { mu: 4.0, kappa: 100, alphaV: 100, betaV: 100 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 120, beta: 880 }, // ~12% CR (20% lift)
      value: { mu: 4.0, kappa: 100, alphaV: 100, betaV: 100 },
    };
    
    // Ask for 5% minimum lift
    const prob = calculateProbabilityMeaningfulLift(control, variant, 5, 5000, 11111);
    
    // Should have good probability of >5% lift (variance means not always >0.8)
    expect(prob).toBeGreaterThan(0.6);
  });

  it('should return lower probability when lift is marginal', () => {
    const control: ARPUModel = {
      incidence: { alpha: 100, beta: 900 },
      value: { mu: 4.0, kappa: 100, alphaV: 100, betaV: 100 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 102, beta: 898 }, // Only 2% lift
      value: { mu: 4.0, kappa: 100, alphaV: 100, betaV: 100 },
    };
    
    // Ask for 10% minimum lift
    const prob = calculateProbabilityMeaningfulLift(control, variant, 10, 5000, 22222);
    
    // Less likely to have 10% lift when true lift is only 2%
    expect(prob).toBeLessThan(0.5);
  });
});

describe('ARPU Model Integration', () => {
  it('should work end-to-end: create prior, update with data, sample', () => {
    // Start with default prior
    let model = createDefaultARPUPrior({ conversionRate: 0.03, avgOrderValue: 50 });
    
    // Simulate observing 10 conversions out of 200 sessions (5% CR)
    model.incidence = updateIncidencePosterior(model.incidence, 10, 200);
    
    // Simulate order values around $45-55
    const orders = [45, 50, 55, 48, 52, 47, 53, 51, 49, 54];
    model.value = updateValuePosterior(model.value, orders);
    
    // Sample ARPU
    const rng = new XorShift32(777);
    const arpuSample = sampleARPU(model, rng);
    
    // Should be positive and reasonable (5% CR × ~$50 AOV ~ $2.50)
    expect(arpuSample).toBeGreaterThan(0);
    expect(arpuSample).toBeLessThan(10);
  });
});
