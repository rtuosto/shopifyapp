import { Card, BlockStack, InlineStack, Text } from "@shopify/polaris";

interface MetricCardProps {
  title: string;
  value: string;
  change?: number;
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
  valueClassName?: string;
}

export default function MetricCard({ title, value, change, trend = "neutral", subtitle, valueClassName }: MetricCardProps) {
  const valueTone = valueClassName?.includes('green') ? 'success' : valueClassName?.includes('red') ? 'critical' : undefined;

  return (
    <Card data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone="subdued" fontWeight="medium" data-testid="text-metric-title">
          {title}
        </Text>
        <InlineStack gap="200" blockAlign="baseline" align="space-between">
          <Text as="p" variant="headingLg" fontWeight="bold" tone={valueTone} data-testid="text-metric-value">
            {value}
          </Text>
          {change !== undefined && (
            <Text as="span" variant="bodySm" fontWeight="semibold" tone={trend === "up" ? "success" : trend === "down" ? "critical" : "subdued"} data-testid="text-metric-change">
              {trend === "up" ? "+" : trend === "down" ? "-" : ""}{Math.abs(change)}%
            </Text>
          )}
        </InlineStack>
        {subtitle && (
          <Text as="p" variant="bodyXs" tone="subdued" data-testid="text-metric-subtitle">
            {subtitle}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}
