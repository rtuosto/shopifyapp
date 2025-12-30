import type { 
  Product, 
  InsertProduct,
  Recommendation,
  InsertRecommendation,
  Optimization,
  InsertOptimization,
  Metric,
  InsertMetric,
  SessionAssignment,
  InsertSessionAssignment,
  OptimizationImpression,
  InsertOptimizationImpression,
  OptimizationConversion,
  InsertOptimizationConversion,
  OptimizationEvolutionSnapshot,
  InsertOptimizationEvolutionSnapshot,
  Shop,
  InsertShop,
  PreviewSession,
  InsertPreviewSession,
  ThemePositioningRules,
  InsertThemePositioningRules,
  EditorSession,
  InsertEditorSession,
  SlotExperiment,
  InsertSlotExperiment,
  ExperimentEvent,
  InsertExperimentEvent,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Shops (quota tracking)
  getShop(shop: string): Promise<Shop | undefined>;
  createOrUpdateShop(shop: string, data: Partial<InsertShop>): Promise<Shop>;
  incrementQuota(shop: string, amount: number): Promise<Shop | undefined>;
  resetQuota(shop: string): Promise<Shop | undefined>;

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

  // Optimizations (shop-scoped)
  getOptimization(shop: string, id: string): Promise<Optimization | undefined>;
  getOptimizations(shop: string, status?: string): Promise<Optimization[]>;
  getOptimizationsByProduct(shop: string, productId: string): Promise<Optimization[]>;
  getActiveOptimizationsByProduct(shop: string, productId: string, optimizationType?: string): Promise<Optimization[]>;
  createOptimization(shop: string, optimization: InsertOptimization): Promise<Optimization>;
  updateOptimization(shop: string, id: string, optimization: Partial<InsertOptimization>): Promise<Optimization | undefined>;
  deleteOptimization(shop: string, id: string): Promise<boolean>;

  // Metrics (shop-scoped)
  getMetrics(shop: string, limit?: number): Promise<Metric[]>;
  getLatestMetric(shop: string): Promise<Metric | undefined>;
  createMetric(shop: string, metric: InsertMetric): Promise<Metric>;

  // Session Assignments (shop-scoped)
  getSessionAssignments(shop: string, sessionId: string): Promise<SessionAssignment[]>;
  createSessionAssignment(shop: string, assignment: InsertSessionAssignment): Promise<SessionAssignment>;
  
  // Optimization Impressions (tracking individual impression events)
  createOptimizationImpression(impression: InsertOptimizationImpression): Promise<OptimizationImpression>;
  createOptimizationImpressionsBulk(impressions: InsertOptimizationImpression[]): Promise<void>;
  
  // Optimization Conversions (tracking individual conversion events)
  createOptimizationConversion(conversion: InsertOptimizationConversion): Promise<OptimizationConversion>;
  createOptimizationConversionsBulk(conversions: InsertOptimizationConversion[]): Promise<void>;
  
  // Optimization Evolution Snapshots (periodic metric snapshots for charts)
  getOptimizationEvolutionSnapshots(optimizationId: string): Promise<OptimizationEvolutionSnapshot[]>;
  createOptimizationEvolutionSnapshot(snapshot: InsertOptimizationEvolutionSnapshot): Promise<OptimizationEvolutionSnapshot>;
  createOptimizationEvolutionSnapshotsBulk(snapshots: InsertOptimizationEvolutionSnapshot[]): Promise<void>;

  // Preview Sessions (storefront overlay preview)
  getPreviewSession(token: string): Promise<PreviewSession | undefined>;
  createPreviewSession(shop: string, session: InsertPreviewSession): Promise<PreviewSession>;
  completePreviewSession(token: string, approved: "yes" | "no"): Promise<PreviewSession | undefined>;
  cleanupExpiredPreviewSessions(): Promise<number>; // Returns count of deleted sessions

  // Theme Positioning Rules (theme analysis for accurate preview placement)
  getThemePositioningRules(shop: string): Promise<ThemePositioningRules | undefined>;
  createOrUpdateThemePositioningRules(shop: string, rules: InsertThemePositioningRules): Promise<ThemePositioningRules>;
  deleteThemePositioningRules(shop: string): Promise<boolean>;

  // Editor Sessions (storefront live editing)
  createEditorSession(shop: string, session: InsertEditorSession): Promise<EditorSession>;
  getEditorSession(token: string): Promise<EditorSession | undefined>;
  updateEditorSessionHeartbeat(token: string): Promise<EditorSession | undefined>;
  deleteEditorSession(token: string): Promise<boolean>;
  cleanupExpiredEditorSessions(): Promise<number>;

  // Slot Experiments (Theme App Extension based)
  getSlotExperiment(shop: string, id: string): Promise<SlotExperiment | undefined>;
  getSlotExperiments(shop: string, status?: string): Promise<SlotExperiment[]>;
  getLiveSlotExperiments(shop: string): Promise<SlotExperiment[]>;
  createSlotExperiment(shop: string, experiment: InsertSlotExperiment): Promise<SlotExperiment>;
  updateSlotExperiment(shop: string, id: string, experiment: Partial<InsertSlotExperiment>): Promise<SlotExperiment | undefined>;
  deleteSlotExperiment(shop: string, id: string): Promise<boolean>;

  // Experiment Events (App Proxy event tracking)
  createExperimentEvent(shop: string, event: InsertExperimentEvent): Promise<ExperimentEvent>;
  getExperimentEvents(experimentId: string, limit?: number): Promise<ExperimentEvent[]>;

  // GDPR Compliance: Delete all data for a shop (shop/redact webhook)
  deleteAllShopData(shop: string): Promise<void>;
}

