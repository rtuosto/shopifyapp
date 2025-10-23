import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardHeader from "@/components/DashboardHeader";
import MetricCard from "@/components/MetricCard";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import TestHistoryTable from "@/components/TestHistoryTable";
import PerformanceChart from "@/components/PerformanceChart";
import TestPreviewModal from "@/components/TestPreviewModal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Product, Recommendation, Test, Metric } from "@shared/schema";

interface SyncStatus {
  syncing: boolean;
  lastSyncTime?: string;
  lastSyncSuccess?: boolean;
  lastSyncError?: string;
  productCount?: number;
}

interface DashboardData {
  totalProducts: number;
  pendingRecommendations: number;
  activeTests: number;
  latestMetric?: Metric;
  syncStatus?: SyncStatus;
}

interface EnrichedTest extends Test {
  productName: string;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

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
      toast({
        title: "Products Synced",
        description: data.message || `Successfully synced ${data.syncedCount} products`,
      });
      // Invalidate relevant queries to refresh data
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

  // Fetch dashboard data (poll more frequently if syncing)
  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    refetchInterval: (query) => {
      const data = query.state.data as DashboardData | undefined;
      // Poll every 2 seconds if syncing, otherwise every 30 seconds
      return data?.syncStatus?.syncing ? 2000 : 30000;
    },
  });

  // Track previous sync status to detect changes
  const prevSyncStatusRef = useRef<SyncStatus | undefined>();
  
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

  // Fetch recommendations
  const { data: recommendations = [] } = useQuery<Recommendation[]>({
    queryKey: ["/api/recommendations"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations?status=pending");
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
  });

  // Fetch tests
  const { data: tests = [] } = useQuery<EnrichedTest[]>({
    queryKey: ["/api/tests"],
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

  // Fetch products (for preview)
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const handlePreview = async (recommendationId: string) => {
    const recommendation = recommendations.find(r => r.id === recommendationId);
    if (!recommendation) return;

    const product = products.find(p => p.id === recommendation.productId);
    if (!product) return;

    setSelectedRecommendation(recommendation);
    setSelectedProduct(product);
    setPreviewOpen(true);
  };

  const latestMetric = dashboardData?.latestMetric || metricsData[0];
  
  // Format chart data
  const chartData = metricsData
    .slice(0, 30)
    .reverse()
    .map(m => ({
      date: new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: parseFloat(m.revenue),
    }));

  // Calculate metrics from latest data
  const conversionRate = latestMetric?.conversionRate ? parseFloat(latestMetric.conversionRate).toFixed(2) + '%' : '3.42%';
  const avgOrderValue = latestMetric?.avgOrderValue ? '$' + parseFloat(latestMetric.avgOrderValue).toFixed(2) : '$87.50';
  const revenueLift = latestMetric?.revenueLift ? '$' + parseFloat(latestMetric.revenueLift).toFixed(0) : '$12,450';
  const activeTestsCount = dashboardData?.activeTests || tests.filter(t => t.status === 'active').length;

  // Format tests for table
  const formattedTests = tests.map(test => ({
    id: test.id,
    productName: test.productName,
    testType: test.testType,
    status: test.status as "active" | "completed" | "draft",
    performance: test.performance ? parseFloat(test.performance) : 0,
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

  return (
    <div className="space-y-6">
      <DashboardHeader 
        activeTests={activeTestsCount} 
        lastSync={getLastSyncText()}
        onRefresh={() => syncMutation.mutate()}
      />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Conversion Rate" 
          value={conversionRate}
          change={12.5} 
          trend="up"
          subtitle="vs. last 30 days"
        />
        <MetricCard 
          title="Avg Order Value" 
          value={avgOrderValue}
          change={-3.2} 
          trend="down"
          subtitle="vs. last 30 days"
        />
        <MetricCard 
          title="Revenue Lift" 
          value={revenueLift}
          change={24.8} 
          trend="up"
          subtitle="from optimizations"
        />
        <MetricCard 
          title="Active Tests" 
          value={activeTestsCount.toString()}
          subtitle="running now"
        />
      </div>

      {recommendations.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4" data-testid="text-recommendations-heading">
            AI Recommendations
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {recommendations.slice(0, 4).map((rec) => (
              <AIRecommendationCard
                key={rec.id}
                title={rec.title}
                description={rec.description}
                confidence={rec.confidence}
                productName={products.find(p => p.id === rec.productId)?.title || 'Unknown Product'}
                estimatedImpact={rec.estimatedImpact}
                onPreview={() => handlePreview(rec.id)}
              />
            ))}
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <PerformanceChart data={chartData} />
      )}

      {formattedTests.length > 0 && (
        <TestHistoryTable tests={formattedTests} />
      )}

      {selectedRecommendation && selectedProduct && (
        <TestPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          testTitle={selectedRecommendation.title}
          control={{
            title: selectedProduct.title,
            price: parseFloat(selectedProduct.price),
            compareAtPrice: selectedProduct.compareAtPrice ? parseFloat(selectedProduct.compareAtPrice) : undefined,
            description: selectedProduct.description ?? "",
            images: selectedProduct.images,
            rating: selectedProduct.rating ? parseFloat(selectedProduct.rating) : undefined,
            reviewCount: selectedProduct.reviewCount ?? undefined,
          }}
          variant={{
            title: (selectedRecommendation.proposedChanges.title as string | undefined) ?? selectedProduct.title,
            price: selectedRecommendation.proposedChanges.price 
              ? parseFloat(selectedRecommendation.proposedChanges.price as string)
              : parseFloat(selectedProduct.price),
            compareAtPrice: selectedProduct.compareAtPrice ? parseFloat(selectedProduct.compareAtPrice) : undefined,
            description: (selectedRecommendation.proposedChanges.description as string | undefined) ?? selectedProduct.description ?? "",
            images: selectedProduct.images,
            rating: selectedProduct.rating ? parseFloat(selectedProduct.rating) : undefined,
            reviewCount: selectedProduct.reviewCount ?? undefined,
          }}
          changes={Object.keys(selectedRecommendation.proposedChanges)}
          insights={selectedRecommendation.insights}
          confidence={selectedRecommendation.confidence}
          estimatedLift={selectedRecommendation.estimatedImpact}
          riskLevel={selectedRecommendation.riskLevel as "low" | "medium" | "high"}
        />
      )}
    </div>
  );
}