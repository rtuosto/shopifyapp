import { Badge } from "@/components/ui/badge";

interface DashboardHeaderProps {
  activeTests: number;
  lastSync?: string;
}

export default function DashboardHeader({ 
  activeTests, 
  lastSync = "5 min ago"
}: DashboardHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <Badge variant="secondary" data-testid="badge-active-tests">
          {activeTests} Active Tests
        </Badge>
        <span className="text-sm text-muted-foreground" data-testid="text-last-sync">
          Last synced {lastSync}
        </span>
      </div>
    </div>
  );
}