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
  const quotaPercentage = (quotaUsed / quotaTotal) * 100;
  
  // Color code based on usage level
  let quotaVariant: "default" | "secondary" | "destructive" = "secondary";
  if (quotaPercentage >= 80) {
    quotaVariant = "destructive"; // 80%+ used (red)
  } else if (quotaPercentage >= 50) {
    quotaVariant = "default"; // 50-79% used (yellow/warning)
  }
  
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <Badge variant="secondary" data-testid="badge-active-tests">
          {activeTests} Active Tests
        </Badge>
        <Badge variant={quotaVariant} className="gap-1" data-testid="badge-quota">
          <Sparkles className="w-3 h-3" />
          {quotaUsed} of {quotaTotal} AI Ideas
        </Badge>
        <span className="text-sm text-muted-foreground" data-testid="text-last-sync">
          Last synced {lastSync}
        </span>
      </div>
    </div>
  );
}