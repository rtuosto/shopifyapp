import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Shops table - stores per-shop settings and quota tracking (multi-tenant)
export const shops = pgTable("shops", {
  shop: varchar("shop").primaryKey(), // Shopify store identifier (mystore.myshopify.com)
  planTier: varchar("plan_tier").notNull().default("basic"), // "basic" | "pro" | "enterprise"
  recommendationQuota: integer("recommendation_quota").notNull().default(20), // Monthly quota
  recommendationsUsed: integer("recommendations_used").notNull().default(0), // Used this month
  quotaResetDate: timestamp("quota_reset_date").notNull().defaultNow(), // When quota resets
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertShopSchema = createInsertSchema(shops).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertShop = z.infer<typeof insertShopSchema>;
export type Shop = typeof shops.$inferSelect;

// Products table - stores Shopify product data (multi-tenant)
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shop: varchar("shop").notNull().default("default-shop"), // Shopify store identifier
  shopifyProductId: text("shopify_product_id").notNull(),
  handle: text("handle").notNull(), // URL-friendly product identifier (e.g., "blue-snowboard")
  title: text("title").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal("compare_at_price", { precision: 10, scale: 2 }),
  cost: decimal("cost", { precision: 10, scale: 2 }), // COGS (nullable - not all merchants track)
  margin: decimal("margin", { precision: 5, scale: 2 }), // Calculated margin percentage
  variants: jsonb("variants").$type<Array<{
    id: string;
    price: string;
    cost?: string;
    title?: string;
  }>>().notNull().default(sql`'[]'::jsonb`), // All product variants with IDs, prices, and costs
  images: jsonb("images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").default(0),
  totalSold: integer("total_sold").default(0), // Total units sold (all time)
  revenue30d: decimal("revenue_30d", { precision: 12, scale: 2 }).default("0"), // Revenue from last 30 days
  lastSaleDate: timestamp("last_sale_date"), // When product was last sold
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  shopProductUnique: unique("products_shop_shopify_product_id_unique").on(table.shop, table.shopifyProductId),
}));

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  shop: true, // Shop is automatically added by storage layer
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// AI Recommendations table (multi-tenant)
// TODO: Add data-driven confidence scores based on historical test performance
// TODO: Add estimated impact calculations from similar past tests in this category
export const recommendations = pgTable("recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shop: varchar("shop").notNull().default("default-shop"), // Shopify store identifier
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  testType: text("test_type").notNull(), // "title", "price", "description", "image"
  proposedChanges: jsonb("proposed_changes").$type<Record<string, any>>().notNull(),
  insights: jsonb("insights").$type<Array<{
    type: "psychology" | "competitor" | "seo" | "data";
    title: string;
    description: string;
  }>>().notNull(),
  impactScore: integer("impact_score").notNull().default(5), // 1-10 score from AI (revenue impact)
  status: text("status").notNull().default("pending"), // "pending", "dismissed", "active", "completed"
  dismissedAt: timestamp("dismissed_at"), // When recommendation was dismissed (null if not dismissed)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRecommendationSchema = createInsertSchema(recommendations).omit({
  id: true,
  shop: true, // Shop is automatically added by storage layer
  createdAt: true,
});

export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type Recommendation = typeof recommendations.$inferSelect;

