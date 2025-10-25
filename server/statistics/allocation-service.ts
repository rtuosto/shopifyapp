/**
 * Allocation Update Service
 * Integrates Bayesian models, TTTS policy, and risk controls to dynamically adjust traffic
 */

import {
  ARPUModel,
  createDefaultARPUPrior,
  updateIncidencePosterior,
  updateValuePosterior,
  calculateProbabilityVariantWins,
  calculateMeanARPU,
} from './models';
import { computeTTTSAllocation, applyAllocationConstraints, AllocationResult } from './policy';
import {
  shouldThrottleVariant,
  getVariantFloorFromRamp,
  calculateEOC,
  calculateCostOfWaiting,
  checkPromotionCriteria,
  DEFAULT_RAMP_SCHEDULE,
  DEFAULT_PROMOTION_CRITERIA,
  PromotionCheckResult,
} from './risk';

export interface TestMetrics {
  controlImpressions: number;
  variantImpressions: number;
  controlConversions: number;
  variantConversions: number;
  controlRevenue: number;
  variantRevenue: number;
}

export interface BayesianState {
  control: {
    incidence: { alpha: number; beta: number };
    value: { mu: number; kappa: number; alphaV: number; betaV: number };
    orderValues?: number[];
  };
  variant: {
    incidence: { alpha: number; beta: number };
    value: { mu: number; kappa: number; alphaV: number; betaV: number };
    orderValues?: number[];
  };
  safetyBudgetRemaining?: number;
  safetyBudgetTotal?: number;
  riskMode?: 'cautious' | 'balanced' | 'aggressive';
  controlFloor?: number;
  variantStart?: number;
  lastAllocationUpdate?: string;
  promotionCheckCount?: number;
}

export interface AllocationUpdateResult {
  allocation: AllocationResult;
  bayesianState: BayesianState;
  metrics: {
    probabilityVariantWins: number;
    meanControlARPU: number;
    meanVariantARPU: number;
    eocPer1000: number;
    costOfWaitingPerSession: number;
  };
  promotionCheck: PromotionCheckResult;
  shouldStop: boolean; // true if safety budget exhausted
  reasoning: string; // Human-readable explanation
}

/**
 * Initialize Bayesian state for a new test
 */
export function initializeBayesianState(params?: {
  conversionRate?: number;
  avgOrderValue?: number;
  riskMode?: 'cautious' | 'balanced' | 'aggressive';
  safetyBudget?: number;
}): BayesianState {
  const { conversionRate, avgOrderValue, riskMode = 'cautious', safetyBudget = 50 } = params || {};

  // Create default priors
  const prior = createDefaultARPUPrior({ conversionRate, avgOrderValue });

  return {
    control: {
      incidence: prior.incidence,
      value: prior.value,
      orderValues: [],
    },
    variant: {
      incidence: prior.incidence,
      value: prior.value,
      orderValues: [],
    },
    safetyBudgetRemaining: safetyBudget,
    safetyBudgetTotal: safetyBudget,
    riskMode,
    controlFloor: 0.75,
    variantStart: 0.05,
    lastAllocationUpdate: new Date().toISOString(),
    promotionCheckCount: 0,
  };
}

/**
 * Calculate order values from revenue and conversions
 * This is a helper when we only have aggregated revenue data
 */
function estimateOrderValues(revenue: number, conversions: number, count: number = 10): number[] {
  if (conversions === 0) return [];
  const avgOrderValue = revenue / conversions;
  // Generate approximate order values (all equal to average)
  // In production, you'd store actual order values from webhooks
  return Array(Math.min(conversions, count)).fill(avgOrderValue);
}

/**
 * Update Bayesian state with new metrics
 */
export function updateBayesianState(
  currentState: BayesianState,
  metrics: TestMetrics,
  newControlOrderValues: number[] = [],
  newVariantOrderValues: number[] = []
): BayesianState {
  // Update control incidence
  const controlIncidence = updateIncidencePosterior(
    currentState.control.incidence,
    metrics.controlConversions,
    metrics.controlImpressions
  );

  // Update control value
  const allControlOrderValues = [
    ...(currentState.control.orderValues || []),
    ...newControlOrderValues,
  ];
  const controlValue = updateValuePosterior(
    currentState.control.value,
    allControlOrderValues
  );

  // Update variant incidence
  const variantIncidence = updateIncidencePosterior(
    currentState.variant.incidence,
    metrics.variantConversions,
    metrics.variantImpressions
  );

  // Update variant value
  const allVariantOrderValues = [
    ...(currentState.variant.orderValues || []),
    ...newVariantOrderValues,
  ];
  const variantValue = updateValuePosterior(
    currentState.variant.value,
    allVariantOrderValues
  );

  return {
    ...currentState,
    control: {
      incidence: controlIncidence,
      value: controlValue,
      orderValues: allControlOrderValues,
    },
    variant: {
      incidence: variantIncidence,
      value: variantValue,
      orderValues: allVariantOrderValues,
    },
    lastAllocationUpdate: new Date().toISOString(),
  };
}

