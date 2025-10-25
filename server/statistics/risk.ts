/**
 * Risk Controls & Promotion Logic
 * Implements CVaR throttling, control floors, ramp schedules, EOC calculation, and promotion criteria
 */

import { ARPUModel, sampleARPU, calculateProbabilityVariantWins, calculateProbabilityMeaningfulLift } from './models';
import { XorShift32 } from './sampling';
import { AllocationResult } from './policy';

/**
 * Ramp schedule: variant floor increases based on P(variant > control)
 */
export interface RampStep {
  probabilityThreshold: number; // e.g., 0.60
  variantFloor: number;         // e.g., 0.10
}

/**
 * Default cautious ramp schedule
 */
export const DEFAULT_RAMP_SCHEDULE: RampStep[] = [
  { probabilityThreshold: 0.60, variantFloor: 0.10 },
  { probabilityThreshold: 0.80, variantFloor: 0.20 },
  { probabilityThreshold: 0.90, variantFloor: 0.35 },
  { probabilityThreshold: 0.95, variantFloor: 0.50 },
];

/**
 * Calculate CVaR (Conditional Value at Risk) - lower tail average
 * @param samples ARPU samples for one arm
 * @param quantile Quantile for CVaR (e.g., 0.05 for 5%)
 * @returns Average of samples below quantile
 */
export function calculateCVaR(samples: number[], quantile: number): number {
  if (samples.length === 0) return 0;

  // Sort samples
  const sorted = [...samples].sort((a, b) => a - b);
  const cutoffIndex = Math.floor(samples.length * quantile);

  // Average of lower tail
  const tailSamples = sorted.slice(0, Math.max(1, cutoffIndex));
  return tailSamples.reduce((sum, x) => sum + x, 0) / tailSamples.length;
}

/**
 * Check if variant should be throttled based on CVaR
 * @param controlModel Control arm model
 * @param variantModel Variant arm model
 * @param cvarQuantile CVaR quantile (default 0.05 for 5%)
 * @param numSamples Number of Monte Carlo samples
 * @param seed RNG seed
 * @returns true if variant CVaR is worse than control (should throttle)
 */
export function shouldThrottleVariant(
  controlModel: ARPUModel,
  variantModel: ARPUModel,
  cvarQuantile: number = 0.05,
  numSamples: number = 2048,
  seed?: number
): boolean {
  const rng = new XorShift32(seed);

  // Generate samples
  const controlSamples: number[] = [];
  const variantSamples: number[] = [];

  for (let i = 0; i < numSamples; i++) {
    controlSamples.push(sampleARPU(controlModel, rng));
    variantSamples.push(sampleARPU(variantModel, rng));
  }

  // Calculate CVaR
  const controlCVaR = calculateCVaR(controlSamples, cvarQuantile);
  const variantCVaR = calculateCVaR(variantSamples, cvarQuantile);

  // Throttle if variant's downside is worse than control
  return variantCVaR < controlCVaR;
}

/**
 * Determine variant floor based on ramp schedule
 * @param probabilityVariantWins P(variant > control)
 * @param rampSchedule Ramp schedule (default: DEFAULT_RAMP_SCHEDULE)
 * @param variantStart Starting variant floor (default 0.05)
 * @returns Variant floor based on probability
 */
export function getVariantFloorFromRamp(
  probabilityVariantWins: number,
  rampSchedule: RampStep[] = DEFAULT_RAMP_SCHEDULE,
  variantStart: number = 0.05
): number {
  let floor = variantStart;

  for (const step of rampSchedule) {
    if (probabilityVariantWins >= step.probabilityThreshold) {
      floor = Math.max(floor, step.variantFloor);
    }
  }

  return floor;
}

/**
 * Calculate Expected Opportunity Cost (EOC) per 1,000 sessions
 * This represents the "lock-in risk" - expected revenue loss if we promote the wrong arm
 * @param controlModel Control arm model
 * @param variantModel Variant arm model
 * @param numSamples Number of Monte Carlo samples (use more for promotion checks)
 * @param seed RNG seed
 * @returns EOC per 1,000 sessions in dollars
 */
