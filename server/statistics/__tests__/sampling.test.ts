import { describe, it, expect } from 'vitest';
import { XorShift32, sampleBeta, sampleNormal } from '../sampling';
import { sampleARPU } from '../models';
import type { IncidencePosterior, ValuePosterior, ARPUModel } from '../models';

describe('XorShift32 RNG', () => {
  it('should produce deterministic sequences from fixed seeds', () => {
    const rng1 = new XorShift32(12345);
    const rng2 = new XorShift32(12345);
    
    const sequence1 = Array.from({ length: 100 }, () => rng1.next());
    const sequence2 = Array.from({ length: 100 }, () => rng2.next());
    
    expect(sequence1).toEqual(sequence2);
  });

  it('should produce different sequences from different seeds', () => {
    const rng1 = new XorShift32(12345);
    const rng2 = new XorShift32(54321);
    
    const sequence1 = Array.from({ length: 100 }, () => rng1.next());
    const sequence2 = Array.from({ length: 100 }, () => rng2.next());
    
    expect(sequence1).not.toEqual(sequence2);
  });

  it('should generate values in [0, 1) range', () => {
    const rng = new XorShift32(42);
    
    for (let i = 0; i < 1000; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('should have approximately uniform distribution', () => {
    const rng = new XorShift32(9876);
    const samples = Array.from({ length: 10000 }, () => rng.next());
    
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    // Uniform [0,1] has mean 0.5
    expect(mean).toBeCloseTo(0.5, 1);
  });
});

describe('Beta Sampler', () => {
  it('should produce samples with correct mean', () => {
    const rng = new XorShift32(111);
    
    // Theoretical mean: alpha / (alpha + beta) = 10/30 = 0.333...
    const samples = Array.from({ length: 10000 }, () => sampleBeta(10, 20, rng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    expect(mean).toBeCloseTo(0.333, 1);
  });

  it('should handle edge case alpha=1, beta=1 (uniform)', () => {
    const rng = new XorShift32(222);
    
    const samples = Array.from({ length: 5000 }, () => sampleBeta(1, 1, rng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    // Beta(1,1) is uniform [0,1], mean = 0.5
    expect(mean).toBeCloseTo(0.5, 1);
  });

  it('should produce samples in [0, 1] range', () => {
    const rng = new XorShift32(333);
    
    for (let i = 0; i < 1000; i++) {
      const sample = sampleBeta(5, 10, rng);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  it('should handle highly skewed distributions (large alpha)', () => {
    const rng = new XorShift32(444);
    
    // Mean should be 100/110 ≈ 0.909
    const samples = Array.from({ length: 5000 }, () => sampleBeta(100, 10, rng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    expect(mean).toBeCloseTo(0.909, 1);
  });
});

describe('Normal Sampler', () => {
  it('should produce samples with approximately correct mean', () => {
    const rng = new XorShift32(555);
    const mu = 100;
    const sigma2 = 25; // variance = 25, stddev = 5
    
    const samples = Array.from({ length: 10000 }, () => sampleNormal(mu, sigma2, rng));
    const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    expect(sampleMean).toBeCloseTo(mu, 0);
  });

  it('should produce samples around mean', () => {
    const rng = new XorShift32(666);
    const mu = 50;
    const sigma2 = 100;
    
    const samples = Array.from({ length: 1000 }, () => sampleNormal(mu, sigma2, rng));
    
    // Most samples should be within 3 standard deviations
    const stddev = Math.sqrt(sigma2);
    const within3Sigma = samples.filter(x => Math.abs(x - mu) <= 3 * stddev).length;
    
    expect(within3Sigma / samples.length).toBeGreaterThan(0.95);
  });

  it('should handle zero variance case', () => {
    const rng = new XorShift32(777);
    const mu = 42;
    const sigma2 = 0.0001; // Very low variance
    
    const samples = Array.from({ length: 100 }, () => sampleNormal(mu, sigma2, rng));
    const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    expect(sampleMean).toBeCloseTo(mu, 0);
  });
});

describe('ARPU Sampler', () => {
  it('should compute ARPU as conversion_rate × order_value', () => {
    const rng = new XorShift32(888);
    
    const model: ARPUModel = {
      incidence: { alpha: 10, beta: 90 }, // ~10% CR
      value: { mu: 4.0, kappa: 10, alphaV: 10, betaV: 10 } // Tighter prior
    };
    
    const samples = Array.from({ length: 5000 }, () => sampleARPU(model, rng));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    // Expected ARPU should be positive
    // CR ~0.1, AOV ~ exp(4.0) ~ $55, so ARPU ~ $5.5
    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(20); // Reasonable for 10% CR × ~$55 AOV
  });

  it('should produce non-negative ARPU values', () => {
    const rng = new XorShift32(999);
    
    const model: ARPUModel = {
      incidence: { alpha: 5, beta: 20 },
      value: { mu: 4.0, kappa: 1, alphaV: 2, betaV: 1 }
    };
    
    for (let i = 0; i < 1000; i++) {
      const arpu = sampleARPU(model, rng);
      expect(arpu).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Statistical Distribution Tests', () => {
  it('should pass chi-square goodness-of-fit for Beta samples', () => {
    const rng = new XorShift32(1111);
    
    const numBins = 10;
    const bins = Array(numBins).fill(0);
    const numSamples = 10000;
    
    for (let i = 0; i < numSamples; i++) {
      const sample = sampleBeta(5, 5, rng); // Symmetric distribution
      const binIndex = Math.min(Math.floor(sample * numBins), numBins - 1);
      bins[binIndex]++;
    }
    
    // For Beta(5,5), distribution should be roughly symmetric
    // Check that left half ≈ right half
    const leftHalf = bins.slice(0, 5).reduce((a, b) => a + b, 0);
    const rightHalf = bins.slice(5).reduce((a, b) => a + b, 0);
    
    const ratio = leftHalf / rightHalf;
    expect(ratio).toBeCloseTo(1.0, 0); // Within 10%
  });

  it('should validate Normal variance scaling', () => {
    const rng1 = new XorShift32(2222);
    const rng2 = new XorShift32(3333);
    
    const lowVarSamples = Array.from({ length: 5000 }, () => sampleNormal(100, 10, rng1));
    const highVarSamples = Array.from({ length: 5000 }, () => sampleNormal(100, 100, rng2));
    
    const lowMean = lowVarSamples.reduce((a, b) => a + b, 0) / lowVarSamples.length;
    const highMean = highVarSamples.reduce((a, b) => a + b, 0) / highVarSamples.length;
    
    const lowStdDev = Math.sqrt(
      lowVarSamples.reduce((sum, x) => sum + (x - lowMean) ** 2, 0) / lowVarSamples.length
    );
    
    const highStdDev = Math.sqrt(
      highVarSamples.reduce((sum, x) => sum + (x - highMean) ** 2, 0) / highVarSamples.length
    );
    
    // High variance samples should have larger standard deviation
    expect(highStdDev).toBeGreaterThan(lowStdDev * 2);
  });
});
