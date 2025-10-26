import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface DashboardHeaderProps {
  activeTests: number;
  lastSync?: string;
  quotaUsed?: number;
  quotaTotal?: number;
}

export default function DashboardHeader({ 
  activeTests, 
  lastSync = "5 min ago",
  quotaUsed = 0,
  quotaTotal = 20
}: DashboardHeaderProps) {
  // Beta testing: Always show secondary variant (unlimited usage)
  
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <Badge variant="secondary" data-testid="badge-active-tests">
          {activeTests} Active Tests
        </Badge>
        <Badge variant="secondary" className="gap-1" data-testid="badge-quota">
          <Sparkles className="w-3 h-3" />
          {quotaUsed} AI Ideas Used · Beta: Unlimited
        </Badge>
        <span className="text-sm text-muted-foreground" data-testid="text-last-sync">
          Last synced {lastSync}
        </span>
      </div>
    </div>
  );
}