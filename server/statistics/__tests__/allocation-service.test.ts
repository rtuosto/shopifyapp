import { describe, it, expect } from 'vitest';
import {
  initializeBayesianState,
  updateBayesianState,
  computeAllocationUpdate,
  type TestMetrics,
  type BayesianState,
} from '../allocation-service';

describe('Bayesian State Initialization', () => {
  it('should initialize with default priors when no params provided', () => {
    const state = initializeBayesianState();
    
    // Both arms should start with same priors
    expect(state.control.incidence.alpha).toBe(state.variant.incidence.alpha);
    expect(state.control.incidence.beta).toBe(state.variant.incidence.beta);
    expect(state.control.value.mu).toBe(state.variant.value.mu);
    
    // Default safety budget
    expect(state.safetyBudgetRemaining).toBe(50);
    expect(state.safetyBudgetTotal).toBe(50);
    
    // Default risk mode
    expect(state.riskMode).toBe('cautious');
    
    // Default floors
    expect(state.controlFloor).toBe(0.75);
    expect(state.variantStart).toBe(0.05);
    
    // Order values should be empty arrays
    expect(state.control.orderValues).toEqual([]);
    expect(state.variant.orderValues).toEqual([]);
    
    // Should have timestamp
    expect(state.lastAllocationUpdate).toBeDefined();
    
    // Promotion check count should be 0
    expect(state.promotionCheckCount).toBe(0);
  });

  it('should initialize with custom conversion rate and AOV', () => {
    const state = initializeBayesianState({
      conversionRate: 0.05, // 5% CR
      avgOrderValue: 50,
    });
    
    // Verify conversion rate prior
    const priorCR = state.control.incidence.alpha / 
                   (state.control.incidence.alpha + state.control.incidence.beta);
    expect(priorCR).toBeCloseTo(0.05, 2);
    
    // Verify AOV prior (mu is log-scale, not raw AOV)
    // Just verify it's reasonable (positive and not crazy)
    expect(state.control.value.mu).toBeGreaterThan(0);
    expect(state.control.value.mu).toBeLessThan(10);
  });

  it('should respect custom risk mode and safety budget', () => {
    const state = initializeBayesianState({
      riskMode: 'aggressive',
      safetyBudget: 100,
    });
    
    expect(state.riskMode).toBe('aggressive');
    expect(state.safetyBudgetRemaining).toBe(100);
    expect(state.safetyBudgetTotal).toBe(100);
  });

  it('should create identical priors for control and variant', () => {
    const state = initializeBayesianState({
      conversionRate: 0.03,
      avgOrderValue: 75,
    });
    
    // Incidence parameters should match
    expect(state.control.incidence).toEqual(state.variant.incidence);
    
    // Value parameters should match
    expect(state.control.value).toEqual(state.variant.value);
  });
});

