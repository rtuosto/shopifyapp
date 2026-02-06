import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Optimization, Product } from "@shared/schema";

interface EnrichedOptimization extends Optimization {
  productName: string;
}

interface SimulationResult {
  type: "batch" | "traffic" | "orders";
  timestamp: string;
  optimizationName: string;
  allocationBefore?: { control: number; variant: number };
  allocationAfter?: { control: number; variant: number };
  variantPerformance?: {
    control: {
      impressions: number;
      conversions: number;
      revenue: string;
      conversionRate: string;
      arpu: string;
    };
    variant: {
      impressions: number;
      conversions: number;
      revenue: string;
      conversionRate: string;
      arpu: string;
    };
  };
  bayesianUpdate?: {
    newAllocation: { control: number; variant: number };
    metrics: any;
    reasoning: string;
  };
  allocation?: {
    control: {
      impressions?: number;
      orders?: number;
    };
    variant: {
      impressions?: number;
      orders?: number;
    };
  };
  metrics?: {
    totalImpressions?: number;
    totalConversions?: number;
    totalRevenue?: string;
    arpu?: string;
  };
  impressions?: {
    total: number;
    control: number;
    variant: number;
  };
  orders?: {
    total: number;
    control: number;
    variant: number;
  };
  revenue?: string;
  evolutionData?: Array<{
    impressions: number;
    controlRPV: number;
    variantRPV: number;
    controlAllocation: number;
    variantAllocation: number;
  }>;
}

