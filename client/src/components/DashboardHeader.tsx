import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

interface DashboardHeaderProps {
  activeTests: number;
  lastSync?: string;
  onCreateTest?: () => void;
  onRefresh?: () => void;
  onGenerateRecommendations?: () => void;
  isGeneratingRecommendations?: boolean;
}

export default function DashboardHeader({ 
  activeTests, 
  lastSync = "5 min ago",
  onCreateTest,
  onRefresh,
  onGenerateRecommendations,
  isGeneratingRecommendations = false
}: DashboardHeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefresh?.();
    console.log("Refreshing data...");
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleCreateTest = () => {
    onCreateTest?.();
    console.log("Creating new test...");
  };

  const handleGenerateRecommendations = () => {
    onGenerateRecommendations?.();
    console.log("Generating AI recommendations...");
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
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
      <div className="flex gap-2 flex-wrap">
        <Button 
          variant="outline" 
          size="default"
          onClick={handleRefresh}
          disabled={isRefreshing}
          data-testid="button-refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button 
          variant="outline"
          size="default"
          onClick={handleGenerateRecommendations}
          disabled={isGeneratingRecommendations}
          data-testid="button-generate-recommendations"
        >
          <Sparkles className={`w-4 h-4 ${isGeneratingRecommendations ? "animate-pulse" : ""}`} />
          {isGeneratingRecommendations ? "Generating..." : "AI Recommendations"}
        </Button>
        <Button onClick={handleCreateTest} data-testid="button-create-test">
          <Plus className="w-4 h-4" />
          Create Test
        </Button>
      </div>
    </div>
  );
}