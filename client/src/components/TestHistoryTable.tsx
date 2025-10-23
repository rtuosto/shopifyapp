import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eye, TrendingUp, TrendingDown } from "lucide-react";

interface Test {
  id: string;
  productName: string;
  testType: string;
  status: "active" | "completed" | "draft";
  performance: number;
  startDate: string;
}

interface TestHistoryTableProps {
  tests: Test[];
  onViewTest?: (testId: string) => void;
}

export default function TestHistoryTable({ tests, onViewTest }: TestHistoryTableProps) {
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

  const handleViewTest = (testId: string) => {
    onViewTest?.(testId);
    console.log("Viewing test:", testId);
  };

  return (
    <Card data-testid="card-test-history">
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4" data-testid="text-table-title">Recent Tests</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="pb-3 font-medium">Product</th>
                <th className="pb-3 font-medium">Test Type</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Performance</th>
                <th className="pb-3 font-medium">Started</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test, index) => (
                <tr 
                  key={test.id} 
                  className="border-b last:border-0 hover-elevate"
                  data-testid={`row-test-${index}`}
                >
                  <td className="py-3 font-medium" data-testid={`text-product-${index}`}>
                    {test.productName}
                  </td>
                  <td className="py-3 text-sm text-muted-foreground" data-testid={`text-test-type-${index}`}>
                    {test.testType}
                  </td>
                  <td className="py-3">
                    <Badge variant={getStatusVariant(test.status)} data-testid={`badge-status-${index}`}>
                      {test.status}
                    </Badge>
                  </td>
                  <td className={`py-3 text-right font-semibold tabular-nums ${getPerformanceColor(test.performance)}`} data-testid={`text-performance-${index}`}>
                    <div className="flex items-center justify-end gap-1">
                      {test.performance > 0 ? <TrendingUp className="w-4 h-4" /> : test.performance < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                      {test.performance > 0 ? "+" : ""}{test.performance}%
                    </div>
                  </td>
                  <td className="py-3 text-sm text-muted-foreground" data-testid={`text-date-${index}`}>
                    {test.startDate}
                  </td>
                  <td className="py-3 text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleViewTest(test.id)}
                      data-testid={`button-view-test-${index}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
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