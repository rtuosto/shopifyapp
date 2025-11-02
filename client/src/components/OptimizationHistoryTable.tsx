import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eye, TrendingUp, TrendingDown, Play, StopCircle } from "lucide-react";

interface Optimization {
  id: string;
  productName: string;
  optimizationType: string;
  status: "active" | "completed" | "draft";
  arpu: number;
  arpuLift: number;
  conversions: number;
  revenue: number;
  startDate: string;
}

interface OptimizationHistoryTableProps {
  optimizations: Optimization[];
  onViewOptimization?: (optimizationId: string) => void;
  onStartOptimization?: (optimizationId: string) => void;
  onStopOptimization?: (optimizationId: string) => void;
}

export default function OptimizationHistoryTable({ optimizations, onViewOptimization, onStartOptimization, onStopOptimization }: OptimizationHistoryTableProps) {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "default";
      case "completed":
        return "secondary";
      case "draft":
        return "outline";
      default:
        return "outline";
    }
  };

  const getPerformanceColor = (performance: number) => {
    if (performance > 0) return "text-chart-4";
    if (performance < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  const handleViewOptimization = (optimizationId: string) => {
    onViewOptimization?.(optimizationId);
    console.log("Viewing optimization:", optimizationId);
  };

  const handleStartOptimization = (optimizationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onStartOptimization?.(optimizationId);
  };

  const handleStopOptimization = (optimizationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onStopOptimization?.(optimizationId);
  };

  return (
    <Card data-testid="card-optimization-history">
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4" data-testid="text-table-title">Recent Optimizations</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="pb-3 font-medium">Product</th>
                <th className="pb-3 font-medium">Optimization Type</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">ARPU</th>
                <th className="pb-3 font-medium text-right">Conversions</th>
                <th className="pb-3 font-medium">Started</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {optimizations.map((optimization, index) => (
                <tr 
                  key={optimization.id} 
                  className="border-b last:border-0 hover-elevate"
                  data-testid={`row-optimization-${index}`}
                >
                  <td className="py-3 font-medium" data-testid={`text-product-${index}`}>
                    {optimization.productName}
                  </td>
                  <td className="py-3 text-sm text-muted-foreground" data-testid={`text-optimization-type-${index}`}>
                    {optimization.optimizationType}
                  </td>
                  <td className="py-3">
                    <Badge variant={getStatusVariant(optimization.status)} data-testid={`badge-status-${index}`}>
                      {optimization.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-right font-semibold tabular-nums" data-testid={`text-arpu-${index}`}>
                    {optimization.arpu > 0 ? `$${optimization.arpu.toFixed(2)}` : '$0.00'}
                  </td>
                  <td className="py-3 text-right tabular-nums text-muted-foreground" data-testid={`text-conversions-${index}`}>
                    {optimization.conversions}
                  </td>
                  <td className="py-3 text-sm text-muted-foreground" data-testid={`text-date-${index}`}>
                    {optimization.startDate}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-2">
                      {optimization.status === "draft" && onStartOptimization && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => handleStartOptimization(optimization.id, e)}
                          data-testid={`button-start-optimization-${index}`}
                          className="gap-1"
                        >
                          <Play className="w-3 h-3" />
                          Start Optimization
                        </Button>
                      )}
                      {optimization.status === "active" && onStopOptimization && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => handleStopOptimization(optimization.id, e)}
                          data-testid={`button-stop-optimization-${index}`}
                          className="gap-1"
                        >
                          <StopCircle className="w-3 h-3" />
                          Stop Optimization
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleViewOptimization(optimization.id)}
                        data-testid={`button-view-optimization-${index}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}