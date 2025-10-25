import type { Express } from "express";
import { createServer, type Server } from "http";
import cors from "cors";
import { storage } from "./storage";
import { shopify, fetchProducts, updateProduct, getProductVariants, sessionStorage } from "./shopify";
import { generateOptimizationRecommendations } from "./ai-service";
import { insertRecommendationSchema, insertTestSchema } from "@shared/schema";
import { requireShopifySessionOrDev } from "./middleware/shopify-auth";
import { syncProductsFromShopify, initializeShopData } from "./sync-service";
import { getSyncStatus, completeSyncSuccess } from "./sync-status";
import { readFileSync } from "fs";
import { join } from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS configuration for public storefront API endpoints
  // These endpoints are called by the SDK from customer Shopify stores
  const storefrontCors = cors({
    origin: '*', // Allow all origins for public SDK
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false
  });

  // Apply CORS to all storefront endpoints
  app.use('/api/storefront', storefrontCors);
  app.options('/api/storefront/*', storefrontCors); // Handle preflight requests
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Shopify OAuth routes
  app.get("/api/auth", async (req, res) => {
    const shop = req.query.shop as string;
    
    console.log(`[OAuth] Initiating OAuth for shop: ${shop}`);
    
    if (!shop) {
      console.log('[OAuth] Missing shop parameter');
      return res.status(400).json({ error: "Missing shop parameter" });
    }

    const sanitizedShop = shopify.utils.sanitizeShop(shop, true);
    console.log(`[OAuth] Sanitized shop: ${sanitizedShop}`);

    // shopify.auth.begin handles the redirect internally
    await shopify.auth.begin({
      shop: sanitizedShop!,
      callbackPath: "/api/auth/callback",
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  });

  app.get("/api/auth/callback", async (req, res) => {
    try {
      console.log('[OAuth Callback] Processing OAuth callback...');
      
      const callback = await shopify.auth.callback({
        rawRequest: req,
        rawResponse: res,
      });

      const { session } = callback;
      
      console.log(`[OAuth Callback] OAuth successful for shop: ${session.shop}`);
      console.log(`[OAuth Callback] Session ID: ${session.id}`);
      console.log(`[OAuth Callback] Access token: ${session.accessToken ? 'present' : 'missing'}`);
      console.log(`[OAuth Callback] Scopes: ${session.scope}`);
      
      // Store session for later use
      const stored = await sessionStorage.storeSession(session);
      console.log(`[OAuth Callback] Session storage result: ${stored ? 'success' : 'failed'}`);
      
      // Register webhook for order tracking
      try {
        const { registerOrderWebhook } = await import("./shopify");
        const webhookUrl = `${process.env.REPLIT_DEV_DOMAIN ? 'https://' : 'http://'}${process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}/api/webhooks/orders/create`;
        console.log(`[OAuth Callback] Registering webhook: ${webhookUrl}`);
        await registerOrderWebhook(session, webhookUrl);
        console.log(`[OAuth Callback] Webhook registered successfully`);
      } catch (error) {
        console.error("[OAuth Callback] Error registering webhook:", error);
        // Don't fail installation if webhook registration fails
      }
      
      // Initialize shop data in background (sync products from Shopify)
      console.log(`[OAuth Callback] Starting background product sync for ${session.shop}`);
      initializeShopData(session).catch(error => {
        console.error("[OAuth Callback] Error initializing shop data:", error);
      });
      
      console.log(`[OAuth Callback] Redirecting to /?shop=${session.shop}`);
      res.redirect(`/?shop=${session.shop}`);
    } catch (error) {
      console.error("[OAuth Callback] Auth callback error:", error);
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

  app.post("/api/recommendations/generate-all", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const products = await storage.getProducts(shop);
      
      if (products.length === 0) {
        return res.json({ message: "No products found", count: 0 });
      }

      console.log(`[AI] Generating recommendations for ${products.length} products`);
      let successCount = 0;
      let errorCount = 0;

      for (const product of products) {
        try {
          // Delete existing pending recommendations for this product to prevent duplicates
          const existingRecs = await storage.getRecommendationsByProduct(shop, product.id);
          const pendingRecs = existingRecs.filter(rec => rec.status === "pending");
          if (pendingRecs.length > 0) {
            console.log(`[AI] Deleting ${pendingRecs.length} pending recommendations for: ${product.title}`);
            await Promise.all(
              pendingRecs.map(rec => storage.deleteRecommendation(shop, rec.id))
            );
          }
          
          const aiRecommendations = await generateOptimizationRecommendations({
            title: product.title,
            description: product.description || "",
            price: parseFloat(product.price),
          });

          await Promise.all(
            aiRecommendations.map(rec =>
              storage.createRecommendation(shop, {
                productId: product.id,
                ...rec,
              })
            )
          );
          
          successCount++;
          console.log(`[AI] Generated ${aiRecommendations.length} recommendations for: ${product.title}`);
        } catch (error) {
          errorCount++;
          console.error(`[AI] Failed to generate recommendations for ${product.title}:`, error);
        }
      }

      res.json({ 
        message: `Generated recommendations for ${successCount} products`, 
        successCount,
        errorCount,
        total: products.length
      });
    } catch (error) {
      console.error("Error generating bulk recommendations:", error);
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

  // Get single test with Bayesian state and metrics
  app.get("/api/tests/:id", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const test = await storage.getTest(shop, req.params.id);
      
      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }
      
      // Enrich with product data
      const product = await storage.getProduct(shop, test.productId);
      
      // Calculate derived metrics
      const controlARPU = test.controlConversions > 0 
        ? parseFloat(test.controlRevenue) / test.controlConversions 
        : 0;
      const variantARPU = test.variantConversions > 0 
        ? parseFloat(test.variantRevenue) / test.variantConversions 
        : 0;
      const arpuLift = controlARPU > 0 
        ? ((variantARPU - controlARPU) / controlARPU) * 100 
        : 0;
      
      res.json({
        ...test,
        productName: product?.title || "Unknown Product",
        metrics: {
          control: {
            impressions: test.controlImpressions,
            conversions: test.controlConversions,
            revenue: parseFloat(test.controlRevenue),
            arpu: controlARPU,
            conversionRate: test.controlImpressions > 0 
              ? (test.controlConversions / test.controlImpressions) * 100 
              : 0,
          },
          variant: {
            impressions: test.variantImpressions,
            conversions: test.variantConversions,
            revenue: parseFloat(test.variantRevenue),
            arpu: variantARPU,
            conversionRate: test.variantImpressions > 0 
              ? (test.variantConversions / test.variantImpressions) * 100 
              : 0,
          },
          arpuLift,
        },
        bayesianState: test.bayesianConfig || null,
      });
    } catch (error) {
      console.error("Error fetching test:", error);
      res.status(500).json({ error: "Failed to fetch test" });
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

  // Activate test - enable A/B testing
  // For price tests: Deploy variant prices to Shopify
  // For other tests: Storefront JavaScript handles display
  app.post("/api/tests/:id/activate", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const testId = req.params.id;
      
      // Get the test
      const test = await storage.getTest(shop, testId);
      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }
      
      if (test.status !== "draft") {
        return res.status(400).json({ error: "Only draft tests can be activated" });
      }
      
      // Get the product
      const product = await storage.getProduct(shop, test.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      console.log(`[Test Activation] Activating A/B test ${testId} for product ${product.title}`);
      console.log(`[Test Activation] Test type: ${test.testType}`);
      console.log(`[Test Activation] Control:`, test.controlData);
      console.log(`[Test Activation] Variant:`, test.variantData);
      
      // For price tests, deploy variant prices to Shopify
      if (test.testType === "price" && test.variantData.variantPrices) {
        try {
          const session = await sessionStorage.getSessionByShop(shop);
          if (!session) {
            throw new Error("No Shopify session found");
          }
          
          console.log(`[Test Activation] Deploying variant prices to Shopify...`);
          await updateProduct(session, product.shopifyProductId, {
            variants: test.variantData.variantPrices,
          });
          console.log(`[Test Activation] Variant prices deployed successfully`);
        } catch (error) {
          console.error("[Test Activation] Failed to deploy prices to Shopify:", error);
          throw new Error("Failed to deploy price changes to Shopify");
        }
      }
      
      // Initialize Bayesian state if using Bayesian allocation
      let updateData: any = {
        status: "active",
        startDate: new Date(),
      };
      
      if (test.allocationStrategy === "bayesian") {
        const { initializeBayesianState } = await import('./statistics/allocation-service');
        
        // Estimate conversion rate and AOV from product price
        const estimatedCR = 0.02; // 2% default
        const estimatedAOV = parseFloat(product.price);
        
        const bayesianState = initializeBayesianState({
          conversionRate: estimatedCR,
          avgOrderValue: estimatedAOV,
          riskMode: 'cautious',
          safetyBudget: 50,
        });
        
        updateData.bayesianConfig = bayesianState;
        updateData.controlAllocation = "75"; // Start cautious: 75% control
        updateData.variantAllocation = "5";  // 5% variant
        
        console.log(`[Test Activation] Initialized Bayesian state with cautious allocation (75/5)`);
      }
      
      // Activate the test in our database
      const activatedTest = await storage.updateTest(shop, testId, updateData);
      
      console.log(`[Test Activation] Test activated successfully`);
      
      res.json({
        success: true,
        test: activatedTest,
        message: "Test activated successfully",
      });
    } catch (error) {
      console.error("Error activating test:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to activate test";
      res.status(500).json({ error: errorMessage });
    }
  });
  
  // Deactivate test - stop A/B testing and rollback changes
  // For price tests: Restore original variant prices
  // For other tests: No Shopify changes needed
  app.post("/api/tests/:id/deactivate", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const testId = req.params.id;
      
      // Get the test
      const test = await storage.getTest(shop, testId);
      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }
      
      if (test.status !== "active") {
        return res.status(400).json({ error: "Only active tests can be deactivated" });
      }
      
      // Get the product
      const product = await storage.getProduct(shop, test.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      console.log(`[Test Deactivation] Stopping A/B test ${testId}`);
      console.log(`[Test Deactivation] Test type: ${test.testType}`);
      
      // For price tests, restore original variant prices
      if (test.testType === "price" && test.controlData.variantPrices) {
        try {
          const session = await sessionStorage.getSessionByShop(shop);
          if (!session) {
            throw new Error("No Shopify session found");
          }
          
          console.log(`[Test Deactivation] Restoring original variant prices...`);
          await updateProduct(session, product.shopifyProductId, {
            variants: test.controlData.variantPrices,
          });
          console.log(`[Test Deactivation] Original prices restored successfully`);
        } catch (error) {
          console.error("[Test Deactivation] Failed to restore prices:", error);
          throw new Error("Failed to restore original prices in Shopify");
        }
      }
      
      // Mark test as completed
      const deactivatedTest = await storage.updateTest(shop, testId, {
        status: "completed",
        endDate: new Date(),
      });
      
      console.log(`[Test Deactivation] Test stopped successfully`);
      
      res.json({
        success: true,
        test: deactivatedTest,
        message: "Test deactivated successfully",
      });
    } catch (error) {
      console.error("Error deactivating test:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to deactivate test";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Bayesian allocation update
  app.post("/api/tests/:id/update-allocation", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const testId = req.params.id;
      
      const test = await storage.getTest(shop, testId);
      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }
      
      if (test.status !== "active" || test.allocationStrategy !== "bayesian") {
        return res.status(400).json({ 
          error: "Can only update allocation for active Bayesian tests" 
        });
      }
      
      // Import allocation service
      const { computeAllocationUpdate, updateBayesianState, BayesianState } = await import('./statistics/allocation-service');
      
      // Update Bayesian state with current metrics
      const bayesianConfig = test.bayesianConfig as BayesianState || {};
      const metrics = {
        controlImpressions: test.controlImpressions || 0,
        variantImpressions: test.variantImpressions || 0,
        controlConversions: test.controlConversions || 0,
        variantConversions: test.variantConversions || 0,
        controlRevenue: parseFloat(test.controlRevenue || "0"),
        variantRevenue: parseFloat(test.variantRevenue || "0"),
      };
      
      const updatedState = updateBayesianState(bayesianConfig, metrics);
      
      // Compute new allocation
      const result = computeAllocationUpdate(updatedState, metrics);
      
      // Update test in database
      const updatedTest = await storage.updateTest(shop, testId, {
        controlAllocation: (result.allocation.control * 100).toFixed(2),
        variantAllocation: (result.allocation.variant * 100).toFixed(2),
        bayesianConfig: result.bayesianState,
      });
      
      console.log(`[Bayesian Update] Test ${testId}: Control ${(result.allocation.control * 100).toFixed(1)}% / Variant ${(result.allocation.variant * 100).toFixed(1)}%`);
      console.log(`[Bayesian Update] ${result.reasoning}`);
      
      res.json({
        test: updatedTest,
        allocation: result.allocation,
        metrics: result.metrics,
        promotionCheck: result.promotionCheck,
        shouldStop: result.shouldStop,
        reasoning: result.reasoning,
      });
    } catch (error) {
      console.error("Error updating allocation:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update allocation";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Check promotion criteria and auto-promote if ready
  app.post("/api/tests/:id/check-promotion", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const testId = req.params.id;
      
      const test = await storage.getTest(shop, testId);
      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }
      
      if (test.status !== "active" || test.allocationStrategy !== "bayesian") {
        return res.status(400).json({ 
          error: "Can only check promotion for active Bayesian tests" 
        });
      }
      
      // Import allocation service
      const { computeAllocationUpdate, BayesianState } = await import('./statistics/allocation-service');
      
      const bayesianConfig = test.bayesianConfig as BayesianState || {};
      const metrics = {
        controlImpressions: test.controlImpressions || 0,
        variantImpressions: test.variantImpressions || 0,
        controlConversions: test.controlConversions || 0,
        variantConversions: test.variantConversions || 0,
        controlRevenue: parseFloat(test.controlRevenue || "0"),
        variantRevenue: parseFloat(test.variantRevenue || "0"),
      };
      
      // Compute allocation to get promotion check
      const result = computeAllocationUpdate(bayesianConfig, metrics);
      
      // If promotion criteria met, upgrade to 100% variant
      if (result.promotionCheck.shouldPromote && result.promotionCheck.winner === "variant") {
        const updatedTest = await storage.updateTest(shop, testId, {
          controlAllocation: "0",
          variantAllocation: "100",
          status: "completed",
          endDate: new Date(),
          bayesianConfig: {
            ...result.bayesianState,
            promotionCheckCount: (result.bayesianState.promotionCheckCount || 0) + 1,
          },
        });
        
        console.log(`[Auto-Promotion] Test ${testId} promoted to 100% variant`);
        console.log(`[Auto-Promotion] Criteria: ${result.reasoning}`);
        
        return res.json({
          promoted: true,
          winner: "variant",
          test: updatedTest,
          promotionCheck: result.promotionCheck,
          reasoning: result.reasoning,
        });
      }
      
      // If should stop due to budget exhaustion, cancel test
      if (result.shouldStop) {
        const updatedTest = await storage.updateTest(shop, testId, {
          status: "cancelled",
          endDate: new Date(),
          bayesianConfig: result.bayesianState,
        });
        
        console.log(`[Auto-Stop] Test ${testId} stopped: safety budget exhausted`);
        
        return res.json({
          promoted: false,
          stopped: true,
          test: updatedTest,
          promotionCheck: result.promotionCheck,
          reasoning: result.reasoning,
        });
      }
      
      // Not ready yet
      res.json({
        promoted: false,
        stopped: false,
        promotionCheck: result.promotionCheck,
        reasoning: result.reasoning,
      });
    } catch (error) {
      console.error("Error checking promotion:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to check promotion";
      res.status(500).json({ error: errorMessage });
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
      const [products, recommendations, tests, latestMetric, syncStatus] = await Promise.all([
        storage.getProducts(shop),
        storage.getRecommendations(shop, "pending"),
        storage.getTests(shop, "active"),
        storage.getLatestMetric(shop),
        Promise.resolve(getSyncStatus(shop)),
      ]);

      res.json({
        totalProducts: products.length,
        pendingRecommendations: recommendations.length,
        activeTests: tests.length,
        latestMetric,
        syncStatus,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  // Webhook endpoint for Shopify order events
  app.post("/api/webhooks/orders/create", async (req, res) => {
    try {
      const hmac = req.get("X-Shopify-Hmac-Sha256");
      const topic = req.get("X-Shopify-Topic");
      const shop = req.get("X-Shopify-Shop-Domain");
      
      console.log(`[Webhook] Received ${topic} webhook from ${shop}`);
      
      if (!hmac || !shop) {
        console.error('[Webhook] Missing required headers');
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Verify webhook authenticity (CRITICAL: use raw body, not parsed JSON)
      const rawBody = (req as any).rawBody as Buffer;
      
      if (!rawBody) {
        console.error('[Webhook] Missing raw body for HMAC verification');
        return res.status(400).json({ error: "Missing raw body" });
      }
      
      const verified = await shopify.webhooks.validate({
        rawBody: rawBody.toString('utf8'),
        rawRequest: req,
        rawResponse: res,
      });
      
      if (!verified) {
        console.error('[Webhook] Failed to verify webhook signature');
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      console.log('[Webhook] Webhook verified successfully');
      
      const orderData = req.body;
      console.log(`[Webhook] Processing order ${orderData.id} with ${orderData.line_items?.length || 0} items`);
      
      // Extract product IDs from line items
      const shopifyProductIds = (orderData.line_items || []).map((item: any) => 
        `gid://shopify/Product/${item.product_id}`
      );
      
      if (shopifyProductIds.length === 0) {
        console.log('[Webhook] No line items in order, skipping attribution');
        return res.status(200).json({ received: true });
      }
      
      // Find matching products in our database
      const allProducts = await storage.getProducts(shop);
      const orderedProducts = allProducts.filter(p => 
        shopifyProductIds.includes(p.shopifyProductId)
      );
      
      console.log(`[Webhook] Found ${orderedProducts.length} matching products in database`);
      
      // Extract session ID from cart/order attributes
      const cartAttributes = orderData.note_attributes || [];
      const sessionAttribute = cartAttributes.find((attr: any) => 
        attr.name === '_shoptimizer_session'
      );
      
      const sessionId = sessionAttribute?.value;
      
      if (!sessionId) {
        console.log('[Webhook] No Shoptimizer session ID found in order attributes');
        // No session ID means customer didn't go through our A/B testing flow
        // This is expected for orders that didn't visit product pages
        return res.status(200).json({ received: true });
      }
      
      console.log(`[Webhook] Found session ID: ${sessionId}`);
      
      // Fetch all session assignments for this session
      const sessionAssignments = await storage.getSessionAssignments(shop, sessionId);
      
      if (sessionAssignments.length === 0) {
        console.log('[Webhook] No variant assignments found for this session');
        return res.status(200).json({ received: true });
      }
      
      console.log(`[Webhook] Found ${sessionAssignments.length} variant assignment(s) for session`);
      
      // Create a map of testId -> variant for quick lookup
      const assignmentMap = new Map(
        sessionAssignments.map(a => [a.testId, a.variant])
      );
      
      // For each product, check if there's an active test and attribute to correct variant
      for (const product of orderedProducts) {
        const activeTests = await storage.getTestsByProduct(shop, product.id);
        const activeTest = activeTests.find(t => t.status === "active");
        
        if (activeTest) {
          // Find the line item for this product to get quantity and price
          const lineItem = orderData.line_items.find((item: any) => 
            `gid://shopify/Product/${item.product_id}` === product.shopifyProductId
          );
          
          if (lineItem) {
            const revenue = parseFloat(lineItem.price) * lineItem.quantity;
            
            // Look up which variant this session saw for this test
            const variant = assignmentMap.get(activeTest.id);
            
            if (!variant) {
              console.log(`[Webhook] No variant assignment found for test ${activeTest.id}, skipping attribution`);
              // Session didn't see this test (maybe test was created after they visited)
              continue;
            }
            
            console.log(`[Webhook] Session saw "${variant}" variant for test ${activeTest.id}`);
            
            // Update per-variant metrics
            const updates: any = {
              conversions: (activeTest.conversions || 0) + lineItem.quantity,
              revenue: (parseFloat(activeTest.revenue || "0") + revenue).toString(),
            };
            
            if (variant === 'control') {
              updates.controlConversions = (activeTest.controlConversions || 0) + lineItem.quantity;
              updates.controlRevenue = (parseFloat(activeTest.controlRevenue || "0") + revenue).toString();
            } else {
              updates.variantConversions = (activeTest.variantConversions || 0) + lineItem.quantity;
              updates.variantRevenue = (parseFloat(activeTest.variantRevenue || "0") + revenue).toString();
            }
            
            // Calculate overall ARPU
            const newConversions = updates.conversions;
            const newRevenue = parseFloat(updates.revenue);
            const arpu = newConversions > 0 ? newRevenue / newConversions : 0;
            updates.arpu = arpu.toString();
            
            console.log(`[Webhook] Attributing conversion to ${variant} for test ${activeTest.id}: ${lineItem.quantity}x ${product.title} = $${revenue}`);
            console.log(`[Webhook] Control metrics - Conversions: ${updates.controlConversions || 0}, Revenue: $${parseFloat(updates.controlRevenue || "0").toFixed(2)}`);
            console.log(`[Webhook] Variant metrics - Conversions: ${updates.variantConversions || 0}, Revenue: $${parseFloat(updates.variantRevenue || "0").toFixed(2)}`);
            console.log(`[Webhook] Overall metrics - Conversions: ${newConversions}, Revenue: $${newRevenue.toFixed(2)}, ARPU: $${arpu.toFixed(2)}`);
            
            // Update test metrics
            await storage.updateTest(shop, activeTest.id, updates);
            console.log(`[Webhook] Successfully attributed conversion for test ${activeTest.id}`);
          }
        }
      }
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[Webhook] Error processing order webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  // Sync products from Shopify (protected)
  app.post("/api/sync/products", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      
      // Get session for this shop
      const session = await sessionStorage.getSessionByShop(shop);
      if (!session) {
        // In dev mode without session, update sync status and return helpful message
        if (process.env.NODE_ENV === "development") {
          completeSyncSuccess(shop, 0);
          return res.status(200).json({ 
            success: true,
            syncedCount: 0,
            message: "Dev mode: No Shopify session available. Install the app to sync products." 
          });
        }
        return res.status(401).json({ error: "No valid session found. Please reinstall the app." });
      }

      const syncedCount = await syncProductsFromShopify(session);
      
      res.json({ 
        success: true, 
        syncedCount,
        message: `Successfully synced ${syncedCount} products from Shopify` 
      });
    } catch (error) {
      console.error("Error syncing products:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to sync products from Shopify";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Simulation endpoints for testing A/B test allocation and tracking
  // POST /api/simulate/traffic - Simulates product impressions
  app.post("/api/simulate/traffic", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { testId, impressions = 100 } = req.body;

      if (!testId) {
        return res.status(400).json({ error: "testId is required" });
      }

      const test = await storage.getTest(shop, testId);
      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }

      if (test.status !== "active") {
        return res.status(400).json({ error: "Test must be active to simulate traffic" });
      }

      console.log(`[Simulate Traffic] START - testId: ${testId}, requested impressions: ${impressions}`);
      console.log(`[Simulate Traffic] Test state BEFORE: impressions=${test.impressions}, control=${test.controlImpressions}, variant=${test.variantImpressions}`);
      
      // Use current allocation percentages for realistic simulation
      const controlAllocation = parseFloat(test.controlAllocation || "50") / 100;
      const variantAllocation = parseFloat(test.variantAllocation || "50") / 100;
      const totalAllocation = controlAllocation + variantAllocation;
      
      const controlImpressions = Math.floor(impressions * (controlAllocation / totalAllocation));
      const variantImpressions = impressions - controlImpressions;

      console.log(`[Simulate Traffic] Will create ${controlImpressions} control + ${variantImpressions} variant = ${controlImpressions + variantImpressions} total records`);

      // Create individual impression records with unique session IDs
      const { randomUUID } = await import("crypto");
      for (let i = 0; i < controlImpressions; i++) {
        await storage.createTestImpression({
          testId,
          sessionId: randomUUID(),
          variant: "control",
        });
      }
      console.log(`[Simulate Traffic] Created ${controlImpressions} control impression records`);
      
      for (let i = 0; i < variantImpressions; i++) {
        await storage.createTestImpression({
          testId,
          sessionId: randomUUID(),
          variant: "variant",
        });
      }
      console.log(`[Simulate Traffic] Created ${variantImpressions} variant impression records`);

      // Update test with new aggregate impressions
      const newControlImpressions = (test.controlImpressions || 0) + controlImpressions;
      const newVariantImpressions = (test.variantImpressions || 0) + variantImpressions;
      const newImpressions = (test.impressions || 0) + impressions;
      
      await storage.updateTest(shop, testId, {
        impressions: newImpressions,
        controlImpressions: newControlImpressions,
        variantImpressions: newVariantImpressions,
      });

      console.log(`[Simulation] Generated ${impressions} impressions for test ${testId} (${controlImpressions} control, ${variantImpressions} variant)`);

      res.json({
        success: true,
        testId,
        impressions: {
          total: impressions,
          control: controlImpressions,
          variant: variantImpressions,
        },
        totalImpressions: newImpressions,
      });
    } catch (error) {
      console.error("Error simulating traffic:", error);
      res.status(500).json({ error: "Failed to simulate traffic" });
    }
  });

  // POST /api/simulate/orders - Simulates orders/conversions
  app.post("/api/simulate/orders", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { 
        testId, 
        orders = 10, 
        avgOrderValue,
        conversionRate 
      } = req.body;

      if (!testId) {
        return res.status(400).json({ error: "testId is required" });
      }

      const test = await storage.getTest(shop, testId);
      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }

      if (test.status !== "active") {
        return res.status(400).json({ error: "Test must be active to simulate orders" });
      }

      // Get the product to use realistic pricing
      const product = await storage.getProduct(shop, test.productId);
      if (!product) {
        return res.status(400).json({ error: "Product not found" });
      }

      // Use provided avgOrderValue or product price
      const basePrice = avgOrderValue || parseFloat(product.price);

      // Use current allocation percentages for realistic simulation
      const controlAllocation = parseFloat(test.controlAllocation || "50") / 100;
      const variantAllocation = parseFloat(test.variantAllocation || "50") / 100;
      const totalAllocation = controlAllocation + variantAllocation;
      
      const controlOrders = Math.floor(orders * (controlAllocation / totalAllocation));
      const variantOrders = orders - controlOrders;

      // Create individual conversion records with revenue tracking
      const { randomUUID } = await import("crypto");
      let totalRevenue = 0;
      let controlRevenue = 0;
      let variantRevenue = 0;

      for (let i = 0; i < controlOrders; i++) {
        const variance = 0.8 + Math.random() * 0.4; // 0.8 to 1.2x
        const orderValue = basePrice * variance;
        totalRevenue += orderValue;
        controlRevenue += orderValue;
        
        await storage.createTestConversion({
          testId,
          sessionId: randomUUID(),
          variant: "control",
          revenue: orderValue.toFixed(2),
        });
      }

      for (let i = 0; i < variantOrders; i++) {
        const variance = 0.8 + Math.random() * 0.4; // 0.8 to 1.2x
        const orderValue = basePrice * variance;
        totalRevenue += orderValue;
        variantRevenue += orderValue;
        
        await storage.createTestConversion({
          testId,
          sessionId: randomUUID(),
          variant: "variant",
          revenue: orderValue.toFixed(2),
        });
      }

      // Update test metrics with aggregate counters
      const newControlConversions = (test.controlConversions || 0) + controlOrders;
      const newVariantConversions = (test.variantConversions || 0) + variantOrders;
      const newConversions = (test.conversions || 0) + orders;
      const newControlRevenue = parseFloat(test.controlRevenue || "0") + controlRevenue;
      const newVariantRevenue = parseFloat(test.variantRevenue || "0") + variantRevenue;
      const newRevenue = parseFloat(test.revenue || "0") + totalRevenue;
      
      // Calculate ARPU for each variant
      const controlArpu = newControlConversions > 0 ? newControlRevenue / newControlConversions : 0;
      const variantArpu = newVariantConversions > 0 ? newVariantRevenue / newVariantConversions : 0;
      const arpu = newConversions > 0 ? newRevenue / newConversions : 0;

      await storage.updateTest(shop, testId, {
        conversions: newConversions,
        controlConversions: newControlConversions,
        variantConversions: newVariantConversions,
        revenue: newRevenue.toString(),
        controlRevenue: newControlRevenue.toString(),
        variantRevenue: newVariantRevenue.toString(),
        arpu: arpu.toString(),
      });

      console.log(`[Simulation] Generated ${orders} orders for test ${testId}`);
      console.log(`[Simulation] Control: ${controlOrders}, Variant: ${variantOrders}`);
      console.log(`[Simulation] Revenue: $${totalRevenue.toFixed(2)}, ARPU: $${arpu.toFixed(2)}`);

      res.json({
        success: true,
        testId,
        orders: {
          total: orders,
          control: controlOrders,
          variant: variantOrders,
        },
        revenue: totalRevenue.toFixed(2),
        totalConversions: newConversions,
        totalRevenue: newRevenue.toFixed(2),
        arpu: arpu.toFixed(2),
      });
    } catch (error) {
      console.error("Error simulating orders:", error);
      res.status(500).json({ error: "Failed to simulate orders" });
    }
  });

  // POST /api/simulate/batch - Simulates both traffic and orders in a realistic ratio
  app.post("/api/simulate/batch", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { 
        testId, 
        visitors = 1000,
        conversionRate = 0.03, // 3% default
        avgOrderValue
      } = req.body;

      if (!testId) {
        return res.status(400).json({ error: "testId is required" });
      }

      const test = await storage.getTest(shop, testId);
      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }

      if (test.status !== "active") {
        return res.status(400).json({ error: "Test must be active to simulate batch" });
      }

      // Simulate traffic (impressions) using current allocation percentages
      const controlAllocation = parseFloat(test.controlAllocation || "50") / 100;
      const variantAllocation = parseFloat(test.variantAllocation || "50") / 100;
      const totalAllocation = controlAllocation + variantAllocation;
      
      const controlImpressions = Math.floor(visitors * (controlAllocation / totalAllocation));
      const variantImpressions = visitors - controlImpressions;

      // Simulate conversions based on conversion rate and allocation
      const expectedOrders = Math.floor(visitors * conversionRate);
      const controlOrders = Math.floor(expectedOrders * (controlAllocation / totalAllocation));
      const variantOrders = expectedOrders - controlOrders;

      // Get the product to use realistic pricing
      const product = await storage.getProduct(shop, test.productId);
      if (!product) {
        return res.status(400).json({ error: "Product not found" });
      }

      const basePrice = avgOrderValue || parseFloat(product.price);
      const { randomUUID } = await import("crypto");

      // Create impression records using bulk insert for performance
      const impressionRecords = [];
      for (let i = 0; i < controlImpressions; i++) {
        impressionRecords.push({
          testId,
          sessionId: randomUUID(),
          variant: "control" as const,
        });
      }
      for (let i = 0; i < variantImpressions; i++) {
        impressionRecords.push({
          testId,
          sessionId: randomUUID(),
          variant: "variant" as const,
        });
      }
      await storage.createTestImpressionsBulk(impressionRecords);

      // Create conversion records using bulk insert for performance
      let controlRevenue = 0;
      let variantRevenue = 0;
      const conversionRecords = [];
      
      for (let i = 0; i < controlOrders; i++) {
        const variance = 0.8 + Math.random() * 0.4;
        const orderValue = basePrice * variance;
        controlRevenue += orderValue;
        
        conversionRecords.push({
          testId,
          sessionId: randomUUID(),
          variant: "control" as const,
          revenue: orderValue.toFixed(2),
        });
      }
      
      for (let i = 0; i < variantOrders; i++) {
        const variance = 0.8 + Math.random() * 0.4;
        const orderValue = basePrice * variance;
        variantRevenue += orderValue;
        
        conversionRecords.push({
          testId,
          sessionId: randomUUID(),
          variant: "variant" as const,
          revenue: orderValue.toFixed(2),
        });
      }
      await storage.createTestConversionsBulk(conversionRecords);
      
      const totalRevenue = controlRevenue + variantRevenue;

      // Update test metrics - both aggregate and per-variant
      const newControlImpressions = (test.controlImpressions || 0) + controlImpressions;
      const newVariantImpressions = (test.variantImpressions || 0) + variantImpressions;
      const newControlConversions = (test.controlConversions || 0) + controlOrders;
      const newVariantConversions = (test.variantConversions || 0) + variantOrders;
      const newControlRevenue = parseFloat(test.controlRevenue || "0") + controlRevenue;
      const newVariantRevenue = parseFloat(test.variantRevenue || "0") + variantRevenue;
      
      const newImpressions = (test.impressions || 0) + visitors;
      const newConversions = (test.conversions || 0) + expectedOrders;
      const newRevenue = parseFloat(test.revenue || "0") + totalRevenue;
      const arpu = newConversions > 0 ? newRevenue / newConversions : 0;

      const updatedTest = await storage.updateTest(shop, testId, {
        // Aggregate metrics
        impressions: newImpressions,
        conversions: newConversions,
        revenue: newRevenue.toString(),
        arpu: arpu.toString(),
        // Per-variant metrics
        controlImpressions: newControlImpressions,
        variantImpressions: newVariantImpressions,
        controlConversions: newControlConversions,
        variantConversions: newVariantConversions,
        controlRevenue: newControlRevenue.toString(),
        variantRevenue: newVariantRevenue.toString(),
      });

      console.log(`[Simulation Batch] Test ${testId}: ${visitors} visitors, ${expectedOrders} orders (${conversionRate * 100}% CR)`);
      console.log(`[Simulation Batch] Allocation - Control: ${controlImpressions}/${controlOrders}, Variant: ${variantImpressions}/${variantOrders}`);
      console.log(`[Simulation Batch] Revenue: $${totalRevenue.toFixed(2)}, ARPU: $${arpu.toFixed(2)}`);

      // Update Bayesian allocation if using Bayesian strategy
      let bayesianUpdate = null;
      if (updatedTest && updatedTest.allocationStrategy === "bayesian") {
        try {
          const { computeAllocationUpdate, updateBayesianState, BayesianState } = await import('./statistics/allocation-service');
          
          const bayesianConfig = updatedTest.bayesianConfig as BayesianState || {};
          const metrics = {
            controlImpressions: newControlImpressions,
            variantImpressions: newVariantImpressions,
            controlConversions: newControlConversions,
            variantConversions: newVariantConversions,
            controlRevenue: newControlRevenue,
            variantRevenue: newVariantRevenue,
          };
          
          const updatedState = updateBayesianState(bayesianConfig, metrics);
          const result = computeAllocationUpdate(updatedState, metrics);
          
          // Update allocation in database
          await storage.updateTest(shop, testId, {
            controlAllocation: (result.allocation.control * 100).toFixed(2),
            variantAllocation: (result.allocation.variant * 100).toFixed(2),
            bayesianConfig: result.bayesianState,
          });
          
          bayesianUpdate = {
            newAllocation: {
              control: (result.allocation.control * 100).toFixed(1),
              variant: (result.allocation.variant * 100).toFixed(1),
            },
            metrics: result.metrics,
            reasoning: result.reasoning,
          };
          
          console.log(`[Bayesian Update] New allocation: Control ${bayesianUpdate.newAllocation.control}% / Variant ${bayesianUpdate.newAllocation.variant}%`);
          console.log(`[Bayesian Update] ${result.reasoning}`);
        } catch (error) {
          console.error("[Bayesian Update] Failed to update allocation:", error);
        }
      }

      res.json({
        success: true,
        testId,
        simulation: {
          visitors,
          conversionRate: conversionRate * 100,
          orders: expectedOrders,
        },
        allocation: {
          control: {
            impressions: controlImpressions,
            orders: controlOrders,
          },
          variant: {
            impressions: variantImpressions,
            orders: variantOrders,
          },
        },
        metrics: {
          totalImpressions: newImpressions,
          totalConversions: newConversions,
          totalRevenue: newRevenue.toFixed(2),
          arpu: arpu.toFixed(2),
        },
        bayesianUpdate,
      });
    } catch (error) {
      console.error("Error simulating batch:", error);
      res.status(500).json({ error: "Failed to simulate batch" });
    }
  });

  // ==========================================
  // STOREFRONT API (PUBLIC - No Auth Required)
  // ==========================================
  
  // Get all active tests for a shop (new unified endpoint)
  app.get("/api/storefront/tests", async (req, res) => {
    try {
      const shop = req.query.shop as string;
      
      if (!shop) {
        return res.status(400).json({ error: "Missing shop parameter" });
      }
      
      // Get all active tests
      const tests = await storage.getTests(shop);
      const activeTests = tests.filter(t => t.status === "active");
      
      // Get products to map product IDs to Shopify IDs
      const products = await storage.getProducts(shop);
      const productMap = new Map(products.map(p => [p.id, p.shopifyProductId]));
      
      // Format tests for storefront use
      const formattedTests = activeTests.map(test => ({
        id: test.id,
        shopifyProductId: productMap.get(test.productId || ''),
        testType: test.testType,
        controlData: test.controlData,
        variantData: test.variantData,
        scope: test.scope || 'product',
      }));
      
      res.json({ tests: formattedTests });
    } catch (error) {
      console.error("Error fetching storefront tests:", error);
      res.status(500).json({ error: "Failed to fetch tests" });
    }
  });
  
  // Get active test data for a product (legacy endpoint - kept for backwards compatibility)
  app.get("/api/storefront/test/:shopifyProductId", async (req, res) => {
    try {
      const shopifyProductId = req.params.shopifyProductId;
      const shop = req.query.shop as string;
      
      if (!shop) {
        return res.status(400).json({ error: "Missing shop parameter" });
      }
      
      // Find the product
      const products = await storage.getProducts(shop);
      const product = products.find(p => p.shopifyProductId === shopifyProductId);
      
      if (!product) {
        return res.json({ activeTest: null });
      }
      
      // Find active test for this product
      const tests = await storage.getTests(shop);
      const activeTest = tests.find(t => 
        t.productId === product.id && 
        t.status === "active"
      );
      
      if (!activeTest) {
        return res.json({ activeTest: null });
      }
      
      // Return test data for storefront use
      res.json({
        activeTest: {
          id: activeTest.id,
          testType: activeTest.testType,
          controlData: activeTest.controlData,
          variantData: activeTest.variantData,
        },
      });
    } catch (error) {
      console.error("Error fetching storefront test:", error);
      res.status(500).json({ error: "Failed to fetch test" });
    }
  });
  
  // Record session assignment (persistent variant assignment)
  app.post("/api/storefront/assign", async (req, res) => {
    try {
      const { sessionId, testId, variant, shop } = req.body;
      
      if (!sessionId || !testId || !variant || !shop) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      if (variant !== "control" && variant !== "variant") {
        return res.status(400).json({ error: "Invalid variant value" });
      }
      
      // Check if test exists and is active
      const test = await storage.getTest(shop, testId);
      if (!test || test.status !== "active") {
        return res.status(404).json({ error: "Active test not found" });
      }
      
      // Record the assignment (90-day expiry)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
      
      await storage.createSessionAssignment(shop, {
        sessionId,
        testId,
        variant,
        expiresAt,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording session assignment:", error);
      res.status(500).json({ error: "Failed to record assignment" });
    }
  });
  
  // Get session assignments for a session ID
  app.get("/api/storefront/assignments/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const shop = req.query.shop as string;
      
      if (!shop) {
        return res.status(400).json({ error: "Missing shop parameter" });
      }
      
      const assignments = await storage.getSessionAssignments(shop, sessionId);
      
      // Filter out expired assignments
      const now = new Date();
      const validAssignments = assignments.filter((a) => new Date(a.expiresAt) > now);
      
      res.json({ assignments: validAssignments });
    } catch (error) {
      console.error("Error fetching session assignments:", error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });
  
  // Track impression (product page view) with session tracking
  app.post("/api/storefront/impression", async (req, res) => {
    try {
      const { testId, variant, sessionId, shop } = req.body;
      
      if (!testId || !variant || !shop) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      if (variant !== "control" && variant !== "variant") {
        return res.status(400).json({ error: "Invalid variant value" });
      }
      
      // Get the test
      const test = await storage.getTest(shop, testId);
      if (!test || test.status !== "active") {
        return res.status(404).json({ error: "Active test not found" });
      }
      
      // Increment the appropriate impression counter
      const updates: any = {
        impressions: (test.impressions || 0) + 1,
      };
      
      if (variant === "control") {
        updates.controlImpressions = (test.controlImpressions || 0) + 1;
      } else {
        updates.variantImpressions = (test.variantImpressions || 0) + 1;
      }
      
      await storage.updateTest(shop, testId, updates);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking impression:", error);
      res.status(500).json({ error: "Failed to track impression" });
    }
  });

  // Serve auto-configured storefront SDK with Replit URL pre-filled
  app.get("/shoptimizer.js", (req, res) => {
    try {
      // Get Replit app URL from environment (auto-detects deployed URL)
      const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.REPLIT_DEV_DOMAIN;
      const apiUrl = replitDomain ? `https://${replitDomain}` : 'http://localhost:5000';
      
      console.log(`[SDK] Serving auto-configured SDK with API URL: ${apiUrl}`);
      
      // Read the SDK file
      const sdkPath = join(import.meta.dirname, '../public/shoptimizer.js');
      const sdkContent = readFileSync(sdkPath, 'utf8');
      
      // Inject the API URL into the SDK (replaces default placeholder)
      const configuredSdk = sdkContent.replace(
        "apiUrl: window.ShoptimizerConfig?.apiUrl || 'https://your-app.replit.app'",
        `apiUrl: window.ShoptimizerConfig?.apiUrl || '${apiUrl}'`
      );
      
      res.type('application/javascript');
      res.send(configuredSdk);
    } catch (error) {
      console.error('[SDK] Error serving shoptimizer.js:', error);
      res.status(500).send('// Error loading Shoptimizer SDK');
    }
  });

  // Get installation instructions (for Settings page)
  app.get("/api/installation-script", requireShopifySessionOrDev, async (req, res) => {
    try {
      const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.REPLIT_DEV_DOMAIN;
      const apiUrl = replitDomain ? `https://${replitDomain}` : 'http://localhost:5000';
      
      const scriptTag = `<script src="${apiUrl}/shoptimizer.js" defer></script>`;

      const webhookUrl = `${apiUrl}/api/webhooks/orders/create`;
      
      res.json({
        apiUrl,
        scriptTag,
        webhookUrl,
        isDev: !replitDomain || replitDomain.includes('replit.dev'),
      });
    } catch (error) {
      console.error("Error getting installation script:", error);
      res.status(500).json({ error: "Failed to get installation script" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}