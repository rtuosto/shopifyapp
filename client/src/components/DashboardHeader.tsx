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
    <s-box padding="none" data-testid="dashboard-header">
      <s-stack direction="block" gap="small">
        <s-text variant="headingLg" data-testid="text-dashboard-title">Dashboard</s-text>
        <s-stack direction="inline" gap="small" blockAlign="center">
          <s-badge tone="info" data-testid="badge-active-optimizations">
            {activeOptimizations} Active
          </s-badge>
          <s-badge tone="info" icon="wand" data-testid="badge-quota">
            {quotaUsed} AI Ideas Used · Beta: Unlimited
          </s-badge>
          <s-text variant="bodySm" tone="subdued" data-testid="text-last-sync">
            Last synced {lastSync}
          </s-text>
        </s-stack>
      </s-stack>
    </s-box>
  );
}
