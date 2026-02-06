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
    <s-section data-testid={`card-metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <s-stack direction="block" gap="small">
        <s-text variant="bodySm" tone="subdued" fontWeight="medium" data-testid="text-metric-title">
          {title}
        </s-text>
        <s-stack direction="inline" gap="small" blockAlign="baseline" align="space-between">
          <s-text variant="headingLg" fontWeight="bold" tone={valueTone} data-testid="text-metric-value">
            {value}
          </s-text>
          {change !== undefined && (
            <s-text variant="bodySm" fontWeight="semibold" tone={trend === "up" ? "success" : trend === "down" ? "critical" : "subdued"} data-testid="text-metric-change">
              {trend === "up" ? "+" : trend === "down" ? "-" : ""}{Math.abs(change)}%
            </s-text>
          )}
        </s-stack>
        {subtitle && (
          <s-text variant="bodyXs" tone="subdued" data-testid="text-metric-subtitle">
            {subtitle}
          </s-text>
        )}
      </s-stack>
    </s-section>
  );
}