export class MemStorage implements IStorage {
  // Shop-scoped storage: Map<shop, Map<id, entity>>
  private shops: Map<string, Shop>;
  private products: Map<string, Map<string, Product>>;
  private recommendations: Map<string, Map<string, Recommendation>>;
  private optimizations: Map<string, Map<string, Optimization>>;
  private metrics: Map<string, Map<string, Metric>>;
  private sessionAssignments: Map<string, Map<string, SessionAssignment>>;
  // Preview sessions stored by token (globally, not shop-scoped)
  private previewSessions: Map<string, PreviewSession>;

  constructor() {
    this.shops = new Map();
    this.products = new Map();
    this.recommendations = new Map();
    this.optimizations = new Map();
    this.metrics = new Map();
    this.sessionAssignments = new Map();
    this.previewSessions = new Map();
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

  async resetQuota(shop: string): Promise<Shop | undefined> {
    const existing = this.shops.get(shop);
    if (!existing) return undefined;
    
    const updated: Shop = {
      ...existing,
      recommendationsUsed: 0,
      quotaResetDate: new Date(),
      updatedAt: new Date(),
    };
    this.shops.set(shop, updated);
    return updated;
  }

  private initializeSampleData(shop: string) {
    // Ensure namespaces exist
    const products = this.ensureShopNamespace(this.products, shop);
    const recommendations = this.ensureShopNamespace(this.recommendations, shop);
    const optimizations = this.ensureShopNamespace(this.optimizations, shop);
    const metrics = this.ensureShopNamespace(this.metrics, shop);
    // Sample products
    const product1: Product = {
      id: randomUUID(),
      shop,
      shopifyProductId: "shopify-123",
      title: "Wireless Bluetooth Speaker",
      description: "High-quality portable speaker with 12-hour battery life. Perfect for outdoor adventures and home use.",
      price: "49.99",
      compareAtPrice: "79.99",
      cost: null,
      margin: null,
      variants: [],
      images: ["https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&h=800&fit=crop"],
      rating: "4.5",
      reviewCount: 328,
      totalSold: 0,
      revenue30d: "0",
      lastSaleDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const product2: Product = {
      id: randomUUID(),
      shop,
      shopifyProductId: "shopify-124",
      title: "Smart Fitness Tracker",
      description: "Track your fitness goals with advanced heart rate monitoring and sleep tracking. Water-resistant design for all activities.",
      price: "49.99",
      compareAtPrice: null,
      cost: null,
      margin: null,
      variants: [],
      images: ["https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=800&h=800&fit=crop"],
      rating: "4.7",
      reviewCount: 512,
      totalSold: 0,
      revenue30d: "0",
      lastSaleDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    products.set(product1.id, product1);
    products.set(product2.id, product2);

    // Sample recommendations
    const rec1: Recommendation = {
      id: randomUUID(),
      shop,
      productId: product1.id,
      title: "Optimize Product Title for SEO",
      description: "Add power words like 'Premium' and 'Professional' to increase click-through rate by emphasizing quality and value proposition.",
      optimizationType: "title",
      impactScore: 8,
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
      dismissedAt: null,
      createdAt: new Date(),
    };

    const rec2: Recommendation = {
      id: randomUUID(),
      shop,
      productId: product2.id,
      title: "Optimize Price Point",
      description: "Reduce price from $49.99 to $44.99 to hit psychological pricing sweet spot. Competitor analysis shows this range performs better.",
      optimizationType: "price",
      impactScore: 9,
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
      dismissedAt: null,
      createdAt: new Date(),
    };

    recommendations.set(rec1.id, rec1);
    recommendations.set(rec2.id, rec2);

    // Sample optimization
    const optimization1: Optimization = {
      id: randomUUID(),
      shop,
      scope: "product",
      productId: product1.id,
      recommendationId: null,
      optimizationType: "title",
      targetSelector: null,
      status: "active",
      controlData: { title: product1.title },
      variantData: { title: "Premium Wireless Speaker" },
      allocationStrategy: "bayesian",
      controlAllocation: "50",
      variantAllocation: "50",
      confidenceThreshold: "0.95",
      minSampleSize: 100,
      bayesianConfig: null,
      controlImpressions: 625,
      variantImpressions: 625,
      controlConversions: 20,
      variantConversions: 25,
      controlRevenue: "1000.00",
      variantRevenue: "1247.55",
      arpu: "15.4",
      arpuLift: "0",
      impressions: 1250,
      conversions: 45,
      revenue: "2247.55",
      startDate: new Date("2025-10-18"),
      endDate: null,
      createdAt: new Date("2025-10-18"),
      updatedAt: new Date(),
    };

    optimizations.set(optimization1.id, optimization1);

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
        activeOptimizations: index > 2 ? 8 : 5,
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

  // Optimizations (shop-scoped)
  async getOptimization(shop: string, id: string): Promise<Optimization | undefined> {
    const shopOptimizations = this.ensureShopNamespace(this.optimizations, shop);
    return shopOptimizations.get(id);
  }

  async getOptimizations(shop: string, status?: string): Promise<Optimization[]> {
    const shopOptimizations = this.ensureShopNamespace(this.optimizations, shop);
    const all = Array.from(shopOptimizations.values());
    if (status) {
      return all.filter(o => o.status === status);
    }
    return all;
  }

  async getOptimizationsByProduct(shop: string, productId: string): Promise<Optimization[]> {
    const shopOptimizations = this.ensureShopNamespace(this.optimizations, shop);
    return Array.from(shopOptimizations.values()).filter(o => o.productId === productId);
  }

  async getActiveOptimizationsByProduct(shop: string, productId: string, optimizationType?: string): Promise<Optimization[]> {
    const shopOptimizations = this.ensureShopNamespace(this.optimizations, shop);
    return Array.from(shopOptimizations.values()).filter(o => 
      o.productId === productId && 
      o.status === 'active' &&
      (!optimizationType || o.optimizationType === optimizationType)
    );
  }

  async createOptimization(shop: string, insertOptimization: InsertOptimization): Promise<Optimization> {
    const shopOptimizations = this.ensureShopNamespace(this.optimizations, shop);
    const id = randomUUID();
    const optimization: Optimization = {
      ...insertOptimization,
      id,
      shop,
      status: insertOptimization.status || "draft",
      arpu: insertOptimization.arpu?.toString() || "0",
      arpuLift: insertOptimization.arpuLift?.toString() || "0",
      revenue: insertOptimization.revenue?.toString() || "0",
      controlRevenue: insertOptimization.controlRevenue?.toString() || "0",
      variantRevenue: insertOptimization.variantRevenue?.toString() || "0",
      controlAllocation: insertOptimization.controlAllocation?.toString() || "50",
      variantAllocation: insertOptimization.variantAllocation?.toString() || "50",
      confidenceThreshold: insertOptimization.confidenceThreshold?.toString() || "0.95",
      recommendationId: insertOptimization.recommendationId || null,
      productId: insertOptimization.productId || null,
      targetSelector: insertOptimization.targetSelector || null,
      bayesianConfig: insertOptimization.bayesianConfig || null,
      startDate: insertOptimization.startDate || null,
      endDate: insertOptimization.endDate || null,
      impressions: insertOptimization.impressions || null,
      conversions: insertOptimization.conversions || null,
      controlImpressions: insertOptimization.controlImpressions || null,
      variantImpressions: insertOptimization.variantImpressions || null,
      controlConversions: insertOptimization.controlConversions || null,
      variantConversions: insertOptimization.variantConversions || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    shopOptimizations.set(id, optimization);
    return optimization;
  }

  async updateOptimization(shop: string, id: string, updates: Partial<InsertOptimization>): Promise<Optimization | undefined> {
    const shopOptimizations = this.ensureShopNamespace(this.optimizations, shop);
    const optimization = shopOptimizations.get(id);
    if (!optimization) return undefined;
    
    const updated: Optimization = {
      ...optimization,
      ...updates,
      updatedAt: new Date(),
    };
    shopOptimizations.set(id, updated);
    return updated;
  }

  async deleteOptimization(shop: string, id: string): Promise<boolean> {
    const shopOptimizations = this.ensureShopNamespace(this.optimizations, shop);
    return shopOptimizations.delete(id);
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
      activeOptimizations: insertMetric.activeOptimizations || null,
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

  // Optimization Impressions (not persisted in MemStorage - for dev only)
  async createOptimizationImpression(impression: InsertOptimizationImpression): Promise<OptimizationImpression> {
    console.warn("[MemStorage] Optimization impressions not persisted in memory - upgrade to DbStorage");
    return {
      ...impression,
      id: randomUUID(),
      createdAt: new Date(),
    };
  }

  async createOptimizationImpressionsBulk(impressions: InsertOptimizationImpression[]): Promise<void> {
    console.warn(`[MemStorage] ${impressions.length} optimization impressions not persisted in memory - upgrade to DbStorage`);
  }

  // Optimization Conversions (not persisted in MemStorage - for dev only)
  async createOptimizationConversion(conversion: InsertOptimizationConversion): Promise<OptimizationConversion> {
    console.warn("[MemStorage] Optimization conversions not persisted in memory - upgrade to DbStorage");
    return {
      ...conversion,
      id: randomUUID(),
      createdAt: new Date(),
    };
  }

  async createOptimizationConversionsBulk(conversions: InsertOptimizationConversion[]): Promise<void> {
    console.warn(`[MemStorage] ${conversions.length} optimization conversions not persisted in memory - upgrade to DbStorage`);
  }

  // Optimization Evolution Snapshots (not persisted in MemStorage - for dev only)
  async getOptimizationEvolutionSnapshots(optimizationId: string): Promise<OptimizationEvolutionSnapshot[]> {
    console.warn("[MemStorage] Optimization evolution snapshots not persisted in memory - upgrade to DbStorage");
    return [];
  }

  async createOptimizationEvolutionSnapshot(snapshot: InsertOptimizationEvolutionSnapshot): Promise<OptimizationEvolutionSnapshot> {
    console.warn("[MemStorage] Optimization evolution snapshots not persisted in memory - upgrade to DbStorage");
    return {
      ...snapshot,
      id: randomUUID(),
      createdAt: new Date(),
    };
  }

  async createOptimizationEvolutionSnapshotsBulk(snapshots: InsertOptimizationEvolutionSnapshot[]): Promise<void> {
    console.warn(`[MemStorage] ${snapshots.length} optimization evolution snapshots not persisted in memory - upgrade to DbStorage`);
  }

  // Preview Sessions (NOT PERSISTENT - will be lost on restart!)
  async getPreviewSession(token: string): Promise<PreviewSession | undefined> {
    console.warn("[MemStorage] Preview sessions not persisted in memory - upgrade to DbStorage");
    return this.previewSessions.get(token);
  }

  async createPreviewSession(shop: string, insertSession: InsertPreviewSession): Promise<PreviewSession> {
    console.warn("[MemStorage] Preview sessions not persisted in memory - upgrade to DbStorage");
    const id = randomUUID();
    const session: PreviewSession = {
      ...insertSession,
      id,
      shop,
      insights: insertSession.insights as Array<{
        type: "psychology" | "competitor" | "seo" | "data";
        title: string;
        description: string;
      }>,
      completedAt: null,
      approved: null,
      createdAt: new Date(),
    };
    this.previewSessions.set(insertSession.token, session);
    return session;
  }

  async completePreviewSession(token: string, approved: "yes" | "no"): Promise<PreviewSession | undefined> {
    const session = this.previewSessions.get(token);
    if (!session) return undefined;
    
    const updated: PreviewSession = {
      ...session,
      completedAt: new Date(),
      approved,
    };
    this.previewSessions.set(token, updated);
    return updated;
  }

  async cleanupExpiredPreviewSessions(): Promise<number> {
    const now = new Date();
    let deleted = 0;
    
    for (const [token, session] of this.previewSessions.entries()) {
      if (session.expiresAt < now) {
        this.previewSessions.delete(token);
        deleted++;
      }
    }
    
    if (deleted > 0) {
      console.log(`[MemStorage] Cleaned up ${deleted} expired preview session(s)`);
    }
    return deleted;
  }

  // Theme Positioning Rules (not persisted in MemStorage)
  async getThemePositioningRules(shop: string): Promise<ThemePositioningRules | undefined> {
    console.warn("[MemStorage] Theme positioning rules not persisted in memory - upgrade to DbStorage");
    return undefined;
  }

  async createOrUpdateThemePositioningRules(shop: string, rules: InsertThemePositioningRules): Promise<ThemePositioningRules> {
    console.warn("[MemStorage] Theme positioning rules not persisted in memory - upgrade to DbStorage");
    return {
      ...rules,
      id: randomUUID(),
      shop,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ThemePositioningRules;
  }

  async deleteThemePositioningRules(shop: string): Promise<boolean> {
    console.warn("[MemStorage] Theme positioning rules not persisted in memory - upgrade to DbStorage");
    return false;
  }

  // Editor Sessions (not persisted in MemStorage)
  async createEditorSession(shop: string, session: InsertEditorSession): Promise<EditorSession> {
    console.warn("[MemStorage] Editor sessions not persisted in memory - upgrade to DbStorage");
    return {
      ...session,
      id: randomUUID(),
      shop,
      createdAt: new Date(),
    } as EditorSession;
  }

  async getEditorSession(token: string): Promise<EditorSession | undefined> {
    console.warn("[MemStorage] Editor sessions not persisted in memory - upgrade to DbStorage");
    return undefined;
  }

  async updateEditorSessionHeartbeat(token: string): Promise<EditorSession | undefined> {
    console.warn("[MemStorage] Editor sessions not persisted in memory - upgrade to DbStorage");
    return undefined;
  }

  async deleteEditorSession(token: string): Promise<boolean> {
    console.warn("[MemStorage] Editor sessions not persisted in memory - upgrade to DbStorage");
    return false;
  }

  async cleanupExpiredEditorSessions(): Promise<number> {
    console.warn("[MemStorage] Editor sessions not persisted in memory - upgrade to DbStorage");
    return 0;
  }

  // Slot Experiments (not persisted in MemStorage)
  async getSlotExperiment(shop: string, id: string): Promise<SlotExperiment | undefined> {
    console.warn("[MemStorage] Slot experiments not persisted in memory - upgrade to DbStorage");
    return undefined;
  }

  async getSlotExperiments(shop: string, status?: string): Promise<SlotExperiment[]> {
    console.warn("[MemStorage] Slot experiments not persisted in memory - upgrade to DbStorage");
    return [];
  }

  async getLiveSlotExperiments(shop: string): Promise<SlotExperiment[]> {
    console.warn("[MemStorage] Slot experiments not persisted in memory - upgrade to DbStorage");
    return [];
  }

  async createSlotExperiment(shop: string, experiment: InsertSlotExperiment): Promise<SlotExperiment> {
    console.warn("[MemStorage] Slot experiments not persisted in memory - upgrade to DbStorage");
    return {
      ...experiment,
      id: randomUUID(),
      shop,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SlotExperiment;
  }

  async updateSlotExperiment(shop: string, id: string, experiment: Partial<InsertSlotExperiment>): Promise<SlotExperiment | undefined> {
    console.warn("[MemStorage] Slot experiments not persisted in memory - upgrade to DbStorage");
    return undefined;
  }

  async deleteSlotExperiment(shop: string, id: string): Promise<boolean> {
    console.warn("[MemStorage] Slot experiments not persisted in memory - upgrade to DbStorage");
    return false;
  }

  // Experiment Events (not persisted in MemStorage)
  async createExperimentEvent(shop: string, event: InsertExperimentEvent): Promise<ExperimentEvent> {
    console.warn("[MemStorage] Experiment events not persisted in memory - upgrade to DbStorage");
    return {
      ...event,
      id: randomUUID(),
      shop,
      createdAt: new Date(),
    } as ExperimentEvent;
  }

  async getExperimentEvents(experimentId: string, limit?: number): Promise<ExperimentEvent[]> {
    console.warn("[MemStorage] Experiment events not persisted in memory - upgrade to DbStorage");
    return [];
  }

  // GDPR Compliance: Delete all shop data
  async deleteAllShopData(shop: string): Promise<void> {
    console.log(`[MemStorage] Deleting all data for shop: ${shop}`);
    this.shops.delete(shop);
    this.products.delete(shop);
    this.recommendations.delete(shop);
    this.optimizations.delete(shop);
    this.metrics.delete(shop);
    this.sessionAssignments.delete(shop);
    // Preview sessions are stored by token, need to filter
    for (const [token, session] of this.previewSessions) {
      if (session.shop === shop) {
        this.previewSessions.delete(token);
      }
    }
    console.log(`[MemStorage] Successfully deleted all data for shop: ${shop}`);
  }
}

// Switch to database storage to persist data through restarts
// This prevents unnecessary LLM calls by caching AI recommendations in PostgreSQL
import { dbStorage } from "./db-storage";
export const storage = dbStorage;