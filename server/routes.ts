import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { shopify, fetchProducts, updateProduct, getProductVariants, sessionStorage } from "./shopify";
import { generateOptimizationRecommendations } from "./ai-service";
import { insertRecommendationSchema, insertTestSchema } from "@shared/schema";
import { requireShopifySessionOrDev } from "./middleware/shopify-auth";
import { syncProductsFromShopify, initializeShopData } from "./sync-service";
import { getSyncStatus, completeSyncSuccess } from "./sync-status";

export async function registerRoutes(app: Express): Promise<Server> {
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

  // Activate test - deploy variant to Shopify
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
      
      // Get Shopify session
      const session = await sessionStorage.getSessionByShop(shop);
      if (!session) {
        return res.status(401).json({ error: "No valid Shopify session found" });
      }
      
      console.log(`[Test Activation] Deploying test ${testId} for product ${product.title}`);
      console.log(`[Test Activation] Variant data:`, test.variantData);
      
      // CRITICAL: Fetch current product state from Shopify before making changes
      // This ensures we can safely revert even if product was edited after test creation
      const currentProductData = await getProductVariants(session, product.shopifyProductId);
      const currentProduct = currentProductData?.product;
      
      if (!currentProduct) {
        throw new Error("Failed to fetch current product state from Shopify");
      }
      
      // Capture the actual current state as control data (all fields that might be changed)
      // CRITICAL: Always capture all fields, even if empty, to ensure complete rollback
      const actualControlData: Record<string, any> = {
        title: currentProduct.title,
        description: currentProduct.descriptionHtml || "", // Always capture, even if empty
      };
      
      // Get current price from first variant
      const currentVariants = currentProduct.variants?.edges || [];
      if (currentVariants.length > 0) {
        actualControlData.price = parseFloat(currentVariants[0].node.price);
      }
      
      console.log(`[Test Activation] Captured current product state:`, actualControlData);
      
      // Build Shopify update payload
      const updatePayload: any = {};
      
      if (test.variantData.title) {
        updatePayload.title = test.variantData.title;
      }
      
      if (test.variantData.description) {
        updatePayload.descriptionHtml = test.variantData.description;
      }
      
      // For price updates, we need variant IDs
      if (test.variantData.price && currentVariants.length > 0) {
        updatePayload.variants = currentVariants.map((edge: any) => ({
          id: edge.node.id,
          price: test.variantData.price.toString(),
        }));
      }
      
      // Update product in Shopify
      await updateProduct(session, product.shopifyProductId, updatePayload);
      
      console.log(`[Test Activation] Successfully updated Shopify product`);
      
      // Update test status to active AND store actual control data
      const activatedTest = await storage.updateTest(shop, testId, {
        status: "active",
        startDate: new Date(),
        controlData: actualControlData, // Store the current state for safe rollback
      });
      
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
  
  // Deactivate test - revert to original product values
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
      
      // Get Shopify session
      const session = await sessionStorage.getSessionByShop(shop);
      if (!session) {
        return res.status(401).json({ error: "No valid Shopify session found" });
      }
      
      console.log(`[Test Deactivation] Reverting test ${testId} for product ${product.title}`);
      console.log(`[Test Deactivation] Control data:`, test.controlData);
      
      // Build Shopify update payload to revert to control
      // CRITICAL: Check field existence, not truthiness, to handle empty strings
      const updatePayload: any = {};
      
      if ("title" in test.controlData) {
        updatePayload.title = test.controlData.title;
      }
      
      if ("description" in test.controlData) {
        updatePayload.descriptionHtml = test.controlData.description;
      }
      
      // For price updates, we need to get variant IDs first
      if (test.controlData.price) {
        const variantsData = await getProductVariants(session, product.shopifyProductId);
        const variants = variantsData?.product?.variants?.edges || [];
        
        if (variants.length > 0) {
          updatePayload.variants = variants.map((edge: any) => ({
            id: edge.node.id,
            price: test.controlData.price.toString(),
          }));
        }
      }
      
      // Update product in Shopify to revert changes
      await updateProduct(session, product.shopifyProductId, updatePayload);
      
      console.log(`[Test Deactivation] Successfully reverted Shopify product`);
      
      // Update test status to completed
      const deactivatedTest = await storage.updateTest(shop, testId, {
        status: "completed",
        endDate: new Date(),
      });
      
      res.json({
        success: true,
        test: deactivatedTest,
        message: "Test deactivated and product reverted successfully",
      });
    } catch (error) {
      console.error("Error deactivating test:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to deactivate test";
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
      
      // For each product, check if there's an active test
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
            const newConversions = (activeTest.conversions || 0) + lineItem.quantity;
            const newRevenue = parseFloat(activeTest.revenue || "0") + revenue;
            
            // Calculate ARPU (Average Revenue Per User = total revenue / total conversions)
            const arpu = newConversions > 0 ? newRevenue / newConversions : 0;
            
            console.log(`[Webhook] Attributing conversion to test ${activeTest.id}: ${lineItem.quantity}x ${product.title} = $${revenue}`);
            console.log(`[Webhook] Test metrics - Conversions: ${newConversions}, Revenue: $${newRevenue.toFixed(2)}, ARPU: $${arpu.toFixed(2)}`);
            
            // Update test metrics including ARPU
            await storage.updateTest(shop, activeTest.id, {
              conversions: newConversions,
              revenue: newRevenue.toString(),
              arpu: arpu.toString(),
            });
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

      // Simulate impressions (50/50 split between control and variant)
      const controlImpressions = Math.floor(impressions / 2);
      const variantImpressions = impressions - controlImpressions;

      // Update test with new impressions
      const newImpressions = (test.impressions || 0) + impressions;
      await storage.updateTest(shop, testId, {
        impressions: newImpressions,
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

      // Simulate orders with 50/50 allocation (simulating random assignment)
      const controlOrders = Math.floor(orders / 2);
      const variantOrders = orders - controlOrders;

      // Generate realistic order values with some variance (±20%)
      let totalRevenue = 0;
      for (let i = 0; i < orders; i++) {
        const variance = 0.8 + Math.random() * 0.4; // 0.8 to 1.2x
        const orderValue = basePrice * variance;
        totalRevenue += orderValue;
      }

      // Update test metrics
      const newConversions = (test.conversions || 0) + orders;
      const newRevenue = parseFloat(test.revenue || "0") + totalRevenue;
      const arpu = newConversions > 0 ? newRevenue / newConversions : 0;

      await storage.updateTest(shop, testId, {
        conversions: newConversions,
        revenue: newRevenue.toString(),
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

      // Simulate traffic (impressions)
      const controlImpressions = Math.floor(visitors / 2);
      const variantImpressions = visitors - controlImpressions;
      const newImpressions = (test.impressions || 0) + visitors;

      // Simulate conversions based on conversion rate
      const expectedOrders = Math.floor(visitors * conversionRate);
      const controlOrders = Math.floor(expectedOrders / 2);
      const variantOrders = expectedOrders - controlOrders;

      // Get the product to use realistic pricing
      const product = await storage.getProduct(shop, test.productId);
      if (!product) {
        return res.status(400).json({ error: "Product not found" });
      }

      const basePrice = avgOrderValue || parseFloat(product.price);

      // Generate realistic order values
      let totalRevenue = 0;
      for (let i = 0; i < expectedOrders; i++) {
        const variance = 0.8 + Math.random() * 0.4;
        totalRevenue += basePrice * variance;
      }

      // Update test metrics
      const newConversions = (test.conversions || 0) + expectedOrders;
      const newRevenue = parseFloat(test.revenue || "0") + totalRevenue;
      const arpu = newConversions > 0 ? newRevenue / newConversions : 0;

      await storage.updateTest(shop, testId, {
        impressions: newImpressions,
        conversions: newConversions,
        revenue: newRevenue.toString(),
        arpu: arpu.toString(),
      });

      console.log(`[Simulation Batch] Test ${testId}: ${visitors} visitors, ${expectedOrders} orders (${conversionRate * 100}% CR)`);
      console.log(`[Simulation Batch] Allocation - Control: ${controlImpressions}/${controlOrders}, Variant: ${variantImpressions}/${variantOrders}`);
      console.log(`[Simulation Batch] Revenue: $${totalRevenue.toFixed(2)}, ARPU: $${arpu.toFixed(2)}`);

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
      });
    } catch (error) {
      console.error("Error simulating batch:", error);
      res.status(500).json({ error: "Failed to simulate batch" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}