import { 
  type Product, 
  type InsertProduct,
  type Recommendation,
  type InsertRecommendation,
  type Test,
  type InsertTest,
  type Metric,
  type InsertMetric,
  type SessionAssignment,
  type InsertSessionAssignment,
  type TestImpression,
  type InsertTestImpression,
  type TestConversion,
  type InsertTestConversion,
  type TestEvolutionSnapshot,
  type InsertTestEvolutionSnapshot,
  type Shop,
  type InsertShop,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Shops (quota tracking)
  getShop(shop: string): Promise<Shop | undefined>;
  createOrUpdateShop(shop: string, data: Partial<InsertShop>): Promise<Shop>;
  incrementQuota(shop: string, amount: number): Promise<Shop | undefined>;

  // Products (shop-scoped)
  getProduct(shop: string, id: string): Promise<Product | undefined>;
  getProducts(shop: string): Promise<Product[]>;
  getProductByShopifyId(shop: string, shopifyProductId: string): Promise<Product | undefined>;
  createProduct(shop: string, product: InsertProduct): Promise<Product>;
  updateProduct(shop: string, id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(shop: string, id: string): Promise<boolean>;

  // Recommendations (shop-scoped)
  getRecommendation(shop: string, id: string): Promise<Recommendation | undefined>;
  getRecommendations(shop: string, status?: string): Promise<Recommendation[]>;
  getRecommendationsByProduct(shop: string, productId: string): Promise<Recommendation[]>;
  createRecommendation(shop: string, recommendation: InsertRecommendation): Promise<Recommendation>;
  updateRecommendation(shop: string, id: string, recommendation: Partial<InsertRecommendation>): Promise<Recommendation | undefined>;
  deleteRecommendation(shop: string, id: string): Promise<boolean>;

  // Tests (shop-scoped)
  getTest(shop: string, id: string): Promise<Test | undefined>;
  getTests(shop: string, status?: string): Promise<Test[]>;
  getTestsByProduct(shop: string, productId: string): Promise<Test[]>;
  getActiveTestsByProduct(shop: string, productId: string, testType?: string): Promise<Test[]>;
  createTest(shop: string, test: InsertTest): Promise<Test>;
  updateTest(shop: string, id: string, test: Partial<InsertTest>): Promise<Test | undefined>;
  deleteTest(shop: string, id: string): Promise<boolean>;

  // Metrics (shop-scoped)
  getMetrics(shop: string, limit?: number): Promise<Metric[]>;
  getLatestMetric(shop: string): Promise<Metric | undefined>;
  createMetric(shop: string, metric: InsertMetric): Promise<Metric>;

  // Session Assignments (shop-scoped)
  getSessionAssignments(shop: string, sessionId: string): Promise<SessionAssignment[]>;
  createSessionAssignment(shop: string, assignment: InsertSessionAssignment): Promise<SessionAssignment>;
  
  // Test Impressions (tracking individual impression events)
  createTestImpression(impression: InsertTestImpression): Promise<TestImpression>;
  createTestImpressionsBulk(impressions: InsertTestImpression[]): Promise<void>;
  
  // Test Conversions (tracking individual conversion events)
  createTestConversion(conversion: InsertTestConversion): Promise<TestConversion>;
  createTestConversionsBulk(conversions: InsertTestConversion[]): Promise<void>;
  
  // Test Evolution Snapshots (periodic metric snapshots for charts)
  getTestEvolutionSnapshots(testId: string): Promise<TestEvolutionSnapshot[]>;
  createTestEvolutionSnapshot(snapshot: InsertTestEvolutionSnapshot): Promise<TestEvolutionSnapshot>;
  createTestEvolutionSnapshotsBulk(snapshots: InsertTestEvolutionSnapshot[]): Promise<void>;
}

export class MemStorage implements IStorage {
  // Shop-scoped storage: Map<shop, Map<id, entity>>
  private shops: Map<string, Shop>;
  private products: Map<string, Map<string, Product>>;
  private recommendations: Map<string, Map<string, Recommendation>>;
  private tests: Map<string, Map<string, Test>>;
  private metrics: Map<string, Map<string, Metric>>;
  private sessionAssignments: Map<string, Map<string, SessionAssignment>>;

  constructor() {
    this.shops = new Map();
    this.products = new Map();
    this.recommendations = new Map();
    this.tests = new Map();
    this.metrics = new Map();
    this.sessionAssignments = new Map();
  }
  
  // Helper to ensure shop namespace exists
  private ensureShopNamespace<T>(map: Map<string, Map<string, T>>, shop: string): Map<string, T> {
    if (!map.has(shop)) {
      map.set(shop, new Map());
    }
    return map.get(shop)!;
  }

  // Shops (quota tracking)
  async getShop(shop: string): Promise<Shop | undefined> {
    return this.shops.get(shop);
  }

  async createOrUpdateShop(shop: string, data: Partial<InsertShop>): Promise<Shop> {
    const existing = this.shops.get(shop);
    const shopData: Shop = {
      shop,
      planTier: data.planTier || existing?.planTier || "basic",
      recommendationQuota: data.recommendationQuota ?? existing?.recommendationQuota ?? 20,
      recommendationsUsed: data.recommendationsUsed ?? existing?.recommendationsUsed ?? 0,
      quotaResetDate: data.quotaResetDate || existing?.quotaResetDate || new Date(),
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    this.shops.set(shop, shopData);
    return shopData;
  }

  async incrementQuota(shop: string, amount: number): Promise<Shop | undefined> {
    const existing = this.shops.get(shop);
    if (!existing) return undefined;
    
    const updated: Shop = {
      ...existing,
      recommendationsUsed: existing.recommendationsUsed + amount,
      updatedAt: new Date(),
    };
    this.shops.set(shop, updated);
    return updated;
  }

  private initializeSampleData(shop: string) {
    // Ensure namespaces exist
    const products = this.ensureShopNamespace(this.products, shop);
    const recommendations = this.ensureShopNamespace(this.recommendations, shop);
    const tests = this.ensureShopNamespace(this.tests, shop);
    const metrics = this.ensureShopNamespace(this.metrics, shop);
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

    products.set(product1.id, product1);
    products.set(product2.id, product2);

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

    recommendations.set(rec1.id, rec1);
    recommendations.set(rec2.id, rec2);

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

    tests.set(test1.id, test1);

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
      metrics.set(metric.id, metric);
    });
  }

  // Products (shop-scoped)
  async getProduct(shop: string, id: string): Promise<Product | undefined> {
    const shopProducts = this.ensureShopNamespace(this.products, shop);
    return shopProducts.get(id);
  }

  async getProducts(shop: string): Promise<Product[]> {
    const shopProducts = this.ensureShopNamespace(this.products, shop);
    return Array.from(shopProducts.values());
  }

  async getProductByShopifyId(shop: string, shopifyProductId: string): Promise<Product | undefined> {
    const shopProducts = this.ensureShopNamespace(this.products, shop);
    return Array.from(shopProducts.values()).find(p => p.shopifyProductId === shopifyProductId);
  }

  async createProduct(shop: string, insertProduct: InsertProduct): Promise<Product> {
    const shopProducts = this.ensureShopNamespace(this.products, shop);
    const id = insertProduct.id || randomUUID();
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
    shopProducts.set(id, product);
    return product;
  }

  async updateProduct(shop: string, id: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const shopProducts = this.ensureShopNamespace(this.products, shop);
    const product = shopProducts.get(id);
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
    shopProducts.set(id, updated);
    return updated;
  }

  async deleteProduct(shop: string, id: string): Promise<boolean> {
    const shopProducts = this.ensureShopNamespace(this.products, shop);
    return shopProducts.delete(id);
  }

  // Recommendations (shop-scoped)
  async getRecommendation(shop: string, id: string): Promise<Recommendation | undefined> {
    const shopRecommendations = this.ensureShopNamespace(this.recommendations, shop);
    return shopRecommendations.get(id);
  }

  async getRecommendations(shop: string, status?: string): Promise<Recommendation[]> {
    const shopRecommendations = this.ensureShopNamespace(this.recommendations, shop);
    const all = Array.from(shopRecommendations.values());
    if (status) {
      return all.filter(r => r.status === status);
    }
    return all;
  }

  async getRecommendationsByProduct(shop: string, productId: string): Promise<Recommendation[]> {
    const shopRecommendations = this.ensureShopNamespace(this.recommendations, shop);
    return Array.from(shopRecommendations.values()).filter(r => r.productId === productId);
  }

  async createRecommendation(shop: string, insertRec: InsertRecommendation): Promise<Recommendation> {
    const shopRecommendations = this.ensureShopNamespace(this.recommendations, shop);
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
    shopRecommendations.set(id, recommendation);
    return recommendation;
  }

  async updateRecommendation(shop: string, id: string, updates: Partial<InsertRecommendation>): Promise<Recommendation | undefined> {
    const shopRecommendations = this.ensureShopNamespace(this.recommendations, shop);
    const rec = shopRecommendations.get(id);
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
    shopRecommendations.set(id, updated);
    return updated;
  }

  async deleteRecommendation(shop: string, id: string): Promise<boolean> {
    const shopRecommendations = this.ensureShopNamespace(this.recommendations, shop);
    return shopRecommendations.delete(id);
  }

  // Tests (shop-scoped)
  async getTest(shop: string, id: string): Promise<Test | undefined> {
    const shopTests = this.ensureShopNamespace(this.tests, shop);
    return shopTests.get(id);
  }

  async getTests(shop: string, status?: string): Promise<Test[]> {
    const shopTests = this.ensureShopNamespace(this.tests, shop);
    const all = Array.from(shopTests.values());
    if (status) {
      return all.filter(t => t.status === status);
    }
    return all;
  }

  async getTestsByProduct(shop: string, productId: string): Promise<Test[]> {
    const shopTests = this.ensureShopNamespace(this.tests, shop);
    return Array.from(shopTests.values()).filter(t => t.productId === productId);
  }

  async getActiveTestsByProduct(shop: string, productId: string, testType?: string): Promise<Test[]> {
    const shopTests = this.ensureShopNamespace(this.tests, shop);
    return Array.from(shopTests.values()).filter(t => 
      t.productId === productId && 
      t.status === 'active' &&
      (!testType || t.testType === testType)
    );
  }

  async createTest(shop: string, insertTest: InsertTest): Promise<Test> {
    const shopTests = this.ensureShopNamespace(this.tests, shop);
    const id = insertTest.id || randomUUID();
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
    shopTests.set(id, test);
    return test;
  }

  async updateTest(shop: string, id: string, updates: Partial<InsertTest>): Promise<Test | undefined> {
    const shopTests = this.ensureShopNamespace(this.tests, shop);
    const test = shopTests.get(id);
    if (!test) return undefined;
    
    const updated: Test = {
      ...test,
      ...updates,
      updatedAt: new Date(),
    };
    shopTests.set(id, updated);
    return updated;
  }

  async deleteTest(shop: string, id: string): Promise<boolean> {
    const shopTests = this.ensureShopNamespace(this.tests, shop);
    return shopTests.delete(id);
  }

  // Metrics (shop-scoped)
  async getMetrics(shop: string, limit?: number): Promise<Metric[]> {
    const shopMetrics = this.ensureShopNamespace(this.metrics, shop);
    const all = Array.from(shopMetrics.values()).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return limit ? all.slice(0, limit) : all;
  }

  async getLatestMetric(shop: string): Promise<Metric | undefined> {
    const metrics = await this.getMetrics(shop, 1);
    return metrics[0];
  }

  async createMetric(shop: string, insertMetric: InsertMetric): Promise<Metric> {
    const shopMetrics = this.ensureShopNamespace(this.metrics, shop);
    const id = randomUUID();
    const metric: Metric = {
      ...insertMetric,
      id,
      conversionRate: insertMetric.conversionRate.toString(),
      avgOrderValue: insertMetric.avgOrderValue.toString(),
      revenue: insertMetric.revenue.toString(),
      revenueLift: insertMetric.revenueLift?.toString() || "0",
      activeTests: insertMetric.activeTests || null,
      createdAt: new Date(),
    };
    shopMetrics.set(id, metric);
    return metric;
  }

  // Session Assignments (shop-scoped)
  async getSessionAssignments(shop: string, sessionId: string): Promise<SessionAssignment[]> {
    const shopAssignments = this.ensureShopNamespace(this.sessionAssignments, shop);
    return Array.from(shopAssignments.values())
      .filter(assignment => assignment.sessionId === sessionId);
  }

  async createSessionAssignment(shop: string, insertAssignment: InsertSessionAssignment): Promise<SessionAssignment> {
    const shopAssignments = this.ensureShopNamespace(this.sessionAssignments, shop);
    const id = randomUUID();
    const assignment: SessionAssignment = {
      ...insertAssignment,
      id,
      assignedAt: new Date(),
    };
    shopAssignments.set(id, assignment);
    return assignment;
  }

  // Test Impressions (not persisted in MemStorage - for dev only)
  async createTestImpression(impression: InsertTestImpression): Promise<TestImpression> {
    console.warn("[MemStorage] Test impressions not persisted in memory - upgrade to DbStorage");
    return {
      ...impression,
      id: randomUUID(),
      createdAt: new Date(),
    };
  }

  async createTestImpressionsBulk(impressions: InsertTestImpression[]): Promise<void> {
    console.warn(`[MemStorage] ${impressions.length} test impressions not persisted in memory - upgrade to DbStorage`);
  }

  // Test Conversions (not persisted in MemStorage - for dev only)
  async createTestConversion(conversion: InsertTestConversion): Promise<TestConversion> {
    console.warn("[MemStorage] Test conversions not persisted in memory - upgrade to DbStorage");
    return {
      ...conversion,
      id: randomUUID(),
      createdAt: new Date(),
    };
  }

  async createTestConversionsBulk(conversions: InsertTestConversion[]): Promise<void> {
    console.warn(`[MemStorage] ${conversions.length} test conversions not persisted in memory - upgrade to DbStorage`);
  }

  // Test Evolution Snapshots (not persisted in MemStorage - for dev only)
  async getTestEvolutionSnapshots(testId: string): Promise<TestEvolutionSnapshot[]> {
    console.warn("[MemStorage] Test evolution snapshots not persisted in memory - upgrade to DbStorage");
    return [];
  }

  async createTestEvolutionSnapshot(snapshot: InsertTestEvolutionSnapshot): Promise<TestEvolutionSnapshot> {
    console.warn("[MemStorage] Test evolution snapshots not persisted in memory - upgrade to DbStorage");
    return {
      ...snapshot,
      id: randomUUID(),
      createdAt: new Date(),
    };
  }

  async createTestEvolutionSnapshotsBulk(snapshots: InsertTestEvolutionSnapshot[]): Promise<void> {
    console.warn(`[MemStorage] ${snapshots.length} test evolution snapshots not persisted in memory - upgrade to DbStorage`);
  }
}

// Switch to database storage to persist data through restarts
// This prevents unnecessary LLM calls by caching AI recommendations in PostgreSQL
import { dbStorage } from "./db-storage";
export const storage = dbStorage;