import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface WebhookStatus {
  ordersWebhook: any | null;
  status: 'registered' | 'not_registered' | 'unknown';
  message: string;
}

export default function SetupGuide() {
  const { toast } = useToast();
  
  const { data: webhookStatus, isLoading: webhookLoading } = useQuery<WebhookStatus>({
    queryKey: ['/api/webhooks/status'],
  });

  const registerWebhookMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/webhooks/register'),
    onSuccess: () => {
      toast({
        title: "Webhook registered",
        description: "Order tracking webhook has been registered successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks/status'] });
    },
    onError: (error: any) => {
      const message = error.message || "";
      const isProtectedDataError = message.includes("protected customer data");
      
      toast({
        title: "Failed to register webhook",
        description: isProtectedDataError 
          ? "Your app needs Protected Customer Data access in Shopify Partner Dashboard. Go to Configuration > Data protection."
          : message || "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const webhookRegistered = webhookStatus?.status === 'registered';
  const webhookUnknown = webhookStatus?.status === 'unknown';

  return (
    <s-section data-testid="card-setup-guide">
      <s-stack direction="inline" align="space-between" blockAlign="start" gap="base">
        <s-stack direction="block" gap="small">
          <s-text variant="headingMd">Welcome to Shoptimizer!</s-text>
          <s-text variant="bodySm" tone="subdued">
            Complete these steps to start optimizing your products with A/B testing
          </s-text>
        </s-stack>
        <Link href="/settings">
          <s-button variant="tertiary" icon="settings" data-testid="link-full-settings">
            Full Settings
          </s-button>
        </Link>
      </s-stack>

      <s-divider />

      <s-stack direction="inline" gap="base" blockAlign="start">
        <s-badge tone="success" icon="check-circle">Done</s-badge>
        <s-stack direction="block" gap="small">
          <s-text variant="headingSm">Step 1: Products Synced</s-text>
          <s-text variant="bodySm" tone="subdued">
            Your products are automatically synced from Shopify during app installation and kept up to date.
          </s-text>
        </s-stack>
      </s-stack>

      <s-divider />

      <s-stack direction="inline" gap="base" blockAlign="start">
        {webhookLoading ? (
          <s-spinner size="small" accessibilityLabel="Checking webhook status" />
        ) : webhookRegistered ? (
          <s-badge tone="success" icon="check-circle">Done</s-badge>
        ) : webhookUnknown ? (
          <s-badge tone="read-only" icon="circle">Unknown</s-badge>
        ) : (
          <s-badge tone="warning" icon="alert-circle">Required</s-badge>
        )}
        <s-stack direction="block" gap="small">
          <s-text variant="headingSm">Step 2: Order Tracking Webhook</s-text>
          {webhookLoading ? (
            <s-text variant="bodySm" tone="subdued">Checking webhook status...</s-text>
          ) : webhookRegistered ? (
            <s-text variant="bodySm" tone="subdued">
              Order tracking webhook is registered and ready to track conversions.
            </s-text>
          ) : webhookUnknown ? (
            <s-text variant="bodySm" tone="subdued">
              Unable to check webhook status in development mode. When running with a real Shopify session, you can verify and register the webhook.
            </s-text>
          ) : (
            <s-stack direction="block" gap="small">
              <s-text variant="bodySm" tone="subdued">
                The order tracking webhook is not registered. Click below to register it for conversion tracking.
              </s-text>
              <s-button
                variant="primary"
                size="slim"
                onClick={() => registerWebhookMutation.mutate()}
                disabled={registerWebhookMutation.isPending}
                loading={registerWebhookMutation.isPending}
                data-testid="button-register-webhook"
              >
                Register Webhook
              </s-button>
            </s-stack>
          )}
        </s-stack>
      </s-stack>

      <s-divider />

      <s-stack direction="inline" gap="base" blockAlign="start">
        <s-badge tone="info" icon="wand">Next</s-badge>
        <s-stack direction="block" gap="small">
          <s-text variant="headingSm">Step 3: Create Your First Optimization</s-text>
          <s-text variant="bodySm" tone="subdued">
            Accept AI recommendations to automatically create and activate product optimizations. Changes are applied directly to your Shopify products.
          </s-text>
          <s-banner tone="info">
            <strong>Product optimizations</strong> (price, title, description) modify your actual Shopify product data and work immediately - no additional setup required.
          </s-banner>
          <s-button-group>
            <Link href="/recommendations">
              <s-button variant="primary" data-testid="link-ai-recommendations">
                View AI Recommendations
              </s-button>
            </Link>
            <Link href="/optimizations">
              <s-button variant="secondary" data-testid="link-active-optimizations">
                View Optimizations
              </s-button>
            </Link>
          </s-button-group>
        </s-stack>
      </s-stack>

      <s-divider />

      <s-stack direction="inline" gap="base" blockAlign="start">
        <s-badge tone="read-only" icon="circle">Optional</s-badge>
        <s-stack direction="block" gap="small">
          <s-text variant="headingSm">Advanced: Enable Theme Extension (Optional)</s-text>
          <s-text variant="bodySm" tone="subdued">
            For enhanced visitor tracking and custom content experiments (Slot Experiments), enable the CRO Runtime in your theme. This requires the extension to be deployed first.
          </s-text>
          <Link href="/settings">
            <s-button variant="secondary" icon="settings" data-testid="link-slot-instructions">
              View Setup Instructions
            </s-button>
          </Link>
        </s-stack>
      </s-stack>

      <s-divider />

      <s-box padding="small">
        <s-text variant="bodySm" tone="subdued" alignment="center">
          Need help? Visit{' '}
          <Link href="/settings">
            <s-link>Settings</s-link>
          </Link>
          {' '}for detailed configuration
        </s-text>
      </s-box>
    </s-section>
  );
}
