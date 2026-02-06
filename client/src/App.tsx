import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import Dashboard from "@/pages/Dashboard";
import Optimizations from "@/pages/Optimizations";
import AIRecommendations from "@/pages/AIRecommendations";
import Simulator from "@/pages/Simulator";
import Settings from "@/pages/Settings";
import Billing from "@/pages/Billing";
import NotFound from "@/pages/NotFound";

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
  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <header className="flex items-center justify-between p-3 md:p-4 border-b bg-card shrink-0">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <ThemeToggle />
              </header>
              <main className="flex-1 overflow-auto p-3 md:p-6 bg-background">
                <div className="max-w-full">
                  <Router />
                </div>
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}