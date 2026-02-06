import { useState, type ReactNode } from "react";
import { getOptimizationTypeBadges } from "@/lib/optimizationTypeFormatter";
import { Card, BlockStack, InlineStack, Text, Button, ButtonGroup, Spinner, Box, Badge, Divider } from "@shopify/polaris";
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

function parseDescriptionBullets(description: string): string[] {
  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  if (sentences.length <= 1) {
    const clauses = description
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
    if (clauses.length > 1) return clauses;
  }

  return sentences.length > 0 ? sentences : [description];
}

function ImpactIndicator({ score }: { score: number }) {
  const level = score >= 8 ? 'High' : score >= 5 ? 'Medium' : 'Low';
  const tone = score >= 8 ? 'success' : score >= 5 ? 'info' : 'new';
  return (
    <Badge tone={tone as any}>
      {`${level} impact`}
    </Badge>
  );
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

  const typeBadges = getOptimizationTypeBadges(optimizationType);
  const bullets = parseDescriptionBullets(description);
  const imgOpacity = imageOpacity === 'opacity-60' ? 0.6 : 1;

  return (
    <Card data-testid={`card-recommendation-${id}`}>
      <BlockStack gap="400">
        <InlineStack gap="400" blockAlign="start" wrap={false}>
          {productImage && (
            <div style={{ borderRadius: '8px', overflow: 'hidden', width: '88px', height: '88px', flexShrink: 0 }}>
              <img
                src={productImage}
                alt={productName}
                style={{ width: '88px', height: '88px', objectFit: 'cover', opacity: imgOpacity }}
                data-testid={`img-product-${id}`}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <BlockStack gap="200">
              {headerBadge && (
                <div>{headerBadge}</div>
              )}
              <Text as="p" variant="bodySm" fontWeight="semibold" truncate data-testid={`text-product-name-${id}`}>
                {productName}
              </Text>
              <InlineStack gap="200" blockAlign="center" wrap>
                {typeBadges.map((badge) => (
                  <Badge key={badge} tone="info" data-testid={`badge-type-${badge.toLowerCase()}-${id}`}>
                    {badge}
                  </Badge>
                ))}
                <ImpactIndicator score={impactScore} />
              </InlineStack>
            </BlockStack>
          </div>
        </InlineStack>

        <Divider />

        <BlockStack gap="200">
          <Text as="h3" variant="headingSm" data-testid={`text-recommendation-title-${id}`}>
            {title}
          </Text>
          <BlockStack gap="100">
            {bullets.map((bullet, idx) => (
              <InlineStack key={idx} gap="200" blockAlign="start" wrap={false}>
                <div style={{ flexShrink: 0, marginTop: '2px' }}>
                  <span style={{ color: 'var(--p-color-icon-success)', display: 'inline-flex' }}>
                    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                      <path d="M8.72 13.28a.75.75 0 0 1-1.06 0l-2.69-2.69a.75.75 0 1 1 1.06-1.06l2.16 2.16 4.78-4.78a.75.75 0 1 1 1.06 1.06l-5.31 5.31Z" />
                    </svg>
                  </span>
                </div>
                <Text as="span" variant="bodySm" tone="subdued" data-testid={`text-bullet-${idx}-${id}`}>
                  {bullet}
                </Text>
              </InlineStack>
            ))}
          </BlockStack>
        </BlockStack>

        <Divider />

        {customActions ? (
          <ButtonGroup>
            {customActions}
          </ButtonGroup>
        ) : (
          <InlineStack align="space-between" blockAlign="center" gap="200">
            <Button
              size="slim"
              icon={ViewIcon}
              onClick={handlePreview}
              disabled={isProcessing}
              data-testid={`button-preview-optimization-${id}`}
            >
              Preview
            </Button>
            <InlineStack gap="200">
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
            </InlineStack>
          </InlineStack>
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
