import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Optimization, Product } from "@shared/schema";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Box,
  Divider,
  Spinner,
  Badge,
  Banner,
  Button,
  TextField,
  Select,
  Checkbox,
  ProgressBar,
} from "@shopify/polaris";

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
        metrics: {
          totalImpressions: Number(data.impressions) || 0,
          totalConversions: Number(data.conversions) || 0,
          totalRevenue: String(data.revenue || "0"),
          arpu: String(data.arpu || "0"),
        },
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
        metrics: {
          totalImpressions: Number(data.impressions) || 0,
          totalConversions: Number(data.conversions) || 0,
          totalRevenue: String(data.revenue || "0"),
          arpu: String(data.arpu || "0"),
        },
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

  return (
    <Page>
      <BlockStack gap="600">
        <BlockStack gap="200">
          <Text as="h1" variant="heading2xl" data-testid="text-page-title">Optimization Simulator</Text>
          <Text as="p" variant="bodyMd" tone="subdued" data-testid="text-page-description">
            Simulate traffic and conversions to verify A/B optimization allocation and performance tracking
          </Text>
        </BlockStack>

        <Card data-testid="card-optimization-selection">
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Select Active Optimization</Text>
            <Text as="p" variant="bodySm" tone="subdued">Choose an optimization to simulate traffic and conversions</Text>
            <Divider />
            {optimizationsLoading ? (
              <Spinner size="small" accessibilityLabel="Loading optimizations" />
            ) : enrichedOptimizations.length === 0 ? (
              <Text as="p" variant="bodySm" tone="subdued" data-testid="text-no-optimizations">
                No active optimizations available. Create and activate an optimization from the Dashboard first.
              </Text>
            ) : (
              <BlockStack gap="400">
                <Select
                  label="Active Optimization"
                  value={selectedOptimizationId}
                  onChange={(value) => setSelectedOptimizationId(value)}
                  data-testid="select-optimization"
                  options={[
                    { label: "Select an optimization", value: "" },
                    ...enrichedOptimizations.map((optimization) => ({
                      label: `${optimization.productName} - ${optimization.optimizationType}`,
                      value: optimization.id,
                    })),
                  ]}
                />

                {selectedOptimization && (
                  <Box padding="400" data-testid="card-optimization-info">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm" tone="subdued">Product:</Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-product-name">{selectedOptimization.productName}</Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm" tone="subdued">Optimization Type:</Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-optimization-type">{selectedOptimization.optimizationType}</Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm" tone="subdued">Current Impressions:</Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-current-impressions">{String(selectedOptimization.impressions || 0)}</Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm" tone="subdued">Current Conversions:</Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-current-conversions">{String(selectedOptimization.conversions || 0)}</Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm" tone="subdued">Current RPV:</Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-current-rpv">${selectedOptimization.arpu || "0.00"}</Text>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {lastSimulationResult && (
          <Card data-testid="card-simulation-results">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Simulation Complete</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {lastSimulationResult.type.charAt(0).toUpperCase() + lastSimulationResult.type.slice(1)} simulation at {lastSimulationResult.timestamp}
                  </Text>
                </BlockStack>
                <Badge tone="success">Complete</Badge>
              </InlineStack>
              <Divider />

              <BlockStack gap="400">
                {lastSimulationResult.type === "batch" && lastSimulationResult.variantPerformance && (
                  <Banner title="Data Generation Summary" tone="info">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" data-testid="text-visitors-added">
                        Added {lastSimulationResult.variantPerformance.control.impressions + lastSimulationResult.variantPerformance.variant.impressions} visitors to optimization
                      </Text>
                      {selectedOptimization && (
                        <Text as="p" variant="bodySm" data-testid="text-total-impressions">
                          Optimization now has {selectedOptimization.impressions || 0} total impressions
                        </Text>
                      )}
                    </BlockStack>
                  </Banner>
                )}

                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" fontWeight="semibold">Optimization Product</Text>
                    <Text as="p" variant="bodySm" tone="subdued" data-testid="text-result-optimization-name">
                      {lastSimulationResult.optimizationName}
                    </Text>
                  </BlockStack>
                </Box>

                {lastSimulationResult.type === "batch" && lastSimulationResult.variantPerformance && (
                  <BlockStack gap="400">
                    {lastSimulationResult.allocationBefore && lastSimulationResult.allocationAfter && (
                      <Box padding="400">
                        <BlockStack gap="400">
                          <Text as="h3" variant="headingSm">Traffic Allocation Evolution</Text>
                          <InlineGrid columns={2} gap="400">
                            <BlockStack gap="200">
                              <Text as="span" variant="bodyXs" tone="subdued">Before Simulation</Text>
                              <InlineStack gap="400">
                                <BlockStack>
                                  <Text as="h2" variant="headingMd" fontWeight="bold" data-testid="text-allocation-before-control">
                                    {lastSimulationResult.allocationBefore.control.toFixed(1)}%
                                  </Text>
                                  <Text as="span" variant="bodyXs" tone="subdued">Control</Text>
                                </BlockStack>
                                <BlockStack>
                                  <Text as="h2" variant="headingMd" fontWeight="bold" data-testid="text-allocation-before-variant">
                                    {lastSimulationResult.allocationBefore.variant.toFixed(1)}%
                                  </Text>
                                  <Text as="span" variant="bodyXs" tone="subdued">Variant</Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                            <BlockStack gap="200">
                              <Text as="span" variant="bodyXs" tone="subdued">After Simulation</Text>
                              <InlineStack gap="400">
                                <BlockStack>
                                  <Text as="h2" variant="headingMd" fontWeight="bold" data-testid="text-allocation-after-control">
                                    {lastSimulationResult.allocationAfter.control.toFixed(1)}%
                                  </Text>
                                  <Text as="span" variant="bodyXs" tone="subdued">Control</Text>
                                </BlockStack>
                                <BlockStack>
                                  <Text as="h2" variant="headingMd" fontWeight="bold" data-testid="text-allocation-after-variant">
                                    {lastSimulationResult.allocationAfter.variant.toFixed(1)}%
                                  </Text>
                                  <Text as="span" variant="bodyXs" tone="subdued">Variant</Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </InlineGrid>
                          {Math.abs(lastSimulationResult.allocationAfter.control - lastSimulationResult.allocationBefore.control) > 0.1 ? (
                            <Banner tone="info">
                              <Text as="span" variant="bodyXs">Bayesian engine shifted traffic based on performance</Text>
                            </Banner>
                          ) : (
                            <Banner tone="warning">
                              <Text as="span" variant="bodyXs">No allocation shift (need more data or similar performance)</Text>
                            </Banner>
                          )}
                        </BlockStack>
                      </Box>
                    )}

                    <Box padding="400">
                      <BlockStack gap="400">
                        <Text as="h3" variant="headingSm">Variant Performance</Text>
                        <InlineGrid columns={2} gap="600">
                          <BlockStack gap="200">
                            <Text as="span" variant="bodyXs" fontWeight="semibold" tone="subdued">Control</Text>
                            <BlockStack gap="200">
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">Impressions:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-control-impressions-new">
                                  {String(lastSimulationResult.variantPerformance.control.impressions)}
                                </Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">Conversions:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-control-conversions">
                                  {String(lastSimulationResult.variantPerformance.control.conversions)}
                                </Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">Conv. Rate:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-control-cr">
                                  {lastSimulationResult.variantPerformance.control.conversionRate}%
                                </Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">Revenue:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-control-revenue">
                                  ${lastSimulationResult.variantPerformance.control.revenue}
                                </Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">RPV:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-control-rpv">
                                  ${lastSimulationResult.variantPerformance.control.arpu}
                                </Text>
                              </InlineStack>
                            </BlockStack>
                          </BlockStack>
                          <BlockStack gap="200">
                            <Text as="span" variant="bodyXs" fontWeight="semibold" tone="subdued">Variant</Text>
                            <BlockStack gap="200">
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">Impressions:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-variant-impressions-new">
                                  {String(lastSimulationResult.variantPerformance.variant.impressions)}
                                </Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">Conversions:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-variant-conversions">
                                  {String(lastSimulationResult.variantPerformance.variant.conversions)}
                                </Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">Conv. Rate:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-variant-cr">
                                  {lastSimulationResult.variantPerformance.variant.conversionRate}%
                                </Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">Revenue:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-variant-revenue">
                                  ${lastSimulationResult.variantPerformance.variant.revenue}
                                </Text>
                              </InlineStack>
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyXs" tone="subdued">RPV:</Text>
                                <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-variant-rpv">
                                  ${lastSimulationResult.variantPerformance.variant.arpu}
                                </Text>
                              </InlineStack>
                            </BlockStack>
                          </BlockStack>
                        </InlineGrid>
                      </BlockStack>
                    </Box>

                    {lastSimulationResult.bayesianUpdate && (
                      <Banner title="Bayesian Engine Update" tone="info">
                        <Text as="span" variant="bodyXs" data-testid="text-bayesian-reasoning">
                          {lastSimulationResult.bayesianUpdate.reasoning}
                        </Text>
                      </Banner>
                    )}
                  </BlockStack>
                )}

                {lastSimulationResult.type === "batch" && lastSimulationResult.allocation && !lastSimulationResult.variantPerformance && (
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingSm">A/B Optimization Allocation Verification</Text>
                    
                    <Box padding="400">
                      <BlockStack gap="400">
                        <Text as="h3" variant="headingSm">Traffic Distribution</Text>
                        <InlineGrid columns={2} gap="400">
                          <BlockStack gap="200">
                            <Text as="span" variant="bodyXs" tone="subdued">Control</Text>
                            <Text as="h1" variant="heading2xl" fontWeight="bold" data-testid="text-control-impressions">
                              {String(lastSimulationResult.allocation.control.impressions)}
                            </Text>
                            <Text as="span" variant="bodyXs" tone="subdued">
                              {calculateAllocationPercentage(
                                lastSimulationResult.allocation.control.impressions || 0,
                                lastSimulationResult.allocation.variant.impressions || 0
                              ).control}% of traffic
                            </Text>
                          </BlockStack>
                          <BlockStack gap="200">
                            <Text as="span" variant="bodyXs" tone="subdued">Variant</Text>
                            <Text as="h1" variant="heading2xl" fontWeight="bold" data-testid="text-variant-impressions">
                              {String(lastSimulationResult.allocation.variant.impressions)}
                            </Text>
                            <Text as="span" variant="bodyXs" tone="subdued">
                              {calculateAllocationPercentage(
                                lastSimulationResult.allocation.control.impressions || 0,
                                lastSimulationResult.allocation.variant.impressions || 0
                              ).variant}% of traffic
                            </Text>
                          </BlockStack>
                        </InlineGrid>
                        {Math.abs(
                          (lastSimulationResult.allocation.control.impressions || 0) - 
                          (lastSimulationResult.allocation.variant.impressions || 0)
                        ) <= 1 ? (
                          <Banner tone="success" data-testid="text-allocation-status">
                            <Text as="span" variant="bodyXs">Perfect 50/50 split achieved</Text>
                          </Banner>
                        ) : (
                          <Banner tone="warning">
                            <Text as="span" variant="bodyXs">Minor variance from 50/50 (expected with random allocation)</Text>
                          </Banner>
                        )}
                      </BlockStack>
                    </Box>

                    <Box padding="400">
                      <BlockStack gap="400">
                        <Text as="h3" variant="headingSm">Conversion Distribution</Text>
                        <InlineGrid columns={2} gap="400">
                          <BlockStack gap="200">
                            <Text as="span" variant="bodyXs" tone="subdued">Control</Text>
                            <Text as="h1" variant="heading2xl" fontWeight="bold" data-testid="text-control-orders">
                              {String(lastSimulationResult.allocation.control.orders)}
                            </Text>
                            <Text as="span" variant="bodyXs" tone="subdued">
                              {calculateAllocationPercentage(
                                lastSimulationResult.allocation.control.orders || 0,
                                lastSimulationResult.allocation.variant.orders || 0
                              ).control}% of orders
                            </Text>
                          </BlockStack>
                          <BlockStack gap="200">
                            <Text as="span" variant="bodyXs" tone="subdued">Variant</Text>
                            <Text as="h1" variant="heading2xl" fontWeight="bold" data-testid="text-variant-orders">
                              {String(lastSimulationResult.allocation.variant.orders)}
                            </Text>
                            <Text as="span" variant="bodyXs" tone="subdued">
                              {calculateAllocationPercentage(
                                lastSimulationResult.allocation.control.orders || 0,
                                lastSimulationResult.allocation.variant.orders || 0
                              ).variant}% of orders
                            </Text>
                          </BlockStack>
                        </InlineGrid>
                      </BlockStack>
                    </Box>

                    {lastSimulationResult.metrics && (
                      <Box padding="400">
                        <BlockStack gap="400">
                          <Text as="h3" variant="headingSm">Updated Optimization Metrics</Text>
                          <InlineGrid columns={4} gap="400">
                            <BlockStack gap="200">
                              <Text as="span" variant="bodyXs" tone="subdued">Total Impressions</Text>
                              <Text as="h2" variant="headingMd" fontWeight="bold" data-testid="text-total-impressions">
                                {String(lastSimulationResult.metrics.totalImpressions)}
                              </Text>
                            </BlockStack>
                            <BlockStack gap="200">
                              <Text as="span" variant="bodyXs" tone="subdued">Total Conversions</Text>
                              <Text as="h2" variant="headingMd" fontWeight="bold" data-testid="text-total-conversions">
                                {String(lastSimulationResult.metrics.totalConversions)}
                              </Text>
                            </BlockStack>
                            <BlockStack gap="200">
                              <Text as="span" variant="bodyXs" tone="subdued">Total Revenue</Text>
                              <Text as="h2" variant="headingMd" fontWeight="bold" data-testid="text-total-revenue">
                                ${lastSimulationResult.metrics.totalRevenue}
                              </Text>
                            </BlockStack>
                            <BlockStack gap="200">
                              <Text as="span" variant="bodyXs" tone="subdued">RPV</Text>
                              <Text as="h2" variant="headingMd" fontWeight="bold" data-testid="text-result-rpv">
                                ${lastSimulationResult.metrics.arpu}
                              </Text>
                            </BlockStack>
                          </InlineGrid>
                          <Text as="span" variant="bodyXs" tone="subdued">
                            Revenue includes ±20% variance per order for realistic simulation
                          </Text>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        <Card data-testid="card-batch-simulation">
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Batch Simulation</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Simulate realistic traffic and conversions in one click. Perfect for validating A/B optimization allocation.
            </Text>
            <Divider />

            <InlineGrid columns={2} gap="400">
              <TextField
                label="Visitors"
                type="number"
                value={String(visitors)}
                min={10}
                max={100000}
                onChange={(value) => setVisitors(Number(value))}
                data-testid="input-visitors"
                disabled={!canSimulate}
                helpText="Number of product page views (split 50/50 between control and variant)"
                autoComplete="off"
              />
              <TextField
                label="Control Conversion Rate (%)"
                type="number"
                value={String(controlConversionRate)}
                min={0}
                max={100}
                step={0.1}
                onChange={(value) => setControlConversionRate(Number(value))}
                data-testid="input-control-conversion-rate"
                disabled={!canSimulate}
                helpText="Control conversion rate (baseline performance)"
                autoComplete="off"
              />
            </InlineGrid>

            <InlineGrid columns={2} gap="400">
              <TextField
                label="Variant Conversion Rate (%)"
                type="number"
                value={String(variantConversionRate)}
                min={0}
                max={100}
                step={0.1}
                onChange={(value) => setVariantConversionRate(Number(value))}
                data-testid="input-variant-conversion-rate"
                disabled={!canSimulate}
                helpText="Variant conversion rate (set higher to simulate lift)"
                autoComplete="off"
              />
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Expected Lift</Text>
                <Box padding="400">
                  <Text as="p" variant="bodySm" fontWeight="semibold" data-testid="text-expected-lift">
                    {controlConversionRate > 0 
                      ? `${(((variantConversionRate - controlConversionRate) / controlConversionRate) * 100).toFixed(1)}%`
                      : '0%'}
                  </Text>
                </Box>
                <Text as="span" variant="bodyXs" tone="subdued">
                  Relative improvement from control to variant
                </Text>
              </BlockStack>
            </InlineGrid>

            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Live Streaming Mode</Text>
                  <Text as="span" variant="bodyXs" tone="subdued">
                    Watch charts update in real-time as the simulation runs
                  </Text>
                </BlockStack>
                <Checkbox
                  label=""
                  checked={liveMode}
                  onChange={(checked) => setLiveMode(checked)}
                  data-testid="toggle-live-mode"
                  disabled={isSimulating}
                />
              </InlineStack>
            </Box>

            {isStreaming && (
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="p" variant="bodySm" tone="subdued">Simulation Progress</Text>
                  <Text as="p" variant="bodySm" fontWeight="semibold">{streamProgress}%</Text>
                </InlineStack>
                <ProgressBar
                  progress={streamProgress}
                  tone="primary"
                  size="small"
                  data-testid="progress-simulation"
                />
                <Text as="span" variant="bodyXs" tone="subdued">
                  Streaming real-time updates...
                </Text>
              </BlockStack>
            )}

            {!selectedOptimizationId && (
              <Banner tone="warning">
                <Text as="p" variant="bodySm">Please select an active optimization above to run simulations</Text>
              </Banner>
            )}

            <Button
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
            </Button>
          </BlockStack>
        </Card>

        <Card data-testid="card-info">
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">How It Works</Text>
            <Divider />
            <BlockStack gap="400">
              <Text as="p" variant="bodySm" tone="subdued">
                <strong>Batch Simulation:</strong> Generates realistic traffic and conversions in one step. 
                Visitors are allocated using the optimization's current Bayesian allocation (Thompson Sampling), and conversions are calculated based on your specified rates.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                <strong>Live Streaming Mode:</strong> Watch the simulation unfold in real-time! Charts update progressively every 100 visitors, 
                letting you see how the Bayesian engine adapts traffic allocation as performance data accumulates. Perfect for understanding Thompson Sampling in action.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                <strong>Evolution Charts:</strong> Track how RPV and traffic allocation change over time as the Bayesian engine learns which variant performs better.
                The x-axis shows impressions (every 100), while the y-axes show RPV and allocation percentages respectively.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                <strong>Allocation Verification:</strong> The simulation uses the optimization's current allocation percentages, 
                adapting dynamically based on performance. Results include detailed breakdowns to confirm proper distribution.
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
