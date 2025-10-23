import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Products table - stores Shopify product data
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyProductId: text("shopify_product_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal("compare_at_price", { precision: 10, scale: 2 }),
  images: jsonb("images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// AI Recommendations table
// TODO: Add data-driven confidence scores based on historical test performance
// TODO: Add estimated impact calculations from similar past tests in this category
export const recommendations = pgTable("recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  createdAt: true,
});

export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type Recommendation = typeof recommendations.$inferSelect;

// A/B Tests table - Now tracks control vs variant metrics separately
export const tests = pgTable("tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  recommendationId: varchar("recommendation_id").references(() => recommendations.id, { onDelete: "set null" }),
  testType: text("test_type").notNull(),
  status: text("status").notNull().default("draft"), // "draft", "active", "completed", "cancelled"
  controlData: jsonb("control_data").$type<Record<string, any>>().notNull(),
  variantData: jsonb("variant_data").$type<Record<string, any>>().notNull(),
  
  // Per-variant metrics for true A/B testing
  controlImpressions: integer("control_impressions").default(0),
  variantImpressions: integer("variant_impressions").default(0),
  controlConversions: integer("control_conversions").default(0),
  variantConversions: integer("variant_conversions").default(0),
  controlRevenue: decimal("control_revenue", { precision: 10, scale: 2 }).default("0"),
  variantRevenue: decimal("variant_revenue", { precision: 10, scale: 2 }).default("0"),
  
  // Legacy aggregate fields (kept for backwards compatibility, calculated from per-variant metrics)
  arpu: decimal("arpu", { precision: 10, scale: 2 }).default("0"),
  arpuLift: decimal("arpu_lift", { precision: 5, scale: 2 }).default("0"),
  impressions: integer("impressions").default(0),
  conversions: integer("conversions").default(0),
  revenue: decimal("revenue", { precision: 10, scale: 2 }).default("0"),
  
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTestSchema = createInsertSchema(tests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTest = z.infer<typeof insertTestSchema>;
export type Test = typeof tests.$inferSelect;

// Analytics/Metrics table for tracking performance over time
export const metrics = pgTable("metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  createdAt: true,
});

export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Metric = typeof metrics.$inferSelect;