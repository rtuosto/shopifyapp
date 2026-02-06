import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AppProvider, Frame, Navigation } from "@shopify/polaris";
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

import Dashboard from "@/pages/Dashboard";
import Optimizations from "@/pages/Optimizations";
import AIRecommendations from "@/pages/AIRecommendations";
import Simulator from "@/pages/Simulator";
import Settings from "@/pages/Settings";
import Billing from "@/pages/Billing";
import NotFound from "@/pages/NotFound";

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
        <Frame navigation={<AppNavigation />}>
          <Router />
        </Frame>
        <Toaster />
      </QueryClientProvider>
    </AppProvider>
  );
}
