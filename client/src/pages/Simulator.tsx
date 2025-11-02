import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Play, Zap, CheckCircle2, AlertCircle, Radio } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
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
  
  // Batch simulation parameters
  const [visitors, setVisitors] = useState(1000);
  const [controlConversionRate, setControlConversionRate] = useState(3.0);
  const [variantConversionRate, setVariantConversionRate] = useState(3.5);
  
  // Streaming state
  const [liveMode, setLiveMode] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  
  // Store EventSource instance for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Fetch active optimizations
  const { data: optimizations = [], isLoading: optimizationsLoading } = useQuery<EnrichedOptimization[]>({
    queryKey: ["/api/optimizations"],
    select: (data) => data.filter((t: Optimization) => t.status === "active"),
  });

  // Fetch all products to enrich optimization data
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Enrich optimizations with product names
  const enrichedOptimizations = optimizations.map((optimization) => ({
    ...optimization,
    productName: products.find((p) => p.id === optimization.productId)?.title || "Unknown Product",
  }));

  const selectedOptimization = enrichedOptimizations.find((t) => t.id === selectedOptimizationId);

  // Batch simulation mutation
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

  // Streaming simulation handler using EventSource API for proper SSE
  const startStreamingSimulation = () => {
    if (!selectedOptimizationId) return;
    
    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsStreaming(true);
    setStreamProgress(0);
    setLastSimulationResult(null);

    // Build URL with query parameters (EventSource only supports GET)
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
      
      // EventSource error events don't have data payload
      // Check readyState to determine error type
      if (eventSource.readyState === EventSource.CONNECTING) {
        // Connection lost, will auto-retry
        toast({
          title: "Connection Lost",
          description: "Attempting to reconnect...",
          variant: "destructive",
        });
      } else if (eventSource.readyState === EventSource.CLOSED) {
        // Connection failed, likely server error
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

  // Calculate allocation percentages
  const calculateAllocationPercentage = (control: number, variant: number) => {
    const total = control + variant;
    if (total === 0) return { control: 0, variant: 0 };
    return {
      control: Math.round((control / total) * 100),
      variant: Math.round((variant / total) * 100),
    };
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Optimization Simulator</h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Simulate traffic and conversions to verify A/B optimization allocation and performance tracking
        </p>
      </div>

      {/* Optimization Selection */}
      <Card data-testid="card-optimization-selection">
        <CardHeader>
          <CardTitle>Select Active Optimization</CardTitle>
          <CardDescription>Choose an optimization to simulate traffic and conversions</CardDescription>
        </CardHeader>
        <CardContent>
          {optimizationsLoading ? (
            <div className="text-sm text-muted-foreground">Loading optimizations...</div>
          ) : enrichedOptimizations.length === 0 ? (
            <div className="text-sm text-muted-foreground" data-testid="text-no-optimizations">
              No active optimizations available. Create and activate an optimization from the Dashboard first.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-select">Active Optimization</Label>
                <Select value={selectedOptimizationId} onValueChange={setSelectedOptimizationId}>
                  <SelectTrigger id="test-select" data-testid="select-optimization">
                    <SelectValue placeholder="Select an optimization" />
                  </SelectTrigger>
                  <SelectContent>
                    {enrichedOptimizations.map((optimization) => (
                      <SelectItem key={optimization.id} value={optimization.id} data-testid={`option-optimization-${optimization.id}`}>
                        {optimization.productName} - {optimization.optimizationType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedOptimization && (
                <div className="p-4 bg-muted rounded-lg space-y-2" data-testid="card-optimization-info">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Product:</span>
                    <span className="text-sm font-medium" data-testid="text-product-name">{selectedOptimization.productName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Optimization Type:</span>
                    <span className="text-sm font-medium" data-testid="text-optimization-type">{selectedOptimization.optimizationType}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current Impressions:</span>
                    <span className="text-sm font-medium" data-testid="text-current-impressions">{selectedOptimization.impressions || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current Conversions:</span>
                    <span className="text-sm font-medium" data-testid="text-current-conversions">{selectedOptimization.conversions || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current RPV:</span>
                    <span className="text-sm font-medium" data-testid="text-current-rpv">${selectedOptimization.arpu || "0.00"}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Latest Simulation Results */}
      {lastSimulationResult && (
        <Card data-testid="card-simulation-results">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Simulation Complete</CardTitle>
                <CardDescription>
                  {lastSimulationResult.type.charAt(0).toUpperCase() + lastSimulationResult.type.slice(1)} simulation at {lastSimulationResult.timestamp}
                </CardDescription>
              </div>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Summary */}
              {lastSimulationResult.type === "batch" && lastSimulationResult.variantPerformance && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-100">Data Generation Summary</div>
                  <div className="space-y-1">
                    <div className="text-sm text-blue-700 dark:text-blue-300" data-testid="text-visitors-added">
                      Added {lastSimulationResult.variantPerformance.control.impressions + lastSimulationResult.variantPerformance.variant.impressions} visitors to optimization
                    </div>
                    {selectedOptimization && (
                      <div className="text-sm text-blue-700 dark:text-blue-300" data-testid="text-total-impressions">
                        Optimization now has {selectedOptimization.impressions || 0} total impressions
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Optimization Info */}
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm font-medium mb-1">Optimization Product</div>
                <div className="text-sm text-muted-foreground" data-testid="text-result-optimization-name">
                  {lastSimulationResult.optimizationName}
                </div>
              </div>

              {/* NEW: Batch Simulation Results with Allocation Evolution */}
              {lastSimulationResult.type === "batch" && lastSimulationResult.variantPerformance && (
                <div className="space-y-4">
                  {/* Allocation Evolution */}
                  {lastSimulationResult.allocationBefore && lastSimulationResult.allocationAfter && (
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="text-sm font-medium">Traffic Allocation Evolution</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">Before Simulation</div>
                          <div className="flex gap-2">
                            <div className="flex-1 text-center">
                              <div className="text-lg font-bold" data-testid="text-allocation-before-control">
                                {lastSimulationResult.allocationBefore.control.toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">Control</div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-lg font-bold" data-testid="text-allocation-before-variant">
                                {lastSimulationResult.allocationBefore.variant.toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">Variant</div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">After Simulation</div>
                          <div className="flex gap-2">
                            <div className="flex-1 text-center">
                              <div className="text-lg font-bold" data-testid="text-allocation-after-control">
                                {lastSimulationResult.allocationAfter.control.toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">Control</div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-lg font-bold" data-testid="text-allocation-after-variant">
                                {lastSimulationResult.allocationAfter.variant.toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">Variant</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {Math.abs(lastSimulationResult.allocationAfter.control - lastSimulationResult.allocationBefore.control) > 0.1 ? (
                        <div className="flex items-center gap-2 text-xs text-blue-600">
                          <CheckCircle2 className="w-4 h-4" />
                          Bayesian engine shifted traffic based on performance
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <AlertCircle className="w-4 h-4" />
                          No allocation shift (need more data or similar performance)
                        </div>
                      )}
                    </div>
                  )}

                  {/* Variant Performance Comparison */}
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="text-sm font-medium">Variant Performance</div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="text-xs font-medium text-muted-foreground">Control</div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Impressions:</span>
                            <span className="text-sm font-medium" data-testid="text-control-impressions-new">
                              {lastSimulationResult.variantPerformance.control.impressions}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Conversions:</span>
                            <span className="text-sm font-medium" data-testid="text-control-conversions">
                              {lastSimulationResult.variantPerformance.control.conversions}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Conv. Rate:</span>
                            <span className="text-sm font-medium" data-testid="text-control-cr">
                              {lastSimulationResult.variantPerformance.control.conversionRate}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Revenue:</span>
                            <span className="text-sm font-medium" data-testid="text-control-revenue">
                              ${lastSimulationResult.variantPerformance.control.revenue}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">RPV:</span>
                            <span className="text-sm font-medium" data-testid="text-control-rpv">
                              ${lastSimulationResult.variantPerformance.control.arpu}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="text-xs font-medium text-muted-foreground">Variant</div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Impressions:</span>
                            <span className="text-sm font-medium" data-testid="text-variant-impressions-new">
                              {lastSimulationResult.variantPerformance.variant.impressions}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Conversions:</span>
                            <span className="text-sm font-medium" data-testid="text-variant-conversions">
                              {lastSimulationResult.variantPerformance.variant.conversions}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Conv. Rate:</span>
                            <span className="text-sm font-medium" data-testid="text-variant-cr">
                              {lastSimulationResult.variantPerformance.variant.conversionRate}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">Revenue:</span>
                            <span className="text-sm font-medium" data-testid="text-variant-revenue">
                              ${lastSimulationResult.variantPerformance.variant.revenue}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">RPV:</span>
                            <span className="text-sm font-medium" data-testid="text-variant-rpv">
                              ${lastSimulationResult.variantPerformance.variant.arpu}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bayesian Update Info */}
                  {lastSimulationResult.bayesianUpdate && (
                    <div className="p-4 border rounded-lg space-y-2 bg-blue-50 dark:bg-blue-950">
                      <div className="text-sm font-medium text-blue-900 dark:text-blue-100">Bayesian Engine Update</div>
                      <p className="text-xs text-blue-700 dark:text-blue-300" data-testid="text-bayesian-reasoning">
                        {lastSimulationResult.bayesianUpdate.reasoning}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* OLD: Batch Simulation Results (fallback for old API response) */}
              {lastSimulationResult.type === "batch" && lastSimulationResult.allocation && !lastSimulationResult.variantPerformance && (
                <div className="space-y-3">
                  <div className="font-medium">A/B Optimization Allocation Verification</div>
                  
                  {/* Impressions Allocation */}
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="text-sm font-medium">Traffic Distribution</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Control</div>
                        <div className="text-2xl font-bold" data-testid="text-control-impressions">
                          {lastSimulationResult.allocation.control.impressions}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {calculateAllocationPercentage(
                            lastSimulationResult.allocation.control.impressions || 0,
                            lastSimulationResult.allocation.variant.impressions || 0
                          ).control}% of traffic
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Variant</div>
                        <div className="text-2xl font-bold" data-testid="text-variant-impressions">
                          {lastSimulationResult.allocation.variant.impressions}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {calculateAllocationPercentage(
                            lastSimulationResult.allocation.control.impressions || 0,
                            lastSimulationResult.allocation.variant.impressions || 0
                          ).variant}% of traffic
                        </div>
                      </div>
                    </div>
                    {Math.abs(
                      (lastSimulationResult.allocation.control.impressions || 0) - 
                      (lastSimulationResult.allocation.variant.impressions || 0)
                    ) <= 1 ? (
                      <div className="flex items-center gap-2 text-xs text-green-600" data-testid="text-allocation-status">
                        <CheckCircle2 className="w-4 h-4" />
                        Perfect 50/50 split achieved
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-yellow-600">
                        <AlertCircle className="w-4 h-4" />
                        Minor variance from 50/50 (expected with random allocation)
                      </div>
                    )}
                  </div>

                  {/* Orders Allocation */}
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="text-sm font-medium">Conversion Distribution</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Control</div>
                        <div className="text-2xl font-bold" data-testid="text-control-orders">
                          {lastSimulationResult.allocation.control.orders}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {calculateAllocationPercentage(
                            lastSimulationResult.allocation.control.orders || 0,
                            lastSimulationResult.allocation.variant.orders || 0
                          ).control}% of orders
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Variant</div>
                        <div className="text-2xl font-bold" data-testid="text-variant-orders">
                          {lastSimulationResult.allocation.variant.orders}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {calculateAllocationPercentage(
                            lastSimulationResult.allocation.control.orders || 0,
                            lastSimulationResult.allocation.variant.orders || 0
                          ).variant}% of orders
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Updated Metrics */}
                  {lastSimulationResult.metrics && (
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="text-sm font-medium">Updated Optimization Metrics</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Total Impressions</div>
                          <div className="text-lg font-bold" data-testid="text-total-impressions">
                            {lastSimulationResult.metrics.totalImpressions}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Total Conversions</div>
                          <div className="text-lg font-bold" data-testid="text-total-conversions">
                            {lastSimulationResult.metrics.totalConversions}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Total Revenue</div>
                          <div className="text-lg font-bold" data-testid="text-total-revenue">
                            ${lastSimulationResult.metrics.totalRevenue}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">RPV</div>
                          <div className="text-lg font-bold" data-testid="text-result-rpv">
                            ${lastSimulationResult.metrics.arpu}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Revenue includes ±20% variance per order for realistic simulation
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Simulation - Easy Mode */}
      <Card data-testid="card-batch-simulation">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <CardTitle>Batch Simulation</CardTitle>
          </div>
          <CardDescription>
            Simulate realistic traffic and conversions in one click. Perfect for validating A/B optimization allocation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="visitors">Visitors</Label>
                <Input
                  id="visitors"
                  type="number"
                  value={visitors}
                  onChange={(e) => setVisitors(Number(e.target.value))}
                  min={10}
                  max={100000}
                  data-testid="input-visitors"
                  disabled={!canSimulate}
                />
                <p className="text-xs text-muted-foreground">
                  Number of product page views (split 50/50 between control and variant)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="control-conversion-rate">Control Conversion Rate (%)</Label>
                <Input
                  id="control-conversion-rate"
                  type="number"
                  value={controlConversionRate}
                  onChange={(e) => setControlConversionRate(Number(e.target.value))}
                  min={0}
                  max={100}
                  step={0.1}
                  data-testid="input-control-conversion-rate"
                  disabled={!canSimulate}
                />
                <p className="text-xs text-muted-foreground">
                  Control conversion rate (baseline performance)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variant-conversion-rate">Variant Conversion Rate (%)</Label>
                <Input
                  id="variant-conversion-rate"
                  type="number"
                  value={variantConversionRate}
                  onChange={(e) => setVariantConversionRate(Number(e.target.value))}
                  min={0}
                  max={100}
                  step={0.1}
                  data-testid="input-variant-conversion-rate"
                  disabled={!canSimulate}
                />
                <p className="text-xs text-muted-foreground">
                  Variant conversion rate (set higher to simulate lift)
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Expected Lift</Label>
                <div className="h-10 flex items-center px-3 border rounded-md bg-muted">
                  <span className="text-sm font-medium" data-testid="text-expected-lift">
                    {controlConversionRate > 0 
                      ? `${(((variantConversionRate - controlConversionRate) / controlConversionRate) * 100).toFixed(1)}%`
                      : '0%'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Relative improvement from control to variant
                </p>
              </div>
            </div>

            {/* Live Mode Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-sm font-medium">Live Streaming Mode</div>
                  <div className="text-xs text-muted-foreground">
                    Watch charts update in real-time as the simulation runs
                  </div>
                </div>
              </div>
              <Switch
                checked={liveMode}
                onCheckedChange={setLiveMode}
                data-testid="toggle-live-mode"
                disabled={isSimulating}
              />
            </div>

            {/* Progress Indicator */}
            {isStreaming && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Simulation Progress</span>
                  <span className="font-medium">{streamProgress}%</span>
                </div>
                <Progress value={streamProgress} className="h-2" data-testid="progress-simulation" />
                <p className="text-xs text-muted-foreground text-center">
                  Streaming real-time updates...
                </p>
              </div>
            )}

            {!selectedOptimizationId && (
              <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                Please select an active optimization above to run simulations
              </div>
            )}

            <Button
              onClick={handleRunSimulation}
              disabled={!canSimulate}
              className="w-full gap-2"
              data-testid="button-run-batch"
            >
              {liveMode ? <Radio className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isSimulating 
                ? (liveMode ? `Streaming... ${streamProgress}%` : "Simulating...") 
                : (liveMode ? "Start Live Simulation" : "Run Batch Simulation")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card data-testid="card-info">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Batch Simulation:</strong> Generates realistic traffic and conversions in one step. 
            Visitors are allocated using the optimization's current Bayesian allocation (Thompson Sampling), and conversions are calculated based on your specified rates.
          </p>
          <p>
            <strong>Live Streaming Mode:</strong> Watch the simulation unfold in real-time! Charts update progressively every 100 visitors, 
            letting you see how the Bayesian engine adapts traffic allocation as performance data accumulates. Perfect for understanding Thompson Sampling in action.
          </p>
          <p>
            <strong>Evolution Charts:</strong> Track how RPV and traffic allocation change over time as the Bayesian engine learns which variant performs better.
            The x-axis shows impressions (every 100), while the y-axes show RPV and allocation percentages respectively.
          </p>
          <p>
            <strong>Allocation Verification:</strong> The simulation uses the optimization's current allocation percentages, 
            adapting dynamically based on performance. Results include detailed breakdowns to confirm proper distribution.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