// A/B Tests table - Extensible for product-level, template-level, and advanced optimization (multi-tenant)
export const tests = pgTable("tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shop: varchar("shop").notNull().default("default-shop"), // Shopify store identifier
  
  // Scope & Target (extensible for future template/page tests)
  scope: text("scope").notNull().default("product"), // "product" | "template" | "page" | "global"
  productId: varchar("product_id").references(() => products.id, { onDelete: "cascade" }), // Nullable for template tests
  recommendationId: varchar("recommendation_id").references(() => recommendations.id, { onDelete: "set null" }),
  testType: text("test_type").notNull(), // "title" | "price" | "layout" | "navigation" etc.
  targetSelector: text("target_selector"), // CSS selector for template tests (e.g., ".product-grid")
  
  // Test Configuration
  status: text("status").notNull().default("draft"), // "draft", "active", "paused", "completed", "cancelled"
  controlData: jsonb("control_data").$type<Record<string, any>>().notNull(),
  variantData: jsonb("variant_data").$type<Record<string, any>>().notNull(),
  
  // Optimization Strategy (Bayesian only - uses Thompson Sampling for dynamic allocation)
  allocationStrategy: text("allocation_strategy").notNull().default("bayesian"), // Always "bayesian"
  controlAllocation: decimal("control_allocation", { precision: 5, scale: 2 }).default("50"), // Percentage (0-100), starts at 50% balanced
  variantAllocation: decimal("variant_allocation", { precision: 5, scale: 2 }).default("50"), // Percentage (0-100), starts at 50% balanced
  
  // Statistical Configuration
  confidenceThreshold: decimal("confidence_threshold", { precision: 3, scale: 2 }).default("0.95"), // 95% confidence
  minSampleSize: integer("min_sample_size").default(100), // Min samples before optimization
  bayesianConfig: jsonb("bayesian_config").$type<{
    // Control arm Bayesian posteriors
    control?: {
      incidence: { alpha: number; beta: number };
      value: { mu: number; kappa: number; alphaV: number; betaV: number };
      orderValues?: number[]; // Stored for incremental updates
    };
    // Variant arm Bayesian posteriors  
    variant?: {
      incidence: { alpha: number; beta: number };
      value: { mu: number; kappa: number; alphaV: number; betaV: number };
      orderValues?: number[]; // Stored for incremental updates
    };
    // Safety and risk parameters
    safetyBudgetRemaining?: number; // Dollars remaining in safety budget
    safetyBudgetTotal?: number; // Total safety budget (default $50)
    riskMode?: 'cautious' | 'balanced' | 'aggressive'; // Default cautious
    controlFloor?: number; // Minimum control allocation (default 0.75)
    variantStart?: number; // Starting variant allocation (default 0.05)
    // Promotion tracking
    lastAllocationUpdate?: string; // ISO timestamp of last allocation update
    promotionCheckCount?: number; // How many times we've checked promotion criteria
  }>(),
  
  // Per-variant metrics for true A/B testing
  controlImpressions: integer("control_impressions").default(0),
  variantImpressions: integer("variant_impressions").default(0),
  controlConversions: integer("control_conversions").default(0),
  variantConversions: integer("variant_conversions").default(0),
  controlRevenue: decimal("control_revenue", { precision: 10, scale: 2 }).default("0"),
  variantRevenue: decimal("variant_revenue", { precision: 10, scale: 2 }).default("0"),
  
  // Legacy aggregate fields (kept for backwards compatibility)
  arpu: decimal("arpu", { precision: 10, scale: 2 }).default("0"),
  arpuLift: decimal("arpu_lift", { precision: 5, scale: 2 }).default("0"),
  impressions: integer("impressions").default(0),
  conversions: integer("conversions").default(0),
  revenue: decimal("revenue", { precision: 10, scale: 2 }).default("0"),
  
  // Metadata
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTestSchema = createInsertSchema(tests).omit({
  id: true,
  shop: true, // Shop is automatically added by storage layer
  createdAt: true,
  updatedAt: true,
});

export type InsertTest = z.infer<typeof insertTestSchema>;
export type Test = typeof tests.$inferSelect;

// Analytics/Metrics table for tracking performance over time (multi-tenant)
export const metrics = pgTable("metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shop: varchar("shop").notNull().default("default-shop"), // Shopify store identifier
  date: timestamp("date").notNull(),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }).notNull(),
  avgOrderValue: decimal("avg_order_value", { precision: 10, scale: 2 }).notNull(),
  revenue: decimal("revenue", { precision: 10, scale: 2 }).notNull(),
  revenueLift: decimal("revenue_lift", { precision: 10, scale: 2 }).default("0"),
  activeTests: integer("active_tests").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMetricSchema = createInsertSchema(metrics).omit({
  id: true,
  shop: true, // Shop is automatically added by storage layer
  createdAt: true,
});

export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Metric = typeof metrics.$inferSelect;

// Session Assignments table - Tracks persistent variant assignments for A/B testing attribution (multi-tenant)
export const sessionAssignments = pgTable("session_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shop: varchar("shop").notNull().default("default-shop"), // Shopify store identifier
  sessionId: varchar("session_id").notNull(), // UUID generated in browser, stored in localStorage
  testId: varchar("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  variant: text("variant").notNull(), // "control" | "variant"
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // Default 90 days from assignment
});

export const insertSessionAssignmentSchema = createInsertSchema(sessionAssignments).omit({
  id: true,
  shop: true, // Shop is automatically added by storage layer
  assignedAt: true,
});

export type InsertSessionAssignment = z.infer<typeof insertSessionAssignmentSchema>;
export type SessionAssignment = typeof sessionAssignments.$inferSelect;

// Test Impressions table - Tracks individual impression events (multi-tenant)
export const testImpressions = pgTable("test_impressions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testId: varchar("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull(),
  variant: text("variant").notNull(), // "control" | "variant"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTestImpressionSchema = createInsertSchema(testImpressions).omit({
  id: true,
  createdAt: true,
});

export type InsertTestImpression = z.infer<typeof insertTestImpressionSchema>;
export type TestImpression = typeof testImpressions.$inferSelect;

