export interface PlanLimits {
  maxActiveOptimizations: number;
  maxAIIdeasPerMonth: number;
  slotExperiments: boolean;
  advancedAnalytics: boolean;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    maxActiveOptimizations: 3,
    maxAIIdeasPerMonth: 10,
    slotExperiments: false,
    advancedAnalytics: false,
  },
  growth: {
    maxActiveOptimizations: 10,
    maxAIIdeasPerMonth: 50,
    slotExperiments: true,
    advancedAnalytics: true,
  },
  pro: {
    maxActiveOptimizations: Infinity,
    maxAIIdeasPerMonth: Infinity,
    slotExperiments: true,
    advancedAnalytics: true,
  },
  beta: {
    maxActiveOptimizations: Infinity,
    maxAIIdeasPerMonth: Infinity,
    slotExperiments: true,
    advancedAnalytics: true,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export function resolvePlanFromBilling(billing: {
  plan: string;
  status: string;
} | null): string {
  if (!billing) return "free";
  if (billing.plan === "beta") return "beta";
  if (billing.status === "active" || billing.status === "ACTIVE") {
    return billing.plan;
  }
  return "free";
}

export async function getEffectivePlan(req: any): Promise<string> {
  const session = req.shopifySession;
  if (!session?.accessToken) {
    return "beta";
  }
  
  try {
    const { getActiveSubscription } = await import("./shopify");
    const subscription = await getActiveSubscription(session);
    if (!subscription) return "free";
    const plan = subscription.name?.toLowerCase().includes("pro") ? "pro" : "growth";
    const status = subscription.status;
    if (status === "ACTIVE" || status === "active") return plan;
    return "free";
  } catch (error) {
    console.error("[Plan Limits] Error resolving plan:", error);
    return "free";
  }
}

export interface PlanLimitCheck {
  allowed: boolean;
  plan: string;
  limits: PlanLimits;
  reason?: string;
  currentUsage?: number;
}
