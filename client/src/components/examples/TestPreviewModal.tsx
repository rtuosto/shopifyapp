import { useState } from "react";
import TestPreviewModal from '../TestPreviewModal';
import { Button } from "@/components/ui/button";

export default function TestPreviewModalExample() {
  const [open, setOpen] = useState(false);

  //todo: remove mock functionality
  const controlProduct = {
    title: "Wireless Bluetooth Speaker",
    price: 49.99,
    compareAtPrice: 79.99,
    description: "High-quality portable speaker with 12-hour battery life. Perfect for outdoor adventures and home use.",
    images: ["https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&h=800&fit=crop"],
    rating: 4.5,
    reviewCount: 328,
  };

  //todo: remove mock functionality
  const variantProduct = {
    title: "Premium Wireless Bluetooth Speaker - Professional Sound Quality",
    price: 44.99,
    compareAtPrice: 79.99,
    description: "Experience premium audio with our professional-grade portable speaker. Featuring 12-hour extended battery life and premium bass enhancement. Perfect for outdoor adventures, parties, and home entertainment.",
    images: ["https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&h=800&fit=crop"],
    rating: 4.5,
    reviewCount: 328,
  };

  //todo: remove mock functionality
  const insights = [
    {
      type: "psychology" as const,
      title: "Power Words Increase Click-Through",
      description: "Adding 'Premium' and 'Professional' creates perceived value and quality association, proven to increase CTR by 12-18%.",
    },
    {
      type: "competitor" as const,
      title: "Competitive Price Point",
      description: "Price of $44.99 matches top-performing competitors in this category. Psychological pricing below $45 threshold increases conversions.",
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
  ];

  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)} data-testid="button-open-preview">
        Open Test Preview
      </Button>
      
      <TestPreviewModal
        open={open}
        onOpenChange={setOpen}
        testTitle="Product Title & Price Optimization Test"
        control={controlProduct}
        variant={variantProduct}
        changes={["title", "price", "description"]}
        insights={insights}
        confidence={87}
        estimatedLift="+18% CTR, +22% conversions"
        riskLevel="low"
      />
    </div>
  );
}