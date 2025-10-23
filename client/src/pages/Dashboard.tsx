import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardHeader from "@/components/DashboardHeader";
import MetricCard from "@/components/MetricCard";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import TestHistoryTable from "@/components/TestHistoryTable";
import PerformanceChart from "@/components/PerformanceChart";
import TestPreviewModal from "@/components/TestPreviewModal";
import type { Product, Recommendation, Test, Metric } from "@shared/schema";

interface DashboardData {
  totalProducts: number;
  pendingRecommendations: number;
  activeTests: number;
  latestMetric?: Metric;
}

interface EnrichedTest extends Test {
  productName: string;
}

export default function Dashboard() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Fetch dashboard data
  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
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

  return (
    <div className="space-y-6">
      <DashboardHeader activeTests={activeTestsCount} lastSync="5 min ago" />
      
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