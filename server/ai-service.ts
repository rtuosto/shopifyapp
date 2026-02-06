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
  variants?: Array<{
    id: string;
    price: string;
    title?: string;
  }>;
  images?: string[];
  variantCount?: number;
  imageCount?: number;
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
  optimizationType: "title" | "price" | "description" | "image";
  proposedChanges: Record<string, any>;
  insights: Array<{
    type: "psychology" | "competitor" | "seo" | "data";
    title: string;
    description: string;
  }>;
  impactScore?: number;
}

const ANTI_HALLUCINATION_RULES = `
STRICT ANTI-HALLUCINATION RULES — VIOLATION OF THESE WILL RENDER THE RECOMMENDATION UNUSABLE:
1. You may ONLY reference facts explicitly provided in the Product Details above.
2. NEVER invent, assume, or imply product specifications (materials, dimensions, weight, technical details, features, ingredients, compatibility).
3. NEVER invent warranty terms, return policies, shipping details, or guarantees.
4. NEVER invent variant details (sizes, colors, SKUs) unless explicitly listed above.
5. NEVER fabricate customer reviews, ratings, testimonials, or sales figures.
6. NEVER invent competitor names, competitor prices, or market data.
7. For DESCRIPTION recommendations: propose a structural outline and tone — use "[insert specific details]" placeholders where the merchant needs to add their own product facts. Do NOT write fictional product specs.
8. For TITLE recommendations: only rearrange, rephrase, or add general power words to the existing title. Do NOT add claims about the product you cannot verify.
9. For PRICE recommendations: base suggestions only on the actual current price. Do NOT reference imaginary competitor pricing or market research.
10. The "description" field (your reasoning) must explain your STRATEGY and WHY it works — not repeat invented product details.

GOOD example of a description recommendation proposedChanges:
{"description": "Introducing the [Product Name]\\n\\nKey Benefits:\\n• [Insert primary benefit]\\n• [Insert secondary benefit]\\n• [Insert unique selling point]\\n\\nSpecifications:\\n• [Insert material/specs]\\n• [Insert dimensions/size]\\n\\nOrder with confidence — [insert your return/warranty policy]."}

BAD example (invents specs):
{"description": "This premium carbon fiber snowboard features a 158cm camber profile with sintered base technology and a 2-year warranty..."}
`;

