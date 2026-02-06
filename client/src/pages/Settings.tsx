import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const replitDomain = typeof window !== 'undefined' 
    ? window.location.hostname 
    : 'your-app.replit.app';
  const apiUrl = `https://${replitDomain}`;
  const webhookUrl = `${apiUrl}/api/webhooks/orders/create`;
  const isDev = replitDomain.includes('replit.dev') || replitDomain === 'localhost';

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
    <s-page>
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small">
          <s-text variant="heading2xl" data-testid="text-settings-title">Settings</s-text>
          <s-text variant="bodyMd" tone="subdued">Configure Shoptimizer for your store</s-text>
        </s-stack>

        {isDev && (
          <s-banner tone="info" heading="Development Mode">
            You're running in development mode. URLs will change when you publish your app.
          </s-banner>
        )}

        <s-banner tone="success" heading="Product Optimizations Work Immediately">
          Product optimizations (price, title, description) modify your actual Shopify product data via the Admin API. They work right away without any additional setup - just accept AI recommendations to get started!
        </s-banner>

        <s-section>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small" blockAlign="center">
              <s-text variant="headingMd">Theme Extension Setup (Optional)</s-text>
            </s-stack>
            <s-text variant="bodySm" tone="subdued">
              For enhanced visitor tracking and Slot Experiments, enable the CRO Runtime in your theme
            </s-text>

            <s-banner tone="warning">
              <strong>Note:</strong> The theme extension must be deployed to your Shopify Partner app before it appears in the Theme Editor. If you don't see "Shoptimizer CRO Runtime" in App embeds, the extension needs to be deployed first.
            </s-banner>

            <s-box background="bg-surface-secondary" padding="base" borderRadius="large">
              <s-stack direction="inline" gap="base" blockAlign="start">
                <s-badge tone="read-only">App Embed</s-badge>
                <s-stack direction="block" gap="small">
                  <s-text variant="bodyMd" fontWeight="semibold">CRO Runtime</s-text>
                  <s-text variant="bodySm" tone="subdued">
                    A lightweight script that handles visitor tracking, experiment bucketing, and conversion attribution across all pages.
                  </s-text>
                </s-stack>
              </s-stack>
            </s-box>

            <s-stack direction="block" gap="small">
              <s-text variant="headingSm">How to Enable (after deployment):</s-text>
              <s-stack direction="block" gap="small">
                <s-text variant="bodySm" tone="subdued">
                  <strong>1.</strong> Go to <strong>Shopify Admin → Online Store → Themes</strong>
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>2.</strong> Click <strong>Customize</strong> on your active theme
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>3.</strong> Click the <strong>App embeds</strong> icon in the left sidebar (puzzle piece icon)
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>4.</strong> Find <strong>"Shoptimizer CRO Runtime"</strong> and toggle it <strong>ON</strong>
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>5.</strong> Click <strong>Save</strong>
                </s-text>
              </s-stack>
            </s-stack>

            <s-button
              variant="secondary"
              size="slim"
              icon="external-link"
              href="https://admin.shopify.com/themes/current/editor"
              target="_blank"
              data-testid="link-theme-editor"
            >
              Open Theme Editor
            </s-button>
          </s-stack>
        </s-section>

        <s-section>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small" blockAlign="center">
              <s-text variant="headingMd">Step 2: Add Experiment Slots (Optional)</s-text>
            </s-stack>
            <s-text variant="bodySm" tone="subdued">
              Add content experiment zones to your product pages for slot-based A/B testing
            </s-text>

            <s-box background="bg-surface-secondary" padding="base" borderRadius="large">
              <s-stack direction="inline" gap="base" blockAlign="start">
                <s-badge tone="read-only">App Block</s-badge>
                <s-stack direction="block" gap="small">
                  <s-text variant="bodyMd" fontWeight="semibold">Experiment Slot</s-text>
                  <s-text variant="bodySm" tone="subdued">
                    A designated area where different content variants can be displayed to visitors for A/B testing. Perfect for testing headlines, descriptions, badges, and promotional content.
                  </s-text>
                </s-stack>
              </s-stack>
            </s-box>

            <s-banner tone="info">
              <strong>This step is optional.</strong> Product optimizations (price, title, description) work automatically via the Admin API. Experiment Slots are only needed for custom content experiments.
            </s-banner>

            <s-stack direction="block" gap="small">
              <s-text variant="headingSm">How to Add Experiment Slots:</s-text>
              <s-stack direction="block" gap="small">
                <s-text variant="bodySm" tone="subdued">
                  <strong>1.</strong> In Theme Editor, navigate to a <strong>Product page template</strong>
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>2.</strong> Click <strong>Add block</strong> or <strong>Add section</strong>
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>3.</strong> Search for and select <strong>"Shoptimizer Experiment Slot"</strong>
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>4.</strong> Configure the <strong>Slot ID</strong> (e.g., "hero-banner", "promo-text")
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>5.</strong> Position the slot where you want experiment content to appear
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>6.</strong> Click <strong>Save</strong>
                </s-text>
              </s-stack>
            </s-stack>
          </s-stack>
        </s-section>

        <s-section>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small" blockAlign="center">
              <s-text variant="headingMd">Webhook Configuration</s-text>
            </s-stack>
            <s-text variant="bodySm" tone="subdued">
              Webhooks track purchases to measure optimization performance
            </s-text>

            <s-stack direction="block" gap="small">
              <s-stack direction="inline" gap="base" align="space-between" blockAlign="center">
                <s-text variant="bodySm" fontWeight="semibold">Webhook URL</s-text>
                <s-button
                  variant="secondary"
                  size="slim"
                  icon={copiedWebhook ? "check" : "clipboard"}
                  onClick={() => copyToClipboard(webhookUrl)}
                  data-testid="button-copy-webhook"
                >
                  {copiedWebhook ? "Copied" : "Copy"}
                </s-button>
              </s-stack>
              <s-box background="bg-surface-secondary" padding="base" borderRadius="large">
                <s-text variant="bodySm">
                  <code data-testid="text-webhook-url">{webhookUrl}</code>
                </s-text>
              </s-box>
            </s-stack>

            <s-banner tone="success">
              Webhooks are <strong>automatically registered</strong> when your Shopify app is installed. You typically don't need to configure this manually.
            </s-banner>

            <s-divider />

            <s-stack direction="block" gap="small">
              <s-text variant="headingSm">Verify Webhook (if needed):</s-text>
              <s-stack direction="block" gap="small">
                <s-text variant="bodySm" tone="subdued">
                  <strong>1.</strong> Go to Shopify Admin → Settings → Notifications
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>2.</strong> Scroll to "Webhooks" section
                </s-text>
                <s-text variant="bodySm" tone="subdued">
                  <strong>3.</strong> Look for webhook with event "Order creation"
                </s-text>
              </s-stack>
              <s-button
                variant="secondary"
                size="slim"
                icon="external-link"
                href="https://admin.shopify.com/settings/notifications"
                target="_blank"
                data-testid="link-webhooks"
              >
                Open Shopify Notifications
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>

        <s-section>
          <s-stack direction="block" gap="base">
            <s-text variant="headingMd">API Configuration</s-text>
            <s-text variant="bodySm" tone="subdued">
              Your Shoptimizer backend URL (auto-detected)
            </s-text>

            <s-stack direction="block" gap="small">
              <s-text variant="bodySm" fontWeight="semibold">Backend URL</s-text>
              <s-box background="bg-surface-secondary" padding="base" borderRadius="large">
                <s-text variant="bodySm">
                  <code data-testid="text-api-url">{apiUrl}</code>
                </s-text>
              </s-box>
              <s-text variant="bodySm" tone="subdued">
                This URL is automatically detected from your environment
              </s-text>
            </s-stack>
          </s-stack>
        </s-section>

        <s-section>
          <s-stack direction="block" gap="base">
            <s-text variant="headingMd">How Shoptimizer Works</s-text>
            <s-text variant="bodySm" tone="subdued">
              Understanding the two types of A/B testing
            </s-text>

            <s-grid columns="2" gap="base">
              <s-box background="bg-surface-secondary" padding="base" borderRadius="large" border="border">
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" gap="small" blockAlign="center">
                    <s-badge tone="info">Product Optimizations</s-badge>
                  </s-stack>
                  <s-text variant="bodySm" tone="subdued">
                    Tests that modify actual Shopify product data (titles, descriptions, prices) via the Admin API. Changes are applied directly to your products.
                  </s-text>
                  <s-stack direction="block" gap="small">
                    <s-text variant="bodySm" tone="subdued">• Price optimization</s-text>
                    <s-text variant="bodySm" tone="subdued">• Title optimization</s-text>
                    <s-text variant="bodySm" tone="subdued">• Description optimization</s-text>
                  </s-stack>
                </s-stack>
              </s-box>
              <s-box background="bg-surface-secondary" padding="base" borderRadius="large" border="border">
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" gap="small" blockAlign="center">
                    <s-badge tone="read-only">Slot Experiments</s-badge>
                  </s-stack>
                  <s-text variant="bodySm" tone="subdued">
                    Content experiments that render variants inside Theme App Extension slots. No product data is modified - variants display in designated areas.
                  </s-text>
                  <s-stack direction="block" gap="small">
                    <s-text variant="bodySm" tone="subdued">• Custom headlines</s-text>
                    <s-text variant="bodySm" tone="subdued">• Promotional badges</s-text>
                    <s-text variant="bodySm" tone="subdued">• Call-to-action text</s-text>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-grid>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}
