import { useState } from "react";
import DashboardHeader from "@/components/DashboardHeader";
import MetricCard from "@/components/MetricCard";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import TestHistoryTable from "@/components/TestHistoryTable";
import PerformanceChart from "@/components/PerformanceChart";
import TestPreviewModal from "@/components/TestPreviewModal";

export default function Dashboard() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<"title" | "price" | null>(null);

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

  //todo: remove mock functionality
  const titleTestData = {
    control: {
      title: "Wireless Bluetooth Speaker",
      price: 49.99,
      compareAtPrice: 79.99,
      description: "High-quality portable speaker with 12-hour battery life. Perfect for outdoor adventures and home use.",
      images: ["https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&h=800&fit=crop"],
      rating: 4.5,
      reviewCount: 328,
    },
    variant: {
      title: "Premium Wireless Bluetooth Speaker - Professional Sound Quality",
      price: 49.99,
      compareAtPrice: 79.99,
      description: "Experience premium audio with our professional-grade portable speaker. Featuring 12-hour extended battery life and premium bass enhancement. Perfect for outdoor adventures, parties, and home entertainment.",
      images: ["https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&h=800&fit=crop"],
      rating: 4.5,
      reviewCount: 328,
    },
    insights: [
      {
        type: "psychology" as const,
        title: "Power Words Increase Click-Through",
        description: "Adding 'Premium' and 'Professional' creates perceived value and quality association, proven to increase CTR by 12-18%.",
      },
      {
        type: "seo" as const,
        title: "SEO-Optimized Title Length",
        description: "Expanded title includes high-volume keywords while staying within optimal 60-character limit for search visibility.",
      },
      {
        type: "data" as const,
        title: "Enhanced Feature Description",
        description: "Detailed feature callouts increase conversion rates by addressing common customer questions upfront, reducing bounce rate.",
      },
    ],
  };

  //todo: remove mock functionality
  const priceTestData = {
    control: {
      title: "Smart Fitness Tracker",
      price: 49.99,
      description: "Track your fitness goals with advanced heart rate monitoring and sleep tracking. Water-resistant design for all activities.",
      images: ["https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=800&h=800&fit=crop"],
      rating: 4.7,
      reviewCount: 512,
    },
    variant: {
      title: "Smart Fitness Tracker",
      price: 44.99,
      description: "Track your fitness goals with advanced heart rate monitoring and sleep tracking. Water-resistant design for all activities.",
      images: ["https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=800&h=800&fit=crop"],
      rating: 4.7,
      reviewCount: 512,
    },
    insights: [
      {
        type: "psychology" as const,
        title: "Psychological Price Point",
        description: "$44.99 hits the sweet spot below the $45 threshold, making the product feel significantly cheaper while maintaining margin.",
      },
      {
        type: "competitor" as const,
        title: "Competitive Price Analysis",
        description: "This price point matches top-performing competitors. Analysis of 50+ similar products shows 22% higher conversion at this price.",
      },
      {
        type: "data" as const,
        title: "Historical Performance Data",
        description: "Similar price reductions in this category have shown 15-25% lift in conversions with minimal impact on profit margins.",
      },
    ],
  };

  const handlePreview = (testType: "title" | "price") => {
    setSelectedTest(testType);
    setPreviewOpen(true);
  };

  const getCurrentTestData = () => {
    return selectedTest === "title" ? titleTestData : priceTestData;
  };

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
            onPreview={() => handlePreview("title")}
          />
          <AIRecommendationCard
            title="Test Price Point Optimization"
            description="Reduce price from $49.99 to $44.99 to hit psychological pricing sweet spot. Competitor analysis shows this range performs better."
            confidence={92}
            productName="Smart Fitness Tracker"
            estimatedImpact="+22% conversions"
            onPreview={() => handlePreview("price")}
          />
        </div>
      </div>

      <PerformanceChart data={mockChartData} />

      <TestHistoryTable tests={mockTests} />

      {selectedTest && (
        <TestPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          testTitle={selectedTest === "title" ? "Product Title & Description Optimization" : "Price Point Optimization Test"}
          control={getCurrentTestData().control}
          variant={getCurrentTestData().variant}
          changes={selectedTest === "title" ? ["title", "description"] : ["price"]}
          insights={getCurrentTestData().insights}
          confidence={selectedTest === "title" ? 87 : 92}
          estimatedLift={selectedTest === "title" ? "+15% CTR, +18% conversions" : "+22% conversions"}
          riskLevel="low"
        />
      )}
    </div>
  );
}