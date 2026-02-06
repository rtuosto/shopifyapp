import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Page, Card, Text, InlineGrid, BlockStack, InlineStack, Button } from "@shopify/polaris";
import DashboardHeader from "@/components/DashboardHeader";
import MetricCard from "@/components/MetricCard";
import OptimizationHistoryTable from "@/components/OptimizationHistoryTable";
import PerformanceChart from "@/components/PerformanceChart";
import SetupGuide from "@/components/SetupGuide";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Product, Recommendation, Optimization, Metric } from "@shared/schema";

interface SyncStatus {
  syncing: boolean;
  lastSyncTime?: string;
  lastSyncSuccess?: boolean;
  lastSyncError?: string;
  productCount?: number;
}

interface IncrementalMetrics {
  optimizationCount: number;
  incrementalRPV: number;
  incrementalRevenue: number;
  totalRevenue: number;
  incrementalConversions: number;
  totalConversions: number;
}

interface DashboardData {
  totalProducts: number;
  pendingRecommendations: number;
  activeOptimizations: number;
  latestMetric?: Metric;
  syncStatus?: SyncStatus;
  allTimeMetrics: IncrementalMetrics;
  activeMetrics: IncrementalMetrics;
}

interface EnrichedOptimization extends Optimization {
  productName: string;
}

