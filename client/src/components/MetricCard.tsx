import { Card } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  change?: number;
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
  valueClassName?: string;
}

export default function MetricCard({ title, value, change, trend = "neutral", subtitle, valueClassName }: MetricCardProps) {
  const getTrendIcon = () => {
    if (trend === "up") return <ArrowUp className="w-4 h-4" />;
    if (trend === "down") return <ArrowDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-chart-4";
    if (trend === "down") return "text-destructive";
    return "text-muted-foreground";
  };

  return (
    <Card className="p-6" data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground font-medium" data-testid="text-metric-title">
          {title}
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={`text-2xl font-bold tabular-nums ${valueClassName || ''}`} data-testid="text-metric-value">
            {value}
          </h3>
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-sm font-semibold ${getTrendColor()}`} data-testid="text-metric-change">
              {getTrendIcon()}
              <span>{Math.abs(change)}%</span>
            </div>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground" data-testid="text-metric-subtitle">
            {subtitle}
          </p>
        )}
      </div>
    </Card>
  );
}