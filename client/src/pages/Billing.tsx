import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, Crown, Zap, Shield, Loader2, ExternalLink, Info } from "lucide-react";

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
      <div className="container max-w-5xl py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" data-testid="spinner-billing-loading" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-billing-title">Plans & Billing</h1>
        <p className="text-muted-foreground mt-2">Manage your subscription and billing</p>
      </div>

      {isBeta && (
        <Alert data-testid="alert-beta-access">
          <Info className="h-4 w-4" />
          <AlertDescription>
            You're currently on beta access with all features unlocked. When the app launches, you'll need to select a plan.
          </AlertDescription>
        </Alert>
      )}

      {billing?.subscription && (
        <Card data-testid="card-current-subscription">
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="text-lg">Current Subscription</CardTitle>
                <CardDescription>{billing.subscription.name}</CardDescription>
              </div>
              <Badge
                variant={isActive ? "default" : "secondary"}
                data-testid="badge-subscription-status"
              >
                {billing.subscription.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {billing.subscription.price && (
                <div>
                  <span className="text-muted-foreground">Price:</span>{" "}
                  <span className="font-medium" data-testid="text-subscription-price">{billing.subscription.price}/month</span>
                </div>
              )}
              {billing.subscription.trialDays > 0 && (
                <div>
                  <span className="text-muted-foreground">Trial:</span>{" "}
                  <span className="font-medium">{billing.subscription.trialDays} days</span>
                </div>
              )}
              {billing.subscription.currentPeriodEnd && (
                <div>
                  <span className="text-muted-foreground">Next billing:</span>{" "}
                  <span className="font-medium">
                    {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
                  </span>
                </div>
              )}
              {billing.subscription.test && (
                <Badge variant="outline">Test Mode</Badge>
              )}
            </div>
            <div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => cancelMutation.mutate(billing.subscription!.id)}
                disabled={cancelMutation.isPending}
                data-testid="button-cancel-subscription"
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Cancel Subscription
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlan === plan.id || (isBeta && plan.id === "pro");
          const canUpgrade = !isCurrentPlan && plan.id !== "free";
          const isPlanActive = isCurrentPlan && isActive;

          return (
            <Card
              key={plan.id}
              className={plan.popular ? "border-primary" : ""}
              data-testid={`card-plan-${plan.id}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {plan.id === "free" && <Shield className="w-4 h-4" />}
                    {plan.id === "growth" && <Zap className="w-4 h-4" />}
                    {plan.id === "pro" && <Crown className="w-4 h-4" />}
                    {plan.name}
                  </CardTitle>
                  {plan.popular && (
                    <Badge variant="default" data-testid="badge-popular">Popular</Badge>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-bold" data-testid={`text-price-${plan.id}`}>{plan.price}</span>
                  <span className="text-muted-foreground text-sm ml-1">/{plan.period}</span>
                </div>
                <CardDescription className="mt-1">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div>
                  {isPlanActive || (isBeta && plan.id === "pro") ? (
                    <Button variant="outline" className="w-full" disabled data-testid={`button-plan-${plan.id}`}>
                      {isBeta ? "Beta Access" : "Current Plan"}
                    </Button>
                  ) : canUpgrade ? (
                    <Button
                      className="w-full"
                      variant={plan.popular ? "default" : "outline"}
                      onClick={() => subscribeMutation.mutate(plan.id)}
                      disabled={subscribeMutation.isPending}
                      data-testid={`button-plan-${plan.id}`}
                    >
                      {subscribeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                      {plan.cta}
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full" disabled data-testid={`button-plan-${plan.id}`}>
                      {plan.cta}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card data-testid="card-billing-faq">
        <CardHeader>
          <CardTitle className="text-lg">Billing FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium">How does billing work?</p>
            <p className="text-muted-foreground mt-1">
              All charges go through Shopify's billing system. You'll see charges on your Shopify invoice, not a separate bill.
            </p>
          </div>
          <div>
            <p className="font-medium">Can I cancel anytime?</p>
            <p className="text-muted-foreground mt-1">
              Yes, you can cancel your subscription at any time. Your features will remain active until the end of the current billing period.
            </p>
          </div>
          <div>
            <p className="font-medium">What happens to my data if I downgrade?</p>
            <p className="text-muted-foreground mt-1">
              Your optimization data and history are preserved. Active optimizations beyond your plan limit will be paused, not deleted.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
