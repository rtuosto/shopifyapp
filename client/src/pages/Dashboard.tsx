import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  // Track automation state to prevent infinite loops
  const prevSyncStatusRef = useRef<SyncStatus | undefined>();
  const hasAutoSyncedRef = useRef(false);
  const syncAttemptedRef = useRef(false);  // Track if we've attempted sync (prevents retry loops)

  // Sync products from Shopify
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
        // apiRequest throws Response object on error, parse it
        if (error instanceof Response) {
          let errorMessage = `HTTP ${error.status}: Failed to sync products`;
          
          // Try to parse error body (JSON or text) exactly once
          try {
            const errorData = await error.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            try {
              const errorText = await error.text();
              errorMessage = errorText || errorMessage;
            } catch {
              // Use default message if both parsing attempts fail
            }
          }
          
          throw new Error(errorMessage);
        }
        // If it's already an Error, rethrow it
        throw error;
      }
    },
    onSuccess: (data: any) => {
      // Set auto-sync flag on success to prevent repeated attempts
      hasAutoSyncedRef.current = true;
      toast({
        title: "Products Synced",
        description: data.message || `Successfully synced ${data.syncedCount} products`,
      });
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      // Keep auto-sync flag false so it can retry on next render
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync products from Shopify. Please try again or reinstall the app if the problem persists.",
        variant: "destructive",
      });
    },
  });

  // Create optimization from recommendation mutation
  const createOptimizationMutation = useMutation({
    mutationFn: async ({ recommendationId, productId }: { recommendationId: string; productId: string }) => {
      const recommendation = recommendations.find(r => r.id === recommendationId);
      const product = products.find(p => p.id === productId);
      
      if (!recommendation || !product) {
        throw new Error("Recommendation or product not found");
      }

      // Build control data (current product state)
      const controlData: Record<string, any> = {
        title: product.title,
        description: product.description,
        price: parseFloat(product.price),
      };

      // For price optimizations, store all variant prices in control and variant data
      if (recommendation.optimizationType === "price" && product.variants && product.variants.length > 0) {
        controlData.variantPrices = product.variants.map((v: any) => ({
          id: v.id,
          price: v.price,
        }));
      }

      // Build variant data (proposed changes)
      const variantData: Record<string, any> = {
        ...controlData,
        ...recommendation.proposedChanges,
      };

      // For price optimizations, calculate proportional price changes for all variants
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
      // Update recommendation status to "testing"
      await apiRequest("PATCH", `/api/recommendations/${variables.recommendationId}`, { status: "testing" });
      
      toast({
        title: "Optimization Created",
        description: "Your A/B optimization has been created successfully",
      });
      
      // Invalidate queries to refresh data
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

  // Activate optimization mutation
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

  // Deactivate optimization mutation
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

  // Fetch dashboard data (poll more frequently if syncing)
  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    refetchInterval: (query) => {
      const data = query.state.data as DashboardData | undefined;
      // Poll every 2 seconds if syncing, otherwise every 30 seconds
      return data?.syncStatus?.syncing ? 2000 : 30000;
    },
  });

  // Fetch quota data
  const { data: quotaData } = useQuery<{
    quota: number;
    used: number;
    remaining: number;
    planTier: string;
    resetDate: string;
  }>({
    queryKey: ["/api/quota"],
  });

  // Fetch products (for preview and auto-generation logic)
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Fetch recommendations
  const { data: recommendations = [] } = useQuery<Recommendation[]>({
    queryKey: ["/api/recommendations"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations?status=pending");
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
  });

  // Fetch optimizations
  const { data: optimizations = [] } = useQuery<EnrichedOptimization[]>({
    queryKey: ["/api/optimizations"],
  });

  // Fetch metrics for chart
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
    
    // Detect sync completion or failure
    if (prevStatus && currentStatus) {
      // Sync just completed successfully
      if (prevStatus.syncing && !currentStatus.syncing && currentStatus.lastSyncSuccess) {
        toast({
          title: "Products Synced",
          description: `Successfully synced ${currentStatus.productCount} products from Shopify`,
        });
      }
      
      // Sync just failed
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

  // Auto-sync products on dashboard load if none exist
  useEffect(() => {
    if (dashboardData && !hasAutoSyncedRef.current && !syncAttemptedRef.current && !syncMutation.isPending) {
      const hasProducts = dashboardData.totalProducts > 0;
      const isSyncing = dashboardData.syncStatus?.syncing;
      
      // Only auto-sync if no products and not already syncing
      // Mark as attempted immediately to prevent retry loops
      // Will be marked as successful in onSuccess if it works
      if (!hasProducts && !isSyncing) {
        syncAttemptedRef.current = true;
        syncMutation.mutate();
      }
    }
  }, [dashboardData, syncMutation.isPending]);

  const latestMetric = dashboardData?.latestMetric || metricsData[0];
  
  // Format chart data
  const chartData = metricsData
    .slice(0, 30)
    .reverse()
    .map(m => ({
      date: new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: parseFloat(m.revenue),
    }));

  // Calculate metrics from latest data and active optimizations
  const activeOptimizations = optimizations.filter(t => t.status === 'active');
  const totalRevenue = activeOptimizations.reduce((sum, t) => sum + parseFloat(t.revenue || "0"), 0);
  const totalConversions = activeOptimizations.reduce((sum, t) => sum + (t.conversions || 0), 0);
  const currentArpu = totalConversions > 0 ? totalRevenue / totalConversions : 0;
  
  const revenueLift = latestMetric?.revenueLift ? '$' + parseFloat(latestMetric.revenueLift).toFixed(0) : '$0';
  const activeOptimizationsCount = dashboardData?.activeOptimizations || activeOptimizations.length;

  // Format optimizations for table - show only completed optimizations on dashboard
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

  // Calculate last sync time
  const getLastSyncText = () => {
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
  };

  // Helper to format incremental values with proper sign and styling
  const formatIncrementalValue = (value: number, decimals: number = 2): { text: string; className: string } => {
    if (value >= 0) {
      return {
        text: `+$${value.toFixed(decimals)}`,
        className: 'text-green-600 dark:text-green-500'
      };
    } else {
      return {
        text: `-$${Math.abs(value).toFixed(decimals)}`,
        className: 'text-red-600 dark:text-red-500'
      };
    }
  };

  // Helper to format incremental conversions with proper sign and styling
  const formatIncrementalConversions = (value: number): { text: string; className: string } => {
    const rounded = Math.round(value);
    if (rounded >= 0) {
      return {
        text: `+${rounded}`,
        className: 'text-green-600 dark:text-green-500'
      };
    } else {
      return {
        text: `${rounded}`, // Negative sign already included
        className: 'text-red-600 dark:text-red-500'
      };
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-full overflow-hidden">
      <DashboardHeader 
        activeOptimizations={activeOptimizationsCount} 
        lastSync={getLastSyncText()}
        quotaUsed={quotaData?.used}
        quotaTotal={quotaData?.quota}
      />
      
      {/* All-Time Performance */}
      <div>
        <h3 className="text-xs md:text-sm font-semibold text-muted-foreground mb-2 md:mb-3" data-testid="text-all-time-heading">
          All-Time Performance
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard 
            title="Optimizations Run" 
            value={dashboardData?.allTimeMetrics?.optimizationCount?.toString() || '0'}
            subtitle="total experiments"
            data-testid="card-all-time-optimizations"
          />
          <MetricCard 
            title="Incremental RPV" 
            value={(() => {
              const irpv = dashboardData?.allTimeMetrics?.incrementalRPV || 0;
              return formatIncrementalValue(irpv, 2).text;
            })()}
            subtitle="avg lift per visitor"
            valueClassName={(() => {
              const irpv = dashboardData?.allTimeMetrics?.incrementalRPV || 0;
              return formatIncrementalValue(irpv, 2).className;
            })()}
            data-testid="card-all-time-irpv"
          />
          <MetricCard 
            title="Revenue Impact" 
            value={(() => {
              if (!dashboardData?.allTimeMetrics) return '$0';
              const { incrementalRevenue } = dashboardData.allTimeMetrics;
              return formatIncrementalValue(incrementalRevenue, 0).text;
            })()}
            valueClassName={(() => {
              if (!dashboardData?.allTimeMetrics) return '';
              const { incrementalRevenue } = dashboardData.allTimeMetrics;
              return formatIncrementalValue(incrementalRevenue, 0).className;
            })()}
            subtitle="lift from optimizations"
            data-testid="card-all-time-revenue"
          />
          <MetricCard 
            title="Conversion Impact" 
            value={(() => {
              if (!dashboardData?.allTimeMetrics) return '0';
              const { incrementalConversions } = dashboardData.allTimeMetrics;
              return formatIncrementalConversions(incrementalConversions).text;
            })()}
            valueClassName={(() => {
              if (!dashboardData?.allTimeMetrics) return '';
              const { incrementalConversions } = dashboardData.allTimeMetrics;
              return formatIncrementalConversions(incrementalConversions).className;
            })()}
            subtitle="lift from optimizations"
            data-testid="card-all-time-conversions"
          />
        </div>
      </div>

      {/* Currently Active */}
      <div>
        <h3 className="text-xs md:text-sm font-semibold text-muted-foreground mb-2 md:mb-3" data-testid="text-active-heading">
          Currently Active
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard 
            title="Active Optimizations" 
            value={dashboardData?.activeMetrics?.optimizationCount?.toString() || '0'}
            subtitle="running now"
            data-testid="card-active-optimizations"
          />
          <MetricCard 
            title="Incremental RPV" 
            value={(() => {
              const irpv = dashboardData?.activeMetrics?.incrementalRPV || 0;
              return formatIncrementalValue(irpv, 2).text;
            })()}
            subtitle="current lift per visitor"
            valueClassName={(() => {
              const irpv = dashboardData?.activeMetrics?.incrementalRPV || 0;
              return formatIncrementalValue(irpv, 2).className;
            })()}
            data-testid="card-active-irpv"
          />
          <MetricCard 
            title="Revenue Impact" 
            value={(() => {
              if (!dashboardData?.activeMetrics) return '$0';
              const { incrementalRevenue } = dashboardData.activeMetrics;
              return formatIncrementalValue(incrementalRevenue, 0).text;
            })()}
            valueClassName={(() => {
              if (!dashboardData?.activeMetrics) return '';
              const { incrementalRevenue } = dashboardData.activeMetrics;
              return formatIncrementalValue(incrementalRevenue, 0).className;
            })()}
            subtitle="lift from optimizations"
            data-testid="card-active-revenue"
          />
          <MetricCard 
            title="Conversion Impact" 
            value={(() => {
              if (!dashboardData?.activeMetrics) return '0';
              const { incrementalConversions } = dashboardData.activeMetrics;
              return formatIncrementalConversions(incrementalConversions).text;
            })()}
            valueClassName={(() => {
              if (!dashboardData?.activeMetrics) return '';
              const { incrementalConversions } = dashboardData.activeMetrics;
              return formatIncrementalConversions(incrementalConversions).className;
            })()}
            subtitle="lift from optimizations"
            data-testid="card-active-conversions"
          />
        </div>
      </div>

      {activeOptimizationsCount === 0 && completedOptimizations.length === 0 && (
        <SetupGuide />
      )}

      {chartData.length > 0 && (
        <PerformanceChart data={chartData} />
      )}

      {activeOptimizationsCount > 0 && (
        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base md:text-lg font-semibold mb-1">Active Optimizations</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  You have {activeOptimizationsCount} optimization{activeOptimizationsCount === 1 ? '' : 's'} running live
                </p>
              </div>
              <Link href="/optimizations">
                <Button variant="outline" size="sm" className="w-full sm:w-auto" data-testid="button-view-optimizations">
                  View All
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {formattedOptimizations.length > 0 && (
        <div>
          <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Completed Optimizations</h2>
          <OptimizationHistoryTable 
            optimizations={formattedOptimizations} 
            onStartOptimization={(optimizationId) => activateOptimizationMutation.mutate(optimizationId)}
            onStopOptimization={(optimizationId) => deactivateOptimizationMutation.mutate(optimizationId)}
          />
        </div>
      )}
    </div>
  );
}