export function calculateEOC(
  controlModel: ARPUModel,
  variantModel: ARPUModel,
  numSamples: number = 4096,
  seed?: number
): number {
  const rng = new XorShift32(seed);
  let totalRegret = 0;

  for (let i = 0; i < numSamples; i++) {
    const controlARPU = sampleARPU(controlModel, rng);
    const variantARPU = sampleARPU(variantModel, rng);
    const maxARPU = Math.max(controlARPU, variantARPU);

    // Current winner (for promotion decision)
    const currentWinner = controlARPU >= variantARPU ? controlARPU : variantARPU;

    // Regret if we lock in current winner
    const regret = maxARPU - currentWinner;
    totalRegret += regret;
  }

  const avgRegretPerSession = totalRegret / numSamples;
  return avgRegretPerSession * 1000; // Per 1,000 sessions
}

/**
 * Calculate "cost of waiting" - exploration regret per session
 * This is different from EOC: it's the cost of NOT sending 100% to best arm yet
 * Not used for promotion, but tracked for budget monitoring
 */
export function calculateCostOfWaiting(
  controlModel: ARPUModel,
  variantModel: ARPUModel,
  currentAllocation: AllocationResult,
  numSamples: number = 2048,
  seed?: number
): number {
  const rng = new XorShift32(seed);
  let totalRegret = 0;

  for (let i = 0; i < numSamples; i++) {
    const controlARPU = sampleARPU(controlModel, rng);
    const variantARPU = sampleARPU(variantModel, rng);
    const maxARPU = Math.max(controlARPU, variantARPU);

    // Expected ARPU with current allocation
    const currentARPU = currentAllocation.control * controlARPU + currentAllocation.variant * variantARPU;

    // Regret per session
    const regret = maxARPU - currentARPU;
    totalRegret += regret;
  }

  return totalRegret / numSamples;
}

/**
 * Promotion criteria checker
 */
export interface PromotionCriteria {
  minSamplesPerArm: number;        // Default 2000
  minLiftPercent: number;           // Default 5%
  minProbabilityMeaningfulLift: number; // Default 0.95 (95%)
  maxEOCPer1000Sessions: number;    // Default $1.00
}

export const DEFAULT_PROMOTION_CRITERIA: PromotionCriteria = {
  minSamplesPerArm: 2000,
  minLiftPercent: 5,
  minProbabilityMeaningfulLift: 0.95,
  maxEOCPer1000Sessions: 1.00,
};

export interface PromotionCheckResult {
  shouldPromote: boolean;
  winner: 'control' | 'variant' | null;
  meetsMinSamples: boolean;
  meetsProbabilityCriteria: boolean;
  meetsEOCCriteria: boolean;
  probabilityMeaningfulLift: number;
  eocPer1000: number;
}

/**
 * Check if test is ready for promotion
 * @param controlModel Control arm model
 * @param variantModel Variant arm model
 * @param controlSessions Total sessions for control
 * @param variantSessions Total sessions for variant
 * @param criteria Promotion criteria (defaults to DEFAULT_PROMOTION_CRITERIA)
 * @param seed RNG seed
 */
export function checkPromotionCriteria(
  controlModel: ARPUModel,
  variantModel: ARPUModel,
  controlSessions: number,
  variantSessions: number,
  criteria: PromotionCriteria = DEFAULT_PROMOTION_CRITERIA,
  seed?: number
): PromotionCheckResult {
  // Check minimum samples
  const meetsMinSamples = controlSessions >= criteria.minSamplesPerArm &&
                          variantSessions >= criteria.minSamplesPerArm;

  // Calculate P(lift >= minLiftPercent)
  const probabilityMeaningfulLift = calculateProbabilityMeaningfulLift(
    controlModel,
    variantModel,
    criteria.minLiftPercent,
    4096, // Use more samples for promotion checks
    seed
  );

  const meetsProbabilityCriteria = probabilityMeaningfulLift >= criteria.minProbabilityMeaningfulLift;

  // Calculate EOC
  const eocPer1000 = calculateEOC(controlModel, variantModel, 4096, seed);
  const meetsEOCCriteria = eocPer1000 <= criteria.maxEOCPer1000Sessions;

  // Determine winner if all criteria met
  let shouldPromote = false;
  let winner: 'control' | 'variant' | null = null;

  if (meetsMinSamples && meetsProbabilityCriteria && meetsEOCCriteria) {
    // Variant is the winner (meets meaningful lift criteria)
    shouldPromote = true;
    winner = 'variant';
  }

  return {
    shouldPromote,
    winner,
    meetsMinSamples,
    meetsProbabilityCriteria,
    meetsEOCCriteria,
    probabilityMeaningfulLift,
    eocPer1000,
  };
}
