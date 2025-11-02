import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface DashboardHeaderProps {
  activeOptimizations: number;
  lastSync?: string;
  quotaUsed?: number;
  quotaTotal?: number;
}

export default function DashboardHeader({ 
  activeOptimizations, 
  lastSync = "5 min ago",
  quotaUsed = 0,
  quotaTotal = 20
}: DashboardHeaderProps) {
  // Beta testing: Always show secondary variant (unlimited usage)
  
  return (
    <div className="mb-4 md:mb-6">
      <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
      <div className="flex items-center gap-2 md:gap-3 mt-2 flex-wrap">
        <Badge variant="secondary" className="text-xs" data-testid="badge-active-optimizations">
          {activeOptimizations} Active
        </Badge>
        <Badge variant="secondary" className="gap-1 text-xs" data-testid="badge-quota">
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">{quotaUsed} AI Ideas Used · Beta: Unlimited</span>
          <span className="sm:hidden">{quotaUsed} Ideas</span>
        </Badge>
        <span className="text-xs md:text-sm text-muted-foreground" data-testid="text-last-sync">
          Last synced {lastSync}
        </span>
      </div>
    </div>
  );
}