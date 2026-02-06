import { useQuery, useMutation } from "@tanstack/react-query";
import { Page, Card, BlockStack, InlineStack, Text, Button, Banner, Badge, Box, Divider, InlineGrid, Spinner } from "@shopify/polaris";
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
      <Page>
        <Box padding="400" minHeight="400px">
          <BlockStack align="center">
            <Spinner size="large" accessibilityLabel="Loading billing information" data-testid="spinner-billing-loading" />
          </BlockStack>
        </Box>
      </Page>
    );
  }

  return (
    <Page>
      <BlockStack gap="600">
        <BlockStack gap="200">
          <Text as="h1" variant="headingLg" data-testid="text-billing-title">Plans & Billing</Text>
          <Text as="p" variant="bodySm" tone="subdued">Manage your subscription and billing</Text>
        </BlockStack>

        {isBeta && (
          <Banner tone="info" data-testid="alert-beta-access">
            <p>You're currently on beta access with all features unlocked. When the app launches, you'll need to select a plan.</p>
          </Banner>
        )}

        {billing?.subscription && (
          <Card data-testid="card-current-subscription">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Current Subscription</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{billing.subscription.name}</Text>
                </BlockStack>
                <Badge
                  tone={isActive ? "success" : undefined}
                  data-testid="badge-subscription-status"
                >
                  {billing.subscription.status}
                </Badge>
              </InlineStack>

              <InlineStack gap="600" wrap={true}>
                {billing.subscription.price && (
                  <InlineStack gap="200">
                    <Text as="span" variant="bodySm" tone="subdued">Price:</Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold" data-testid="text-subscription-price">{billing.subscription.price}/month</Text>
                  </InlineStack>
                )}
                {billing.subscription.trialDays > 0 && (
                  <InlineStack gap="200">
                    <Text as="span" variant="bodySm" tone="subdued">Trial:</Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold">{billing.subscription.trialDays} days</Text>
                  </InlineStack>
                )}
                {billing.subscription.currentPeriodEnd && (
                  <InlineStack gap="200">
                    <Text as="span" variant="bodySm" tone="subdued">Next billing:</Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
                    </Text>
                  </InlineStack>
                )}
                {billing.subscription.test && (
                  <Badge>Test Mode</Badge>
                )}
              </InlineStack>

              <Button
                variant="primary"
                tone="critical"
                onClick={() => cancelMutation.mutate(billing.subscription!.id)}
                disabled={cancelMutation.isPending}
                loading={cancelMutation.isPending}
                data-testid="button-cancel-subscription"
              >
                Cancel Subscription
              </Button>
            </BlockStack>
          </Card>
        )}

        <InlineGrid columns={3} gap="400">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id || (isBeta && plan.id === "pro");
            const canUpgrade = !isCurrentPlan && plan.id !== "free";
            const isPlanActive = isCurrentPlan && isActive;

            return (
              <Card key={plan.id} data-testid={`card-plan-${plan.id}`}>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">{plan.name}</Text>
                    {plan.popular && (
                      <Badge tone="info" data-testid="badge-popular">Popular</Badge>
                    )}
                  </InlineStack>

                  <InlineStack blockAlign="baseline" gap="200">
                    <Text as="p" variant="headingXl" data-testid={`text-price-${plan.id}`}>{plan.price}</Text>
                    <Text as="span" variant="bodySm" tone="subdued">/{plan.period}</Text>
                  </InlineStack>

                  <Text as="p" variant="bodySm" tone="subdued">{plan.description}</Text>

                  <Divider />

                  <BlockStack gap="200">
                    {plan.features.map((feature, i) => (
                      <InlineStack gap="200" blockAlign="start" key={i}>
                        <Text as="span" variant="bodySm" tone="success">&#10003;</Text>
                        <Text as="span" variant="bodySm">{feature}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>

                  {isPlanActive || (isBeta && plan.id === "pro") ? (
                    <Button
                      fullWidth
                      disabled
                      data-testid={`button-plan-${plan.id}`}
                    >
                      {isBeta ? "Beta Access" : "Current Plan"}
                    </Button>
                  ) : canUpgrade ? (
                    <Button
                      variant={plan.popular ? "primary" : undefined}
                      fullWidth
                      onClick={() => subscribeMutation.mutate(plan.id)}
                      disabled={subscribeMutation.isPending}
                      loading={subscribeMutation.isPending}
                      data-testid={`button-plan-${plan.id}`}
                    >
                      {plan.cta}
                    </Button>
                  ) : (
                    <Button
                      fullWidth
                      disabled
                      data-testid={`button-plan-${plan.id}`}
                    >
                      {plan.cta}
                    </Button>
                  )}
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>

        <Card data-testid="card-billing-faq">
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Billing FAQ</Text>

            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">How does billing work?</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  All charges go through Shopify's billing system. You'll see charges on your Shopify invoice, not a separate bill.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">Can I cancel anytime?</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Yes, you can cancel your subscription at any time. Your features will remain active until the end of the current billing period.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">What happens to my data if I downgrade?</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Your optimization data and history are preserved. Active optimizations beyond your plan limit will be paused, not deleted.
                </Text>
              </BlockStack>
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
