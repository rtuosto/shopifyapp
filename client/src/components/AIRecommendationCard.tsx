import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, XCircle, Eye } from "lucide-react";
import { useState } from "react";

interface AIRecommendationCardProps {
  title: string;
  description: string;
  confidence: number;
  productName: string;
  estimatedImpact: string;
  onAccept?: () => void;
  onReject?: () => void;
  onPreview?: () => void;
}

export default function AIRecommendationCard({
  title,
  description,
  confidence,
  productName,
  estimatedImpact,
  onAccept,
  onReject,
  onPreview,
}: AIRecommendationCardProps) {
  const [status, setStatus] = useState<"pending" | "accepted" | "rejected">("pending");

  const handleAccept = () => {
    setStatus("accepted");
    onAccept?.();
    console.log("Recommendation accepted:", title);
  };

  const handleReject = () => {
    setStatus("rejected");
    onReject?.();
    console.log("Recommendation rejected:", title);
  };

  const handlePreview = () => {
    onPreview?.();
    console.log("Opening preview for:", title);
  };

  const titleSlug = title ? title.toLowerCase().replace(/\s+/g, '-') : 'unknown';

  return (
    <Card className="p-6 border-l-4 border-l-chart-3" data-testid={`card-recommendation-${titleSlug}`}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="gap-1" data-testid="badge-ai-recommended">
                <Sparkles className="w-3 h-3" />
                AI Recommended
              </Badge>
              <Badge variant="outline" data-testid="text-confidence">
                {confidence}% confidence
              </Badge>
            </div>
            <h3 className="text-base font-semibold" data-testid="text-recommendation-title">
              {title}
            </h3>
            <p className="text-sm text-muted-foreground" data-testid="text-recommendation-description">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Product</p>
            <p className="text-sm font-medium" data-testid="text-product-name">{productName}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xs text-muted-foreground">Est. Impact</p>
            <p className="text-sm font-semibold text-chart-4" data-testid="text-estimated-impact">
              {estimatedImpact}
            </p>
          </div>
        </div>

        {status === "pending" && (
          <div className="flex flex-col gap-2">
            <Button 
              variant="outline"
              onClick={handlePreview}
              className="w-full gap-2"
              data-testid="button-preview-test"
            >
              <Eye className="w-4 h-4" />
              Preview Changes
            </Button>
            <div className="flex gap-2">
              <Button 
                onClick={handleAccept} 
                className="flex-1 gap-2"
                data-testid="button-accept-recommendation"
              >
                <CheckCircle2 className="w-4 h-4" />
                Accept & Create Test
              </Button>
              <Button 
                variant="outline" 
                onClick={handleReject}
                data-testid="button-reject-recommendation"
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {status === "accepted" && (
          <div className="text-sm text-chart-4 font-medium flex items-center gap-2" data-testid="text-status-accepted">
            <CheckCircle2 className="w-4 h-4" />
            Test created successfully
          </div>
        )}

        {status === "rejected" && (
          <div className="text-sm text-muted-foreground font-medium" data-testid="text-status-rejected">
            Recommendation dismissed
          </div>
        )}
      </div>
    </Card>
  );
}