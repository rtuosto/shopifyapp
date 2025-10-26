import { describe, it, expect } from 'vitest';
import {
  getVariantFloorFromRamp,
  getControlFloorFromConfidence,
  DEFAULT_RAMP_SCHEDULE,
  DEFAULT_CONTROL_FLOOR_SCHEDULE,
  RampStep,
  ControlFloorStep,
} from '../risk';

describe('Dynamic Control Floor', () => {
  it('should start at 0.75 when confidence is low', () => {
    const controlFloor = getControlFloorFromConfidence(0.50); // 50% confidence
    expect(controlFloor).toBe(0.75);
  });

  it('should decrease to 0.65 at 60% confidence', () => {
    const controlFloor = getControlFloorFromConfidence(0.60);
    expect(controlFloor).toBe(0.65);
  });

  it('should decrease to 0.60 at 80% confidence', () => {
    const controlFloor = getControlFloorFromConfidence(0.80);
    expect(controlFloor).toBe(0.60);
  });

  it('should decrease to 0.55 at 90% confidence', () => {
    const controlFloor = getControlFloorFromConfidence(0.90);
    expect(controlFloor).toBe(0.55);
  });

  it('should decrease to 0.50 at 95% confidence', () => {
    const controlFloor = getControlFloorFromConfidence(0.95);
    expect(controlFloor).toBe(0.50);
  });

  it('should stay at 0.50 for very high confidence', () => {
    const controlFloor = getControlFloorFromConfidence(0.99);
    expect(controlFloor).toBe(0.50);
  });

  it('should use custom starting floor', () => {
    const controlFloor = getControlFloorFromConfidence(0.50, undefined, 0.80);
    expect(controlFloor).toBe(0.80);
  });

  it('should work with custom control floor schedule', () => {
    const customSchedule: ControlFloorStep[] = [
      { probabilityThreshold: 0.70, controlFloor: 0.60 },
      { probabilityThreshold: 0.85, controlFloor: 0.55 },
    ];
    
    const floor1 = getControlFloorFromConfidence(0.65, customSchedule, 0.75);
    expect(floor1).toBe(0.75); // Below first threshold
    
    const floor2 = getControlFloorFromConfidence(0.70, customSchedule, 0.75);
    expect(floor2).toBe(0.60); // At first threshold
    
    const floor3 = getControlFloorFromConfidence(0.85, customSchedule, 0.75);
    expect(floor3).toBe(0.55); // At second threshold
  });

  it('should always decrease or stay the same as confidence increases', () => {
    const probabilities = [0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.99];
    const floors: number[] = [];
    
    for (const prob of probabilities) {
      floors.push(getControlFloorFromConfidence(prob));
    }
    
    // Each floor should be <= previous floor
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i]).toBeLessThanOrEqual(floors[i - 1]);
    }
  });
});

describe('Variant Ramp Schedule', () => {
  it('should complement control floor schedule', () => {
    // Test that at each confidence threshold, control floor + variant floor <= 1
    const testPoints = [
      { prob: 0.60, expectedControlFloor: 0.65, expectedVariantFloor: 0.10 },
      { prob: 0.80, expectedControlFloor: 0.60, expectedVariantFloor: 0.20 },
      { prob: 0.90, expectedControlFloor: 0.55, expectedVariantFloor: 0.35 },
      { prob: 0.95, expectedControlFloor: 0.50, expectedVariantFloor: 0.50 },
    ];
    
    for (const point of testPoints) {
      const controlFloor = getControlFloorFromConfidence(point.prob);
      const variantFloor = getVariantFloorFromRamp(point.prob);
      
      expect(controlFloor).toBe(point.expectedControlFloor);
      expect(variantFloor).toBe(point.expectedVariantFloor);
      
      // Sum should be <= 1 (they should be compatible)
      expect(controlFloor + variantFloor).toBeLessThanOrEqual(1);
    }
  });

  it('should allow variant to scale beyond 25% as confidence grows', () => {
    // At 60% confidence
    const controlFloor60 = getControlFloorFromConfidence(0.60);
    const variantFloor60 = getVariantFloorFromRamp(0.60);
    const maxVariant60 = 1 - controlFloor60;
    expect(maxVariant60).toBeGreaterThan(0.25); // Can reach 35%
    expect(variantFloor60).toBe(0.10);
    
    // At 80% confidence
    const controlFloor80 = getControlFloorFromConfidence(0.80);
    const maxVariant80 = 1 - controlFloor80;
    expect(maxVariant80).toBeGreaterThan(0.35); // Can reach 40%
    
    // At 90% confidence
    const controlFloor90 = getControlFloorFromConfidence(0.90);
    const maxVariant90 = 1 - controlFloor90;
    expect(maxVariant90).toBeGreaterThan(0.40); // Can reach 45%
    
    // At 95% confidence
    const controlFloor95 = getControlFloorFromConfidence(0.95);
    const maxVariant95 = 1 - controlFloor95;
    expect(maxVariant95).toBe(0.50); // Can reach 50%
  });
});

describe('Ramp Schedule Compatibility', () => {
  it('should ensure control and variant floors are always compatible', () => {
    // Test across a range of probabilities
    for (let prob = 0.50; prob <= 1.0; prob += 0.05) {
      const controlFloor = getControlFloorFromConfidence(prob);
      const variantFloor = getVariantFloorFromRamp(prob);
      
      // Sum should always be <= 1
      expect(controlFloor + variantFloor).toBeLessThanOrEqual(1);
    }
  });

  it('should respect the design intent: start conservative, end balanced', () => {
    // Early stage (60% confidence): Conservative
    const early = {
      control: getControlFloorFromConfidence(0.60),
      variant: getVariantFloorFromRamp(0.60),
    };
    expect(early.control).toBe(0.65); // 65% guaranteed to control
    expect(early.variant).toBe(0.10); // 10% guaranteed to variant
    expect(early.control / early.variant).toBeGreaterThan(5); // Heavily favor control
    
    // Late stage (95% confidence): Balanced
    const late = {
      control: getControlFloorFromConfidence(0.95),
      variant: getVariantFloorFromRamp(0.95),
    };
    expect(late.control).toBe(0.50); // 50% guaranteed to control
    expect(late.variant).toBe(0.50); // 50% guaranteed to variant
    expect(late.control).toBe(late.variant); // Balanced
  });

  it('should return to baseline when confidence drops (regression safety)', () => {
    // Start with low confidence
    const floor1 = getControlFloorFromConfidence(0.50);
    expect(floor1).toBe(0.75); // Baseline
    
    // Confidence rises above 60% → floor drops
    const floor2 = getControlFloorFromConfidence(0.65);
    expect(floor2).toBe(0.65); // Lowered
    
    // Confidence rises above 80% → floor drops further
    const floor3 = getControlFloorFromConfidence(0.85);
    expect(floor3).toBe(0.60); // Further lowered
    
    // CRITICAL: Confidence drops back below 60% → floor should return to baseline
    const floor4 = getControlFloorFromConfidence(0.55);
    expect(floor4).toBe(0.75); // Back to baseline!
    
    // This prevents noisy regressions from keeping elevated variant traffic
  });
});
