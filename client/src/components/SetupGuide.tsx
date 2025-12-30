import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, CheckCircle2, Circle, Settings, Info, Sparkles, AlertCircle, Loader2 } from "lucide-react";
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
          ? "Your app needs Protected Customer Data access in Shopify Partner Dashboard. Go to Configuration → Data protection."
          : message || "Please try again or contact support.",
        variant: "destructive",
      });
    },
  });

  const webhookRegistered = webhookStatus?.status === 'registered';
  const webhookUnknown = webhookStatus?.status === 'unknown';

  return (
    <Card className="border-primary/50" data-testid="card-setup-guide">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl">Welcome to Shoptimizer!</CardTitle>
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
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 mt-0.5 text-green-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 1: Products Synced</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Your products are automatically synced from Shopify during app installation and kept up to date.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-3">
            {webhookLoading ? (
              <Loader2 className="w-5 h-5 mt-0.5 text-muted-foreground animate-spin" />
            ) : webhookRegistered ? (
              <CheckCircle2 className="w-5 h-5 mt-0.5 text-green-600" />
            ) : webhookUnknown ? (
              <Circle className="w-5 h-5 mt-0.5 text-muted-foreground" />
            ) : (
              <AlertCircle className="w-5 h-5 mt-0.5 text-amber-500" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 2: Order Tracking Webhook</h3>
              {webhookLoading ? (
                <p className="text-sm text-muted-foreground mb-3">
                  Checking webhook status...
                </p>
              ) : webhookRegistered ? (
                <p className="text-sm text-muted-foreground mb-3">
                  Order tracking webhook is registered and ready to track conversions.
                </p>
              ) : webhookUnknown ? (
                <p className="text-sm text-muted-foreground mb-3">
                  Unable to check webhook status in development mode. When running with a real Shopify session, you can verify and register the webhook.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    The order tracking webhook is not registered. Click below to register it for conversion tracking.
                  </p>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={() => registerWebhookMutation.mutate()}
                    disabled={registerWebhookMutation.isPending}
                    data-testid="button-register-webhook"
                  >
                    {registerWebhookMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      'Register Webhook'
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 mt-0.5 text-primary" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 3: Create Your First Optimization</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Accept AI recommendations to automatically create and activate product optimizations. Changes are applied directly to your Shopify products.
              </p>
              
              <Alert className="mb-3">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Product optimizations</strong> (price, title, description) modify your actual Shopify product data and work immediately - no additional setup required.
                </AlertDescription>
              </Alert>
              
              <div className="flex flex-wrap gap-2">
                <Button variant="default" size="sm" asChild>
                  <Link href="/recommendations" data-testid="link-ai-recommendations">
                    View AI Recommendations
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/optimizations" data-testid="link-active-optimizations">
                    View Optimizations
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-3">
            <Circle className="w-5 h-5 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Advanced: Enable Theme Extension (Optional)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                For enhanced visitor tracking and custom content experiments (Slot Experiments), enable the CRO Runtime in your theme. This requires the extension to be deployed first.
              </p>
              
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings" data-testid="link-slot-instructions">
                  <Settings className="w-4 h-4 mr-2" />
                  View Setup Instructions
                </Link>
              </Button>
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
