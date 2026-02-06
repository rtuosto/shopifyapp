interface Optimization {
  id: string;
  productName: string;
  optimizationType: string;
  status: "active" | "completed" | "draft";
  arpu: number;
  arpuLift: number;
  conversions: number;
  revenue: number;
  startDate: string;
}

interface OptimizationHistoryTableProps {
  optimizations: Optimization[];
  onViewOptimization?: (optimizationId: string) => void;
  onStartOptimization?: (optimizationId: string) => void;
  onStopOptimization?: (optimizationId: string) => void;
}

function getStatusTone(status: string): "info" | "success" | "read-only" | undefined {
  switch (status) {
    case "active": return "success";
    case "completed": return "info";
    case "draft": return "read-only";
    default: return "read-only";
  }
}

export default function OptimizationHistoryTable({ optimizations, onViewOptimization, onStartOptimization, onStopOptimization }: OptimizationHistoryTableProps) {
  return (
    <s-section data-testid="card-optimization-history">
      <s-text variant="headingSm" fontWeight="semibold" data-testid="text-table-title">Recent Optimizations</s-text>
      <s-box padding="base none">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--p-color-border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', fontWeight: 500, color: 'var(--p-color-text-secondary)' }}>Product</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', fontWeight: 500, color: 'var(--p-color-text-secondary)' }}>Type</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', fontWeight: 500, color: 'var(--p-color-text-secondary)' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px', fontWeight: 500, color: 'var(--p-color-text-secondary)' }}>ARPU</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px', fontWeight: 500, color: 'var(--p-color-text-secondary)' }}>Conversions</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', fontWeight: 500, color: 'var(--p-color-text-secondary)' }}>Started</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px', fontWeight: 500, color: 'var(--p-color-text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {optimizations.map((optimization, index) => (
                <tr 
                  key={optimization.id} 
                  style={{ borderBottom: '1px solid var(--p-color-border)' }}
                  data-testid={`row-optimization-${index}`}
                >
                  <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 500 }} data-testid={`text-product-${index}`}>
                    {optimization.productName}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--p-color-text-secondary)' }} data-testid={`text-optimization-type-${index}`}>
                    {optimization.optimizationType}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <s-badge tone={getStatusTone(optimization.status)} data-testid={`badge-status-${index}`}>
                      {optimization.status}
                    </s-badge>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} data-testid={`text-arpu-${index}`}>
                    {optimization.arpu > 0 ? `$${optimization.arpu.toFixed(2)}` : '$0.00'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: 'var(--p-color-text-secondary)', fontVariantNumeric: 'tabular-nums' }} data-testid={`text-conversions-${index}`}>
                    {optimization.conversions}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--p-color-text-secondary)' }} data-testid={`text-date-${index}`}>
                    {optimization.startDate}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <s-stack direction="inline" gap="small" align="end">
                      {optimization.status === "draft" && onStartOptimization && (
                        <s-button
                          variant="secondary"
                          size="slim"
                          icon="play"
                          onClick={(e: any) => { e.stopPropagation(); onStartOptimization(optimization.id); }}
                          data-testid={`button-start-optimization-${index}`}
                        >
                          Start
                        </s-button>
                      )}
                      {optimization.status === "active" && onStopOptimization && (
                        <s-button
                          variant="secondary"
                          size="slim"
                          icon="stop-circle"
                          onClick={(e: any) => { e.stopPropagation(); onStopOptimization(optimization.id); }}
                          data-testid={`button-stop-optimization-${index}`}
                        >
                          Stop
                        </s-button>
                      )}
                      <s-button
                        variant="tertiary"
                        size="slim"
                        icon="view"
                        onClick={() => onViewOptimization?.(optimization.id)}
                        data-testid={`button-view-optimization-${index}`}
                        accessibilityLabel="View optimization"
                      />
                    </s-stack>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </s-box>
    </s-section>
  );
}
