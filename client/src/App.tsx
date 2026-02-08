import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient, setAuthErrorCallback } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AppProvider, Frame, Navigation, Banner, Page, BlockStack, Text, Button, Box } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import {
  HomeIcon,
  ChartVerticalIcon,
  WandIcon,
  ChartLineIcon,
  CashDollarIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";
import { Component, useState, useEffect } from "react";
import type { ReactNode, ErrorInfo } from "react";

import Dashboard from "@/pages/Dashboard";
import Optimizations from "@/pages/Optimizations";
import AIRecommendations from "@/pages/AIRecommendations";
import Simulator from "@/pages/Simulator";
import Settings from "@/pages/Settings";
import Billing from "@/pages/Billing";
import NotFound from "@/pages/NotFound";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Page>
          <Box padding="600">
            <BlockStack gap="400">
              <Text as="h1" variant="headingLg">Something went wrong</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                The app encountered an unexpected error. Please try refreshing the page.
              </Text>
              {this.state.error && (
                <Banner tone="critical">
                  <p>{this.state.error.message}</p>
                </Banner>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                data-testid="button-error-reload"
              >
                Reload Page
              </Button>
            </BlockStack>
          </Box>
        </Page>
      );
    }

    return this.props.children;
  }
}

function AuthBanner() {
  const [authRedirectUrl, setAuthRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    setAuthErrorCallback((redirectUrl: string) => {
      setAuthRedirectUrl(redirectUrl);
    });
  }, []);

  if (!authRedirectUrl) return null;

  return (
    <Box padding="400">
      <Banner
        tone="warning"
        title="Session expired"
        action={{
          content: "Re-authenticate",
          url: authRedirectUrl,
          target: "_top",
        }}
        onDismiss={() => setAuthRedirectUrl(null)}
      >
        <p>Your Shopify session has expired. Please re-authenticate to continue using Shoptimizer.</p>
      </Banner>
    </Box>
  );
}

function AppNavigation() {
  const [location, setLocation] = useLocation();

  return (
    <Navigation location={location}>
      <Navigation.Section
        title="Shoptimizer"
        items={[
          {
            label: "Dashboard",
            icon: HomeIcon,
            selected: location === "/",
            onClick: () => setLocation("/"),
          },
          {
            label: "Optimizations",
            icon: ChartVerticalIcon,
            selected: location === "/optimizations",
            onClick: () => setLocation("/optimizations"),
          },
          {
            label: "AI Recommendations",
            icon: WandIcon,
            selected: location === "/recommendations",
            onClick: () => setLocation("/recommendations"),
          },
          {
            label: "Simulator",
            icon: ChartLineIcon,
            selected: location === "/simulator",
            onClick: () => setLocation("/simulator"),
          },
          {
            label: "Plans & Billing",
            icon: CashDollarIcon,
            selected: location === "/billing",
            onClick: () => setLocation("/billing"),
          },
          {
            label: "Settings",
            icon: SettingsIcon,
            selected: location === "/settings",
            onClick: () => setLocation("/settings"),
          },
        ]}
      />
    </Navigation>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/optimizations" component={Optimizations} />
      <Route path="/recommendations" component={AIRecommendations} />
      <Route path="/simulator" component={Simulator} />
      <Route path="/settings" component={Settings} />
      <Route path="/billing" component={Billing} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <Frame navigation={<AppNavigation />}>
            <AuthBanner />
            <Router />
          </Frame>
        </ErrorBoundary>
        <Toaster />
      </QueryClientProvider>
    </AppProvider>
  );
}
