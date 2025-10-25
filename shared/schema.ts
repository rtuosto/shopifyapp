import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Products table - stores Shopify product data (multi-tenant)
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shop: varchar("shop").notNull().default("default-shop"), // Shopify store identifier
  shopifyProductId: text("shopify_product_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal("compare_at_price", { precision: 10, scale: 2 }),
  variants: jsonb("variants").$type<Array<{
    id: string;
    price: string;
    title?: string;
  }>>().notNull().default(sql`'[]'::jsonb`), // All product variants with IDs and prices
  images: jsonb("images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").default(0),
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
  status: text("status").notNull().default("pending"), // "pending", "accepted", "rejected"
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
  status: text("status").notNull().default("draft"), // "draft", "active", "completed", "cancelled"
  controlData: jsonb("control_data").$type<Record<string, any>>().notNull(),
  variantData: jsonb("variant_data").$type<Record<string, any>>().notNull(),
  
  // Optimization Strategy (extensible for Bayesian & Bandits)
  allocationStrategy: text("allocation_strategy").notNull().default("fixed"), // "fixed" | "bayesian" | "bandit"
  controlAllocation: decimal("control_allocation", { precision: 5, scale: 2 }).default("50"), // Percentage (0-100)
  variantAllocation: decimal("variant_allocation", { precision: 5, scale: 2 }).default("50"), // Percentage (0-100)
  
  // Statistical Configuration
  confidenceThreshold: decimal("confidence_threshold", { precision: 3, scale: 2 }).default("0.95"), // 95% confidence
  minSampleSize: integer("min_sample_size").default(100), // Min samples before optimization
  bayesianConfig: jsonb("bayesian_config").$type<{
    priorAlpha?: number; // Beta distribution alpha
    priorBeta?: number;  // Beta distribution beta
    updateInterval?: number; // How often to recalculate (minutes)
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