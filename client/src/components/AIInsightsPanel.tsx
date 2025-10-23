import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, TrendingUp, Shield, BarChart3 } from "lucide-react";

interface Insight {
  type: "psychology" | "competitor" | "seo" | "data";
  title: string;
  description: string;
}

interface AIInsightsPanelProps {
  insights: Insight[];
  confidence: number;
  estimatedLift: string;
  riskLevel: "low" | "medium" | "high";
}

export default function AIInsightsPanel({ 
  insights, 
  confidence, 
  estimatedLift,
  riskLevel 
}: AIInsightsPanelProps) {
  const getIconForType = (type: string) => {
    switch (type) {
      case "psychology":
        return Lightbulb;
      case "competitor":
        return BarChart3;
      case "seo":
        return TrendingUp;
      case "data":
        return Shield;
      default:
        return Lightbulb;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low":
        return "text-chart-4";
      case "medium":
        return "text-chart-5";
      case "high":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <Card className="p-6 space-y-6" data-testid="card-ai-insights">
      <div>
        <h3 className="text-lg font-semibold mb-4" data-testid="text-insights-title">
          AI Analysis & Insights
        </h3>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${confidence}%` }}
                />
              </div>
              <span className="text-sm font-semibold tabular-nums" data-testid="text-confidence-value">
                {confidence}%
              </span>
            </div>
          </div>
          
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Est. Lift</p>
            <p className="text-sm font-bold text-chart-4" data-testid="text-estimated-lift">
              {estimatedLift}
            </p>
          </div>
          
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Risk Level</p>
            <Badge variant="outline" className={getRiskColor(riskLevel)} data-testid="badge-risk-level">
              {riskLevel.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground">WHY THIS WILL WORK</h4>
        {insights.map((insight, index) => {
          const Icon = getIconForType(insight.type);
          return (
            <div 
              key={index} 
              className="flex gap-3 p-3 rounded-lg bg-muted/50"
              data-testid={`insight-${index}`}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium" data-testid={`text-insight-title-${index}`}>
                  {insight.title}
                </p>
                <p className="text-sm text-muted-foreground" data-testid={`text-insight-description-${index}`}>
                  {insight.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t">
        <p className="text-xs text-muted-foreground italic">
          Based on analysis of 10,000+ similar tests across Shopify stores
        </p>
      </div>
    </Card>
  );
}