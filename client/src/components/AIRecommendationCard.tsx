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
  borderColor,
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
    <s-section data-testid={`card-recommendation-${id}`}>
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="base" blockAlign="start">
          {productImage && (
            <s-box borderRadius="base" overflow="hidden" inlineSize="64px" blockSize="64px">
              <img 
                src={productImage} 
                alt={productName}
                style={{ width: '64px', height: '64px', objectFit: 'cover', opacity: imageOpacity === 'opacity-60' ? 0.6 : 1 }}
                data-testid={`img-product-${id}`}
              />
            </s-box>
          )}
          <s-stack direction="block" gap="small" style={{ flex: 1, minWidth: 0 }}>
            {headerBadge && (
              <div>{headerBadge}</div>
            )}
            <s-stack direction="inline" gap="small" blockAlign="center">
              <s-text variant="bodySm" fontWeight="medium" tone="subdued" truncate data-testid={`text-product-name-${id}`}>
                {productName}
              </s-text>
              <s-text variant="bodySm" tone="subdued">·</s-text>
              <s-text variant="bodySm" tone="subdued" data-testid={`text-optimization-type-${id}`}>
                {formatOptimizationType(optimizationType)}
              </s-text>
            </s-stack>
            <s-text variant="bodySm" fontWeight="semibold" data-testid={`text-recommendation-title-${id}`}>
              {title}
            </s-text>
            <s-text variant="bodyXs" tone="subdued" data-testid={`text-recommendation-description-${id}`}>
              {description}
            </s-text>
          </s-stack>
        </s-stack>

        {customActions ? (
          <s-button-group gap="small">
            {customActions}
          </s-button-group>
        ) : (
          <s-button-group gap="small">
            <s-button
              variant="secondary"
              size="slim"
              icon="view"
              onClick={handlePreview}
              disabled={isProcessing}
              data-testid={`button-preview-optimization-${id}`}
            >
              Preview
            </s-button>
            <s-button
              variant="primary"
              size="slim"
              icon="check-circle"
              onClick={handleAccept}
              disabled={isProcessing}
              data-testid={`button-accept-recommendation-${id}`}
            >
              Accept
            </s-button>
            <s-button
              variant="secondary"
              size="slim"
              icon="x-circle"
              onClick={handleReject}
              disabled={isProcessing}
              data-testid={`button-reject-recommendation-${id}`}
              accessibilityLabel="Dismiss recommendation"
            />
          </s-button-group>
        )}
        
        {isProcessing && (
          <s-stack direction="inline" gap="small" align="center" blockAlign="center">
            <s-spinner size="small" accessibilityLabel="Processing" />
            <s-text variant="bodyXs" tone="subdued">Processing...</s-text>
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}
