import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, XCircle, Eye } from "lucide-react";
import { useState } from "react";

interface AIRecommendationCardProps {
  title: string;
  description: string;
  productName: string;
  impactScore?: number; // 1-10 AI confidence score
  onAccept?: () => void;
  onReject?: () => void;
  onPreview?: () => void;
}

export default function AIRecommendationCard({
  title,
  description,
  productName,
  impactScore = 5,
  onAccept,
  onReject,
  onPreview,
}: AIRecommendationCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAccept = async () => {
    setIsProcessing(true);
    try {
      await onAccept?.();
    } finally {
      // Always reset processing state whether success or error
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await onReject?.();
    } finally {
      // Always reset processing state whether success or error
      setIsProcessing(false);
    }
  };

  const handlePreview = () => {
    onPreview?.();
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
              <Badge 
                variant={impactScore >= 8 ? "default" : impactScore >= 5 ? "outline" : "secondary"} 
                className="gap-1"
                data-testid="badge-impact-score"
              >
                Impact: {impactScore}/10
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
        </div>

        <div className="flex flex-col gap-2">
          <Button 
            variant="outline"
            onClick={handlePreview}
            className="w-full gap-2"
            data-testid="button-preview-test"
            disabled={isProcessing}
          >
            <Eye className="w-4 h-4" />
            Preview Changes
          </Button>
          <div className="flex gap-2">
            <Button 
              onClick={handleAccept} 
              className="flex-1 gap-2"
              data-testid="button-accept-recommendation"
              disabled={isProcessing}
            >
              <CheckCircle2 className="w-4 h-4" />
              Accept & Launch Test
            </Button>
            <Button 
              variant="outline" 
              onClick={handleReject}
              data-testid="button-reject-recommendation"
              disabled={isProcessing}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          </div>
          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
              Processing...
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}