export async function generateOptimizationRecommendations(
  product: ProductData
): Promise<OptimizationRecommendation[]> {
  const prompt = `Analyze this Shopify product and provide 2-3 specific, actionable optimization recommendations.

Product Details:
- Title: ${product.title}
- Current Description: ${product.description || 'No description provided'}
- Price: $${product.price}
${product.category ? `- Category: ${product.category}` : ''}
${product.variantCount ? `- Number of Variants: ${product.variantCount}` : ''}
${product.imageCount ? `- Number of Images: ${product.imageCount}` : ''}

${ANTI_HALLUCINATION_RULES}

For each recommendation, provide:
1. optimizationType: What to change ("title", "price", or "description")
2. title: A brief, actionable title for the recommendation (e.g., "Add benefit-driven keywords to title")
3. description: A concise explanation of your STRATEGY and why it improves conversions. Keep this focused on the approach, not on invented product details.
4. proposedChanges: An object containing the proposed new value:
   - For title: {"title": "Your Proposed New Title Here"}
   - For price: {"price": 99.99}
   - For description: {"description": "A structured template with [placeholder] markers where the merchant inserts their own facts"}
5. insights: Array of 1-2 objects with type ("psychology"|"seo"|"data"), title, and description explaining the reasoning
6. impactScore: 1-10 score of expected revenue impact

Focus on:
- Structural improvements (better layout, scannable formatting, clear hierarchy)
- Power words and psychological triggers based on the EXISTING title/description
- SEO keyword positioning using words already present or obviously relevant to the product category
- Price psychology (charm pricing, anchoring) based on the ACTUAL listed price
- Clarity and value proposition improvements

Return a JSON object with a "recommendations" array.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert e-commerce conversion rate optimization specialist. You give strategic advice on how to improve product listings. You NEVER invent product specifications, policies, or details that were not provided to you. You always respond with valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);
    const recommendations = Array.isArray(parsed) ? parsed : (parsed.recommendations || []);

    console.log("[AI Service] Single-product recommendations received:", JSON.stringify(recommendations, null, 2));

    return recommendations.map((rec: any) => ({
      title: rec.title,
      description: rec.description,
      optimizationType: rec.optimizationType || "title",
      proposedChanges: rec.proposedChanges || {},
      insights: rec.insights || [],
      impactScore: rec.impactScore || 5,
    }));
  } catch (error) {
    console.error("Error generating recommendations:", error);
    
    return [
      {
        title: "Optimize Product Title for SEO",
        description: "Restructure the title to lead with high-intent keywords, improving search visibility and click-through rates.",
        optimizationType: "title",
        proposedChanges: {
          title: `${product.title} — Premium Quality`,
        },
        insights: [
          {
            type: "seo",
            title: "Keyword Positioning",
            description: "Leading with descriptive keywords improves search engine visibility and organic traffic.",
          },
          {
            type: "psychology",
            title: "Value Signaling",
            description: "Appending quality descriptors reinforces perceived value without inventing product claims.",
          },
        ],
        impactScore: 5,
      },
    ];
  }
}

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

  const prompt = `Analyze this Shopify store's product catalog and identify the ${targetCount} HIGHEST-IMPACT optimization opportunities.

Product Catalog:
${productSummaries}

${ANTI_HALLUCINATION_RULES}

Prioritization Criteria:
1. Revenue Impact: Products with high margins or sales volumes benefit most from optimization
2. Quick Wins: Products with missing descriptions or weak titles are easy to improve
3. Hidden Gems: High-margin products with low sales need better messaging
4. Top Performers: Best-sellers with room for improvement can drive major gains

For each of your TOP ${targetCount} recommendations, provide:
1. productId: The exact ID from the product list above
2. optimizationType: What to change ("title", "price", or "description")
3. title: A brief, actionable title for the recommendation
4. description: A concise explanation of your STRATEGY and why it will improve conversions. Focus on the approach (e.g., "restructure title to lead with category keyword"), not on invented product details.
5. proposedChanges: An object with the proposed new value:
   - For title: {"title": "Your Proposed New Title"}
   - For price: {"price": 99.99}
   - For description: {"description": "Structured template with [placeholder] markers for merchant-specific facts"}
6. insights: Array of 1-2 objects with type ("psychology"|"seo"|"data"), title, and description
7. impactScore: 1-10 score based on margin x sales x improvement potential

CRITICAL:
- Return EXACTLY ${targetCount} recommendations
- Focus on products with highest profit/revenue potential
- NEVER invent product features, specs, materials, policies, or any facts not provided above

Return a JSON object with a "recommendations" array, sorted by impactScore descending.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert e-commerce optimization specialist analyzing product catalogs. You identify high-impact optimization opportunities based ONLY on the data provided. You NEVER invent product specifications, policies, or details. You always respond with valid JSON and prioritize by revenue impact.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);
    const recommendations = Array.isArray(parsed) ? parsed : (parsed.recommendations || []);

    console.log("[AI Service] Batch recommendations received:", JSON.stringify({
      count: recommendations.length,
      impactScores: recommendations.map((r: any) => ({ title: r.title, impactScore: r.impactScore }))
    }, null, 2));

    return recommendations.map((rec: any) => ({
      productId: rec.productId,
      title: rec.title,
      description: rec.description,
      optimizationType: rec.optimizationType || "title",
      proposedChanges: rec.proposedChanges || {},
      insights: rec.insights || [],
      impactScore: rec.impactScore || 5,
    })).slice(0, targetCount);
  } catch (error) {
    console.error("Error generating batch recommendations:", error);
    
    return products.slice(0, targetCount).map(product => ({
      productId: product.id,
      title: `Optimize "${product.title}" for Better Conversions`,
      description: "Restructure this product's title and messaging to improve search visibility and click-through rates.",
      optimizationType: "title" as const,
      proposedChanges: {
        title: `${product.title} — Premium Quality`,
      },
      insights: [
        {
          type: "psychology" as const,
          title: "Value Signaling",
          description: "Clear value language reinforces perceived quality.",
        },
        {
          type: "seo" as const,
          title: "SEO Enhancement",
          description: "Descriptive keywords improve search visibility.",
        },
      ],
      impactScore: 5,
    }));
  }
}
