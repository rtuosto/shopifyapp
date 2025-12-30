import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, ExternalLink, Info, CheckCircle2, Puzzle, LayoutGrid, Zap } from "lucide-react";
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
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground mt-2">Configure Shoptimizer for your store</p>
      </div>

      {isDev && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Development Mode</AlertTitle>
          <AlertDescription>
            You're running in development mode. URLs will change when you publish your app.
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertTitle className="text-green-900 dark:text-green-100">Product Optimizations Work Immediately</AlertTitle>
        <AlertDescription className="text-green-800 dark:text-green-200">
          Product optimizations (price, title, description) modify your actual Shopify product data via the Admin API. They work right away without any additional setup - just accept AI recommendations to get started!
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle>Theme Extension Setup (Optional)</CardTitle>
          </div>
          <CardDescription>
            For enhanced visitor tracking and Slot Experiments, enable the CRO Runtime in your theme
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> The theme extension must be deployed to your Shopify Partner app before it appears in the Theme Editor. If you don't see "Shoptimizer CRO Runtime" in App embeds, the extension needs to be deployed first.
            </AlertDescription>
          </Alert>

          <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
            <Badge variant="outline" className="mt-0.5">App Embed</Badge>
            <div className="flex-1">
              <p className="font-medium">CRO Runtime</p>
              <p className="text-sm text-muted-foreground">
                A lightweight script that handles visitor tracking, experiment bucketing, and conversion attribution across all pages.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <h4 className="text-sm font-medium mb-3">How to Enable (after deployment):</h4>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">1</span>
                <span>Go to <strong className="text-foreground">Shopify Admin → Online Store → Themes</strong></span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">2</span>
                <span>Click <strong className="text-foreground">Customize</strong> on your active theme</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">3</span>
                <span>Click the <strong className="text-foreground">App embeds</strong> icon in the left sidebar (puzzle piece icon)</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">4</span>
                <span>Find <strong className="text-foreground">"Shoptimizer CRO Runtime"</strong> and toggle it <strong className="text-foreground">ON</strong></span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">5</span>
                <span>Click <strong className="text-foreground">Save</strong></span>
              </li>
            </ol>
          </div>

          <Button variant="outline" size="sm" asChild className="mt-4">
            <a 
              href="https://admin.shopify.com/themes/current/editor"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-theme-editor"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Theme Editor
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <CardTitle>Step 2: Add Experiment Slots (Optional)</CardTitle>
          </div>
          <CardDescription>
            Add content experiment zones to your product pages for slot-based A/B testing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
            <Badge variant="outline" className="mt-0.5">App Block</Badge>
            <div className="flex-1">
              <p className="font-medium">Experiment Slot</p>
              <p className="text-sm text-muted-foreground">
                A designated area where different content variants can be displayed to visitors for A/B testing. Perfect for testing headlines, descriptions, badges, and promotional content.
              </p>
            </div>
          </div>

          <Alert variant="default" className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              <strong>This step is optional.</strong> Product optimizations (price, title, description) work automatically via the Admin API. Experiment Slots are only needed for custom content experiments.
            </AlertDescription>
          </Alert>

          <div className="pt-2">
            <h4 className="text-sm font-medium mb-3">How to Add Experiment Slots:</h4>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">1</span>
                <span>In Theme Editor, navigate to a <strong className="text-foreground">Product page template</strong></span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">2</span>
                <span>Click <strong className="text-foreground">Add block</strong> or <strong className="text-foreground">Add section</strong></span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">3</span>
                <span>Search for and select <strong className="text-foreground">"Shoptimizer Experiment Slot"</strong></span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">4</span>
                <span>Configure the <strong className="text-foreground">Slot ID</strong> (e.g., "hero-banner", "promo-text")</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">5</span>
                <span>Position the slot where you want experiment content to appear</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">6</span>
                <span>Click <strong className="text-foreground">Save</strong></span>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-primary" />
            <CardTitle>Webhook Configuration</CardTitle>
          </div>
          <CardDescription>
            Webhooks track purchases to measure optimization performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Webhook URL</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(webhookUrl)}
                data-testid="button-copy-webhook"
              >
                {copiedWebhook ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <code data-testid="text-webhook-url">{webhookUrl}</code>
            </div>
          </div>

          <Alert variant="default">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Webhooks are <strong>automatically registered</strong> when your Shopify app is installed. You typically don't need to configure this manually.
            </AlertDescription>
          </Alert>

          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Verify Webhook (if needed):</h4>
            <ol className="space-y-2 text-sm text-muted-foreground mb-4">
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">1.</span>
                Go to Shopify Admin → Settings → Notifications
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">2.</span>
                Scroll to "Webhooks" section
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">3.</span>
                Look for webhook with event "Order creation"
              </li>
            </ol>
            <Button variant="outline" size="sm" asChild>
              <a 
                href="https://admin.shopify.com/settings/notifications"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-webhooks"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Shopify Notifications
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
          <CardDescription>
            Your Shoptimizer backend URL (auto-detected)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-sm font-medium">Backend URL</label>
            <div className="bg-muted p-4 rounded-lg font-mono text-sm mt-2">
              <code data-testid="text-api-url">{apiUrl}</code>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              This URL is automatically detected from your environment
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Shoptimizer Works</CardTitle>
          <CardDescription>
            Understanding the two types of A/B testing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Badge>Product Optimizations</Badge>
              </h4>
              <p className="text-sm text-muted-foreground">
                Tests that modify actual Shopify product data (titles, descriptions, prices) via the Admin API. Changes are applied directly to your products.
              </p>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                <li>• Price optimization</li>
                <li>• Title optimization</li>
                <li>• Description optimization</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Badge variant="secondary">Slot Experiments</Badge>
              </h4>
              <p className="text-sm text-muted-foreground">
                Content experiments that render variants inside Theme App Extension slots. No product data is modified - variants display in designated areas.
              </p>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                <li>• Custom headlines</li>
                <li>• Promotional badges</li>
                <li>• Call-to-action text</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
