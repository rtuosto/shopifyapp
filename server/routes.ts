import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { shopify, fetchProducts, updateProduct, sessionStorage } from "./shopify";
import { generateOptimizationRecommendations, analyzeCompetitors } from "./ai-service";
import { insertRecommendationSchema, insertTestSchema } from "@shared/schema";
import { requireShopifySessionOrDev } from "./middleware/shopify-auth";
import { syncProductsFromShopify, initializeShopData } from "./sync-service";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Shopify OAuth routes
  app.get("/api/auth", async (req, res) => {
    const shop = req.query.shop as string;
    
    if (!shop) {
      return res.status(400).json({ error: "Missing shop parameter" });
    }

    const authRoute = await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(shop, true)!,
      callbackPath: "/api/auth/callback",
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });

    res.redirect(authRoute);
  });

  app.get("/api/auth/callback", async (req, res) => {
    try {
      const callback = await shopify.auth.callback({
        rawRequest: req,
        rawResponse: res,
      });

      const { session } = callback;
      
      // Store session for later use
      await sessionStorage.storeSession(session);
      console.log("Session stored for shop:", session.shop);
      
      res.redirect(`/?shop=${session.shop}`);
    } catch (error) {
      console.error("Auth callback error:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  // Products API (protected by Shopify auth in production)
  app.get("/api/products", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const products = await storage.getProducts(shop);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const product = await storage.getProduct(shop, req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  // Recommendations API (protected)
  app.get("/api/recommendations", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const status = req.query.status as string | undefined;
      const recommendations = await storage.getRecommendations(shop, status);
      res.json(recommendations);
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  app.post("/api/recommendations/generate/:productId", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const product = await storage.getProduct(shop, req.params.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      const aiRecommendations = await generateOptimizationRecommendations({
        title: product.title,
        description: product.description || "",
        price: parseFloat(product.price),
      });

      const created = await Promise.all(
        aiRecommendations.map(rec =>
          storage.createRecommendation(shop, {
            productId: product.id,
            ...rec,
          })
        )
      );

      res.json(created);
    } catch (error) {
      console.error("Error generating recommendations:", error);
      res.status(500).json({ error: "Failed to generate recommendations" });
    }
  });

  app.patch("/api/recommendations/:id", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const updated = await storage.updateRecommendation(shop, req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Recommendation not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating recommendation:", error);
      res.status(500).json({ error: "Failed to update recommendation" });
    }
  });

  // Tests API (protected)
  app.get("/api/tests", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const status = req.query.status as string | undefined;
      const tests = await storage.getTests(shop, status);
      
      // Enrich with product data
      const enrichedTests = await Promise.all(
        tests.map(async (test) => {
          const product = await storage.getProduct(shop, test.productId);
          return {
            ...test,
            productName: product?.title || "Unknown Product",
          };
        })
      );
      
      res.json(enrichedTests);
    } catch (error) {
      console.error("Error fetching tests:", error);
      res.status(500).json({ error: "Failed to fetch tests" });
    }
  });

  app.post("/api/tests", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const validatedData = insertTestSchema.parse(req.body);
      const test = await storage.createTest(shop, validatedData);
      res.json(test);
    } catch (error) {
      console.error("Error creating test:", error);
      res.status(400).json({ error: "Invalid test data" });
    }
  });

  app.patch("/api/tests/:id", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const updated = await storage.updateTest(shop, req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Test not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating test:", error);
      res.status(500).json({ error: "Failed to update test" });
    }
  });

  // Metrics API (protected)
  app.get("/api/metrics", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const metrics = await storage.getMetrics(shop, limit);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  app.get("/api/metrics/latest", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const metric = await storage.getLatestMetric(shop);
      if (!metric) {
        return res.status(404).json({ error: "No metrics found" });
      }
      res.json(metric);
    } catch (error) {
      console.error("Error fetching latest metric:", error);
      res.status(500).json({ error: "Failed to fetch latest metric" });
    }
  });

  // Dashboard summary (protected)
  app.get("/api/dashboard", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const [products, recommendations, tests, latestMetric] = await Promise.all([
        storage.getProducts(shop),
        storage.getRecommendations(shop, "pending"),
        storage.getTests(shop, "active"),
        storage.getLatestMetric(shop),
      ]);

      res.json({
        totalProducts: products.length,
        pendingRecommendations: recommendations.length,
        activeTests: tests.length,
        latestMetric,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}