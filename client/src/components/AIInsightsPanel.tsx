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
}

export default function AIInsightsPanel({ 
  insights
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

  return (
    <Card className="p-6 space-y-6" data-testid="card-ai-insights">
      <div>
        <h3 className="text-lg font-semibold mb-4" data-testid="text-insights-title">
          AI Analysis & Insights
        </h3>
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

      {/* TODO: Add data-driven confidence scores based on historical test performance */}
      {/* TODO: Add estimated impact calculations from similar past tests in this category */}
    </Card>
  );
}