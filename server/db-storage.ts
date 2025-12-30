import { eq, and, desc, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { 
  products, 
  recommendations, 
  optimizations, 
  metrics, 
  sessionAssignments,
  optimizationImpressions,
  optimizationConversions,
  optimizationEvolutionSnapshots,
  shops,
  previewSessions,
  themePositioningRules,
  editorSessions,
  slotExperiments,
  experimentEvents,
  type Product,
  type InsertProduct,
  type Recommendation,
  type InsertRecommendation,
  type Optimization,
  type InsertOptimization,
  type Metric,
  type InsertMetric,
  type SessionAssignment,
  type InsertSessionAssignment,
  type OptimizationImpression,
  type InsertOptimizationImpression,
  type OptimizationConversion,
  type InsertOptimizationConversion,
  type OptimizationEvolutionSnapshot,
  type InsertOptimizationEvolutionSnapshot,
  type Shop,
  type InsertShop,
  type PreviewSession,
  type InsertPreviewSession,
  type ThemePositioningRules,
  type InsertThemePositioningRules,
  type EditorSession,
  type InsertEditorSession,
  type SlotExperiment,
  type InsertSlotExperiment,
  type ExperimentEvent,
  type InsertExperimentEvent,
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

  // Optimizations (shop-scoped)
  async getOptimization(shop: string, id: string): Promise<Optimization | undefined> {
    const result = await db.select().from(optimizations)
      .where(and(eq(optimizations.shop, shop), eq(optimizations.id, id)))
      .limit(1);
    return result[0];
  }

  async getOptimizations(shop: string, status?: string): Promise<Optimization[]> {
    if (status) {
      return await db.select().from(optimizations)
        .where(and(eq(optimizations.shop, shop), eq(optimizations.status, status)))
        .orderBy(desc(optimizations.createdAt));
    }
    return await db.select().from(optimizations)
      .where(eq(optimizations.shop, shop))
      .orderBy(desc(optimizations.createdAt));
  }

  async getOptimizationsByProduct(shop: string, productId: string): Promise<Optimization[]> {
    return await db.select().from(optimizations)
      .where(and(eq(optimizations.shop, shop), eq(optimizations.productId, productId)))
      .orderBy(desc(optimizations.createdAt));
  }

  async getActiveOptimizationsByProduct(shop: string, productId: string, optimizationType?: string): Promise<Optimization[]> {
    const conditions = [
      eq(optimizations.shop, shop),
      eq(optimizations.productId, productId),
      eq(optimizations.status, 'active')
    ];
    
    if (optimizationType) {
      conditions.push(eq(optimizations.optimizationType, optimizationType));
    }
    
    return await db.select().from(optimizations)
      .where(and(...conditions))
      .orderBy(desc(optimizations.createdAt));
  }

  async createOptimization(shop: string, optimization: InsertOptimization): Promise<Optimization> {
    const [result] = await db.insert(optimizations).values({ ...optimization, shop }).returning();
    return result;
  }

  async updateOptimization(shop: string, id: string, updates: Partial<InsertOptimization>): Promise<Optimization | undefined> {
    // Remove shop from updates to prevent cross-tenant reassignment
    const { shop: _, ...safeUpdates } = updates as any;
    const [result] = await db.update(optimizations)
      .set({ ...safeUpdates, updatedAt: new Date() })
      .where(and(eq(optimizations.shop, shop), eq(optimizations.id, id)))
      .returning();
    return result;
  }

  async deleteOptimization(shop: string, id: string): Promise<boolean> {
    const result = await db.delete(optimizations)
      .where(and(eq(optimizations.shop, shop), eq(optimizations.id, id)))
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

  // Optimization Impressions (NOT shop-scoped - global tracking)
  async createOptimizationImpression(impression: InsertOptimizationImpression): Promise<OptimizationImpression> {
    const [result] = await db.insert(optimizationImpressions).values(impression).returning();
    return result;
  }

  async createOptimizationImpressionsBulk(impressions: InsertOptimizationImpression[]): Promise<void> {
    if (impressions.length === 0) return;
    await db.insert(optimizationImpressions).values(impressions);
  }

  // Optimization Conversions (NOT shop-scoped - global tracking)
  async createOptimizationConversion(conversion: InsertOptimizationConversion): Promise<OptimizationConversion> {
    const [result] = await db.insert(optimizationConversions).values(conversion).returning();
    return result;
  }

  async createOptimizationConversionsBulk(conversions: InsertOptimizationConversion[]): Promise<void> {
    if (conversions.length === 0) return;
    await db.insert(optimizationConversions).values(conversions);
  }

  // Optimization Evolution Snapshots
  async getOptimizationEvolutionSnapshots(optimizationId: string): Promise<OptimizationEvolutionSnapshot[]> {
    return await db.select().from(optimizationEvolutionSnapshots)
      .where(eq(optimizationEvolutionSnapshots.optimizationId, optimizationId))
      .orderBy(optimizationEvolutionSnapshots.impressions);
  }

  async createOptimizationEvolutionSnapshot(snapshot: InsertOptimizationEvolutionSnapshot): Promise<OptimizationEvolutionSnapshot> {
    const [result] = await db.insert(optimizationEvolutionSnapshots).values(snapshot).returning();
    return result;
  }

  async createOptimizationEvolutionSnapshotsBulk(snapshots: InsertOptimizationEvolutionSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;
    await db.insert(optimizationEvolutionSnapshots).values(snapshots);
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

  // Editor Sessions (storefront live editing)
  async createEditorSession(shop: string, session: InsertEditorSession): Promise<EditorSession> {
    const [result] = await db.insert(editorSessions).values({ ...session, shop }).returning();
    return result;
  }

  async getEditorSession(token: string): Promise<EditorSession | undefined> {
    const result = await db.select().from(editorSessions)
      .where(eq(editorSessions.token, token))
      .limit(1);
    return result[0];
  }

  async updateEditorSessionHeartbeat(token: string): Promise<EditorSession | undefined> {
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes from now

    const [result] = await db.update(editorSessions)
      .set({ 
        lastHeartbeat: sql`NOW()`,
        expiresAt: newExpiresAt,
      })
      .where(eq(editorSessions.token, token))
      .returning();
    return result;
  }

  async deleteEditorSession(token: string): Promise<boolean> {
    const result = await db.delete(editorSessions)
      .where(eq(editorSessions.token, token))
      .returning();
    return result.length > 0;
  }

  async cleanupExpiredEditorSessions(): Promise<number> {
    const now = new Date();
    const result = await db.delete(editorSessions)
      .where(lt(editorSessions.expiresAt, now))
      .returning();
    
    const deleted = result.length;
    if (deleted > 0) {
      console.log(`[DbStorage] Cleaned up ${deleted} expired editor session(s)`);
    }
    return deleted;
  }

  // Slot Experiments (Theme App Extension based)
  async getSlotExperiment(shop: string, id: string): Promise<SlotExperiment | undefined> {
    const result = await db.select().from(slotExperiments)
      .where(and(eq(slotExperiments.shop, shop), eq(slotExperiments.id, id)))
      .limit(1);
    return result[0];
  }

  async getSlotExperiments(shop: string, status?: string): Promise<SlotExperiment[]> {
    if (status) {
      return await db.select().from(slotExperiments)
        .where(and(eq(slotExperiments.shop, shop), eq(slotExperiments.status, status)))
        .orderBy(desc(slotExperiments.createdAt));
    }
    return await db.select().from(slotExperiments)
      .where(eq(slotExperiments.shop, shop))
      .orderBy(desc(slotExperiments.createdAt));
  }

  async getLiveSlotExperiments(shop: string): Promise<SlotExperiment[]> {
    return await db.select().from(slotExperiments)
      .where(and(eq(slotExperiments.shop, shop), eq(slotExperiments.status, 'LIVE')));
  }

  async createSlotExperiment(shop: string, experiment: InsertSlotExperiment): Promise<SlotExperiment> {
    const values = {
      ...experiment,
      shop,
      variantA: experiment.variantA as any,
      variantB: experiment.variantB as any,
    };
    const [result] = await db.insert(slotExperiments).values(values).returning();
    return result;
  }

  async updateSlotExperiment(shop: string, id: string, experiment: Partial<InsertSlotExperiment>): Promise<SlotExperiment | undefined> {
    const updates: Record<string, any> = { ...experiment, updatedAt: new Date() };
    if (experiment.variantA) updates.variantA = experiment.variantA as any;
    if (experiment.variantB) updates.variantB = experiment.variantB as any;
    
    const [result] = await db.update(slotExperiments)
      .set(updates)
      .where(and(eq(slotExperiments.shop, shop), eq(slotExperiments.id, id)))
      .returning();
    return result;
  }

  async deleteSlotExperiment(shop: string, id: string): Promise<boolean> {
    const result = await db.delete(slotExperiments)
      .where(and(eq(slotExperiments.shop, shop), eq(slotExperiments.id, id)))
      .returning();
    return result.length > 0;
  }

  // Experiment Events (App Proxy event tracking)
  async createExperimentEvent(shop: string, event: InsertExperimentEvent): Promise<ExperimentEvent> {
    const [result] = await db.insert(experimentEvents).values({ ...event, shop }).returning();
    return result;
  }

  async getExperimentEvents(experimentId: string, limit?: number): Promise<ExperimentEvent[]> {
    const query = db.select().from(experimentEvents)
      .where(eq(experimentEvents.experimentId, experimentId))
      .orderBy(desc(experimentEvents.createdAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  // GDPR Compliance: Delete all data for a shop (shop/redact webhook)
  async deleteAllShopData(shop: string): Promise<void> {
    console.log(`[DbStorage] Deleting all data for shop: ${shop}`);
    
    try {
      // Delete in order to respect foreign key constraints
      // Note: Tables with onDelete: "cascade" on their FK to optimizations
      // (optimizationImpressions, optimizationConversions, optimizationEvolutionSnapshots)
      // will be automatically deleted when we delete optimizations
      
      // 1. Delete experiment events first (references slot experiments via experimentId)
      await db.delete(experimentEvents).where(eq(experimentEvents.shop, shop));
      console.log(`[DbStorage] Deleted experiment events for shop: ${shop}`);
      
      // 2. Delete slot experiments
      await db.delete(slotExperiments).where(eq(slotExperiments.shop, shop));
      console.log(`[DbStorage] Deleted slot experiments for shop: ${shop}`);
      
      // 3. Delete editor sessions
      await db.delete(editorSessions).where(eq(editorSessions.shop, shop));
      console.log(`[DbStorage] Deleted editor sessions for shop: ${shop}`);
      
      // 4. Delete preview sessions
      await db.delete(previewSessions).where(eq(previewSessions.shop, shop));
      console.log(`[DbStorage] Deleted preview sessions for shop: ${shop}`);
      
      // 5. Delete theme positioning rules
      await db.delete(themePositioningRules).where(eq(themePositioningRules.shop, shop));
      console.log(`[DbStorage] Deleted theme positioning rules for shop: ${shop}`);
      
      // 6. Delete session assignments
      await db.delete(sessionAssignments).where(eq(sessionAssignments.shop, shop));
      console.log(`[DbStorage] Deleted session assignments for shop: ${shop}`);
      
      // 7. Delete metrics
      await db.delete(metrics).where(eq(metrics.shop, shop));
      console.log(`[DbStorage] Deleted metrics for shop: ${shop}`);
      
      // 8. Delete optimizations (cascades to impressions, conversions, evolution snapshots)
      await db.delete(optimizations).where(eq(optimizations.shop, shop));
      console.log(`[DbStorage] Deleted optimizations (and cascaded data) for shop: ${shop}`);
      
      // 9. Delete recommendations
      await db.delete(recommendations).where(eq(recommendations.shop, shop));
      console.log(`[DbStorage] Deleted recommendations for shop: ${shop}`);
      
      // 10. Delete products
      await db.delete(products).where(eq(products.shop, shop));
      console.log(`[DbStorage] Deleted products for shop: ${shop}`);
      
      // 11. Delete shop record
      await db.delete(shops).where(eq(shops.shop, shop));
      console.log(`[DbStorage] Deleted shop record for: ${shop}`);
      
      console.log(`[DbStorage] Successfully deleted all data for shop: ${shop}`);
    } catch (error) {
      console.error(`[DbStorage] Error deleting shop data for ${shop}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const dbStorage = new DbStorage();
