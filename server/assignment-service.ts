/**
 * Assignment Service
 * 
 * Centralized logic for assigning visitors to test variants.
 * Used by both the SDK HTTP endpoint and the batch simulator to ensure
 * consistent behavior across production and testing environments.
 */

import type { IStorage } from './storage';
import type { Test } from '../shared/schema';

export interface AssignmentResult {
  variant: 'control' | 'variant';
  sessionId: string;
  testId: string;
}

export interface AssignVisitorParams {
  shop: string;
  testId: string;
  sessionId: string;
  test?: Test; // Optional: pass if already fetched to avoid double lookup
  seed?: number; // Optional: for deterministic assignment in tests
}

/**
 * Assign a visitor to a variant using the test's current allocation percentages.
 * This is the SINGLE source of truth for variant assignment logic.
 * 
 * Flow:
 * 1. Fetch test (or use provided test object)
 * 2. Use weighted random selection based on current controlAllocation/variantAllocation
 * 3. Create session assignment record
 * 4. Return assigned variant
 */
export async function assignVisitor(
  storage: IStorage,
  params: AssignVisitorParams
): Promise<AssignmentResult> {
  const { shop, testId, sessionId, test: providedTest, seed } = params;
  
  // Fetch test if not provided
  const test = providedTest || await storage.getTest(shop, testId);
  
  if (!test) {
    throw new Error(`Test ${testId} not found for shop ${shop}`);
  }
  
  if (test.status !== 'active') {
    throw new Error(`Test ${testId} is not active (status: ${test.status})`);
  }
  
  // Get current allocation percentages (which Bayesian engine may have updated)
  const controlAllocation = parseFloat(test.controlAllocation || '50') / 100;
  const variantAllocation = parseFloat(test.variantAllocation || '50') / 100;
  const totalAllocation = controlAllocation + variantAllocation;
  
  // Normalize allocations to ensure they sum to 1.0
  const normalizedControlAllocation = controlAllocation / totalAllocation;
  
  // Weighted random selection
  const random = seed !== undefined ? seededRandom(seed) : Math.random();
  const variant: 'control' | 'variant' = random < normalizedControlAllocation ? 'control' : 'variant';
  
  // Record the assignment (90-day expiry)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);
  
  await storage.createSessionAssignment(shop, {
    sessionId,
    testId,
    variant,
    expiresAt,
  });
  
  return {
    variant,
    sessionId,
    testId,
  };
}

/**
 * Simple seeded random number generator for deterministic testing
 * Based on mulberry32 algorithm
 */
function seededRandom(seed: number): number {
  let t = seed + 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

/**
 * Record an impression for a test variant.
 * Increments the appropriate counters in the test record.
 */
export async function recordImpression(
  storage: IStorage,
  params: {
    shop: string;
    testId: string;
    variant: 'control' | 'variant';
  }
): Promise<void> {
  const { shop, testId, variant } = params;
  
  const test = await storage.getTest(shop, testId);
  if (!test || test.status !== 'active') {
    throw new Error(`Active test ${testId} not found for shop ${shop}`);
  }
  
  // Increment the appropriate impression counter
  const updates: any = {
    impressions: (test.impressions || 0) + 1,
  };
  
  if (variant === 'control') {
    updates.controlImpressions = (test.controlImpressions || 0) + 1;
  } else {
    updates.variantImpressions = (test.variantImpressions || 0) + 1;
  }
  
  await storage.updateTest(shop, testId, updates);
}

/**
 * Record a conversion for a test variant.
 * Increments conversion counters and adds revenue.
 */
export async function recordConversion(
  storage: IStorage,
  params: {
    shop: string;
    testId: string;
    variant: 'control' | 'variant';
    revenue: number;
  }
): Promise<void> {
  const { shop, testId, variant, revenue } = params;
  
  const test = await storage.getTest(shop, testId);
  if (!test) {
    throw new Error(`Test ${testId} not found for shop ${shop}`);
  }
  
  // Increment conversion counters and add revenue
  const updates: any = {
    conversions: (test.conversions || 0) + 1,
    revenue: (parseFloat(test.revenue || '0') + revenue).toString(),
  };
  
  if (variant === 'control') {
    updates.controlConversions = (test.controlConversions || 0) + 1;
    updates.controlRevenue = (parseFloat(test.controlRevenue || '0') + revenue).toString();
  } else {
    updates.variantConversions = (test.variantConversions || 0) + 1;
    updates.variantRevenue = (parseFloat(test.variantRevenue || '0') + revenue).toString();
  }
  
  // Recalculate ARPU
  const newConversions = updates.conversions;
  const newRevenue = parseFloat(updates.revenue);
  updates.arpu = newConversions > 0 ? (newRevenue / newConversions).toString() : '0';
  
  await storage.updateTest(shop, testId, updates);
}
