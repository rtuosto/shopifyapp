import { eq, and, desc, lt } from "drizzle-orm";
import { db } from "./db";
import { 
  products, 
  recommendations, 
  tests, 
  metrics, 
  sessionAssignments,
  testImpressions,
  testConversions,
  testEvolutionSnapshots,
  shops,
  previewSessions,
  themePositioningRules,
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
  type PreviewSession,
  type InsertPreviewSession,
  type ThemePositioningRules,
  type InsertThemePositioningRules,
} from "@shared/schema";
import type { IStorage } from "./storage";

/**
 * PostgreSQL-backed storage implementation using Drizzle ORM
 * Persists data across server restarts, avoiding unnecessary LLM calls
 */
export class DbStorage implements IStorage {
  // Shops (quota tracking)
  async getShop(shop: string): Promise<Shop | undefined> {
    const result = await db.select().from(shops)
      .where(eq(shops.shop, shop))
      .limit(1);
    return result[0];
  }

  async createOrUpdateShop(shop: string, data: Partial<InsertShop>): Promise<Shop> {
    const existing = await this.getShop(shop);
    
    if (existing) {
      // Update existing shop
      const [result] = await db.update(shops)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(shops.shop, shop))
        .returning();
      return result;
    } else {
      // Create new shop with defaults
      const [result] = await db.insert(shops)
        .values({
          shop,
          planTier: data.planTier || "basic",
          recommendationQuota: data.recommendationQuota ?? 20,
          recommendationsUsed: data.recommendationsUsed ?? 0,
          quotaResetDate: data.quotaResetDate || new Date(),
        })
        .returning();
      return result;
    }
  }

  async incrementQuota(shop: string, amount: number): Promise<Shop | undefined> {
    const existing = await this.getShop(shop);
    if (!existing) return undefined;
    
    const [result] = await db.update(shops)
      .set({ 
        recommendationsUsed: existing.recommendationsUsed + amount,
        updatedAt: new Date(),
      })
      .where(eq(shops.shop, shop))
      .returning();
    return result;
  }

  // Products (shop-scoped)
  async getProduct(shop: string, id: string): Promise<Product | undefined> {
    const result = await db.select().from(products)
      .where(and(eq(products.shop, shop), eq(products.id, id)))
      .limit(1);
    return result[0];
  }

  async getProducts(shop: string): Promise<Product[]> {
    return await db.select().from(products)
      .where(eq(products.shop, shop));
  }

  async getProductByShopifyId(shop: string, shopifyProductId: string): Promise<Product | undefined> {
    const result = await db.select().from(products)
      .where(and(eq(products.shop, shop), eq(products.shopifyProductId, shopifyProductId)))
      .limit(1);
    return result[0];
  }

  async createProduct(shop: string, product: InsertProduct): Promise<Product> {
    const [result] = await db.insert(products).values({ ...product, shop }).returning();
    return result;
  }

  async updateProduct(shop: string, id: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    // Remove shop from updates to prevent cross-tenant reassignment
    const { shop: _, ...safeUpdates } = updates as any;
    const [result] = await db.update(products)
      .set({ ...safeUpdates, updatedAt: new Date() })
      .where(and(eq(products.shop, shop), eq(products.id, id)))
      .returning();
    return result;
  }

  async deleteProduct(shop: string, id: string): Promise<boolean> {
    const result = await db.delete(products)
      .where(and(eq(products.shop, shop), eq(products.id, id)))
      .returning();
    return result.length > 0;
  }

  // Recommendations (shop-scoped) - KEY FOR AVOIDING LLM COSTS
  async getRecommendation(shop: string, id: string): Promise<Recommendation | undefined> {
    const result = await db.select().from(recommendations)
      .where(and(eq(recommendations.shop, shop), eq(recommendations.id, id)))
      .limit(1);
    return result[0];
  }

  async getRecommendations(shop: string, status?: string): Promise<Recommendation[]> {
    if (status) {
      return await db.select().from(recommendations)
        .where(and(eq(recommendations.shop, shop), eq(recommendations.status, status)))
        .orderBy(desc(recommendations.impactScore)); // Sort by impact score (highest first)
    }
    return await db.select().from(recommendations)
      .where(eq(recommendations.shop, shop))
      .orderBy(desc(recommendations.impactScore)); // Sort by impact score (highest first)
  }

  async getRecommendationsByProduct(shop: string, productId: string): Promise<Recommendation[]> {
    return await db.select().from(recommendations)
      .where(and(eq(recommendations.shop, shop), eq(recommendations.productId, productId)))
      .orderBy(desc(recommendations.impactScore)); // Sort by impact score (highest first)
  }

  async createRecommendation(shop: string, recommendation: InsertRecommendation): Promise<Recommendation> {
    const [result] = await db.insert(recommendations).values({ ...recommendation, shop }).returning();
    return result;
  }

  async updateRecommendation(shop: string, id: string, updates: Partial<InsertRecommendation>): Promise<Recommendation | undefined> {
    // Remove shop from updates to prevent cross-tenant reassignment
    const { shop: _, ...safeUpdates } = updates as any;
    const [result] = await db.update(recommendations)
      .set(safeUpdates)
      .where(and(eq(recommendations.shop, shop), eq(recommendations.id, id)))
      .returning();
    return result;
  }

  async deleteRecommendation(shop: string, id: string): Promise<boolean> {
    const result = await db.delete(recommendations)
      .where(and(eq(recommendations.shop, shop), eq(recommendations.id, id)))
      .returning();
    return result.length > 0;
  }

  // Tests (shop-scoped)
  async getTest(shop: string, id: string): Promise<Test | undefined> {
    const result = await db.select().from(tests)
      .where(and(eq(tests.shop, shop), eq(tests.id, id)))
      .limit(1);
    return result[0];
  }

  async getTests(shop: string, status?: string): Promise<Test[]> {
    if (status) {
      return await db.select().from(tests)
        .where(and(eq(tests.shop, shop), eq(tests.status, status)))
        .orderBy(desc(tests.createdAt));
    }
    return await db.select().from(tests)
      .where(eq(tests.shop, shop))
      .orderBy(desc(tests.createdAt));
  }

  async getTestsByProduct(shop: string, productId: string): Promise<Test[]> {
    return await db.select().from(tests)
      .where(and(eq(tests.shop, shop), eq(tests.productId, productId)))
      .orderBy(desc(tests.createdAt));
  }

  async getActiveTestsByProduct(shop: string, productId: string, testType?: string): Promise<Test[]> {
    const conditions = [
      eq(tests.shop, shop),
      eq(tests.productId, productId),
      eq(tests.status, 'active')
    ];
    
    if (testType) {
      conditions.push(eq(tests.testType, testType));
    }
    
    return await db.select().from(tests)
      .where(and(...conditions))
      .orderBy(desc(tests.createdAt));
  }

  async createTest(shop: string, test: InsertTest): Promise<Test> {
    const [result] = await db.insert(tests).values({ ...test, shop }).returning();
    return result;
  }

  async updateTest(shop: string, id: string, updates: Partial<InsertTest>): Promise<Test | undefined> {
    // Remove shop from updates to prevent cross-tenant reassignment
    const { shop: _, ...safeUpdates } = updates as any;
    const [result] = await db.update(tests)
      .set({ ...safeUpdates, updatedAt: new Date() })
      .where(and(eq(tests.shop, shop), eq(tests.id, id)))
      .returning();
    return result;
  }

  async deleteTest(shop: string, id: string): Promise<boolean> {
    const result = await db.delete(tests)
      .where(and(eq(tests.shop, shop), eq(tests.id, id)))
      .returning();
    return result.length > 0;
  }

  // Metrics (shop-scoped)
  async getMetrics(shop: string, limit?: number): Promise<Metric[]> {
    const query = db.select().from(metrics)
      .where(eq(metrics.shop, shop))
      .orderBy(desc(metrics.date));
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async getLatestMetric(shop: string): Promise<Metric | undefined> {
    const result = await db.select().from(metrics)
      .where(eq(metrics.shop, shop))
      .orderBy(desc(metrics.date))
      .limit(1);
    return result[0];
  }

  async createMetric(shop: string, metric: InsertMetric): Promise<Metric> {
    const [result] = await db.insert(metrics).values({ ...metric, shop }).returning();
    return result;
  }

  // Session Assignments (shop-scoped)
  async getSessionAssignments(shop: string, sessionId: string): Promise<SessionAssignment[]> {
    return await db.select().from(sessionAssignments)
      .where(and(eq(sessionAssignments.shop, shop), eq(sessionAssignments.sessionId, sessionId)));
  }

  async createSessionAssignment(shop: string, assignment: InsertSessionAssignment): Promise<SessionAssignment> {
    const [result] = await db.insert(sessionAssignments).values({ ...assignment, shop }).returning();
    return result;
  }

  // Test Impressions (NOT shop-scoped - global tracking)
  async createTestImpression(impression: InsertTestImpression): Promise<TestImpression> {
    const [result] = await db.insert(testImpressions).values(impression).returning();
    return result;
  }

  async createTestImpressionsBulk(impressions: InsertTestImpression[]): Promise<void> {
    if (impressions.length === 0) return;
    await db.insert(testImpressions).values(impressions);
  }

  // Test Conversions (NOT shop-scoped - global tracking)
  async createTestConversion(conversion: InsertTestConversion): Promise<TestConversion> {
    const [result] = await db.insert(testConversions).values(conversion).returning();
    return result;
  }

  async createTestConversionsBulk(conversions: InsertTestConversion[]): Promise<void> {
    if (conversions.length === 0) return;
    await db.insert(testConversions).values(conversions);
  }

  // Test Evolution Snapshots
  async getTestEvolutionSnapshots(testId: string): Promise<TestEvolutionSnapshot[]> {
    return await db.select().from(testEvolutionSnapshots)
      .where(eq(testEvolutionSnapshots.testId, testId))
      .orderBy(testEvolutionSnapshots.impressions);
  }

  async createTestEvolutionSnapshot(snapshot: InsertTestEvolutionSnapshot): Promise<TestEvolutionSnapshot> {
    const [result] = await db.insert(testEvolutionSnapshots).values(snapshot).returning();
    return result;
  }

  async createTestEvolutionSnapshotsBulk(snapshots: InsertTestEvolutionSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    await db.insert(testEvolutionSnapshots).values(snapshots);
  }

  // Preview Sessions (storefront overlay preview)
  async getPreviewSession(token: string): Promise<PreviewSession | undefined> {
    const result = await db.select().from(previewSessions)
      .where(eq(previewSessions.token, token))
      .limit(1);
    return result[0];
  }

  async createPreviewSession(shop: string, session: InsertPreviewSession): Promise<PreviewSession> {
    const [result] = await db.insert(previewSessions).values({ ...session, shop }).returning();
    return result;
  }

  async completePreviewSession(token: string, approved: "yes" | "no"): Promise<PreviewSession | undefined> {
    const [result] = await db.update(previewSessions)
      .set({ completedAt: new Date(), approved })
      .where(eq(previewSessions.token, token))
      .returning();
    return result;
  }

  async cleanupExpiredPreviewSessions(): Promise<number> {
    const now = new Date();
    const result = await db.delete(previewSessions)
      .where(lt(previewSessions.expiresAt, now))
      .returning();
    
    const deleted = result.length;
    if (deleted > 0) {
      console.log(`[DbStorage] Cleaned up ${deleted} expired preview session(s)`);
    }
    return deleted;
  }

  // Theme Positioning Rules (theme analysis for accurate preview placement)
  async getThemePositioningRules(shop: string): Promise<ThemePositioningRules | undefined> {
    const result = await db.select().from(themePositioningRules)
      .where(eq(themePositioningRules.shop, shop))
      .limit(1);
    return result[0];
  }

  async createOrUpdateThemePositioningRules(shop: string, rulesData: InsertThemePositioningRules): Promise<ThemePositioningRules> {
    const existing = await this.getThemePositioningRules(shop);
    
    if (existing) {
      // Update existing rules
      const [result] = await db.update(themePositioningRules)
        .set({ ...rulesData, updatedAt: new Date() })
        .where(eq(themePositioningRules.shop, shop))
        .returning();
      return result;
    } else {
      // Create new rules
      const [result] = await db.insert(themePositioningRules)
        .values({ ...rulesData, shop })
        .returning();
      return result;
    }
  }

  async deleteThemePositioningRules(shop: string): Promise<boolean> {
    const result = await db.delete(themePositioningRules)
      .where(eq(themePositioningRules.shop, shop))
      .returning();
    return result.length > 0;
  }
}

// Export singleton instance
export const dbStorage = new DbStorage();
