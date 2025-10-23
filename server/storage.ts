import { 
  type Product, 
  type InsertProduct,
  type Recommendation,
  type InsertRecommendation,
  type Test,
  type InsertTest,
  type Metric,
  type InsertMetric,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Products
  getProduct(id: string): Promise<Product | undefined>;
  getProducts(): Promise<Product[]>;
  getProductByShopifyId(shopifyProductId: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;

  // Recommendations
  getRecommendation(id: string): Promise<Recommendation | undefined>;
  getRecommendations(status?: string): Promise<Recommendation[]>;
  getRecommendationsByProduct(productId: string): Promise<Recommendation[]>;
  createRecommendation(recommendation: InsertRecommendation): Promise<Recommendation>;
  updateRecommendation(id: string, recommendation: Partial<InsertRecommendation>): Promise<Recommendation | undefined>;
  deleteRecommendation(id: string): Promise<boolean>;

  // Tests
  getTest(id: string): Promise<Test | undefined>;
  getTests(status?: string): Promise<Test[]>;
  getTestsByProduct(productId: string): Promise<Test[]>;
  createTest(test: InsertTest): Promise<Test>;
  updateTest(id: string, test: Partial<InsertTest>): Promise<Test | undefined>;
  deleteTest(id: string): Promise<boolean>;

  // Metrics
  getMetrics(limit?: number): Promise<Metric[]>;
  getLatestMetric(): Promise<Metric | undefined>;
  createMetric(metric: InsertMetric): Promise<Metric>;
}

export class MemStorage implements IStorage {
  private products: Map<string, Product>;
  private recommendations: Map<string, Recommendation>;
  private tests: Map<string, Test>;
  private metrics: Map<string, Metric>;

  constructor() {
    this.products = new Map();
    this.recommendations = new Map();
    this.tests = new Map();
    this.metrics = new Map();
    
    // Initialize with sample data
    this.initializeSampleData();
  }

  private initializeSampleData() {
    // Sample products
    const product1: Product = {
      id: randomUUID(),
      shopifyProductId: "shopify-123",
      title: "Wireless Bluetooth Speaker",
      description: "High-quality portable speaker with 12-hour battery life. Perfect for outdoor adventures and home use.",
      price: "49.99",
      compareAtPrice: "79.99",
      images: ["https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&h=800&fit=crop"],
      rating: "4.5",
      reviewCount: 328,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const product2: Product = {
      id: randomUUID(),
      shopifyProductId: "shopify-124",
      title: "Smart Fitness Tracker",
      description: "Track your fitness goals with advanced heart rate monitoring and sleep tracking. Water-resistant design for all activities.",
      price: "49.99",
      compareAtPrice: null,
      images: ["https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=800&h=800&fit=crop"],
      rating: "4.7",
      reviewCount: 512,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.products.set(product1.id, product1);
    this.products.set(product2.id, product2);

    // Sample recommendations
    const rec1: Recommendation = {
      id: randomUUID(),
      productId: product1.id,
      title: "Optimize Product Title for SEO",
      description: "Add power words like 'Premium' and 'Professional' to increase click-through rate by emphasizing quality and value proposition.",
      testType: "title",
      confidence: 87,
      estimatedImpact: "+15% CTR",
      riskLevel: "low",
      proposedChanges: {
        title: "Premium Wireless Bluetooth Speaker - Professional Sound Quality",
        description: "Experience premium audio with our professional-grade portable speaker. Featuring 12-hour extended battery life and premium bass enhancement. Perfect for outdoor adventures, parties, and home entertainment.",
      },
      insights: [
        {
          type: "psychology",
          title: "Power Words Increase Click-Through",
          description: "Adding 'Premium' and 'Professional' creates perceived value and quality association, proven to increase CTR by 12-18%.",
        },
        {
          type: "seo",
          title: "SEO-Optimized Title Length",
          description: "Expanded title includes high-volume keywords while staying within optimal 60-character limit for search visibility.",
        },
        {
          type: "data",
          title: "Enhanced Feature Description",
          description: "Detailed feature callouts increase conversion rates by addressing common customer questions upfront, reducing bounce rate.",
        },
      ],
      status: "pending",
      createdAt: new Date(),
    };

    const rec2: Recommendation = {
      id: randomUUID(),
      productId: product2.id,
      title: "Test Price Point Optimization",
      description: "Reduce price from $49.99 to $44.99 to hit psychological pricing sweet spot. Competitor analysis shows this range performs better.",
      testType: "price",
      confidence: 92,
      estimatedImpact: "+22% conversions",
      riskLevel: "low",
      proposedChanges: {
        price: "44.99",
      },
      insights: [
        {
          type: "psychology",
          title: "Psychological Price Point",
          description: "$44.99 hits the sweet spot below the $45 threshold, making the product feel significantly cheaper while maintaining margin.",
        },
        {
          type: "competitor",
          title: "Competitive Price Analysis",
          description: "This price point matches top-performing competitors. Analysis of 50+ similar products shows 22% higher conversion at this price.",
        },
        {
          type: "data",
          title: "Historical Performance Data",
          description: "Similar price reductions in this category have shown 15-25% lift in conversions with minimal impact on profit margins.",
        },
      ],
      status: "pending",
      createdAt: new Date(),
    };

    this.recommendations.set(rec1.id, rec1);
    this.recommendations.set(rec2.id, rec2);

    // Sample test
    const test1: Test = {
      id: randomUUID(),
      productId: product1.id,
      recommendationId: null,
      testType: "Title Optimization",
      status: "active",
      controlData: { title: product1.title },
      variantData: { title: "Premium Wireless Speaker" },
      performance: "15.4",
      impressions: 1250,
      conversions: 45,
      revenue: "2247.55",
      startDate: new Date("2025-10-18"),
      endDate: null,
      createdAt: new Date("2025-10-18"),
      updatedAt: new Date(),
    };

    this.tests.set(test1.id, test1);

    // Sample metrics
    const dates = ["Oct 1", "Oct 5", "Oct 10", "Oct 15", "Oct 20", "Oct 23"];
    const revenues = [12400, 13200, 14100, 15800, 17200, 18500];
    
    dates.forEach((date, index) => {
      const metric: Metric = {
        id: randomUUID(),
        date: new Date(`2025-${date}`),
        conversionRate: "3.42",
        avgOrderValue: "87.50",
        revenue: revenues[index].toString(),
        revenueLift: index > 0 ? ((revenues[index] - revenues[0]) / revenues[0] * 100).toFixed(2) : "0",
        activeTests: index > 2 ? 8 : 5,
        createdAt: new Date(),
      };
      this.metrics.set(metric.id, metric);
    });
  }

  // Products
  async getProduct(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async getProducts(): Promise<Product[]> {
    return Array.from(this.products.values());
  }

  async getProductByShopifyId(shopifyProductId: string): Promise<Product | undefined> {
    return Array.from(this.products.values()).find(p => p.shopifyProductId === shopifyProductId);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = randomUUID();
    const product: Product = {
      ...insertProduct,
      id,
      description: insertProduct.description || null,
      price: insertProduct.price.toString(),
      compareAtPrice: insertProduct.compareAtPrice?.toString() || null,
      rating: insertProduct.rating?.toString() || null,
      reviewCount: insertProduct.reviewCount || null,
      images: insertProduct.images as string[],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.products.set(id, product);
    return product;
  }

  async updateProduct(id: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const product = this.products.get(id);
    if (!product) return undefined;
    
    const updated: Product = {
      ...product,
      ...updates,
      description: updates.description !== undefined ? updates.description : product.description,
      price: updates.price?.toString() || product.price,
      compareAtPrice: updates.compareAtPrice?.toString() || product.compareAtPrice,
      rating: updates.rating?.toString() || product.rating,
      reviewCount: updates.reviewCount !== undefined ? updates.reviewCount : product.reviewCount,
      images: updates.images ? (updates.images as string[]) : product.images,
      updatedAt: new Date(),
    };
    this.products.set(id, updated);
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  // Recommendations
  async getRecommendation(id: string): Promise<Recommendation | undefined> {
    return this.recommendations.get(id);
  }

  async getRecommendations(status?: string): Promise<Recommendation[]> {
    const all = Array.from(this.recommendations.values());
    if (status) {
      return all.filter(r => r.status === status);
    }
    return all;
  }

  async getRecommendationsByProduct(productId: string): Promise<Recommendation[]> {
    return Array.from(this.recommendations.values()).filter(r => r.productId === productId);
  }

  async createRecommendation(insertRec: InsertRecommendation): Promise<Recommendation> {
    const id = randomUUID();
    const recommendation: Recommendation = {
      ...insertRec,
      id,
      status: insertRec.status || "pending",
      insights: insertRec.insights as Array<{
        type: "psychology" | "competitor" | "seo" | "data";
        title: string;
        description: string;
      }>,
      createdAt: new Date(),
    };
    this.recommendations.set(id, recommendation);
    return recommendation;
  }

  async updateRecommendation(id: string, updates: Partial<InsertRecommendation>): Promise<Recommendation | undefined> {
    const rec = this.recommendations.get(id);
    if (!rec) return undefined;
    
    const updated: Recommendation = { 
      ...rec, 
      ...updates,
      insights: updates.insights ? (updates.insights as Array<{
        type: "psychology" | "competitor" | "seo" | "data";
        title: string;
        description: string;
      }>) : rec.insights,
    };
    this.recommendations.set(id, updated);
    return updated;
  }

  async deleteRecommendation(id: string): Promise<boolean> {
    return this.recommendations.delete(id);
  }

  // Tests
  async getTest(id: string): Promise<Test | undefined> {
    return this.tests.get(id);
  }

  async getTests(status?: string): Promise<Test[]> {
    const all = Array.from(this.tests.values());
    if (status) {
      return all.filter(t => t.status === status);
    }
    return all;
  }

  async getTestsByProduct(productId: string): Promise<Test[]> {
    return Array.from(this.tests.values()).filter(t => t.productId === productId);
  }

  async createTest(insertTest: InsertTest): Promise<Test> {
    const id = randomUUID();
    const test: Test = {
      ...insertTest,
      id,
      status: insertTest.status || "draft",
      performance: insertTest.performance?.toString() || "0",
      revenue: insertTest.revenue?.toString() || "0",
      recommendationId: insertTest.recommendationId || null,
      startDate: insertTest.startDate || null,
      endDate: insertTest.endDate || null,
      impressions: insertTest.impressions || null,
      conversions: insertTest.conversions || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tests.set(id, test);
    return test;
  }

  async updateTest(id: string, updates: Partial<InsertTest>): Promise<Test | undefined> {
    const test = this.tests.get(id);
    if (!test) return undefined;
    
    const updated: Test = {
      ...test,
      ...updates,
      performance: updates.performance?.toString() || test.performance,
      revenue: updates.revenue?.toString() || test.revenue,
      updatedAt: new Date(),
    };
    this.tests.set(id, updated);
    return updated;
  }

  async deleteTest(id: string): Promise<boolean> {
    return this.tests.delete(id);
  }

  // Metrics
  async getMetrics(limit?: number): Promise<Metric[]> {
    const all = Array.from(this.metrics.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return limit ? all.slice(0, limit) : all;
  }

  async getLatestMetric(): Promise<Metric | undefined> {
    const metrics = await this.getMetrics(1);
    return metrics[0];
  }

  async createMetric(insertMetric: InsertMetric): Promise<Metric> {
    const id = randomUUID();
    const metric: Metric = {
      ...insertMetric,
      id,
      conversionRate: insertMetric.conversionRate.toString(),
      avgOrderValue: insertMetric.avgOrderValue.toString(),
      revenue: insertMetric.revenue.toString(),
      revenueLift: insertMetric.revenueLift?.toString() || "0",
      createdAt: new Date(),
    };
    this.metrics.set(id, metric);
    return metric;
  }
}

export const storage = new MemStorage();