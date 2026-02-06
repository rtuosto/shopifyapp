import { useState, type ReactNode } from "react";
import { formatOptimizationType } from "@/lib/optimizationTypeFormatter";
import { Card, BlockStack, InlineStack, Text, Button, ButtonGroup, Spinner, Box } from "@shopify/polaris";
import { ViewIcon, CheckCircleIcon, XCircleIcon } from "@shopify/polaris-icons";

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
    <Card data-testid={`card-recommendation-${id}`}>
      <BlockStack gap="400">
        <InlineStack gap="400" blockAlign="start">
          {productImage && (
            <div style={{ borderRadius: '4px', overflow: 'hidden', width: '64px', height: '64px', flexShrink: 0 }}>
              <img 
                src={productImage} 
                alt={productName}
                style={{ width: '64px', height: '64px', objectFit: 'cover', opacity: imageOpacity === 'opacity-60' ? 0.6 : 1 }}
                data-testid={`img-product-${id}`}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
          <BlockStack gap="200">
            {headerBadge && (
              <div>{headerBadge}</div>
            )}
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodySm" fontWeight="medium" tone="subdued" truncate data-testid={`text-product-name-${id}`}>
                {productName}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">·</Text>
              <Text as="span" variant="bodySm" tone="subdued" data-testid={`text-optimization-type-${id}`}>
                {formatOptimizationType(optimizationType)}
              </Text>
            </InlineStack>
            <Text as="p" variant="bodySm" fontWeight="semibold" data-testid={`text-recommendation-title-${id}`}>
              {title}
            </Text>
            <Text as="p" variant="bodyXs" tone="subdued" data-testid={`text-recommendation-description-${id}`}>
              {description}
            </Text>
          </BlockStack>
          </div>
        </InlineStack>

        {customActions ? (
          <ButtonGroup>
            {customActions}
          </ButtonGroup>
        ) : (
          <ButtonGroup>
            <Button
              size="slim"
              icon={ViewIcon}
              onClick={handlePreview}
              disabled={isProcessing}
              data-testid={`button-preview-optimization-${id}`}
            >
              Preview
            </Button>
            <Button
              variant="primary"
              size="slim"
              icon={CheckCircleIcon}
              onClick={handleAccept}
              disabled={isProcessing}
              data-testid={`button-accept-recommendation-${id}`}
            >
              Accept
            </Button>
            <Button
              size="slim"
              icon={XCircleIcon}
              onClick={handleReject}
              disabled={isProcessing}
              data-testid={`button-reject-recommendation-${id}`}
              accessibilityLabel="Dismiss recommendation"
            />
          </ButtonGroup>
        )}
        
        {isProcessing && (
          <InlineStack gap="200" align="center" blockAlign="center">
            <Spinner size="small" accessibilityLabel="Processing" />
            <Text as="span" variant="bodyXs" tone="subdued">Processing...</Text>
          </InlineStack>
        )}
      </BlockStack>
    </Card>
  );
}
