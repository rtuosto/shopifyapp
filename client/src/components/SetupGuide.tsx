import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, BlockStack, InlineStack, Text, Button, Badge, Divider, Spinner, Banner, ButtonGroup, Box } from "@shopify/polaris";
import { SettingsIcon } from "@shopify/polaris-icons";

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
    <Card data-testid="card-setup-guide">
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="start" gap="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Welcome to Shoptimizer!</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Complete these steps to start optimizing your products with A/B testing
            </Text>
          </BlockStack>
          <Link href="/settings">
            <Button variant="plain" icon={SettingsIcon} data-testid="link-full-settings">
              Full Settings
            </Button>
          </Link>
        </InlineStack>

        <Divider />

        <InlineStack gap="400" blockAlign="start">
          <Badge tone="success">Done</Badge>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Step 1: Products Synced</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Your products are automatically synced from Shopify during app installation and kept up to date.
            </Text>
          </BlockStack>
        </InlineStack>

        <Divider />

        <InlineStack gap="400" blockAlign="start">
          {webhookLoading ? (
            <Spinner size="small" accessibilityLabel="Checking webhook status" />
          ) : webhookRegistered ? (
            <Badge tone="success">Done</Badge>
          ) : webhookUnknown ? (
            <Badge tone="read-only">Unknown</Badge>
          ) : (
            <Badge tone="warning">Required</Badge>
          )}
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Step 2: Order Tracking Webhook</Text>
            {webhookLoading ? (
              <Text as="p" variant="bodySm" tone="subdued">Checking webhook status...</Text>
            ) : webhookRegistered ? (
              <Text as="p" variant="bodySm" tone="subdued">
                Order tracking webhook is registered and ready to track conversions.
              </Text>
            ) : webhookUnknown ? (
              <Text as="p" variant="bodySm" tone="subdued">
                Unable to check webhook status in development mode. When running with a real Shopify session, you can verify and register the webhook.
              </Text>
            ) : (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  The order tracking webhook is not registered. Click below to register it for conversion tracking.
                </Text>
                <Button
                  variant="primary"
                  size="slim"
                  onClick={() => registerWebhookMutation.mutate()}
                  disabled={registerWebhookMutation.isPending}
                  loading={registerWebhookMutation.isPending}
                  data-testid="button-register-webhook"
                >
                  Register Webhook
                </Button>
              </BlockStack>
            )}
          </BlockStack>
        </InlineStack>

        <Divider />

        <InlineStack gap="400" blockAlign="start">
          <Badge tone="info">Next</Badge>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Step 3: Create Your First Optimization</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Accept AI recommendations to automatically create and activate product optimizations. Changes are applied directly to your Shopify products.
            </Text>
            <Banner tone="info">
              <p><strong>Product optimizations</strong> (price, title, description) modify your actual Shopify product data and work immediately - no additional setup required.</p>
            </Banner>
            <ButtonGroup>
              <Link href="/recommendations">
                <Button variant="primary" data-testid="link-ai-recommendations">
                  View AI Recommendations
                </Button>
              </Link>
              <Link href="/optimizations">
                <Button data-testid="link-active-optimizations">
                  View Optimizations
                </Button>
              </Link>
            </ButtonGroup>
          </BlockStack>
        </InlineStack>

        <Divider />

        <InlineStack gap="400" blockAlign="start">
          <Badge tone="read-only">Optional</Badge>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Advanced: Enable Theme Extension (Optional)</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              For enhanced visitor tracking and custom content experiments (Slot Experiments), enable the CRO Runtime in your theme. This requires the extension to be deployed first.
            </Text>
            <Link href="/settings">
              <Button icon={SettingsIcon} data-testid="link-slot-instructions">
                View Setup Instructions
              </Button>
            </Link>
          </BlockStack>
        </InlineStack>

        <Divider />

        <Box padding="200">
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            Need help? Visit{' '}
            <Link href="/settings">
              Settings
            </Link>
            {' '}for detailed configuration
          </Text>
        </Box>
      </BlockStack>
    </Card>
  );
}
