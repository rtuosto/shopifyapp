import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { isEmbedded } from "@/lib/shopify";
import Dashboard from "@/pages/Dashboard";
import Optimizations from "@/pages/Optimizations";
import AIRecommendations from "@/pages/AIRecommendations";
import Simulator from "@/pages/Simulator";
import Settings from "@/pages/Settings";
import Billing from "@/pages/Billing";
import NotFound from "@/pages/NotFound";

const navItems = [
  { label: "Dashboard", path: "/" },
  { label: "Optimizations", path: "/optimizations" },
  { label: "AI Recommendations", path: "/recommendations" },
  { label: "Simulator", path: "/simulator" },
  { label: "Plans & Billing", path: "/billing" },
  { label: "Settings", path: "/settings" },
];

function EmbeddedNav() {
  return (
    <ui-nav-menu>
      <Link href="/" data-testid="nav-dashboard">Dashboard</Link>
      <Link href="/optimizations" data-testid="nav-optimizations">Optimizations</Link>
      <Link href="/recommendations" data-testid="nav-recommendations">AI Recommendations</Link>
      <Link href="/simulator" data-testid="nav-simulator">Simulator</Link>
      <Link href="/billing" data-testid="nav-billing">Plans & Billing</Link>
      <Link href="/settings" data-testid="nav-settings">Settings</Link>
    </ui-nav-menu>
  );
}

function DevNav() {
  const [location] = useLocation();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '8px 16px',
      borderBottom: '1px solid var(--p-color-border)',
      background: 'var(--p-color-bg-surface)',
      flexWrap: 'wrap',
    }}>
      <s-text variant="bodySm" fontWeight="semibold" style={{ marginRight: '12px' }}>
        Shoptimizer
      </s-text>
      {navItems.map((item) => (
        <Link key={item.path} href={item.path}>
          <s-button
            variant={location === item.path ? "secondary" : "tertiary"}
            size="micro"
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {item.label}
          </s-button>
        </Link>
      ))}
    </div>
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
  const embedded = isEmbedded();

  return (
    <QueryClientProvider client={queryClient}>
      {embedded ? <EmbeddedNav /> : <DevNav />}
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}
