/**
 * Allocation Policy: Top-Two Thompson Sampling (TTTS)
 * Implements smart traffic allocation that concentrates on winning arms while exploring
 */

import { ARPUModel, sampleARPU } from './models';
import { XorShift32 } from './sampling';

export type RiskMode = 'cautious' | 'balanced' | 'aggressive';

export interface AllocationParams {
  riskMode?: RiskMode;
  explorationCap?: number; // Maximum allocation to non-best arm
}

export interface AllocationResult {
  control: number;  // Allocation percentage for control (0-1)
  variant: number;  // Allocation percentage for variant (0-1)
}

/**
 * Get epsilon (exploration parameter) based on risk mode
 */
function getEpsilon(riskMode: RiskMode): number {
  switch (riskMode) {
    case 'cautious':
      return 0.05; // 5% to second-best
    case 'balanced':
      return 0.10; // 10% to second-best
    case 'aggressive':
      return 0.20; // 20% to second-best
    default:
      return 0.05;
  }
}

/**
 * Compute TTTS allocation without floors/constraints
 * @param controlModel Bayesian model for control arm
 * @param variantModel Bayesian model for variant arm
 * @param params Allocation parameters
 * @param seed RNG seed for reproducibility
 */
export function computeTTTSAllocation(
  controlModel: ARPUModel,
  variantModel: ARPUModel,
  params: AllocationParams = {},
  seed?: number
): AllocationResult {
  const { riskMode = 'cautious', explorationCap = 0.50 } = params;
  const epsilon = getEpsilon(riskMode);
  const rng = new XorShift32(seed);

  // Sample ARPU for both arms
  const controlSample = sampleARPU(controlModel, rng);
  const variantSample = sampleARPU(variantModel, rng);

  // Determine best and second-best
  let bestAllocation: number;
  let secondAllocation: number;
  let controlIsBest: boolean;

  if (controlSample >= variantSample) {
    bestAllocation = 1 - epsilon;
    secondAllocation = epsilon;
    controlIsBest = true;
  } else {
    bestAllocation = 1 - epsilon;
    secondAllocation = epsilon;
    controlIsBest = false;
  }

  // Apply exploration cap to non-best arm
  secondAllocation = Math.min(secondAllocation, explorationCap);
  bestAllocation = 1 - secondAllocation;

  // Normalize to ensure sum = 1
  const total = bestAllocation + secondAllocation;
  bestAllocation /= total;
  secondAllocation /= total;

  // Return allocations
  if (controlIsBest) {
    return {
      control: bestAllocation,
      variant: secondAllocation,
    };
  } else {
    return {
      control: secondAllocation,
      variant: bestAllocation,
    };
  }
}

/**
 * Apply allocation constraints (floors, normalization)
 * Enforces minimum allocations while maintaining valid probability distribution
 * @param rawAllocation Unconstrained allocation
 * @param controlFloor Minimum control allocation (e.g., 0.75)
 * @param variantFloor Minimum variant allocation (e.g., 0.05)
 */
export function applyAllocationConstraints(
  rawAllocation: AllocationResult,
  controlFloor: number,
  variantFloor: number
): AllocationResult {
  let control = rawAllocation.control;
  let variant = rawAllocation.variant;

  // Check if floors are compatible (sum <= 1)
  if (controlFloor + variantFloor > 1) {
    // Floors are incompatible - prioritize control floor (cautious approach)
    return { control: controlFloor, variant: 1 - controlFloor };
  }

  // Enforce control floor first (more important for safety)
  if (control < controlFloor) {
    control = controlFloor;
    variant = 1 - controlFloor;
  }
  // Then enforce variant floor if needed
  else if (variant < variantFloor) {
    variant = variantFloor;
    control = 1 - variantFloor;
  }

  // Ensure they sum to exactly 1 (handle floating point precision)
  const total = control + variant;
  if (Math.abs(total - 1) > 1e-10) {
    control /= total;
    variant /= total;
  }

  return { control, variant };
}