export default function Simulator() {
  const { toast } = useToast();
  const [selectedOptimizationId, setSelectedOptimizationId] = useState<string>("");
  const [lastSimulationResult, setLastSimulationResult] = useState<SimulationResult | null>(null);
  
  const [visitors, setVisitors] = useState(1000);
  const [controlConversionRate, setControlConversionRate] = useState(3.0);
  const [variantConversionRate, setVariantConversionRate] = useState(3.5);
  
  const [liveMode, setLiveMode] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const { data: optimizations = [], isLoading: optimizationsLoading } = useQuery<EnrichedOptimization[]>({
    queryKey: ["/api/optimizations"],
    select: (data) => data.filter((t: Optimization) => t.status === "active"),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const enrichedOptimizations = optimizations.map((optimization) => ({
    ...optimization,
    productName: products.find((p) => p.id === optimization.productId)?.title || "Unknown Product",
  }));

  const selectedOptimization = enrichedOptimizations.find((t) => t.id === selectedOptimizationId);

  const batchSimulation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulate/batch", {
        optimizationId: selectedOptimizationId,
        visitors,
        controlConversionRate: controlConversionRate / 100,
        variantConversionRate: variantConversionRate / 100,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const result: SimulationResult = {
        type: "batch",
        timestamp: new Date().toLocaleTimeString(),
        optimizationName: selectedOptimization?.productName || "Unknown",
        allocationBefore: data.allocationBefore,
        allocationAfter: data.allocationAfter,
        variantPerformance: data.variantPerformance,
        bayesianUpdate: data.bayesianUpdate,
      };
      setLastSimulationResult(result);
      
      const allocationShifted = data.allocationBefore && data.allocationAfter && 
        (Math.abs(data.allocationBefore.control - data.allocationAfter.control) > 0.1);
      
      toast({
        title: "Batch Simulation Complete",
        description: allocationShifted 
          ? `Generated ${data.impressions} visitors. Allocation shifted: ${data.allocationBefore.control.toFixed(1)}% → ${data.allocationAfter.control.toFixed(1)}% control`
          : `Generated ${data.impressions} visitors and ${data.conversions} conversions`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startStreamingSimulation = () => {
    if (!selectedOptimizationId) return;
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsStreaming(true);
    setStreamProgress(0);
    setLastSimulationResult(null);

    const params = new URLSearchParams({
      optimizationId: selectedOptimizationId,
      visitors: visitors.toString(),
      controlConversionRate: (controlConversionRate / 100).toString(),
      variantConversionRate: (variantConversionRate / 100).toString(),
    });
    const url = `/api/simulate/batch-stream?${params.toString()}`;

    console.log('[SSE Client] Connecting to:', url);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('start', (event) => {
      const data = JSON.parse(event.data);
      console.log('[SSE Client] Received start event:', data);
    });

    eventSource.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data);
      console.log('[SSE Client] Received progress event:', `${data.impressions} impressions`);
      
      setStreamProgress(parseFloat(data.percentage));
    });

    eventSource.addEventListener('complete', (event) => {
      const data = JSON.parse(event.data);
      console.log('[SSE Client] Received complete event:', data);
      
      setIsStreaming(false);
      const result: SimulationResult = {
        type: "batch",
        timestamp: new Date().toLocaleTimeString(),
        optimizationName: selectedOptimization?.productName || "Unknown",
        allocationBefore: data.allocationBefore,
        allocationAfter: data.allocationAfter,
        variantPerformance: data.variantPerformance,
        bayesianUpdate: data.bayesianUpdate,
      };
      setLastSimulationResult(result);

      toast({
        title: "Live Simulation Complete",
        description: `Simulated ${data.impressions} visitors in real-time`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.onerror = (event) => {
      console.error('[SSE Client] Connection error:', event);
      setIsStreaming(false);
      
      if (eventSource.readyState === EventSource.CONNECTING) {
        toast({
          title: "Connection Lost",
          description: "Attempting to reconnect...",
          variant: "destructive",
        });
      } else if (eventSource.readyState === EventSource.CLOSED) {
        toast({
          title: "Connection Failed",
          description: "Failed to connect to streaming server. Please check parameters and try again.",
          variant: "destructive",
        });
        eventSource.close();
        eventSourceRef.current = null;
      }
    };
  };

  const handleRunSimulation = () => {
    if (liveMode) {
      startStreamingSimulation();
    } else {
      batchSimulation.mutate();
    }
  };

  const isSimulating = batchSimulation.isPending || isStreaming;
  const canSimulate = !!selectedOptimizationId && !isSimulating;

  const calculateAllocationPercentage = (control: number, variant: number) => {
    const total = control + variant;
    if (total === 0) return { control: 0, variant: 0 };
    return {
      control: Math.round((control / total) * 100),
      variant: Math.round((variant / total) * 100),
    };
  };

  const handleSelectChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    setSelectedOptimizationId(target.value);
  };

  const handleVisitorsChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setVisitors(Number(target.value));
  };

  const handleControlCRChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setControlConversionRate(Number(target.value));
  };

  const handleVariantCRChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setVariantConversionRate(Number(target.value));
  };

  const handleLiveModeChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setLiveMode(target.checked);
  };

  return (
    <s-page>
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small">
          <s-text variant="heading2xl" data-testid="text-page-title">Optimization Simulator</s-text>
          <s-text variant="bodyMd" tone="subdued" data-testid="text-page-description">
            Simulate traffic and conversions to verify A/B optimization allocation and performance tracking
          </s-text>
        </s-stack>

        {/* Optimization Selection */}
        <s-section data-testid="card-optimization-selection">
          <s-stack direction="block" gap="base">
            <s-text variant="headingMd">Select Active Optimization</s-text>
            <s-text variant="bodySm" tone="subdued">Choose an optimization to simulate traffic and conversions</s-text>
            <s-divider />
            {optimizationsLoading ? (
              <s-spinner size="small" accessibilityLabel="Loading optimizations" />
            ) : enrichedOptimizations.length === 0 ? (
              <s-text variant="bodySm" tone="subdued" data-testid="text-no-optimizations">
                No active optimizations available. Create and activate an optimization from the Dashboard first.
              </s-text>
            ) : (
              <s-stack direction="block" gap="base">
                <s-select
                  label="Active Optimization"
                  value={selectedOptimizationId}
                  onChange={handleSelectChange}
                  data-testid="select-optimization"
                >
                  <option value="">Select an optimization</option>
                  {enrichedOptimizations.map((optimization) => (
                    <option key={optimization.id} value={optimization.id} data-testid={`option-optimization-${optimization.id}`}>
                      {optimization.productName} - {optimization.optimizationType}
                    </option>
                  ))}
                </s-select>

                {selectedOptimization && (
                  <s-box padding="base" background="bg-surface-secondary" borderRadius="large" data-testid="card-optimization-info">
                    <s-stack direction="block" gap="small">
                      <s-stack direction="inline" align="space-between">
                        <s-text variant="bodySm" tone="subdued">Product:</s-text>
                        <s-text variant="bodySm" fontWeight="semibold" data-testid="text-product-name">{selectedOptimization.productName}</s-text>
                      </s-stack>
                      <s-stack direction="inline" align="space-between">
                        <s-text variant="bodySm" tone="subdued">Optimization Type:</s-text>
                        <s-text variant="bodySm" fontWeight="semibold" data-testid="text-optimization-type">{selectedOptimization.optimizationType}</s-text>
                      </s-stack>
                      <s-stack direction="inline" align="space-between">
                        <s-text variant="bodySm" tone="subdued">Current Impressions:</s-text>
                        <s-text variant="bodySm" fontWeight="semibold" data-testid="text-current-impressions">{selectedOptimization.impressions || 0}</s-text>
                      </s-stack>
                      <s-stack direction="inline" align="space-between">
                        <s-text variant="bodySm" tone="subdued">Current Conversions:</s-text>
                        <s-text variant="bodySm" fontWeight="semibold" data-testid="text-current-conversions">{selectedOptimization.conversions || 0}</s-text>
                      </s-stack>
                      <s-stack direction="inline" align="space-between">
                        <s-text variant="bodySm" tone="subdued">Current RPV:</s-text>
                        <s-text variant="bodySm" fontWeight="semibold" data-testid="text-current-rpv">${selectedOptimization.arpu || "0.00"}</s-text>
                      </s-stack>
                    </s-stack>
                  </s-box>
                )}
              </s-stack>
            )}
          </s-stack>
        </s-section>

        {/* Latest Simulation Results */}
        {lastSimulationResult && (
          <s-section data-testid="card-simulation-results">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" align="space-between" blockAlign="center">
                <s-stack direction="block" gap="small">
                  <s-text variant="headingMd">Simulation Complete</s-text>
                  <s-text variant="bodySm" tone="subdued">
                    {lastSimulationResult.type.charAt(0).toUpperCase() + lastSimulationResult.type.slice(1)} simulation at {lastSimulationResult.timestamp}
                  </s-text>
                </s-stack>
                <s-badge tone="success">Complete</s-badge>
              </s-stack>
              <s-divider />

              <s-stack direction="block" gap="base">
                {/* Summary */}
                {lastSimulationResult.type === "batch" && lastSimulationResult.variantPerformance && (
                  <s-banner tone="info" heading="Data Generation Summary">
                    <s-stack direction="block" gap="small">
                      <s-text variant="bodySm" data-testid="text-visitors-added">
                        Added {lastSimulationResult.variantPerformance.control.impressions + lastSimulationResult.variantPerformance.variant.impressions} visitors to optimization
                      </s-text>
                      {selectedOptimization && (
                        <s-text variant="bodySm" data-testid="text-total-impressions">
                          Optimization now has {selectedOptimization.impressions || 0} total impressions
                        </s-text>
                      )}
                    </s-stack>
                  </s-banner>
                )}

                {/* Optimization Info */}
                <s-box padding="base" background="bg-surface-secondary" borderRadius="large">
                  <s-stack direction="block" gap="small">
                    <s-text variant="bodySm" fontWeight="semibold">Optimization Product</s-text>
                    <s-text variant="bodySm" tone="subdued" data-testid="text-result-optimization-name">
                      {lastSimulationResult.optimizationName}
                    </s-text>
                  </s-stack>
                </s-box>

                {/* Batch Simulation Results with Allocation Evolution */}
                {lastSimulationResult.type === "batch" && lastSimulationResult.variantPerformance && (
                  <s-stack direction="block" gap="base">
                    {/* Allocation Evolution */}
                    {lastSimulationResult.allocationBefore && lastSimulationResult.allocationAfter && (
                      <s-box padding="base" border="base" borderRadius="large">
                        <s-stack direction="block" gap="base">
                          <s-text variant="headingSm">Traffic Allocation Evolution</s-text>
                          <s-grid columns="2" gap="base">
                            <s-stack direction="block" gap="small">
                              <s-text variant="bodyXs" tone="subdued">Before Simulation</s-text>
                              <s-stack direction="inline" gap="base">
                                <s-stack direction="block" align="center">
                                  <s-text variant="headingMd" fontWeight="bold" data-testid="text-allocation-before-control">
                                    {lastSimulationResult.allocationBefore.control.toFixed(1)}%
                                  </s-text>
                                  <s-text variant="bodyXs" tone="subdued">Control</s-text>
                                </s-stack>
                                <s-stack direction="block" align="center">
                                  <s-text variant="headingMd" fontWeight="bold" data-testid="text-allocation-before-variant">
                                    {lastSimulationResult.allocationBefore.variant.toFixed(1)}%
                                  </s-text>
                                  <s-text variant="bodyXs" tone="subdued">Variant</s-text>
                                </s-stack>
                              </s-stack>
                            </s-stack>
                            <s-stack direction="block" gap="small">
                              <s-text variant="bodyXs" tone="subdued">After Simulation</s-text>
                              <s-stack direction="inline" gap="base">
                                <s-stack direction="block" align="center">
                                  <s-text variant="headingMd" fontWeight="bold" data-testid="text-allocation-after-control">
                                    {lastSimulationResult.allocationAfter.control.toFixed(1)}%
                                  </s-text>
                                  <s-text variant="bodyXs" tone="subdued">Control</s-text>
                                </s-stack>
                                <s-stack direction="block" align="center">
                                  <s-text variant="headingMd" fontWeight="bold" data-testid="text-allocation-after-variant">
                                    {lastSimulationResult.allocationAfter.variant.toFixed(1)}%
                                  </s-text>
                                  <s-text variant="bodyXs" tone="subdued">Variant</s-text>
                                </s-stack>
                              </s-stack>
                            </s-stack>
                          </s-grid>
                          {Math.abs(lastSimulationResult.allocationAfter.control - lastSimulationResult.allocationBefore.control) > 0.1 ? (
                            <s-banner tone="info">
                              <s-text variant="bodyXs">Bayesian engine shifted traffic based on performance</s-text>
                            </s-banner>
                          ) : (
                            <s-banner tone="warning">
                              <s-text variant="bodyXs">No allocation shift (need more data or similar performance)</s-text>
                            </s-banner>
                          )}
                        </s-stack>
                      </s-box>
                    )}

                    {/* Variant Performance Comparison */}
                    <s-box padding="base" border="base" borderRadius="large">
                      <s-stack direction="block" gap="base">
                        <s-text variant="headingSm">Variant Performance</s-text>
                        <s-grid columns="2" gap="large">
                          <s-stack direction="block" gap="small">
                            <s-text variant="bodyXs" fontWeight="semibold" tone="subdued">Control</s-text>
                            <s-stack direction="block" gap="small">
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">Impressions:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-control-impressions-new">
                                  {lastSimulationResult.variantPerformance.control.impressions}
                                </s-text>
                              </s-stack>
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">Conversions:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-control-conversions">
                                  {lastSimulationResult.variantPerformance.control.conversions}
                                </s-text>
                              </s-stack>
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">Conv. Rate:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-control-cr">
                                  {lastSimulationResult.variantPerformance.control.conversionRate}%
                                </s-text>
                              </s-stack>
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">Revenue:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-control-revenue">
                                  ${lastSimulationResult.variantPerformance.control.revenue}
                                </s-text>
                              </s-stack>
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">RPV:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-control-rpv">
                                  ${lastSimulationResult.variantPerformance.control.arpu}
                                </s-text>
                              </s-stack>
                            </s-stack>
                          </s-stack>
                          <s-stack direction="block" gap="small">
                            <s-text variant="bodyXs" fontWeight="semibold" tone="subdued">Variant</s-text>
                            <s-stack direction="block" gap="small">
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">Impressions:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-variant-impressions-new">
                                  {lastSimulationResult.variantPerformance.variant.impressions}
                                </s-text>
                              </s-stack>
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">Conversions:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-variant-conversions">
                                  {lastSimulationResult.variantPerformance.variant.conversions}
                                </s-text>
                              </s-stack>
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">Conv. Rate:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-variant-cr">
                                  {lastSimulationResult.variantPerformance.variant.conversionRate}%
                                </s-text>
                              </s-stack>
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">Revenue:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-variant-revenue">
                                  ${lastSimulationResult.variantPerformance.variant.revenue}
                                </s-text>
                              </s-stack>
                              <s-stack direction="inline" align="space-between">
                                <s-text variant="bodyXs" tone="subdued">RPV:</s-text>
                                <s-text variant="bodySm" fontWeight="semibold" data-testid="text-variant-rpv">
                                  ${lastSimulationResult.variantPerformance.variant.arpu}
                                </s-text>
                              </s-stack>
                            </s-stack>
                          </s-stack>
                        </s-grid>
                      </s-stack>
                    </s-box>

                    {/* Bayesian Update Info */}
                    {lastSimulationResult.bayesianUpdate && (
                      <s-banner tone="info" heading="Bayesian Engine Update">
                        <s-text variant="bodyXs" data-testid="text-bayesian-reasoning">
                          {lastSimulationResult.bayesianUpdate.reasoning}
                        </s-text>
                      </s-banner>
                    )}
                  </s-stack>
                )}

                {/* OLD: Batch Simulation Results (fallback for old API response) */}
                {lastSimulationResult.type === "batch" && lastSimulationResult.allocation && !lastSimulationResult.variantPerformance && (
                  <s-stack direction="block" gap="base">
                    <s-text variant="headingSm">A/B Optimization Allocation Verification</s-text>
                    
                    {/* Impressions Allocation */}
                    <s-box padding="base" border="base" borderRadius="large">
                      <s-stack direction="block" gap="base">
                        <s-text variant="headingSm">Traffic Distribution</s-text>
                        <s-grid columns="2" gap="base">
                          <s-stack direction="block" gap="small">
                            <s-text variant="bodyXs" tone="subdued">Control</s-text>
                            <s-text variant="heading2xl" fontWeight="bold" data-testid="text-control-impressions">
                              {lastSimulationResult.allocation.control.impressions}
                            </s-text>
                            <s-text variant="bodyXs" tone="subdued">
                              {calculateAllocationPercentage(
                                lastSimulationResult.allocation.control.impressions || 0,
                                lastSimulationResult.allocation.variant.impressions || 0
                              ).control}% of traffic
                            </s-text>
                          </s-stack>
                          <s-stack direction="block" gap="small">
                            <s-text variant="bodyXs" tone="subdued">Variant</s-text>
                            <s-text variant="heading2xl" fontWeight="bold" data-testid="text-variant-impressions">
                              {lastSimulationResult.allocation.variant.impressions}
                            </s-text>
                            <s-text variant="bodyXs" tone="subdued">
                              {calculateAllocationPercentage(
                                lastSimulationResult.allocation.control.impressions || 0,
                                lastSimulationResult.allocation.variant.impressions || 0
                              ).variant}% of traffic
                            </s-text>
                          </s-stack>
                        </s-grid>
                        {Math.abs(
                          (lastSimulationResult.allocation.control.impressions || 0) - 
                          (lastSimulationResult.allocation.variant.impressions || 0)
                        ) <= 1 ? (
                          <s-banner tone="success" data-testid="text-allocation-status">
                            <s-text variant="bodyXs">Perfect 50/50 split achieved</s-text>
                          </s-banner>
                        ) : (
                          <s-banner tone="warning">
                            <s-text variant="bodyXs">Minor variance from 50/50 (expected with random allocation)</s-text>
                          </s-banner>
                        )}
                      </s-stack>
                    </s-box>

                    {/* Orders Allocation */}
                    <s-box padding="base" border="base" borderRadius="large">
                      <s-stack direction="block" gap="base">
                        <s-text variant="headingSm">Conversion Distribution</s-text>
                        <s-grid columns="2" gap="base">
                          <s-stack direction="block" gap="small">
                            <s-text variant="bodyXs" tone="subdued">Control</s-text>
                            <s-text variant="heading2xl" fontWeight="bold" data-testid="text-control-orders">
                              {lastSimulationResult.allocation.control.orders}
                            </s-text>
                            <s-text variant="bodyXs" tone="subdued">
                              {calculateAllocationPercentage(
                                lastSimulationResult.allocation.control.orders || 0,
                                lastSimulationResult.allocation.variant.orders || 0
                              ).control}% of orders
                            </s-text>
                          </s-stack>
                          <s-stack direction="block" gap="small">
                            <s-text variant="bodyXs" tone="subdued">Variant</s-text>
                            <s-text variant="heading2xl" fontWeight="bold" data-testid="text-variant-orders">
                              {lastSimulationResult.allocation.variant.orders}
                            </s-text>
                            <s-text variant="bodyXs" tone="subdued">
                              {calculateAllocationPercentage(
                                lastSimulationResult.allocation.control.orders || 0,
                                lastSimulationResult.allocation.variant.orders || 0
                              ).variant}% of orders
                            </s-text>
                          </s-stack>
                        </s-grid>
                      </s-stack>
                    </s-box>

                    {/* Updated Metrics */}
                    {lastSimulationResult.metrics && (
                      <s-box padding="base" border="base" borderRadius="large">
                        <s-stack direction="block" gap="base">
                          <s-text variant="headingSm">Updated Optimization Metrics</s-text>
                          <s-grid columns="4" gap="base">
                            <s-stack direction="block" gap="small">
                              <s-text variant="bodyXs" tone="subdued">Total Impressions</s-text>
                              <s-text variant="headingMd" fontWeight="bold" data-testid="text-total-impressions">
                                {lastSimulationResult.metrics.totalImpressions}
                              </s-text>
                            </s-stack>
                            <s-stack direction="block" gap="small">
                              <s-text variant="bodyXs" tone="subdued">Total Conversions</s-text>
                              <s-text variant="headingMd" fontWeight="bold" data-testid="text-total-conversions">
                                {lastSimulationResult.metrics.totalConversions}
                              </s-text>
                            </s-stack>
                            <s-stack direction="block" gap="small">
                              <s-text variant="bodyXs" tone="subdued">Total Revenue</s-text>
                              <s-text variant="headingMd" fontWeight="bold" data-testid="text-total-revenue">
                                ${lastSimulationResult.metrics.totalRevenue}
                              </s-text>
                            </s-stack>
                            <s-stack direction="block" gap="small">
                              <s-text variant="bodyXs" tone="subdued">RPV</s-text>
                              <s-text variant="headingMd" fontWeight="bold" data-testid="text-result-rpv">
                                ${lastSimulationResult.metrics.arpu}
                              </s-text>
                            </s-stack>
                          </s-grid>
                          <s-text variant="bodyXs" tone="subdued">
                            Revenue includes ±20% variance per order for realistic simulation
                          </s-text>
                        </s-stack>
                      </s-box>
                    )}
                  </s-stack>
                )}
              </s-stack>
            </s-stack>
          </s-section>
        )}

        {/* Batch Simulation */}
        <s-section data-testid="card-batch-simulation">
          <s-stack direction="block" gap="base">
            <s-text variant="headingMd">Batch Simulation</s-text>
            <s-text variant="bodySm" tone="subdued">
              Simulate realistic traffic and conversions in one click. Perfect for validating A/B optimization allocation.
            </s-text>
            <s-divider />

            <s-grid columns="2" gap="base">
              <s-text-field
                label="Visitors"
                type="number"
                value={String(visitors)}
                min="10"
                max="100000"
                onInput={handleVisitorsChange}
                data-testid="input-visitors"
                disabled={!canSimulate}
                helpText="Number of product page views (split 50/50 between control and variant)"
              />
              <s-text-field
                label="Control Conversion Rate (%)"
                type="number"
                value={String(controlConversionRate)}
                min="0"
                max="100"
                step="0.1"
                onInput={handleControlCRChange}
                data-testid="input-control-conversion-rate"
                disabled={!canSimulate}
                helpText="Control conversion rate (baseline performance)"
              />
            </s-grid>

            <s-grid columns="2" gap="base">
              <s-text-field
                label="Variant Conversion Rate (%)"
                type="number"
                value={String(variantConversionRate)}
                min="0"
                max="100"
                step="0.1"
                onInput={handleVariantCRChange}
                data-testid="input-variant-conversion-rate"
                disabled={!canSimulate}
                helpText="Variant conversion rate (set higher to simulate lift)"
              />
              <s-stack direction="block" gap="small">
                <s-text variant="bodySm" fontWeight="semibold" tone="subdued">Expected Lift</s-text>
                <s-box padding="base" background="bg-surface-secondary" borderRadius="large">
                  <s-text variant="bodySm" fontWeight="semibold" data-testid="text-expected-lift">
                    {controlConversionRate > 0 
                      ? `${(((variantConversionRate - controlConversionRate) / controlConversionRate) * 100).toFixed(1)}%`
                      : '0%'}
                  </s-text>
                </s-box>
                <s-text variant="bodyXs" tone="subdued">
                  Relative improvement from control to variant
                </s-text>
              </s-stack>
            </s-grid>

            {/* Live Mode Toggle */}
            <s-box padding="base" background="bg-surface-secondary" borderRadius="large">
              <s-stack direction="inline" align="space-between" blockAlign="center">
                <s-stack direction="block" gap="small">
                  <s-text variant="bodySm" fontWeight="semibold">Live Streaming Mode</s-text>
                  <s-text variant="bodyXs" tone="subdued">
                    Watch charts update in real-time as the simulation runs
                  </s-text>
                </s-stack>
                <s-switch
                  label=""
                  checked={liveMode}
                  onChange={handleLiveModeChange}
                  data-testid="toggle-live-mode"
                  disabled={isSimulating}
                />
              </s-stack>
            </s-box>

            {/* Progress Indicator */}
            {isStreaming && (
              <s-stack direction="block" gap="small">
                <s-stack direction="inline" align="space-between">
                  <s-text variant="bodySm" tone="subdued">Simulation Progress</s-text>
                  <s-text variant="bodySm" fontWeight="semibold">{streamProgress}%</s-text>
                </s-stack>
                <s-progress-bar
                  progress={streamProgress}
                  tone="primary"
                  size="small"
                  data-testid="progress-simulation"
                  accessibilityLabel={`Simulation progress: ${streamProgress}%`}
                />
                <s-text variant="bodyXs" tone="subdued" alignment="center">
                  Streaming real-time updates...
                </s-text>
              </s-stack>
            )}

            {!selectedOptimizationId && (
              <s-banner tone="warning">
                <s-text variant="bodySm">Please select an active optimization above to run simulations</s-text>
              </s-banner>
            )}

            <s-button
              variant="primary"
              onClick={handleRunSimulation}
              disabled={!canSimulate}
              loading={isSimulating}
              fullWidth
              data-testid="button-run-batch"
            >
              {isSimulating 
                ? (liveMode ? `Streaming... ${streamProgress}%` : "Simulating...") 
                : (liveMode ? "Start Live Simulation" : "Run Batch Simulation")}
            </s-button>
          </s-stack>
        </s-section>

        {/* Information Card */}
        <s-section data-testid="card-info">
          <s-stack direction="block" gap="base">
            <s-text variant="headingMd">How It Works</s-text>
            <s-divider />
            <s-stack direction="block" gap="base">
              <s-text variant="bodySm" tone="subdued">
                <strong>Batch Simulation:</strong> Generates realistic traffic and conversions in one step. 
                Visitors are allocated using the optimization's current Bayesian allocation (Thompson Sampling), and conversions are calculated based on your specified rates.
              </s-text>
              <s-text variant="bodySm" tone="subdued">
                <strong>Live Streaming Mode:</strong> Watch the simulation unfold in real-time! Charts update progressively every 100 visitors, 
                letting you see how the Bayesian engine adapts traffic allocation as performance data accumulates. Perfect for understanding Thompson Sampling in action.
              </s-text>
              <s-text variant="bodySm" tone="subdued">
                <strong>Evolution Charts:</strong> Track how RPV and traffic allocation change over time as the Bayesian engine learns which variant performs better.
                The x-axis shows impressions (every 100), while the y-axes show RPV and allocation percentages respectively.
              </s-text>
              <s-text variant="bodySm" tone="subdued">
                <strong>Allocation Verification:</strong> The simulation uses the optimization's current allocation percentages, 
                adapting dynamically based on performance. Results include detailed breakdowns to confirm proper distribution.
              </s-text>
            </s-stack>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}
