import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface BillingStatus {
  plan: string;
  status: string;
  subscription: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
    trialDays: number;
    currentPeriodEnd: string | null;
    test: boolean;
    price: string | null;
  } | null;
  message?: string;
}

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with basic optimization",
    features: [
      "Up to 5 AI recommendations per month",
      "1 active optimization",
      "Basic analytics",
      "Community support",
    ],
    cta: "Current Plan",
    popular: false,
    icon: "shield",
  },
  {
    id: "growth",
    name: "Growth",
    price: "$29.99",
    period: "per month",
    description: "For growing stores ready to optimize",
    features: [
      "50 AI recommendations per month",
      "10 active optimizations",
      "Advanced analytics & reporting",
      "Slot experiments (App Blocks)",
      "Priority email support",
      "14-day free trial",
    ],
    cta: "Start Free Trial",
    popular: true,
    icon: "lightning",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$79.99",
    period: "per month",
    description: "For high-volume stores maximizing revenue",
    features: [
      "Unlimited AI recommendations",
      "Unlimited active optimizations",
      "Full analytics suite",
      "All experiment types",
      "Priority support",
      "Custom automation rules",
      "14-day free trial",
    ],
    cta: "Start Free Trial",
    popular: false,
    icon: "star",
  },
];

export default function Billing() {
  const { data: billing, isLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
  });

  const subscribeMutation = useMutation({
    mutationFn: async (plan: string) => {
      const res = await apiRequest("POST", "/api/billing/subscribe", { plan });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.confirmationUrl) {
        window.top?.location.assign(data.confirmationUrl);
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const res = await apiRequest("POST", "/api/billing/cancel", { subscriptionId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
    },
  });

  const currentPlan = billing?.plan || "free";
  const isBeta = currentPlan === "beta";
  const isActive = billing?.status === "active" || billing?.status === "ACTIVE";

  if (isLoading) {
    return (
      <s-page>
        <s-box padding="base" minBlockSize="400px">
          <s-stack direction="block" align="center" blockAlign="center">
            <s-spinner size="large" accessibilityLabel="Loading billing information" data-testid="spinner-billing-loading" />
          </s-stack>
        </s-box>
      </s-page>
    );
  }

  return (
    <s-page>
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small">
          <s-text variant="headingLg" data-testid="text-billing-title">Plans & Billing</s-text>
          <s-text variant="bodySm" tone="subdued">Manage your subscription and billing</s-text>
        </s-stack>

        {isBeta && (
          <s-banner tone="info" data-testid="alert-beta-access">
            You're currently on beta access with all features unlocked. When the app launches, you'll need to select a plan.
          </s-banner>
        )}

        {billing?.subscription && (
          <s-section data-testid="card-current-subscription">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" align="space-between" blockAlign="center" wrap>
                <s-stack direction="block" gap="small">
                  <s-text variant="headingMd">Current Subscription</s-text>
                  <s-text variant="bodySm" tone="subdued">{billing.subscription.name}</s-text>
                </s-stack>
                <s-badge
                  tone={isActive ? "success" : "read-only"}
                  data-testid="badge-subscription-status"
                >
                  {billing.subscription.status}
                </s-badge>
              </s-stack>

              <s-stack direction="inline" gap="large" wrap>
                {billing.subscription.price && (
                  <s-stack direction="inline" gap="small">
                    <s-text variant="bodySm" tone="subdued">Price:</s-text>
                    <s-text variant="bodySm" fontWeight="semibold" data-testid="text-subscription-price">{billing.subscription.price}/month</s-text>
                  </s-stack>
                )}
                {billing.subscription.trialDays > 0 && (
                  <s-stack direction="inline" gap="small">
                    <s-text variant="bodySm" tone="subdued">Trial:</s-text>
                    <s-text variant="bodySm" fontWeight="semibold">{billing.subscription.trialDays} days</s-text>
                  </s-stack>
                )}
                {billing.subscription.currentPeriodEnd && (
                  <s-stack direction="inline" gap="small">
                    <s-text variant="bodySm" tone="subdued">Next billing:</s-text>
                    <s-text variant="bodySm" fontWeight="semibold">
                      {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
                    </s-text>
                  </s-stack>
                )}
                {billing.subscription.test && (
                  <s-badge tone="read-only">Test Mode</s-badge>
                )}
              </s-stack>

              <s-button
                variant="primary"
                tone="critical"
                size="slim"
                onClick={() => cancelMutation.mutate(billing.subscription!.id)}
                disabled={cancelMutation.isPending}
                loading={cancelMutation.isPending}
                data-testid="button-cancel-subscription"
              >
                Cancel Subscription
              </s-button>
            </s-stack>
          </s-section>
        )}

        <s-grid columns="3" gap="base">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id || (isBeta && plan.id === "pro");
            const canUpgrade = !isCurrentPlan && plan.id !== "free";
            const isPlanActive = isCurrentPlan && isActive;

            return (
              <s-section key={plan.id} data-testid={`card-plan-${plan.id}`}>
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" align="space-between" blockAlign="center">
                    <s-text variant="headingMd">{plan.name}</s-text>
                    {plan.popular && (
                      <s-badge tone="info" data-testid="badge-popular">Popular</s-badge>
                    )}
                  </s-stack>

                  <s-stack direction="inline" blockAlign="baseline" gap="small">
                    <s-text variant="headingXl" data-testid={`text-price-${plan.id}`}>{plan.price}</s-text>
                    <s-text variant="bodySm" tone="subdued">/{plan.period}</s-text>
                  </s-stack>

                  <s-text variant="bodySm" tone="subdued">{plan.description}</s-text>

                  <s-divider />

                  <s-stack direction="block" gap="small">
                    {plan.features.map((feature, i) => (
                      <s-stack direction="inline" gap="small" blockAlign="start" key={i}>
                        <s-text variant="bodySm" tone="success">&#10003;</s-text>
                        <s-text variant="bodySm">{feature}</s-text>
                      </s-stack>
                    ))}
                  </s-stack>

                  {isPlanActive || (isBeta && plan.id === "pro") ? (
                    <s-button
                      variant="secondary"
                      fullWidth
                      disabled
                      data-testid={`button-plan-${plan.id}`}
                    >
                      {isBeta ? "Beta Access" : "Current Plan"}
                    </s-button>
                  ) : canUpgrade ? (
                    <s-button
                      variant={plan.popular ? "primary" : "secondary"}
                      fullWidth
                      icon="external-link"
                      onClick={() => subscribeMutation.mutate(plan.id)}
                      disabled={subscribeMutation.isPending}
                      loading={subscribeMutation.isPending}
                      data-testid={`button-plan-${plan.id}`}
                    >
                      {plan.cta}
                    </s-button>
                  ) : (
                    <s-button
                      variant="secondary"
                      fullWidth
                      disabled
                      data-testid={`button-plan-${plan.id}`}
                    >
                      {plan.cta}
                    </s-button>
                  )}
                </s-stack>
              </s-section>
            );
          })}
        </s-grid>

        <s-section data-testid="card-billing-faq">
          <s-stack direction="block" gap="base">
            <s-text variant="headingMd">Billing FAQ</s-text>

            <s-stack direction="block" gap="base">
              <s-stack direction="block" gap="small">
                <s-text variant="bodyMd" fontWeight="semibold">How does billing work?</s-text>
                <s-text variant="bodySm" tone="subdued">
                  All charges go through Shopify's billing system. You'll see charges on your Shopify invoice, not a separate bill.
                </s-text>
              </s-stack>

              <s-divider />

              <s-stack direction="block" gap="small">
                <s-text variant="bodyMd" fontWeight="semibold">Can I cancel anytime?</s-text>
                <s-text variant="bodySm" tone="subdued">
                  Yes, you can cancel your subscription at any time. Your features will remain active until the end of the current billing period.
                </s-text>
              </s-stack>

              <s-divider />

              <s-stack direction="block" gap="small">
                <s-text variant="bodyMd" fontWeight="semibold">What happens to my data if I downgrade?</s-text>
                <s-text variant="bodySm" tone="subdued">
                  Your optimization data and history are preserved. Active optimizations beyond your plan limit will be paused, not deleted.
                </s-text>
              </s-stack>
            </s-stack>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}
