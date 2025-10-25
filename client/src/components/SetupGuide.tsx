import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, ExternalLink, CheckCircle2, Circle, Settings } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function SetupGuide() {
  const { toast } = useToast();
  const [copiedScript, setCopiedScript] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/installation-script"],
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);

      toast({
        title: "Copied!",
        description: "Installation script copied to clipboard",
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
      <Card>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-20 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const installationData = data as {
    apiUrl: string;
    scriptTag: string;
    webhookUrl: string;
    isDev: boolean;
  } | undefined;

  return (
    <Card className="border-primary/50" data-testid="card-setup-guide">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Welcome to Shoptimizer! 🎉</CardTitle>
            <CardDescription className="mt-2">
              Complete these steps to start optimizing your products with A/B testing
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings" data-testid="link-full-settings">
              <Settings className="w-4 h-4 mr-2" />
              Full Settings
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: Install SDK */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Circle className="w-5 h-5 mt-0.5 text-primary" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 1: Install Shoptimizer SDK</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Add this script to your theme.liquid file to enable A/B testing across all pages
              </p>
              
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Installation Script</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => installationData && copyToClipboard(installationData.scriptTag)}
                  data-testid="button-copy-setup-script"
                >
                  {copiedScript ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Script
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto mb-3">
                <pre>{installationData?.scriptTag}</pre>
              </div>

              <Alert>
                <AlertDescription className="text-sm">
                  <ol className="space-y-1.5 list-decimal list-inside">
                    <li>Go to Shopify Admin → Online Store → Themes</li>
                    <li>Click Actions → Edit code</li>
                    <li>Open <code className="bg-background px-1 rounded">theme.liquid</code></li>
                    <li>Paste script before <code className="bg-background px-1 rounded">&lt;/head&gt;</code></li>
                    <li>Click Save</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </div>

        {/* Step 2: Verify Webhook */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 mt-0.5 text-green-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 2: Webhook (Auto-Configured ✓)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Your order webhook was automatically registered during app installation
              </p>
              
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a 
                  href="https://admin.shopify.com/settings/notifications"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-verify-webhook"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Verify in Shopify
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Step 3: Create Tests */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-3">
            <Circle className="w-5 h-5 mt-0.5 text-primary" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 3: Create Your First A/B Test</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Once the SDK is installed, create tests to optimize your products
              </p>
              
              <div className="flex gap-2">
                <Button variant="default" size="sm" asChild>
                  <Link href="/" data-testid="link-dashboard">
                    Go to Dashboard
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/active-tests" data-testid="link-active-tests">
                    View Active Tests
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground text-center">
            Need help? Visit <Link href="/settings" className="text-primary hover:underline">Settings</Link> for detailed configuration
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
