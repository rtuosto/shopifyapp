import { Box, BlockStack, InlineStack, Badge, Text } from "@shopify/polaris";

interface DashboardHeaderProps {
  activeOptimizations: number;
  lastSync?: string;
  quotaUsed?: number;
  quotaTotal?: number;
}

export default function DashboardHeader({ 
  activeOptimizations, 
  lastSync = "5 min ago",
  quotaUsed = 0,
  quotaTotal = 20
}: DashboardHeaderProps) {
  return (
    <Box padding="0" data-testid="dashboard-header">
      <BlockStack gap="200">
        <Text as="h1" variant="headingLg" data-testid="text-dashboard-title">Dashboard</Text>
        <InlineStack gap="200" blockAlign="center">
          <Badge tone="info" data-testid="badge-active-optimizations">
            {`${activeOptimizations} Active`}
          </Badge>
          <Badge tone="info" data-testid="badge-quota">
            {`${quotaUsed} AI Ideas Used · Beta: Unlimited`}
          </Badge>
          <Text as="span" variant="bodySm" tone="subdued" data-testid="text-last-sync">
            Last synced {lastSync}
          </Text>
        </InlineStack>
      </BlockStack>
    </Box>
  );
}
