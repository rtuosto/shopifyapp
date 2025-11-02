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
      <div className="p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold mb-3 md:mb-4" data-testid="text-table-title">Recent Optimizations</h3>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed lg:table-auto">
            <thead>
              <tr className="border-b text-left text-xs md:text-sm text-muted-foreground">
                <th className="pb-3 font-medium w-2/5 lg:w-auto">Product</th>
                <th className="pb-3 font-medium hidden md:table-cell w-24 lg:w-auto">Type</th>
                <th className="pb-3 font-medium w-20 lg:w-auto">Status</th>
                <th className="pb-3 font-medium text-right w-20 lg:w-auto">ARPU</th>
                <th className="pb-3 font-medium text-right hidden sm:table-cell w-24 lg:w-auto">Conversions</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Started</th>
                <th className="pb-3 font-medium text-right w-16 lg:w-auto">Actions</th>
              </tr>
            </thead>
            <tbody>
              {optimizations.map((optimization, index) => (
                <tr 
                  key={optimization.id} 
                  className="border-b last:border-0 hover-elevate"
                  data-testid={`row-optimization-${index}`}
                >
                  <td className="py-3 text-xs md:text-sm font-medium break-words" data-testid={`text-product-${index}`}>
                    <div className="line-clamp-2">{optimization.productName}</div>
                  </td>
                  <td className="py-3 text-xs md:text-sm text-muted-foreground hidden md:table-cell" data-testid={`text-optimization-type-${index}`}>
                    {optimization.optimizationType}
                  </td>
                  <td className="py-3">
                    <Badge variant={getStatusVariant(optimization.status)} data-testid={`badge-status-${index}`} className="text-xs">
                      {optimization.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-right text-xs md:text-sm font-semibold tabular-nums" data-testid={`text-arpu-${index}`}>
                    {optimization.arpu > 0 ? `$${optimization.arpu.toFixed(2)}` : '$0.00'}
                  </td>
                  <td className="py-3 text-right text-xs md:text-sm tabular-nums text-muted-foreground hidden sm:table-cell" data-testid={`text-conversions-${index}`}>
                    {optimization.conversions}
                  </td>
                  <td className="py-3 text-xs md:text-sm text-muted-foreground hidden lg:table-cell" data-testid={`text-date-${index}`}>
                    {optimization.startDate}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-1 md:gap-2">
                      {optimization.status === "draft" && onStartOptimization && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => handleStartOptimization(optimization.id, e)}
                          data-testid={`button-start-optimization-${index}`}
                          className="gap-1 hidden sm:flex"
                        >
                          <Play className="w-3 h-3" />
                          <span className="hidden lg:inline">Start Optimization</span>
                          <span className="lg:hidden">Start</span>
                        </Button>
                      )}
                      {optimization.status === "active" && onStopOptimization && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => handleStopOptimization(optimization.id, e)}
                          data-testid={`button-stop-optimization-${index}`}
                          className="gap-1 hidden sm:flex"
                        >
                          <StopCircle className="w-3 h-3" />
                          <span className="hidden lg:inline">Stop Optimization</span>
                          <span className="lg:hidden">Stop</span>
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleViewOptimization(optimization.id)}
                        data-testid={`button-view-optimization-${index}`}
                        className="h-8 w-8 p-0"
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