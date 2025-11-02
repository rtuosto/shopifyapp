import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Check, ExternalLink, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/installation-script"],
  });

  const copyToClipboard = async (text: string, type: 'script' | 'webhook') => {
    try {
      await navigator.clipboard.writeText(text);
      
      if (type === 'script') {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      } else {
        setCopiedWebhook(true);
        setTimeout(() => setCopiedWebhook(false), 2000);
      }

      toast({
        title: "Copied!",
        description: `${type === 'script' ? 'Installation script' : 'Webhook URL'} copied to clipboard`,
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy manually",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">Configure Shoptimizer for your store</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-20 bg-muted rounded"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const installationData = data as {
    apiUrl: string;
    scriptTag: string;
    webhookUrl: string;
    isDev: boolean;
  } | undefined;

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground mt-2">Configure Shoptimizer for your store</p>
      </div>

      {installationData?.isDev && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Development Mode</AlertTitle>
          <AlertDescription>
            You're running in development mode. The URLs below will change when you publish your app.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Installation Script</CardTitle>
          <CardDescription>
            Add this script to your Shopify theme to enable A/B optimization across all pages (product pages, collections, homepage, search)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Theme Installation</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => installationData && copyToClipboard(installationData.scriptTag, 'script')}
                data-testid="button-copy-script"
              >
                {copiedScript ? (
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
              <pre data-testid="text-installation-script">{installationData?.scriptTag}</pre>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Add this to your <code className="bg-muted px-1 rounded">theme.liquid</code> file before the closing <code className="bg-muted px-1 rounded">&lt;/head&gt;</code> tag
            </p>
          </div>

          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Installation Steps:</h4>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">1.</span>
                Go to Shopify Admin → Online Store → Themes
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">2.</span>
                Click Actions → Edit code
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">3.</span>
                Open <code className="bg-muted px-1 rounded">theme.liquid</code>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">4.</span>
                Paste the script above before <code className="bg-muted px-1 rounded">&lt;/head&gt;</code>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">5.</span>
                Click Save
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            Your webhook is automatically registered. Verify it's working below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Webhook URL</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => installationData && copyToClipboard(installationData.webhookUrl, 'webhook')}
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
              <code data-testid="text-webhook-url">{installationData?.webhookUrl}</code>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Verify Webhook:</h4>
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
                Look for webhook with URL above and event "Order creation"
              </li>
            </ol>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
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
            Your Shoptimizer backend URL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-sm font-medium">Backend URL</label>
            <div className="bg-muted p-4 rounded-lg font-mono text-sm mt-2">
              <code data-testid="text-api-url">{installationData?.apiUrl}</code>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              This URL is automatically detected from your Replit environment
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
