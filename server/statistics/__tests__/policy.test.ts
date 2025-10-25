import { describe, it, expect } from 'vitest';
import {
  computeTTTSAllocation,
  applyAllocationConstraints,
} from '../policy';
import { XorShift32 } from '../sampling';
import { sampleARPU } from '../models';
import type { ARPUModel } from '../models';

describe('TTTS Allocation', () => {
  it('should produce valid allocations that sum to 1', () => {
    const control: ARPUModel = {
      incidence: { alpha: 50, beta: 950 },
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 60, beta: 940 },
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const allocation = computeTTTSAllocation(control, variant, {}, 12345);
    
    expect(allocation.control).toBeGreaterThanOrEqual(0);
    expect(allocation.control).toBeLessThanOrEqual(1);
    expect(allocation.variant).toBeGreaterThanOrEqual(0);
    expect(allocation.variant).toBeLessThanOrEqual(1);
    expect(allocation.control + allocation.variant).toBeCloseTo(1.0, 10);
  });

  it('should favor clearly better variant', () => {
    const control: ARPUModel = {
      incidence: { alpha: 100, beta: 900 }, // ~10% CR
      value: { mu: 4.0, kappa: 100, alphaV: 100, betaV: 100 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 200, beta: 800 }, // ~20% CR (2x better!)
      value: { mu: 4.0, kappa: 100, alphaV: 100, betaV: 100 },
    };
    
    // Run multiple times and check average allocation
    const allocations: number[] = [];
    for (let i = 0; i < 100; i++) {
      const allocation = computeTTTSAllocation(control, variant, {}, i);
      allocations.push(allocation.variant);
    }
    
    const avgVariantAllocation = allocations.reduce((a, b) => a + b, 0) / allocations.length;
    
    // Variant should get most of the traffic (due to epsilon exploration cap, not 100%)
    expect(avgVariantAllocation).toBeGreaterThan(0.8);
  });

  it('should respect risk mode epsilon exploration', () => {
    const control: ARPUModel = {
      incidence: { alpha: 900, beta: 100 }, // High-performing control ~90% CR
      value: { mu: 5.0, kappa: 1000, alphaV: 1000, betaV: 1000 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 10, beta: 990 }, // Terrible variant ~1% CR
      value: { mu: 2.0, kappa: 1000, alphaV: 1000, betaV: 1000 },
    };
    
    // Run multiple times to check average epsilon allocation
    const allocations: number[] = [];
    for (let i = 0; i < 20; i++) {
      const allocation = computeTTTSAllocation(control, variant, { riskMode: 'cautious' }, i);
      allocations.push(allocation.variant);
    }
    
    const avgVariantAllocation = allocations.reduce((a, b) => a + b, 0) / allocations.length;
    
    // Even though variant is terrible, it should average around epsilon (5%)
    expect(avgVariantAllocation).toBeGreaterThan(0.03);
    expect(avgVariantAllocation).toBeLessThan(0.15);
  });

  it('should be deterministic with same seed', () => {
    const control: ARPUModel = {
      incidence: { alpha: 50, beta: 50 },
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 55, beta: 45 },
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const alloc1 = computeTTTSAllocation(control, variant, {}, 777);
    const alloc2 = computeTTTSAllocation(control, variant, {}, 777);
    
    // Same seed should produce identical results
    expect(alloc1.control).toBe(alloc2.control);
    expect(alloc1.variant).toBe(alloc2.variant);
  });
});

describe('Allocation Constraints', () => {
  it('should enforce control floor constraint', () => {
    const rawAllocation = { control: 0.5, variant: 0.5 };
    const controlFloor = 0.75;
    const variantFloor = 0.05;
    
    const constrained = applyAllocationConstraints(rawAllocation, controlFloor, variantFloor);
    
    expect(constrained.control).toBeGreaterThanOrEqual(controlFloor);
    expect(constrained.variant).toBeCloseTo(1 - controlFloor, 10);
  });

  it('should enforce variant floor constraint', () => {
    const rawAllocation = { control: 0.98, variant: 0.02 };
    const controlFloor = 0.75;
    const variantFloor = 0.05;
    
    const constrained = applyAllocationConstraints(rawAllocation, controlFloor, variantFloor);
    
    expect(constrained.variant).toBeGreaterThanOrEqual(variantFloor);
    expect(constrained.control).toBeCloseTo(1 - variantFloor, 10);
  });

  it('should prioritize control floor when floors are incompatible', () => {
    const rawAllocation = { control: 0.5, variant: 0.5 };
    const controlFloor = 0.8;
    const variantFloor = 0.3; // 0.8 + 0.3 = 1.1 > 1.0 (impossible!)
    
    const constrained = applyAllocationConstraints(rawAllocation, controlFloor, variantFloor);
    
    // Control should get its floor, variant gets remainder
    expect(constrained.control).toBeCloseTo(controlFloor, 10);
    expect(constrained.variant).toBeCloseTo(1 - controlFloor, 10);
  });

  it('should return raw allocation if already satisfying constraints', () => {
    const rawAllocation = { control: 0.80, variant: 0.20 };
    const controlFloor = 0.75;
    const variantFloor = 0.05;
    
    const constrained = applyAllocationConstraints(rawAllocation, controlFloor, variantFloor);
    
    // Should be unchanged (already satisfies constraints)
    expect(constrained.control).toBeCloseTo(0.80, 10);
    expect(constrained.variant).toBeCloseTo(0.20, 10);
  });

  it('should always sum to exactly 1.0', () => {
    const testCases = [
      { raw: { control: 0.3, variant: 0.7 }, controlFloor: 0.75, variantFloor: 0.05 },
      { raw: { control: 0.9, variant: 0.1 }, controlFloor: 0.5, variantFloor: 0.2 },
      { raw: { control: 0.6, variant: 0.4 }, controlFloor: 0.8, variantFloor: 0.3 },
    ];
    
    testCases.forEach(({ raw, controlFloor, variantFloor }) => {
      const constrained = applyAllocationConstraints(raw, controlFloor, variantFloor);
      expect(constrained.control + constrained.variant).toBeCloseTo(1.0, 10);
    });
  });

  it('should handle edge case with zero floors', () => {
    const rawAllocation = { control: 0.4, variant: 0.6 };
    const constrained = applyAllocationConstraints(rawAllocation, 0, 0);
    
    // No constraints, should return normalized version of raw
    expect(constrained.control).toBeCloseTo(0.4, 10);
    expect(constrained.variant).toBeCloseTo(0.6, 10);
  });
});


describe('Policy Integration Tests', () => {
  it('should work end-to-end: TTTS Allocation + Constraints', () => {
    const control: ARPUModel = {
      incidence: { alpha: 50, beta: 950 },
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    const variant: ARPUModel = {
      incidence: { alpha: 60, beta: 940 },
      value: { mu: 4.0, kappa: 50, alphaV: 50, betaV: 50 },
    };
    
    // Get TTTS recommendation
    const rawAllocation = computeTTTSAllocation(control, variant, {}, 42);
    
    // Apply safety constraints
    const finalAllocation = applyAllocationConstraints(rawAllocation, 0.75, 0.05);
    
    // Final allocation should respect all constraints
    expect(finalAllocation.control).toBeGreaterThanOrEqual(0.75);
    expect(finalAllocation.variant).toBeGreaterThanOrEqual(0.05);
    expect(finalAllocation.control + finalAllocation.variant).toBeCloseTo(1.0, 10);
  });
});
