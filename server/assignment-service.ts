/**
 * Assignment Service
 * 
 * Centralized logic for assigning visitors to optimization variants.
 * Used by both the SDK HTTP endpoint and the batch simulator to ensure
 * consistent behavior across production and testing environments.
 */

import type { IStorage } from './storage';
import type { Optimization } from '../shared/schema';

export interface AssignmentResult {
  variant: 'control' | 'variant';
  sessionId: string;
  optimizationId: string;
}

export interface AssignVisitorParams {
  shop: string;
  optimizationId: string;
  sessionId: string;
  optimization?: Optimization; // Optional: pass if already fetched to avoid double lookup
  seed?: number; // Optional: for deterministic assignment in testing
}

/**
 * Assign a visitor to a variant using the optimization's current allocation percentages.
 * This is the SINGLE source of truth for variant assignment logic.
 * 
 * Flow:
 * 1. Fetch optimization (or use provided optimization object)
 * 2. Use weighted random selection based on current controlAllocation/variantAllocation
 * 3. Create session assignment record
 * 4. Return assigned variant
 */
export async function assignVisitor(
  storage: IStorage,
  params: AssignVisitorParams
): Promise<AssignmentResult> {
  const { shop, optimizationId, sessionId, optimization: providedOptimization, seed } = params;
  
  // Fetch optimization if not provided
  const optimization = providedOptimization || await storage.getOptimization(shop, optimizationId);
  
  if (!optimization) {
    throw new Error(`Optimization ${optimizationId} not found for shop ${shop}`);
  }
  
  if (optimization.status !== 'active') {
    throw new Error(`Optimization ${optimizationId} is not active (status: ${optimization.status})`);
  }
  
  // Get current allocation percentages (which Bayesian engine may have updated)
  const controlAllocation = parseFloat(optimization.controlAllocation || '50') / 100;
  const variantAllocation = parseFloat(optimization.variantAllocation || '50') / 100;
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
    optimizationId,
    variant,
    expiresAt,
  });
  
  return {
    variant,
    sessionId,
    optimizationId,
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
 * Record an impression for an optimization variant.
 * Increments the appropriate counters in the optimization record.
 */
export async function recordImpression(
  storage: IStorage,
  params: {
    shop: string;
    optimizationId: string;
    variant: 'control' | 'variant';
  }
): Promise<void> {
  const { shop, optimizationId, variant } = params;
  
  const optimization = await storage.getOptimization(shop, optimizationId);
  if (!optimization || optimization.status !== 'active') {
    throw new Error(`Active optimization ${optimizationId} not found for shop ${shop}`);
  }
  
  // Increment the appropriate impression counter
  const updates: any = {
    impressions: (optimization.impressions || 0) + 1,
  };
  
  if (variant === 'control') {
    updates.controlImpressions = (optimization.controlImpressions || 0) + 1;
  } else {
    updates.variantImpressions = (optimization.variantImpressions || 0) + 1;
  }
  
  await storage.updateOptimization(shop, optimizationId, updates);
}

/**
 * Record a conversion for an optimization variant.
 * Increments conversion counters and adds revenue.
 */
export async function recordConversion(
  storage: IStorage,
  params: {
    shop: string;
    optimizationId: string;
    variant: 'control' | 'variant';
    revenue: number;
  }
): Promise<void> {
  const { shop, optimizationId, variant, revenue } = params;
  
  const optimization = await storage.getOptimization(shop, optimizationId);
  if (!optimization) {
    throw new Error(`Optimization ${optimizationId} not found for shop ${shop}`);
  }
  
  // Increment conversion counters and add revenue
  const updates: any = {
    conversions: (optimization.conversions || 0) + 1,
    revenue: (parseFloat(optimization.revenue || '0') + revenue).toString(),
  };
  
  if (variant === 'control') {
    updates.controlConversions = (optimization.controlConversions || 0) + 1;
    updates.controlRevenue = (parseFloat(optimization.controlRevenue || '0') + revenue).toString();
  } else {
    updates.variantConversions = (optimization.variantConversions || 0) + 1;
    updates.variantRevenue = (parseFloat(optimization.variantRevenue || '0') + revenue).toString();
  }
  
  // Recalculate ARPU
  const newConversions = updates.conversions;
  const newRevenue = parseFloat(updates.revenue);
  updates.arpu = newConversions > 0 ? (newRevenue / newConversions).toString() : '0';
  
  await storage.updateOptimization(shop, optimizationId, updates);
}
