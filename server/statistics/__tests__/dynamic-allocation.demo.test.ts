import { describe, it, expect } from 'vitest';
import {
  initializeBayesianState,
  updateBayesianState,
  computeAllocationUpdate,
  TestMetrics,
} from '../allocation-service';

describe('Dynamic Allocation Demo', () => {
  it('should demonstrate variant scaling beyond 25% as performance improves', () => {
    console.log('\n=== Dynamic Allocation Scaling Demo ===\n');
    
    const state = initializeBayesianState({
      conversionRate: 0.02,
      avgOrderValue: 100,
      riskMode: 'cautious',
      safetyBudget: 1000,
    });

    // Stage 1: Early data - low confidence
    console.log('Stage 1: Early Data (500 impressions each)');
    const metrics1: TestMetrics = {
      controlImpressions: 500,
      variantImpressions: 500,
      controlConversions: 10, // 2.0% CR
      variantConversions: 13, // 2.6% CR (30% better)
      controlRevenue: 1000,
      variantRevenue: 1300,
    };
    
    const state1 = updateBayesianState(state, metrics1);
    const result1 = computeAllocationUpdate(state1, metrics1, 123);
    
    console.log(`  P(variant wins): ${(result1.metrics.probabilityVariantWins * 100).toFixed(1)}%`);
    console.log(`  Control floor: ${(result1.bayesianState.controlFloor! * 100).toFixed(1)}%`);
    console.log(`  Allocation: Control ${(result1.allocation.control * 100).toFixed(1)}% / Variant ${(result1.allocation.variant * 100).toFixed(1)}%`);
    console.log(`  Reasoning: ${result1.reasoning}\n`);

    // Stage 2: More data - building confidence (60%+)
    console.log('Stage 2: Building Confidence (1500 impressions each)');
    const metrics2: TestMetrics = {
      controlImpressions: 1500,
      variantImpressions: 1500,
      controlConversions: 30, // 2.0% CR
      variantConversions: 45, // 3.0% CR (50% better!)
      controlRevenue: 3000,
      variantRevenue: 4500,
    };
    
    const state2 = updateBayesianState(result1.bayesianState, metrics2);
    const result2 = computeAllocationUpdate(state2, metrics2, 456);
    
    console.log(`  P(variant wins): ${(result2.metrics.probabilityVariantWins * 100).toFixed(1)}%`);
    console.log(`  Control floor: ${(result2.bayesianState.controlFloor! * 100).toFixed(1)}%`);
    console.log(`  Allocation: Control ${(result2.allocation.control * 100).toFixed(1)}% / Variant ${(result2.allocation.variant * 100).toFixed(1)}%`);
    console.log(`  Reasoning: ${result2.reasoning}\n`);
    
    // Verify variant can exceed 25%
    expect(result2.allocation.variant).toBeGreaterThan(0.25);

    // Stage 3: Strong evidence - high confidence (80%+)
    console.log('Stage 3: High Confidence (3000 impressions each)');
    const metrics3: TestMetrics = {
      controlImpressions: 3000,
      variantImpressions: 3000,
      controlConversions: 60, // 2.0% CR
      variantConversions: 105, // 3.5% CR (75% better!)
      controlRevenue: 6000,
      variantRevenue: 10500,
    };
    
    const state3 = updateBayesianState(result2.bayesianState, metrics3);
    const result3 = computeAllocationUpdate(state3, metrics3, 789);
    
    console.log(`  P(variant wins): ${(result3.metrics.probabilityVariantWins * 100).toFixed(1)}%`);
    console.log(`  Control floor: ${(result3.bayesianState.controlFloor! * 100).toFixed(1)}%`);
    console.log(`  Allocation: Control ${(result3.allocation.control * 100).toFixed(1)}% / Variant ${(result3.allocation.variant * 100).toFixed(1)}%`);
    console.log(`  Reasoning: ${result3.reasoning}\n`);
    
    // Verify variant continues to have high allocation
    expect(result3.allocation.variant).toBeGreaterThanOrEqual(0.30);
    expect(result3.allocation.variant).toBeGreaterThan(0.25); // Exceeds old cap!
    
    console.log('=== Demo Complete ===');
    console.log('✓ Variant allocation successfully scaled beyond 25% as performance improved!');
    console.log('✓ Control floor dynamically decreased as confidence grew\n');
  });

  it('should demonstrate old behavior would have capped at 25%', () => {
    console.log('\n=== Comparison: Static vs Dynamic Floor ===\n');
    
    // Use the same data from Stage 2 above which showed clear improvement
    const state = initializeBayesianState({
      conversionRate: 0.02,
      avgOrderValue: 100,
      riskMode: 'cautious',
      safetyBudget: 1000,
    });

    const metrics: TestMetrics = {
      controlImpressions: 1500,
      variantImpressions: 1500,
      controlConversions: 30, // 2.0% CR
      variantConversions: 45, // 3.0% CR (50% better!)
      controlRevenue: 3000,
      variantRevenue: 4500,
    };
    
    const updatedState = updateBayesianState(state, metrics);
    const result = computeAllocationUpdate(updatedState, metrics, 456); // Use same seed as Stage 2
    
    console.log('With Dynamic Control Floor (Current Implementation):');
    console.log(`  P(variant wins): ${(result.metrics.probabilityVariantWins * 100).toFixed(1)}%`);
    console.log(`  Control floor: ${(result.bayesianState.controlFloor! * 100).toFixed(1)}%`);
    console.log(`  Max possible variant: ${((1 - result.bayesianState.controlFloor!) * 100).toFixed(1)}%`);
    console.log(`  Actual allocation: Control ${(result.allocation.control * 100).toFixed(1)}% / Variant ${(result.allocation.variant * 100).toFixed(1)}%\n`);
    
    console.log('With Static 0.75 Floor (Old Behavior):');
    console.log(`  P(variant wins): ${(result.metrics.probabilityVariantWins * 100).toFixed(1)}%`);
    console.log(`  Control floor: 75.0%`);
    console.log(`  Max possible variant: 25.0% ← CAPPED!`);
    console.log(`  Would have allocated: Control ~75-95% / Variant ~5-25% (capped)\n`);
    
    // Verify the key improvement: control floor is lower, allowing more variant traffic
    expect(result.bayesianState.controlFloor).toBeLessThan(0.75);
    expect(result.bayesianState.controlFloor).toBe(0.65); // At 60%+ confidence
    
    console.log(`✓ Control floor reduced from 75% to ${(result.bayesianState.controlFloor! * 100).toFixed(0)}%`);
    console.log(`✓ Max variant traffic increased from 25% to ${((1 - result.bayesianState.controlFloor!) * 100).toFixed(0)}%\n`);
  });
});
