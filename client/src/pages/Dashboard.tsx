import DashboardHeader from "@/components/DashboardHeader";
import MetricCard from "@/components/MetricCard";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import TestHistoryTable from "@/components/TestHistoryTable";
import PerformanceChart from "@/components/PerformanceChart";

export default function Dashboard() {
  //todo: remove mock functionality
  const mockChartData = [
    { date: "Oct 1", revenue: 12400 },
    { date: "Oct 5", revenue: 13200 },
    { date: "Oct 10", revenue: 14100 },
    { date: "Oct 15", revenue: 15800 },
    { date: "Oct 20", revenue: 17200 },
    { date: "Oct 23", revenue: 18500 },
  ];

  //todo: remove mock functionality
  const mockTests = [
    {
      id: "1",
      productName: "Wireless Bluetooth Speaker",
      testType: "Title Optimization",
      status: "active" as const,
      performance: 15.4,
      startDate: "Oct 18, 2025",
    },
    {
      id: "2",
      productName: "Smart Fitness Tracker",
      testType: "Price Test",
      status: "completed" as const,
      performance: 22.1,
      startDate: "Oct 15, 2025",
    },
    {
      id: "3",
      productName: "Ergonomic Office Chair",
      testType: "Image Variant",
      status: "active" as const,
      performance: -3.2,
      startDate: "Oct 20, 2025",
    },
    {
      id: "4",
      productName: "LED Desk Lamp",
      testType: "Description A/B Test",
      status: "draft" as const,
      performance: 0,
      startDate: "Oct 22, 2025",
    },
  ];

  return (
    <div className="space-y-6">
      <DashboardHeader activeTests={8} lastSync="5 min ago" />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Conversion Rate" 
          value="3.42%" 
          change={12.5} 
          trend="up"
          subtitle="vs. last 30 days"
        />
        <MetricCard 
          title="Avg Order Value" 
          value="$87.50" 
          change={-3.2} 
          trend="down"
          subtitle="vs. last 30 days"
        />
        <MetricCard 
          title="Revenue Lift" 
          value="$12,450" 
          change={24.8} 
          trend="up"
          subtitle="from optimizations"
        />
        <MetricCard 
          title="Active Tests" 
          value="8" 
          subtitle="running now"
        />
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4" data-testid="text-recommendations-heading">
          AI Recommendations
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AIRecommendationCard
            title="Optimize Product Title for SEO"
            description="Add power words like 'Premium' and 'Professional' to increase click-through rate by emphasizing quality and value proposition."
            confidence={87}
            productName="Wireless Bluetooth Speaker"
            estimatedImpact="+15% CTR"
          />
          <AIRecommendationCard
            title="Test Price Point Optimization"
            description="Reduce price from $49.99 to $44.99 to hit psychological pricing sweet spot. Competitor analysis shows this range performs better."
            confidence={92}
            productName="Smart Fitness Tracker"
            estimatedImpact="+22% conversions"
          />
        </div>
      </div>

      <PerformanceChart data={mockChartData} />

      <TestHistoryTable tests={mockTests} />
    </div>
  );
}