// Test Conversions table - Tracks individual conversion events (multi-tenant)
export const testConversions = pgTable("test_conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testId: varchar("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id").notNull(),
  variant: text("variant").notNull(), // "control" | "variant"
  revenue: decimal("revenue", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTestConversionSchema = createInsertSchema(testConversions).omit({
  id: true,
  createdAt: true,
});

export type InsertTestConversion = z.infer<typeof insertTestConversionSchema>;
export type TestConversion = typeof testConversions.$inferSelect;

// Test Evolution Snapshots - Stores periodic metric snapshots for evolution charts (multi-tenant)
export const testEvolutionSnapshots = pgTable("test_evolution_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testId: varchar("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  impressions: integer("impressions").notNull(), // Cumulative impressions at this snapshot
  controlImpressions: integer("control_impressions").notNull(),
  variantImpressions: integer("variant_impressions").notNull(),
  controlConversions: integer("control_conversions").notNull(),
  variantConversions: integer("variant_conversions").notNull(),
  controlRevenue: decimal("control_revenue", { precision: 10, scale: 2 }).notNull(),
  variantRevenue: decimal("variant_revenue", { precision: 10, scale: 2 }).notNull(),
  controlRPV: decimal("control_rpv", { precision: 10, scale: 2 }).notNull(), // Revenue Per Visitor
  variantRPV: decimal("variant_rpv", { precision: 10, scale: 2 }).notNull(),
  controlAllocation: decimal("control_allocation", { precision: 5, scale: 2 }).notNull(), // Percentage
  variantAllocation: decimal("variant_allocation", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTestEvolutionSnapshotSchema = createInsertSchema(testEvolutionSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertTestEvolutionSnapshot = z.infer<typeof insertTestEvolutionSnapshotSchema>;
export type TestEvolutionSnapshot = typeof testEvolutionSnapshots.$inferSelect;

// Preview Sessions table - Stores temporary preview sessions for storefront overlay preview (multi-tenant)
export const previewSessions = pgTable("preview_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: varchar("token").notNull().unique(), // Opaque token for URL (short, single-use)
  shop: varchar("shop").notNull().default("default-shop"), // Shopify store identifier
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  recommendationId: varchar("recommendation_id").references(() => recommendations.id, { onDelete: "set null" }),
  
  // Preview data
  controlData: jsonb("control_data").$type<Record<string, any>>().notNull(),
  variantData: jsonb("variant_data").$type<Record<string, any>>().notNull(),
  changes: jsonb("changes").$type<string[]>().notNull(), // Array of changed field names
  insights: jsonb("insights").$type<Array<{
    type: "psychology" | "competitor" | "seo" | "data";
    title: string;
    description: string;
  }>>().notNull(),
  
  // Session state
  expiresAt: timestamp("expires_at").notNull(), // Short-lived (15 minutes)
  completedAt: timestamp("completed_at"), // When user approved/dismissed
  approved: text("approved"), // "yes" | "no" | null (pending)
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPreviewSessionSchema = createInsertSchema(previewSessions).omit({
  id: true,
  shop: true, // Shop is automatically added by storage layer
  createdAt: true,
});

export type InsertPreviewSession = z.infer<typeof insertPreviewSessionSchema>;
export type PreviewSession = typeof previewSessions.$inferSelect;

// Theme Positioning Rules table - Stores DOM positioning rules learned from theme analysis (multi-tenant)
export const themePositioningRules = pgTable("theme_positioning_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shop: varchar("shop").notNull().unique(), // One rule set per shop
  themeId: varchar("theme_id").notNull(), // Shopify theme ID (for detecting theme changes)
  themeName: text("theme_name"), // Human-readable theme name
  
  // DOM positioning rules extracted from theme analysis
  rules: jsonb("rules").$type<{
    // CSS selectors for product containers
    mainProductContainer: string | null; // Main product area selector
    productInfoContainer: string | null; // Product info/details container
    
    // Description positioning
    descriptionSelector: string | null; // Existing description element selector
    descriptionInsertionPoint: {
      method: 'appendChild' | 'insertBefore' | 'insertAfter'; // How to insert
      targetSelector: string; // Reference element for insertion
      className: string | null; // CSS classes to add to injected element
    } | null;
    
    // Title positioning
    titleSelector: string | null; // Product title selector
    
    // Price positioning
    priceSelectors: string[] | null; // All price element selectors
    
    // Additional metadata
    hasDescriptionByDefault: boolean | null; // Whether products usually have descriptions
  }>().notNull(),
  
  // Clone product used for analysis
  cloneProductId: text("clone_product_id"), // Shopify product ID of the template clone (nullable - deleted after analysis)
  
  // Metadata
  analyzedAt: timestamp("analyzed_at").notNull().defaultNow(), // When theme was last analyzed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertThemePositioningRulesSchema = createInsertSchema(themePositioningRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertThemePositioningRules = z.infer<typeof insertThemePositioningRulesSchema>;
export type ThemePositioningRules = typeof themePositioningRules.$inferSelect;