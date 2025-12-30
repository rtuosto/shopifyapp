import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, CheckCircle2, Circle, Settings, Puzzle, Zap } from "lucide-react";
import { Link } from "wouter";

export default function SetupGuide() {
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
            <Zap className="w-5 h-5 mt-0.5 text-primary" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 1: Enable CRO Runtime</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Enable the Shoptimizer runtime in your theme to track visitors and run optimizations
              </p>
              
              <Alert>
                <AlertDescription className="text-sm">
                  <ol className="space-y-1.5 list-decimal list-inside">
                    <li>Go to Shopify Admin → Online Store → Themes</li>
                    <li>Click <strong>Customize</strong> on your active theme</li>
                    <li>Click <strong>App embeds</strong> in the left sidebar (puzzle icon)</li>
                    <li>Find <strong>"Shoptimizer CRO Runtime"</strong> and toggle it ON</li>
                    <li>Click Save</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <Button variant="outline" size="sm" className="mt-3" asChild>
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
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 mt-0.5 text-green-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 2: Webhook (Auto-Configured)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Your order webhook was automatically registered during app installation
              </p>
              
              <Button variant="outline" size="sm" asChild>
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

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-3">
            <Puzzle className="w-5 h-5 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 3: Add Experiment Slots (Optional)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                For custom content experiments, add Experiment Slot blocks to your product pages. 
                This is optional - product optimizations (price, title, description) work automatically.
              </p>
              
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings" data-testid="link-slot-instructions">
                  <Settings className="w-4 h-4 mr-2" />
                  View Instructions
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-start gap-3">
            <Circle className="w-5 h-5 mt-0.5 text-primary" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Step 4: Create Your First Optimization</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Once the runtime is enabled, accept AI recommendations or create optimizations manually
              </p>
              
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

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground text-center">
            Need help? Visit <Link href="/settings" className="text-primary hover:underline">Settings</Link> for detailed configuration
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