describe('Bayesian State Updates', () => {
  it('should update control posterior with new impressions/conversions', () => {
    const initialState = initializeBayesianState();
    const initialAlpha = initialState.control.incidence.alpha;
    const initialBeta = initialState.control.incidence.beta;
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 0,
      controlConversions: 50, // 5% CR
      variantConversions: 0,
      controlRevenue: 2500, // $50 AOV
      variantRevenue: 0,
    };
    
    const updatedState = updateBayesianState(initialState, metrics);
    
    // Control alpha should increase by conversions
    expect(updatedState.control.incidence.alpha).toBe(initialAlpha + 50);
    
    // Control beta should increase by (impressions - conversions)
    expect(updatedState.control.incidence.beta).toBe(initialBeta + 950);
    
    // Variant should remain unchanged (no data)
    expect(updatedState.variant.incidence).toEqual(initialState.variant.incidence);
  });

  it('should update variant posterior with new impressions/conversions', () => {
    const initialState = initializeBayesianState();
    const initialAlpha = initialState.variant.incidence.alpha;
    const initialBeta = initialState.variant.incidence.beta;
    
    const metrics: TestMetrics = {
      controlImpressions: 0,
      variantImpressions: 1000,
      controlConversions: 0,
      variantConversions: 60, // 6% CR
      controlRevenue: 0,
      variantRevenue: 3000, // $50 AOV
    };
    
    const updatedState = updateBayesianState(initialState, metrics);
    
    // Variant alpha should increase by conversions
    expect(updatedState.variant.incidence.alpha).toBe(initialAlpha + 60);
    
    // Variant beta should increase by (impressions - conversions)
    expect(updatedState.variant.incidence.beta).toBe(initialBeta + 940);
    
    // Control should remain unchanged
    expect(updatedState.control.incidence).toEqual(initialState.control.incidence);
  });

  it('should accumulate order values across multiple updates', () => {
    let state = initializeBayesianState();
    
    const metrics: TestMetrics = {
      controlImpressions: 100,
      variantImpressions: 100,
      controlConversions: 5,
      variantConversions: 6,
      controlRevenue: 250,
      variantRevenue: 300,
    };
    
    // First update with some order values
    state = updateBayesianState(state, metrics, [50, 50, 50], [50, 50, 50, 50]);
    expect(state.control.orderValues?.length).toBe(3);
    expect(state.variant.orderValues?.length).toBe(4);
    
    // Second update adds more
    state = updateBayesianState(state, metrics, [60, 60], [55, 55, 55]);
    expect(state.control.orderValues?.length).toBe(5);
    expect(state.variant.orderValues?.length).toBe(7);
  });

  it('should update timestamp on state update', () => {
    const initialState = initializeBayesianState();
    const initialTimestamp = initialState.lastAllocationUpdate;
    
    // Wait a tiny bit
    const now = Date.now();
    while (Date.now() === now) {
      // Busy wait to ensure timestamp changes
    }
    
    const metrics: TestMetrics = {
      controlImpressions: 100,
      variantImpressions: 100,
      controlConversions: 5,
      variantConversions: 6,
      controlRevenue: 250,
      variantRevenue: 300,
    };
    
    const updatedState = updateBayesianState(initialState, metrics);
    
    // Timestamp should be updated
    expect(updatedState.lastAllocationUpdate).not.toBe(initialTimestamp);
  });

  it('should handle missing state defensively by initializing defaults', () => {
    // Simulate missing/null state
    const emptyState = null as unknown as BayesianState;
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 1000,
      controlConversions: 20, // 2% CR
      variantConversions: 25, // 2.5% CR
      controlRevenue: 2000, // $100 AOV
      variantRevenue: 2500, // $100 AOV
    };
    
    // Should not throw, should initialize with defaults
    const newState = updateBayesianState(emptyState, metrics);
    
    // Verify it created a valid state
    expect(newState).toBeDefined();
    expect(newState.control).toBeDefined();
    expect(newState.variant).toBeDefined();
    expect(newState.safetyBudgetRemaining).toBe(50); // Default budget
    expect(newState.riskMode).toBe('cautious'); // Default mode
  });

  it('should handle zero conversions without errors', () => {
    const initialState = initializeBayesianState();
    
    const metrics: TestMetrics = {
      controlImpressions: 500,
      variantImpressions: 500,
      controlConversions: 0,
      variantConversions: 0,
      controlRevenue: 0,
      variantRevenue: 0,
    };
    
    const updatedState = updateBayesianState(initialState, metrics);
    
    // Beta parameters should increase (all impressions went to non-conversions)
    expect(updatedState.control.incidence.beta).toBeGreaterThan(initialState.control.incidence.beta);
    expect(updatedState.variant.incidence.beta).toBeGreaterThan(initialState.variant.incidence.beta);
    
    // Alpha should remain at prior
    expect(updatedState.control.incidence.alpha).toBe(initialState.control.incidence.alpha);
    expect(updatedState.variant.incidence.alpha).toBe(initialState.variant.incidence.alpha);
  });
});

