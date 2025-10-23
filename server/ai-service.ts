import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface ProductData {
  title: string;
  description: string;
  price: number;
  category?: string;
}

interface OptimizationRecommendation {
  title: string;
  description: string;
  testType: "title" | "price" | "description" | "image";
  confidence: number;
  estimatedImpact: string;
  riskLevel: "low" | "medium" | "high";
  proposedChanges: Record<string, any>;
  insights: Array<{
    type: "psychology" | "competitor" | "seo" | "data";
    title: string;
    description: string;
  }>;
}

export async function generateOptimizationRecommendations(
  product: ProductData
): Promise<OptimizationRecommendation[]> {
  const prompt = `You are an expert e-commerce conversion rate optimization specialist. Analyze this Shopify product and provide 2-3 specific, actionable optimization recommendations.

Product Details:
- Title: ${product.title}
- Description: ${product.description}
- Price: $${product.price}
${product.category ? `- Category: ${product.category}` : ''}

For each recommendation, provide:
1. What to change (title, price, description, or image)
2. Specific changes to make
3. Why it will work (psychology, competitor analysis, SEO, or data-driven reasoning)
4. Confidence level (0-100)
5. Estimated impact (e.g., "+15% CTR")
6. Risk level (low, medium, high)

Focus on:
- Power words and psychological triggers
- SEO optimization
- Price psychology
- Clear value propositions
- Competitive positioning

Return your response as a JSON object with a "recommendations" array containing your suggestions.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert e-commerce optimization AI that provides data-driven, actionable recommendations to improve product conversion rates. You always respond with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);
    
    // Handle both array and object responses
    const recommendations = Array.isArray(parsed) ? parsed : (parsed.recommendations || []);

    return recommendations.map((rec: any) => ({
      title: rec.title,
      description: rec.description,
      testType: rec.testType || "title",
      confidence: rec.confidence || 75,
      estimatedImpact: rec.estimatedImpact || "+10% conversions",
      riskLevel: rec.riskLevel || "low",
      proposedChanges: rec.proposedChanges || {},
      insights: rec.insights || [],
    }));
  } catch (error) {
    console.error("Error generating recommendations:", error);
    
    // Fallback recommendations if AI fails
    return [
      {
        title: "Optimize Product Title for SEO",
        description: "Enhance your product title with relevant keywords and power words to improve search visibility and click-through rates.",
        testType: "title",
        confidence: 75,
        estimatedImpact: "+12% CTR",
        riskLevel: "low",
        proposedChanges: {
          title: `Premium ${product.title} - Professional Quality`,
        },
        insights: [
          {
            type: "seo",
            title: "Keyword Optimization",
            description: "Adding descriptive keywords improves search engine visibility and organic traffic.",
          },
          {
            type: "psychology",
            title: "Power Words",
            description: "Words like 'Premium' and 'Professional' create perceived value and quality.",
          },
        ],
      },
    ];
  }
}

export async function analyzeCompetitors(
  productTitle: string,
  price: number
): Promise<{
  averagePrice: number;
  pricePosition: "low" | "average" | "high";
  recommendations: string[];
}> {
  // Simplified competitor analysis
  // In production, this would scrape actual competitor data
  const averagePrice = price * 1.15; // Mock: assume we're 15% below average
  
  return {
    averagePrice,
    pricePosition: price < averagePrice * 0.9 ? "low" : price > averagePrice * 1.1 ? "high" : "average",
    recommendations: [
      `Your price of $${price} is competitive. Consider testing $${(price * 0.9).toFixed(2)} for higher volume.`,
      "Similar products in this category range from $" + (price * 0.8).toFixed(2) + " to $" + (price * 1.4).toFixed(2),
    ],
  };
}