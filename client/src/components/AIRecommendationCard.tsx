import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Eye } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatOptimizationType } from "@/lib/optimizationTypeFormatter";

interface AIRecommendationCardProps {
  id: string;
  title: string;
  description: string;
  productName: string;
  productImage?: string;
  optimizationType: string;
  impactScore?: number;
  onAccept?: () => void;
  onReject?: () => void;
  onPreview?: () => void;
  headerBadge?: ReactNode;
  customActions?: ReactNode;
  borderColor?: string;
  imageOpacity?: string;
}

export default function AIRecommendationCard({
  id,
  title,
  description,
  productName,
  productImage,
  optimizationType,
  impactScore = 5,
  onAccept,
  onReject,
  onPreview,
  headerBadge,
  customActions,
  borderColor = "border-l-chart-3",
  imageOpacity = "",
}: AIRecommendationCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAccept = async () => {
    setIsProcessing(true);
    try {
      await onAccept?.();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await onReject?.();
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreview = () => {
    onPreview?.();
  };

  return (
    <Card className={`p-4 border-l-4 ${borderColor}`} data-testid={`card-recommendation-${id}`}>
      <div className="space-y-3">
        <div className="flex gap-3">
          {productImage && (
            <div className="shrink-0">
              <img 
                src={productImage} 
                alt={productName}
                className={`w-16 h-16 object-cover rounded-md ${imageOpacity}`}
                data-testid={`img-product-${id}`}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {headerBadge && (
              <div className="mb-1">
                {headerBadge}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 min-w-0">
              <span data-testid={`text-product-name-${id}`} className="font-medium truncate">{productName}</span>
              <span className="flex-shrink-0">•</span>
              <span data-testid={`text-optimization-type-${id}`} className="flex-shrink-0">{formatOptimizationType(optimizationType)}</span>
            </div>
            <h3 className="text-sm font-semibold mb-1 line-clamp-2 break-words" data-testid={`text-recommendation-title-${id}`}>
              {title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2 break-words" data-testid={`text-recommendation-description-${id}`}>
              {description}
            </p>
          </div>
        </div>

        {customActions ? (
          <div className="flex gap-2">
            {customActions}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button 
              variant="outline"
              size="sm"
              onClick={handlePreview}
              className="flex-1 gap-1.5"
              data-testid={`button-preview-optimization-${id}`}
              disabled={isProcessing}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </Button>
            <Button 
              size="sm"
              onClick={handleAccept} 
              className="flex-1 gap-1.5"
              data-testid={`button-accept-recommendation-${id}`}
              disabled={isProcessing}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Accept
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleReject}
              data-testid={`button-reject-recommendation-${id}`}
              disabled={isProcessing}
            >
              <XCircle className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
        
        {isProcessing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
            Processing...
          </div>
        )}
      </div>
    </Card>
  );
}
