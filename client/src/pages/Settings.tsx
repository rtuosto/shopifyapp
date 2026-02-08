import { useState } from "react";
import { Page, Card, BlockStack, InlineStack, Text, Button, Banner, Badge, Box, Divider, InlineGrid } from "@shopify/polaris";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const appOrigin = typeof window !== 'undefined'
    ? window.location.origin
    : '';
  const webhookUrl = `${appOrigin}/api/webhooks/orders/create`;
  const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || !window.location.origin.startsWith('https'));

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
      toast({
        title: "Copied!",
        description: "Webhook URL copied to clipboard",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy manually",
        variant: "destructive",
      });
    }
  };

  return (
    <Page>
      <BlockStack gap="600">
        <BlockStack gap="200">
          <Text as="h1" variant="heading2xl" data-testid="text-settings-title">Settings</Text>
          <Text as="p" variant="bodyMd" tone="subdued">Configure Shoptimizer for your store</Text>
        </BlockStack>

        {isDev && (
          <Banner title="Development Mode" tone="info">
            <p>You're running in development mode. URLs will change when you publish your app.</p>
          </Banner>
        )}

        <Banner title="Product Optimizations Work Immediately" tone="success">
          <p>Product optimizations (price, title, description) modify your actual Shopify product data via the Admin API. They work right away without any additional setup - just accept AI recommendations to get started!</p>
        </Banner>

        <Card>
          <BlockStack gap="400">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">Theme Extension Setup (Optional)</Text>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              For enhanced visitor tracking and Slot Experiments, enable the CRO Runtime in your theme
            </Text>

            <Banner tone="warning">
              <p><strong>Note:</strong> The theme extension must be deployed to your Shopify Partner app before it appears in the Theme Editor. If you don't see "Shoptimizer CRO Runtime" in App embeds, the extension needs to be deployed first.</p>
            </Banner>

            <Box padding="400" background="bg-surface-secondary" borderRadius="300">
              <InlineStack gap="400" blockAlign="start">
                <Badge tone="info">App Embed</Badge>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">CRO Runtime</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    A lightweight script that handles visitor tracking, experiment bucketing, and conversion attribution across all pages.
                  </Text>
                </BlockStack>
              </InlineStack>
            </Box>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">How to Enable (after deployment):</Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>1.</strong> Go to <strong>Shopify Admin → Online Store → Themes</strong>
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>2.</strong> Click <strong>Customize</strong> on your active theme
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>3.</strong> Click the <strong>App embeds</strong> icon in the left sidebar (puzzle piece icon)
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>4.</strong> Find <strong>"Shoptimizer CRO Runtime"</strong> and toggle it <strong>ON</strong>
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>5.</strong> Click <strong>Save</strong>
                </Text>
              </BlockStack>
            </BlockStack>

            <Button
              url="https://admin.shopify.com/themes/current/editor"
              external
              data-testid="link-theme-editor"
            >
              Open Theme Editor
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">Step 2: Add Experiment Slots (Optional)</Text>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Add content experiment zones to your product pages for slot-based A/B testing
            </Text>

            <Box padding="400" background="bg-surface-secondary" borderRadius="300">
              <InlineStack gap="400" blockAlign="start">
                <Badge tone="info">App Block</Badge>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Experiment Slot</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    A designated area where different content variants can be displayed to visitors for A/B testing. Perfect for testing headlines, descriptions, badges, and promotional content.
                  </Text>
                </BlockStack>
              </InlineStack>
            </Box>

            <Banner tone="info">
              <p><strong>This step is optional.</strong> Product optimizations (price, title, description) work automatically via the Admin API. Experiment Slots are only needed for custom content experiments.</p>
            </Banner>

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">How to Add Experiment Slots:</Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>1.</strong> In Theme Editor, navigate to a <strong>Product page template</strong>
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>2.</strong> Click <strong>Add block</strong> or <strong>Add section</strong>
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>3.</strong> Search for and select <strong>"Shoptimizer Experiment Slot"</strong>
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>4.</strong> Configure the <strong>Slot ID</strong> (e.g., "hero-banner", "promo-text")
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>5.</strong> Position the slot where you want experiment content to appear
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>6.</strong> Click <strong>Save</strong>
                </Text>
              </BlockStack>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">Webhook Configuration</Text>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Webhooks track purchases to measure optimization performance
            </Text>

            <BlockStack gap="200">
              <InlineStack gap="400" align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" fontWeight="semibold">Webhook URL</Text>
                <Button
                  onClick={() => copyToClipboard(webhookUrl)}
                  data-testid="button-copy-webhook"
                >
                  {copiedWebhook ? "Copied" : "Copy"}
                </Button>
              </InlineStack>
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <Text as="p" variant="bodySm">
                  <code data-testid="text-webhook-url">{webhookUrl}</code>
                </Text>
              </Box>
            </BlockStack>

            <Banner tone="success">
              <p>Webhooks are <strong>automatically registered</strong> when your Shopify app is installed. You typically don't need to configure this manually.</p>
            </Banner>

            <Divider />

            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Verify Webhook (if needed):</Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>1.</strong> Go to Shopify Admin → Settings → Notifications
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>2.</strong> Scroll to "Webhooks" section
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>3.</strong> Look for webhook with event "Order creation"
                </Text>
              </BlockStack>
              <Button
                url="https://admin.shopify.com/settings/notifications"
                external
                data-testid="link-webhooks"
              >
                Open Shopify Notifications
              </Button>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">API Configuration</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Your Shoptimizer backend URL (auto-detected)
            </Text>

            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="semibold">Backend URL</Text>
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <Text as="p" variant="bodySm">
                  <code data-testid="text-api-url">{appOrigin || '(loading…)'}</code>
                </Text>
              </Box>
              <Text as="p" variant="bodySm" tone="subdued">
                This URL is automatically detected from your environment
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">How Shoptimizer Works</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Understanding the two types of A/B testing
            </Text>

            <InlineGrid columns={2} gap="400">
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="info">Product Optimizations</Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Tests that modify actual Shopify product data (titles, descriptions, prices) via the Admin API. Changes are applied directly to your products.
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">• Price optimization</Text>
                    <Text as="p" variant="bodySm" tone="subdued">• Title optimization</Text>
                    <Text as="p" variant="bodySm" tone="subdued">• Description optimization</Text>
                  </BlockStack>
                </BlockStack>
              </Box>
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="info">Slot Experiments</Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Content experiments that render variants inside Theme App Extension slots. No product data is modified - variants display in designated areas.
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">• Custom headlines</Text>
                    <Text as="p" variant="bodySm" tone="subdued">• Promotional badges</Text>
                    <Text as="p" variant="bodySm" tone="subdued">• Call-to-action text</Text>
                  </BlockStack>
                </BlockStack>
              </Box>
            </InlineGrid>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