export default function Dashboard() {
  const { toast } = useToast();

  const prevSyncStatusRef = useRef<SyncStatus | undefined>();
  const hasAutoSyncedRef = useRef(false);
  const syncAttemptedRef = useRef(false);

  const syncMutation = useMutation({
    mutationFn: async () => {
      try {
        const res = await apiRequest("POST", "/api/sync/products");
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to sync products");
        }
        return data;
      } catch (error: any) {
        if (error instanceof Response) {
          let errorMessage = `HTTP ${error.status}: Failed to sync products`;
          try {
            const errorData = await error.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            try {
              const errorText = await error.text();
              errorMessage = errorText || errorMessage;
            } catch {}
          }
          throw new Error(errorMessage);
        }
        throw error;
      }
    },
    onSuccess: (data: any) => {
      hasAutoSyncedRef.current = true;
      toast({
        title: "Products Synced",
        description: data.message || `Successfully synced ${data.syncedCount} products`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync products from Shopify. Please try again or reinstall the app if the problem persists.",
        variant: "destructive",
      });
    },
  });

  const createOptimizationMutation = useMutation({
    mutationFn: async ({ recommendationId, productId }: { recommendationId: string; productId: string }) => {
      const recommendation = recommendations.find(r => r.id === recommendationId);
      const product = products.find(p => p.id === productId);
      
      if (!recommendation || !product) {
        throw new Error("Recommendation or product not found");
      }

      const controlData: Record<string, any> = {
        title: product.title,
        description: product.description,
        price: parseFloat(product.price),
      };

      if (recommendation.optimizationType === "price" && product.variants && product.variants.length > 0) {
        controlData.variantPrices = product.variants.map((v: any) => ({
          id: v.id,
          price: v.price,
        }));
      }

      const variantData: Record<string, any> = {
        ...controlData,
        ...recommendation.proposedChanges,
      };

      if (recommendation.optimizationType === "price" && controlData.variantPrices) {
        const priceMultiplier = variantData.price / controlData.price;
        variantData.variantPrices = controlData.variantPrices.map((v: any) => ({
          id: v.id,
          price: (parseFloat(v.price) * priceMultiplier).toFixed(2),
        }));
      }

      const optimizationData = {
        productId: product.id,
        recommendationId: recommendation.id,
        optimizationType: recommendation.optimizationType,
        status: "draft",
        controlData,
        variantData,
        arpu: "0",
        arpuLift: "0",
        impressions: 0,
        conversions: 0,
        revenue: "0",
      };

      const res = await apiRequest("POST", "/api/optimizations", optimizationData);
      return res.json();
    },
    onSuccess: async (data, variables) => {
      await apiRequest("PATCH", `/api/recommendations/${variables.recommendationId}`, { status: "testing" });
      toast({
        title: "Optimization Created",
        description: "Your A/B optimization has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Optimization",
        description: error.message || "Could not create optimization from recommendation",
        variant: "destructive",
      });
    },
  });

  const activateOptimizationMutation = useMutation({
    mutationFn: async (optimizationId: string) => {
      const res = await apiRequest("POST", `/api/optimizations/${optimizationId}/activate`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Optimization Activated",
        description: "Optimization is now live in your Shopify store",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to activate optimization",
        variant: "destructive",
      });
    },
  });

  const deactivateOptimizationMutation = useMutation({
    mutationFn: async (optimizationId: string) => {
      const res = await apiRequest("POST", `/api/optimizations/${optimizationId}/deactivate`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Optimization Deactivated",
        description: "Product reverted to original values",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to deactivate optimization",
        variant: "destructive",
      });
    },
  });

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    refetchInterval: (query) => {
      const data = query.state.data as DashboardData | undefined;
      return data?.syncStatus?.syncing ? 2000 : 30000;
    },
  });

  const { data: quotaData } = useQuery<{
    quota: number;
    used: number;
    remaining: number;
    planTier: string;
    resetDate: string;
  }>({
    queryKey: ["/api/quota"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: recommendations = [] } = useQuery<Recommendation[]>({
    queryKey: ["/api/recommendations"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations?status=pending");
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
  });

  const { data: optimizations = [] } = useQuery<EnrichedOptimization[]>({
    queryKey: ["/api/optimizations"],
  });

  const { data: metricsData = [] } = useQuery<Metric[]>({
    queryKey: ["/api/metrics"],
    queryFn: async () => {
      const res = await fetch("/api/metrics?limit=30");
      if (!res.ok) throw new Error("Failed to fetch metrics");
      return res.json();
    },
  });

  useEffect(() => {
    const currentStatus = dashboardData?.syncStatus;
    const prevStatus = prevSyncStatusRef.current;
    
    if (prevStatus && currentStatus) {
      if (prevStatus.syncing && !currentStatus.syncing && currentStatus.lastSyncSuccess) {
        toast({
          title: "Products Synced",
          description: `Successfully synced ${currentStatus.productCount} products from Shopify`,
        });
      }
      if (prevStatus.syncing && !currentStatus.syncing && currentStatus.lastSyncSuccess === false) {
        toast({
          title: "Sync Failed",
          description: currentStatus.lastSyncError || "Failed to sync products from Shopify",
          variant: "destructive",
        });
      }
    }
    prevSyncStatusRef.current = currentStatus;
  }, [dashboardData?.syncStatus, toast]);

  useEffect(() => {
    if (dashboardData && !hasAutoSyncedRef.current && !syncAttemptedRef.current && !syncMutation.isPending) {
      const hasProducts = dashboardData.totalProducts > 0;
      const isSyncing = dashboardData.syncStatus?.syncing;
      if (!hasProducts && !isSyncing) {
        syncAttemptedRef.current = true;
        syncMutation.mutate();
      }
    }
  }, [dashboardData, syncMutation.isPending]);

  const latestMetric = dashboardData?.latestMetric || metricsData[0];

  const chartData = metricsData
    .slice(0, 30)
    .reverse()
    .map(m => ({
      date: new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: parseFloat(m.revenue),
    }));

  const activeOptimizations = optimizations.filter(t => t.status === 'active');
  const activeOptimizationsCount = dashboardData?.activeOptimizations || activeOptimizations.length;

  const completedOptimizations = optimizations.filter(t => t.status === 'completed');
  const formattedOptimizations = completedOptimizations.map(test => ({
    id: test.id,
    productName: test.productName,
    optimizationType: test.optimizationType,
    status: test.status as "active" | "completed" | "draft",
    arpu: test.arpu ? parseFloat(test.arpu) : 0,
    arpuLift: test.arpuLift ? parseFloat(test.arpuLift) : 0,
    conversions: test.conversions || 0,
    revenue: test.revenue ? parseFloat(test.revenue) : 0,
    startDate: test.startDate ? new Date(test.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not started',
  }));

  const formatIncrementalValue = (value: number, decimals: number = 2): { text: string; className: string } => {
    if (value >= 0) {
      return { text: `+$${value.toFixed(decimals)}`, className: 'text-green-600' };
    } else {
      return { text: `-$${Math.abs(value).toFixed(decimals)}`, className: 'text-red-600' };
    }
  };

  const formatIncrementalConversions = (value: number): { text: string; className: string } => {
    const rounded = Math.round(value);
    if (rounded >= 0) {
      return { text: `+${rounded}`, className: 'text-green-600' };
    } else {
      return { text: `${rounded}`, className: 'text-red-600' };
    }
  };

  return (
    <Page fullWidth>
      <BlockStack gap="400">
      <DashboardHeader 
        activeOptimizations={activeOptimizationsCount} 
        lastSync={(() => {
          const syncStatus = dashboardData?.syncStatus;
          if (syncStatus?.syncing) return "Syncing...";
          if (!syncStatus?.lastSyncTime) return "Never";
          const lastSync = new Date(syncStatus.lastSyncTime);
          const now = new Date();
          const diffMs = now.getTime() - lastSync.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          if (diffMins < 1) return "Just now";
          if (diffMins < 60) return `${diffMins} min ago`;
          const diffHours = Math.floor(diffMins / 60);
          if (diffHours < 24) return `${diffHours}h ago`;
          return lastSync.toLocaleDateString();
        })()}
        quotaUsed={quotaData?.used}
        quotaTotal={quotaData?.quota}
      />
      
      <Card>
        <Text as="h2" variant="headingSm" tone="subdued" data-testid="text-all-time-heading">
          All-Time Performance
        </Text>
        <InlineGrid columns={4} gap="400">
          <MetricCard 
            title="Optimizations Run" 
            value={dashboardData?.allTimeMetrics?.optimizationCount?.toString() || '0'}
            subtitle="total experiments"
          />
          <MetricCard 
            title="Incremental RPV" 
            value={formatIncrementalValue(dashboardData?.allTimeMetrics?.incrementalRPV || 0, 2).text}
            subtitle="avg lift per visitor"
            valueClassName={formatIncrementalValue(dashboardData?.allTimeMetrics?.incrementalRPV || 0, 2).className}
          />
          <MetricCard 
            title="Revenue Impact" 
            value={dashboardData?.allTimeMetrics ? formatIncrementalValue(dashboardData.allTimeMetrics.incrementalRevenue, 0).text : '$0'}
            valueClassName={dashboardData?.allTimeMetrics ? formatIncrementalValue(dashboardData.allTimeMetrics.incrementalRevenue, 0).className : ''}
            subtitle="lift from optimizations"
          />
          <MetricCard 
            title="Conversion Impact" 
            value={dashboardData?.allTimeMetrics ? formatIncrementalConversions(dashboardData.allTimeMetrics.incrementalConversions).text : '0'}
            valueClassName={dashboardData?.allTimeMetrics ? formatIncrementalConversions(dashboardData.allTimeMetrics.incrementalConversions).className : ''}
            subtitle="lift from optimizations"
          />
        </InlineGrid>
      </Card>

      <Card>
        <Text as="h2" variant="headingSm" tone="subdued" data-testid="text-active-heading">
          Currently Active
        </Text>
        <InlineGrid columns={4} gap="400">
          <MetricCard 
            title="Active Optimizations" 
            value={dashboardData?.activeMetrics?.optimizationCount?.toString() || '0'}
            subtitle="running now"
          />
          <MetricCard 
            title="Incremental RPV" 
            value={formatIncrementalValue(dashboardData?.activeMetrics?.incrementalRPV || 0, 2).text}
            subtitle="current lift per visitor"
            valueClassName={formatIncrementalValue(dashboardData?.activeMetrics?.incrementalRPV || 0, 2).className}
          />
          <MetricCard 
            title="Revenue Impact" 
            value={dashboardData?.activeMetrics ? formatIncrementalValue(dashboardData.activeMetrics.incrementalRevenue, 0).text : '$0'}
            valueClassName={dashboardData?.activeMetrics ? formatIncrementalValue(dashboardData.activeMetrics.incrementalRevenue, 0).className : ''}
            subtitle="lift from optimizations"
          />
          <MetricCard 
            title="Conversion Impact" 
            value={dashboardData?.activeMetrics ? formatIncrementalConversions(dashboardData.activeMetrics.incrementalConversions).text : '0'}
            valueClassName={dashboardData?.activeMetrics ? formatIncrementalConversions(dashboardData.activeMetrics.incrementalConversions).className : ''}
            subtitle="lift from optimizations"
          />
        </InlineGrid>
      </Card>

      {activeOptimizationsCount === 0 && completedOptimizations.length === 0 && (
        <SetupGuide />
      )}

      {chartData.length > 0 && (
        <PerformanceChart data={chartData} />
      )}

      {activeOptimizationsCount > 0 && (
        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">Active Optimizations</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                You have {activeOptimizationsCount} optimization{activeOptimizationsCount === 1 ? '' : 's'} running live
              </Text>
            </BlockStack>
            <Link href="/optimizations">
              <Button data-testid="button-view-optimizations">
                View All
              </Button>
            </Link>
          </InlineStack>
        </Card>
      )}

      {formattedOptimizations.length > 0 && (
        <Card>
          <Text as="h2" variant="headingMd">Completed Optimizations</Text>
          <OptimizationHistoryTable 
            optimizations={formattedOptimizations} 
            onStartOptimization={(optimizationId) => activateOptimizationMutation.mutate(optimizationId)}
            onStopOptimization={(optimizationId) => deactivateOptimizationMutation.mutate(optimizationId)}
          />
        </Card>
      )}
      </BlockStack>
    </Page>
  );
}