/**
 * Main allocation update function
 * Computes new traffic allocation based on Bayesian models and risk controls
 */
export function computeAllocationUpdate(
  bayesianState: BayesianState,
  metrics: TestMetrics,
  seed?: number
): AllocationUpdateResult {
  // Build ARPU models
  const controlModel: ARPUModel = {
    incidence: bayesianState.control.incidence,
    value: bayesianState.control.value,
  };

  const variantModel: ARPUModel = {
    incidence: bayesianState.variant.incidence,
    value: bayesianState.variant.value,
  };

  // Calculate key metrics
  const probabilityVariantWins = calculateProbabilityVariantWins(controlModel, variantModel, 2048, seed);
  const meanControlARPU = calculateMeanARPU(controlModel);
  const meanVariantARPU = calculateMeanARPU(variantModel);
  const eocPer1000 = calculateEOC(controlModel, variantModel, 4096, seed);

  // Check CVaR throttle
  const shouldThrottle = shouldThrottleVariant(controlModel, variantModel, 0.05, 2048, seed);

  // Get variant floor from ramp schedule
  const variantFloorFromRamp = getVariantFloorFromRamp(
    probabilityVariantWins,
    DEFAULT_RAMP_SCHEDULE,
    bayesianState.variantStart || 0.05
  );

  // Compute raw TTTS allocation
  const rawAllocation = computeTTTSAllocation(
    controlModel,
    variantModel,
    { riskMode: bayesianState.riskMode || 'cautious' },
    seed
  );

  // Apply CVaR throttle if needed
  let variantFloor = variantFloorFromRamp;
  if (shouldThrottle) {
    variantFloor = Math.min(variantFloor, 0.02); // Throttle to 2%
  }

  // Apply floors
  const allocation = applyAllocationConstraints(
    rawAllocation,
    bayesianState.controlFloor || 0.75,
    variantFloor
  );

  // Calculate cost of waiting (exploration regret)
  const costOfWaitingPerSession = calculateCostOfWaiting(
    controlModel,
    variantModel,
    allocation,
    2048,
    seed
  );

  // Update safety budget
  const safetyBudgetRemaining = (bayesianState.safetyBudgetRemaining || 50) - 
    (costOfWaitingPerSession * (metrics.controlImpressions + metrics.variantImpressions));

  // Check promotion criteria
  const promotionCheck = checkPromotionCriteria(
    controlModel,
    variantModel,
    metrics.controlImpressions,
    metrics.variantImpressions,
    DEFAULT_PROMOTION_CRITERIA,
    seed
  );

  // Determine if we should stop (safety budget exhausted)
  const shouldStop = safetyBudgetRemaining <= 0 && !promotionCheck.shouldPromote;

  // Build reasoning
  let reasoning = `P(variant wins) = ${(probabilityVariantWins * 100).toFixed(1)}%. `;
  reasoning += `Variant floor = ${(variantFloor * 100).toFixed(1)}% (from ramp). `;
  if (shouldThrottle) {
    reasoning += `CVaR throttle active (downside risk). `;
  }
  if (promotionCheck.shouldPromote) {
    reasoning += `✓ PROMOTION READY: All criteria met. `;
  }
  if (shouldStop) {
    reasoning += `⚠ STOP: Safety budget exhausted ($${safetyBudgetRemaining.toFixed(2)} remaining).`;
  }

  return {
    allocation,
    bayesianState: {
      ...bayesianState,
      safetyBudgetRemaining,
      promotionCheckCount: (bayesianState.promotionCheckCount || 0) + 1,
    },
    metrics: {
      probabilityVariantWins,
      meanControlARPU,
      meanVariantARPU,
      eocPer1000,
      costOfWaitingPerSession,
    },
    promotionCheck,
    shouldStop,
    reasoning,
  };
}
