import OpenAI from "openai";
import { Product } from "@shared/schema";

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

interface BatchProductData extends ProductData {
  id: string;
  margin?: number;
  revenue30d?: number;
  totalSold?: number;
}

interface OptimizationRecommendation {
  title: string;
  description: string;
  testType: "title" | "price" | "description" | "image";
  proposedChanges: Record<string, any>;
  insights: Array<{
    type: "psychology" | "competitor" | "seo" | "data";
    title: string;
    description: string;
  }>;
  impactScore?: number; // 1-10 score for revenue impact (optional for single-product generation)
}

export async function generateOptimizationRecommendations(
  product: ProductData
): Promise<OptimizationRecommendation[]> {
  const prompt = `You are an expert e-commerce conversion rate optimization specialist. Analyze this Shopify product and provide 2-3 specific, actionable optimization recommendations.

Product Details:
- Title: ${product.title}
- Description: ${product.description || 'No description provided'}
- Price: $${product.price}
${product.category ? `- Category: ${product.category}` : ''}

For each recommendation, provide:
1. testType: What to change ("title", "price", "description", or "image")
2. title: A brief title for the recommendation
3. description: Why this change will work
4. proposedChanges: An object containing the ACTUAL new values (e.g., {"title": "new title here"} or {"price": 99.99} or {"description": "new description"})
5. insights: Array of objects with type, title, and description explaining the psychology/SEO/competitive reasoning
6. impactScore: A 1-10 score representing expected revenue impact (1=low impact, 10=transformative)

CRITICAL: 
- The proposedChanges object MUST contain the actual new value(s), not instructions or descriptions
- Always include impactScore based on expected conversion lift and revenue impact

Examples:
- For title change: {"title": "Premium Snowboard - Professional Quality"}
- For price change: {"price": 899.95}
- For description change: {"description": "This premium snowboard features..."}

Focus on:
- Power words and psychological triggers
- SEO optimization
- Price psychology (e.g., charm pricing, prestige pricing)
- Clear value propositions
- Competitive positioning

Return your response as a JSON object with a "recommendations" array.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
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

    // Log GPT response for debugging impact scores
    console.log("[AI Service] Single-product recommendations received:", JSON.stringify(recommendations, null, 2));

    return recommendations.map((rec: any) => ({
      title: rec.title,
      description: rec.description,
      testType: rec.testType || "title",
      proposedChanges: rec.proposedChanges || {},
      insights: rec.insights || [],
      impactScore: rec.impactScore || 5, // Extract impact score from GPT response
    }));
  } catch (error) {
    console.error("Error generating recommendations:", error);
    
    // Fallback recommendations if AI fails
    return [
      {
        title: "Optimize Product Title for SEO",
        description: "Enhance your product title with relevant keywords and power words to improve search visibility and click-through rates.",
        testType: "title",
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
        impactScore: 5, // Default fallback score
      },
    ];
  }
}

/**
 * Generate batch recommendations for store-wide analysis
 * Analyzes multiple products in a single AI call and returns prioritized recommendations
 */
export async function generateBatchRecommendations(
  products: BatchProductData[],
  targetCount: number = 10
): Promise<Array<OptimizationRecommendation & { productId: string }>> {
  const productSummaries = products.map((p, index) => 
    `Product ${index + 1} (ID: ${p.id}):
- Title: ${p.title}
- Price: $${p.price}
- Margin: ${p.margin ? p.margin.toFixed(1) + '%' : 'Unknown'}
- Recent Revenue: $${p.revenue30d || 0}
- Units Sold: ${p.totalSold || 0}
- Description: ${p.description ? (p.description.substring(0, 150) + '...') : 'None'}`
  ).join('\n\n');

  const prompt = `You are an expert e-commerce conversion rate optimization specialist analyzing a Shopify store's product catalog.

You have ${products.length} products to analyze. Your goal is to identify the ${targetCount} HIGHEST-IMPACT optimization opportunities across the entire store.

Product Catalog:
${productSummaries}

Prioritization Criteria:
1. **Revenue Impact**: Products with high margins or sales volumes have bigger impact potential
2. **Quick Wins**: Products with obvious gaps (no description, weak titles) are easy to improve
3. **Hidden Gems**: High-margin products with low sales need better messaging
4. **Top Performers**: Best-sellers with room for improvement can drive major gains

For each of your TOP ${targetCount} recommendations, provide:
1. productId: The ID of the product from the list above (e.g., "ID: abc-123" → use "abc-123")
2. testType: What to change ("title", "price", "description")
3. title: A brief title for the recommendation
4. description: Why this change will work and its expected impact
5. proposedChanges: An object with the ACTUAL new values (not instructions)
6. insights: Array of objects explaining the psychology/SEO/data reasoning
7. impactScore: 1-10 score of expected revenue impact

CRITICAL: 
- Return EXACTLY ${targetCount} recommendations
- Focus on products with highest profit/revenue potential
- proposedChanges must contain actual new values, not descriptions
- Include impactScore (1-10) based on margin × sales × improvement potential

Return your response as a JSON object with a "recommendations" array, sorted by impactScore descending.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert e-commerce optimization AI that analyzes entire product catalogs and identifies the highest-impact optimization opportunities. You always respond with valid JSON and prioritize recommendations by revenue impact.",
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
    const recommendations = Array.isArray(parsed) ? parsed : (parsed.recommendations || []);

    // Log GPT response for debugging impact scores
    console.log("[AI Service] Batch recommendations received:", JSON.stringify({
      count: recommendations.length,
      impactScores: recommendations.map((r: any) => ({ title: r.title, impactScore: r.impactScore }))
    }, null, 2));

    return recommendations.map((rec: any) => ({
      productId: rec.productId,
      title: rec.title,
      description: rec.description,
      testType: rec.testType || "title",
      proposedChanges: rec.proposedChanges || {},
      insights: rec.insights || [],
      impactScore: rec.impactScore || 5, // AI's 1-10 revenue impact score (default to 5 if missing)
    })).slice(0, targetCount); // Ensure we don't exceed target count
  } catch (error) {
    console.error("Error generating batch recommendations:", error);
    
    // Fallback: generate one recommendation per product (up to targetCount)
    return products.slice(0, targetCount).map(product => ({
      productId: product.id,
      title: `Optimize "${product.title}" for Better Conversions`,
      description: "Enhance this product's messaging to improve click-through and conversion rates.",
      testType: "title" as const,
      proposedChanges: {
        title: `Premium ${product.title} - Professional Quality`,
      },
      insights: [
        {
          type: "psychology" as const,
          title: "Power Words",
          description: "Adding 'Premium' and 'Professional' creates perceived value.",
        },
        {
          type: "seo" as const,
          title: "SEO Enhancement",
          description: "Descriptive keywords improve search visibility.",
        },
      ],
      impactScore: 5, // Default middle score for fallback recommendations
    }));
  }
}

