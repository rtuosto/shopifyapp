import AIRecommendationCard from '../AIRecommendationCard';

export default function AIRecommendationCardExample() {
  return (
    <div className="space-y-4 max-w-2xl">
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
  );
}