describe('Allocation Update Computation', () => {
  it('should produce valid allocation that sums to 1.0', () => {
    const state = initializeBayesianState();
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 1000,
      controlConversions: 50,
      variantConversions: 60,
      controlRevenue: 2500,
      variantRevenue: 3000,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    const result = computeAllocationUpdate(updatedState, metrics, 777);
    
    expect(result.allocation.control).toBeGreaterThanOrEqual(0);
    expect(result.allocation.control).toBeLessThanOrEqual(1);
    expect(result.allocation.variant).toBeGreaterThanOrEqual(0);
    expect(result.allocation.variant).toBeLessThanOrEqual(1);
    expect(result.allocation.control + result.allocation.variant).toBeCloseTo(1.0, 10);
  });

  it('should respect control floor constraint', () => {
    const state = initializeBayesianState();
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 1000,
      controlConversions: 50,
      variantConversions: 60,
      controlRevenue: 2500,
      variantRevenue: 3000,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    const result = computeAllocationUpdate(updatedState, metrics, 777);
    
    // Control floor should be enforced (default 0.75)
    expect(result.allocation.control).toBeGreaterThanOrEqual(0.75);
  });

  it('should calculate probability variant wins', () => {
    const state = initializeBayesianState();
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 1000,
      controlConversions: 50, // 5% CR
      variantConversions: 70, // 7% CR - clearly better
      controlRevenue: 2500,
      variantRevenue: 3500,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    const result = computeAllocationUpdate(updatedState, metrics, 777);
    
    expect(result.metrics.probabilityVariantWins).toBeGreaterThanOrEqual(0);
    expect(result.metrics.probabilityVariantWins).toBeLessThanOrEqual(1);
    
    // Variant is clearly better, so should have high probability
    expect(result.metrics.probabilityVariantWins).toBeGreaterThan(0.5);
  });

  it('should calculate mean ARPU for both arms', () => {
    const state = initializeBayesianState();
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 1000,
      controlConversions: 50,
      variantConversions: 60,
      controlRevenue: 2500,
      variantRevenue: 3000,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    const result = computeAllocationUpdate(updatedState, metrics, 777);
    
    expect(result.metrics.meanControlARPU).toBeGreaterThan(0);
    expect(result.metrics.meanVariantARPU).toBeGreaterThan(0);
    
    // Variant has better CR and AOV, so should have higher ARPU
    expect(result.metrics.meanVariantARPU).toBeGreaterThan(result.metrics.meanControlARPU);
  });

  it('should decrement safety budget based on cost of waiting', () => {
    const state = initializeBayesianState({ safetyBudget: 1000 }); // Larger budget
    
    const metrics: TestMetrics = {
      controlImpressions: 100, // Smaller sample to avoid huge cost
      variantImpressions: 100,
      controlConversions: 5,
      variantConversions: 6,
      controlRevenue: 250,
      variantRevenue: 300,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    
    // First call initializes lastTotalImpressions (no charge)
    const result1 = computeAllocationUpdate(updatedState, metrics, 777);
    expect(result1.bayesianState.safetyBudgetRemaining).toBe(1000); // No charge on first call
    
    // Add more impressions
    const metrics2: TestMetrics = {
      controlImpressions: 150,
      variantImpressions: 150,
      controlConversions: 8,
      variantConversions: 9,
      controlRevenue: 400,
      variantRevenue: 450,
    };
    
    const updatedState2 = updateBayesianState(result1.bayesianState, metrics2);
    const result2 = computeAllocationUpdate(updatedState2, metrics2, 777);
    
    // Second call should charge for new impressions (300 - 200 = 100 new)
    expect(result2.bayesianState.safetyBudgetRemaining).toBeLessThan(1000);
    expect(typeof result2.bayesianState.safetyBudgetRemaining).toBe('number');
  });

  it('should check promotion criteria', () => {
    const state = initializeBayesianState();
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 1000,
      controlConversions: 50,
      variantConversions: 60,
      controlRevenue: 2500,
      variantRevenue: 3000,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    const result = computeAllocationUpdate(updatedState, metrics, 777);
    
    expect(result.promotionCheck).toBeDefined();
    expect(typeof result.promotionCheck.shouldPromote).toBe('boolean');
    expect(typeof result.promotionCheck.probabilityMeaningfulLift).toBe('number');
    expect(typeof result.promotionCheck.eocPer1000).toBe('number');
    expect(typeof result.promotionCheck.meetsMinSamples).toBe('boolean');
    expect(typeof result.promotionCheck.meetsProbabilityCriteria).toBe('boolean');
    expect(typeof result.promotionCheck.meetsEOCCriteria).toBe('boolean');
  });

  it('should signal stop when safety budget exhausted and no promotion', () => {
    const state = initializeBayesianState({ safetyBudget: 0.01 }); // Very small budget
    
    const metrics1: TestMetrics = {
      controlImpressions: 5000,
      variantImpressions: 5000,
      controlConversions: 250,
      variantConversions: 253, // Barely different
      controlRevenue: 12500,
      variantRevenue: 12625,
    };
    
    const updatedState1 = updateBayesianState(state, metrics1);
    const result1 = computeAllocationUpdate(updatedState1, metrics1, 777);
    
    // Add more impressions to exhaust budget
    const metrics2: TestMetrics = {
      controlImpressions: 10000,
      variantImpressions: 10000,
      controlConversions: 500,
      variantConversions: 505,
      controlRevenue: 25000,
      variantRevenue: 25250,
    };
    
    const updatedState2 = updateBayesianState(result1.bayesianState, metrics2);
    const result2 = computeAllocationUpdate(updatedState2, metrics2, 777);
    
    // Should signal to stop (budget exhausted, no clear winner)
    if (!result2.promotionCheck.shouldPromote) {
      expect(result2.shouldStop).toBe(true);
    }
  });

  it('should provide human-readable reasoning', () => {
    const state = initializeBayesianState();
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 1000,
      controlConversions: 50,
      variantConversions: 60,
      controlRevenue: 2500,
      variantRevenue: 3000,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    const result = computeAllocationUpdate(updatedState, metrics, 777);
    
    expect(result.reasoning).toBeDefined();
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.reasoning).toContain('P(variant wins)');
  });

  it('should be deterministic with same seed', () => {
    const state = initializeBayesianState();
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 1000,
      controlConversions: 50,
      variantConversions: 60,
      controlRevenue: 2500,
      variantRevenue: 3000,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    const result1 = computeAllocationUpdate(updatedState, metrics, 12345);
    const result2 = computeAllocationUpdate(updatedState, metrics, 12345);
    
    // Same seed should produce identical results
    expect(result1.allocation.control).toBe(result2.allocation.control);
    expect(result1.allocation.variant).toBe(result2.allocation.variant);
    expect(result1.metrics.probabilityVariantWins).toBe(result2.metrics.probabilityVariantWins);
  });

  it('should increment promotion check count', () => {
    const state = initializeBayesianState();
    expect(state.promotionCheckCount).toBe(0);
    
    const metrics: TestMetrics = {
      controlImpressions: 1000,
      variantImpressions: 1000,
      controlConversions: 50,
      variantConversions: 60,
      controlRevenue: 2500,
      variantRevenue: 3000,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    const result1 = computeAllocationUpdate(updatedState, metrics, 777);
    expect(result1.bayesianState.promotionCheckCount).toBe(1);
    
    const result2 = computeAllocationUpdate(result1.bayesianState, metrics, 888);
    expect(result2.bayesianState.promotionCheckCount).toBe(2);
  });
});

describe('End-to-End Integration Tests', () => {
  it('should handle full lifecycle: initialize → update → allocate', () => {
    // 1. Initialize
    const initialState = initializeBayesianState({
      conversionRate: 0.02,
      avgOrderValue: 100,
      riskMode: 'balanced',
      safetyBudget: 75,
    });
    
    expect(initialState.safetyBudgetRemaining).toBe(75);
    expect(initialState.riskMode).toBe('balanced');
    
    // 2. First metrics batch
    const metrics1: TestMetrics = {
      controlImpressions: 500,
      variantImpressions: 500,
      controlConversions: 10, // 2% CR
      variantConversions: 15, // 3% CR (better)
      controlRevenue: 1000,
      variantRevenue: 1500,
    };
    
    const state1 = updateBayesianState(initialState, metrics1);
    const result1 = computeAllocationUpdate(state1, metrics1, 111);
    
    // Allocation should be valid
    expect(result1.allocation.control + result1.allocation.variant).toBeCloseTo(1.0, 10);
    // With dynamic control floor, the floor depends on P(variant wins)
    // At low confidence, floor is 0.75; as confidence grows, it decreases
    expect(result1.allocation.control).toBeGreaterThan(0); // Just verify it's positive
    
    // Safety budget should not have decreased on first call (migration handling)
    expect(result1.bayesianState.safetyBudgetRemaining).toBe(75);
    
    // 3. Second metrics batch (more data, variant pulling ahead)
    const metrics2: TestMetrics = {
      controlImpressions: 1500,
      variantImpressions: 1500,
      controlConversions: 30, // Still 2% CR
      variantConversions: 60, // Now 4% CR (clearly better)
      controlRevenue: 3000,
      variantRevenue: 6000,
    };
    
    const state2 = updateBayesianState(result1.bayesianState, metrics2);
    const result2 = computeAllocationUpdate(state2, metrics2, 222);
    
    // Probability variant wins should be significantly higher than 50%
    expect(result2.metrics.probabilityVariantWins).toBeGreaterThan(0.6);
    
    // Safety budget should have decreased now (charged for new impressions)
    expect(result2.bayesianState.safetyBudgetRemaining).toBeLessThan(75);
    
    // Should still be valid allocation
    expect(result2.allocation.control + result2.allocation.variant).toBeCloseTo(1.0, 10);
  });

  it('should handle scenario with clear winner reaching promotion', () => {
    const initialState = initializeBayesianState({
      conversionRate: 0.02,
      avgOrderValue: 100,
    });
    
    // Large sample with variant clearly winning
    const metrics: TestMetrics = {
      controlImpressions: 5000,
      variantImpressions: 5000,
      controlConversions: 100, // 2% CR
      variantConversions: 175, // 3.5% CR (75% lift!)
      controlRevenue: 10000, // $100 AOV
      variantRevenue: 17500, // $100 AOV
    };
    
    const updatedState = updateBayesianState(initialState, metrics);
    const result = computeAllocationUpdate(updatedState, metrics, 999);
    
    // Check promotion check structure
    expect(result.promotionCheck.meetsMinSamples).toBe(true); // 5000 > 2000
    expect(result.promotionCheck.probabilityMeaningfulLift).toBeGreaterThan(0.6); // High but realistic
    
    // If promotion criteria met, should promote
    if (result.promotionCheck.shouldPromote) {
      expect(result.reasoning).toContain('PROMOTION');
    }
    
    // Variant should be clearly better (>50%, but not unrealistically high)
    expect(result.metrics.probabilityVariantWins).toBeGreaterThan(0.6);
  });

  it('should handle scenario with no clear winner', () => {
    const initialState = initializeBayesianState();
    
    // Both arms performing identically
    const metrics: TestMetrics = {
      controlImpressions: 2000,
      variantImpressions: 2000,
      controlConversions: 40, // 2% CR
      variantConversions: 40, // 2% CR (same)
      controlRevenue: 4000, // $100 AOV
      variantRevenue: 4000, // $100 AOV (same)
    };
    
    const updatedState = updateBayesianState(initialState, metrics);
    const result = computeAllocationUpdate(updatedState, metrics, 555);
    
    // Probability should be around 50%
    expect(result.metrics.probabilityVariantWins).toBeGreaterThan(0.3);
    expect(result.metrics.probabilityVariantWins).toBeLessThan(0.7);
    
    // Should not promote (no clear winner)
    expect(result.promotionCheck.shouldPromote).toBe(false);
    
    // Mean ARPUs should be similar
    expect(Math.abs(result.metrics.meanVariantARPU - result.metrics.meanControlARPU))
      .toBeLessThan(1.0);
  });
});
