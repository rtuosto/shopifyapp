import type { Express } from "express";
import { createServer, type Server } from "http";
import cors from "cors";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { storage } from "./storage";
import { shopify, fetchProducts, updateProduct, getProductVariants, sessionStorage } from "./shopify";
import { generateOptimizationRecommendations, generateBatchRecommendations } from "./ai-service";
import { insertRecommendationSchema, insertOptimizationSchema } from "@shared/schema";
import { requireShopifySessionOrDev } from "./middleware/shopify-auth";
import { syncProductsFromShopify, initializeShopData } from "./sync-service";
import { getSyncStatus, completeSyncSuccess } from "./sync-status";
import { selectTopProducts } from "./recommendation-engine";
import type { BayesianState } from "./statistics/allocation-service";

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS configuration for public API endpoints
  // These endpoints are called from storefronts via Shopify App Proxy
  const storefrontCors = cors({
    origin: '*', // Allow all origins for public SDK
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false
  });

  // Apply CORS to all storefront endpoints
  app.use('/api/storefront', storefrontCors);
  app.options('/api/storefront/*', storefrontCors); // Handle preflight requests

  // App Proxy endpoints for Theme App Extension runtime
  // These are called from the storefront via Shopify App Proxy
  app.use('/apps/cro-proxy', storefrontCors);
  app.options('/apps/cro-proxy/*', storefrontCors);

  // Shopify App Proxy HMAC validation helper
  // Validates requests coming through Shopify's App Proxy
  function validateAppProxySignature(query: Record<string, any>): { valid: boolean; shop: string | null } {
    const signature = query.signature as string;
    if (!signature) {
      // In development mode, allow requests without signature
      if (process.env.NODE_ENV === 'development' && query.shop) {
        console.log('[App Proxy] Dev mode: skipping HMAC validation');
        return { valid: true, shop: query.shop as string };
      }
      return { valid: false, shop: null };
    }

    const apiSecret = process.env.SHOPIFY_API_SECRET;
    if (!apiSecret) {
      console.error('[App Proxy] SHOPIFY_API_SECRET not configured');
      return { valid: false, shop: null };
    }

    // Build sorted query string (excluding signature)
    const sortedParams = Object.keys(query)
      .filter(key => key !== 'signature')
      .sort()
      .map(key => `${key}=${Array.isArray(query[key]) ? query[key].join(',') : query[key]}`)
      .join('');

    // Compute HMAC
    const computedSignature = createHmac('sha256', apiSecret)
      .update(sortedParams)
      .digest('hex');

    if (computedSignature === signature) {
      return { valid: true, shop: query.shop as string };
    }

    console.warn('[App Proxy] HMAC validation failed');
    return { valid: false, shop: null };
  }

  // App Proxy: Get experiment configuration for storefront
  app.get("/apps/cro-proxy/config", async (req, res) => {
    try {
      // Validate App Proxy signature
      const { valid, shop } = validateAppProxySignature(req.query as Record<string, any>);
      
      if (!valid || !shop) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      console.log(`[App Proxy] Config request for shop: ${shop}`);
      
      // Get all LIVE slot experiments for this shop
      const experiments = await storage.getLiveSlotExperiments(shop);
      
      // Transform to config format for runtime.js
      const config = experiments.map(exp => ({
        id: exp.id,
        name: exp.name,
        slot_id: exp.slotId,
        status: exp.status,
        allocation: parseFloat(exp.allocation || "0.50"),
        variants: {
          A: exp.variantA,
          B: exp.variantB,
        },
      }));

      console.log(`[App Proxy] Returning ${config.length} experiments for ${shop}`);
      
      res.json({ 
        experiments: config,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      console.error("[App Proxy] Config error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // App Proxy: Track experiment event from storefront
  // Security layers:
  // 1. HMAC validation on query params (Shopify App Proxy standard)
  // 2. Experiment must exist for the authenticated shop
  // 3. Variant must be valid (A or B)
  // 4. Event type must be from allowed list
  // Note: Shopify App Proxy only signs query params, not POST body.
  // Additional protection comes from experiment-shop binding.
  app.post("/apps/cro-proxy/event", async (req, res) => {
    try {
      // Validate App Proxy signature
      const { valid, shop } = validateAppProxySignature(req.query as Record<string, any>);
      
      if (!valid || !shop) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { 
        experiment_id, 
        variant, 
        event_type, 
        cro_vid, 
        path,
        revenue,
        timestamp,
        ...metadata 
      } = req.body;

      if (!experiment_id || !variant || !event_type || !cro_vid) {
        return res.status(400).json({ 
          error: "Missing required fields: experiment_id, variant, event_type, cro_vid" 
        });
      }

      // Validate event type (whitelist allowed types)
      const allowedEventTypes = ['slot_view', 'add_to_cart', 'purchase'];
      if (!allowedEventTypes.includes(event_type)) {
        return res.status(400).json({ error: "Invalid event type" });
      }

      // Optional: Validate timestamp is within acceptable range (prevent very old replays)
      if (timestamp) {
        const eventTime = new Date(timestamp);
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes
        if (now - eventTime.getTime() > maxAge) {
          console.warn(`[App Proxy] Event rejected: timestamp too old`);
          return res.status(400).json({ error: "Stale event" });
        }
      }

      console.log(`[App Proxy] Event: ${event_type} for experiment ${experiment_id}, variant ${variant}`);

      // Validate experiment exists for this shop (prevents cross-shop spoofing)
      const experiment = await storage.getSlotExperiment(shop, experiment_id);
      if (!experiment) {
        console.warn(`[App Proxy] Event rejected: experiment ${experiment_id} not found for shop ${shop}`);
        return res.status(404).json({ error: "Experiment not found" });
      }

      // Validate variant is valid
      if (variant !== 'A' && variant !== 'B') {
        return res.status(400).json({ error: "Invalid variant" });
      }

      // Create event record
      await storage.createExperimentEvent(shop, {
        experimentId: experiment_id,
        visitorId: cro_vid,
        variant,
        eventType: event_type,
        path,
        metadata,
        revenue: revenue ? revenue.toString() : null,
      });

      // Update experiment metrics
      const updates: Record<string, any> = {};
      
      if (event_type === 'slot_view') {
        if (variant === 'A') {
          updates.viewsA = (experiment.viewsA || 0) + 1;
        } else if (variant === 'B') {
          updates.viewsB = (experiment.viewsB || 0) + 1;
        }
      } else if (event_type === 'purchase' || event_type === 'add_to_cart') {
        if (variant === 'A') {
          updates.conversionsA = (experiment.conversionsA || 0) + 1;
          if (revenue) {
            updates.revenueA = parseFloat(experiment.revenueA || "0") + parseFloat(revenue);
          }
        } else if (variant === 'B') {
          updates.conversionsB = (experiment.conversionsB || 0) + 1;
          if (revenue) {
            updates.revenueB = parseFloat(experiment.revenueB || "0") + parseFloat(revenue);
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateSlotExperiment(shop, experiment_id, updates);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[App Proxy] Event tracking error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

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

  // Shop Info API
  app.get("/api/shop", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      res.json({ shop });
    } catch (error) {
      console.error("Error fetching shop info:", error);
      res.status(500).json({ error: "Failed to fetch shop info" });
    }
  });

  // Webhook Status API - check if webhooks are registered
  app.get("/api/webhooks/status", requireShopifySessionOrDev, async (req, res) => {
    try {
      const session = (req as any).shopifySession;
      
      // In dev mode without real session, return unknown status
      if (!session?.accessToken) {
        return res.json({ 
          ordersWebhook: null,
          status: 'unknown',
          message: 'Unable to check webhook status in development mode without Shopify session'
        });
      }
      
      const { getWebhookSubscriptions } = await import("./shopify");
      const webhooks = await getWebhookSubscriptions(session);
      const ordersWebhook = webhooks.find((w: any) => w.topic === 'ORDERS_CREATE');
      
      res.json({
        ordersWebhook: ordersWebhook || null,
        status: ordersWebhook ? 'registered' : 'not_registered',
        message: ordersWebhook ? 'Order webhook is registered' : 'Order webhook is not registered'
      });
    } catch (error) {
      console.error("Error checking webhook status:", error);
      res.status(500).json({ error: "Failed to check webhook status" });
    }
  });

  // Register Webhook API - manually register order webhook
  app.post("/api/webhooks/register", requireShopifySessionOrDev, async (req, res) => {
    try {
      const session = (req as any).shopifySession;
      
      // In dev mode without real session, return error
      if (!session?.accessToken) {
        return res.status(400).json({ 
          error: 'Cannot register webhook in development mode without Shopify session'
        });
      }
      
      const { registerOrderWebhook } = await import("./shopify");
      const webhookUrl = `${process.env.REPLIT_DEV_DOMAIN ? 'https://' : 'http://'}${process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}/api/webhooks/orders/create`;
      
      console.log(`[Webhook Registration] Registering webhook: ${webhookUrl}`);
      await registerOrderWebhook(session, webhookUrl);
      
      res.json({ 
        success: true, 
        message: 'Order webhook registered successfully',
        callbackUrl: webhookUrl
      });
    } catch (error: any) {
      console.error("Error registering webhook:", error);
      res.status(500).json({ error: error.message || "Failed to register webhook" });
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

      // Get active optimizations to filter out conflicting optimization types
      const activeOptimizations = await storage.getActiveOptimizationsByProduct(shop, product.id);
      const activeOptimizationTypes = new Set(activeOptimizations.map(t => t.optimizationType));
      
      console.log(`[AI] Product: ${product.title} (${product.id})`);
      console.log(`[AI] Active optimizations for this product:`, activeOptimizations.map(t => ({ id: t.id, type: t.optimizationType, status: t.status })));
      console.log(`[AI] Active optimization types:`, Array.from(activeOptimizationTypes));

      const aiRecommendations = await generateOptimizationRecommendations({
        title: product.title,
        description: product.description || "",
        price: parseFloat(product.price),
        variants: product.variants,
        variantCount: product.variants?.length || 0,
        imageCount: product.images?.length || 0,
      });

      console.log(`[AI] Generated ${aiRecommendations.length} recommendations:`, aiRecommendations.map(r => r.optimizationType));

      // Filter out recommendations for optimization types that already have active optimizations
      const availableRecommendations = aiRecommendations.filter(rec => {
        const hasConflict = activeOptimizationTypes.has(rec.optimizationType);
        if (hasConflict) {
          console.log(`[AI] FILTERING OUT ${rec.optimizationType} recommendation - active optimization exists`);
          return false;
        }
        console.log(`[AI] KEEPING ${rec.optimizationType} recommendation - no conflict`);
        return true;
      });

      const created = await Promise.all(
        availableRecommendations.map(rec =>
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
          
          // Get active optimizations to filter out conflicting optimization types
          const activeOptimizations = await storage.getActiveOptimizationsByProduct(shop, product.id);
          const activeOptimizationTypes = new Set(activeOptimizations.map(t => t.optimizationType));
          
          console.log(`[AI] Product: ${product.title} (${product.id})`);
          console.log(`[AI] Active optimizations for this product:`, activeOptimizations.map(t => ({ id: t.id, type: t.optimizationType, status: t.status })));
          console.log(`[AI] Active optimization types:`, Array.from(activeOptimizationTypes));
          
          const aiRecommendations = await generateOptimizationRecommendations({
            title: product.title,
            description: product.description || "",
            price: parseFloat(product.price),
          });

          console.log(`[AI] Generated ${aiRecommendations.length} recommendations:`, aiRecommendations.map(r => r.optimizationType));

          // Filter out recommendations for optimization types that already have active optimizations
          const availableRecommendations = aiRecommendations.filter(rec => {
            const hasConflict = activeOptimizationTypes.has(rec.optimizationType);
            if (hasConflict) {
              console.log(`[AI] FILTERING OUT ${rec.optimizationType} recommendation for ${product.title} - active optimization exists`);
              return false;
            }
            console.log(`[AI] KEEPING ${rec.optimizationType} recommendation for ${product.title} - no conflict`);
            return true;
          });

          await Promise.all(
            availableRecommendations.map(rec =>
              storage.createRecommendation(shop, {
                productId: product.id,
                ...rec,
              })
            )
          );
          
          successCount++;
          console.log(`[AI] Generated ${availableRecommendations.length} recommendations for: ${product.title}`);
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

  // Quota management
  app.get("/api/quota", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      let shopData = await storage.getShop(shop);
      
      // Create shop record if doesn't exist
      if (!shopData) {
        shopData = await storage.createOrUpdateShop(shop, {});
      }
      
      const remaining = shopData.recommendationQuota - shopData.recommendationsUsed;
      
      res.json({
        quota: shopData.recommendationQuota,
        used: shopData.recommendationsUsed,
        remaining: Math.max(0, remaining), // Never return negative remaining
        planTier: shopData.planTier,
        resetDate: shopData.quotaResetDate,
      });
    } catch (error) {
      console.error("Error fetching quota:", error);
      res.status(500).json({ error: "Failed to fetch quota" });
    }
  });

  // Admin endpoint to reset quota (for testing/dev purposes)
  app.post("/api/admin/reset-quota", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      
      // Only allow in development mode for safety
      if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ error: "Quota reset only available in development mode" });
      }
      
      const shopData = await storage.resetQuota(shop);
      if (!shopData) {
        return res.status(404).json({ error: "Shop not found" });
      }
      
      console.log(`[Admin] Reset quota for shop: ${shop}`);
      
      res.json({
        success: true,
        quota: shopData.recommendationQuota,
        used: shopData.recommendationsUsed,
        remaining: shopData.recommendationQuota - shopData.recommendationsUsed,
      });
    } catch (error) {
      console.error("Error resetting quota:", error);
      res.status(500).json({ error: "Failed to reset quota" });
    }
  });

  // Store-wide intelligent recommendation generation
  app.post("/api/recommendations/store-analysis", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      
      // Get shop data (beta testing: quota enforcement disabled)
      let shopData = await storage.getShop(shop);
      if (!shopData) {
        shopData = await storage.createOrUpdateShop(shop, {});
      }
      
      const quotaNeeded = 10; // Store-wide analysis generates 10 recommendations
      
      // Beta: Unlimited usage - still tracking for analytics & future pricing
      
      // Get all products and active optimizations
      const products = await storage.getProducts(shop);
      if (products.length === 0) {
        return res.status(400).json({ error: "No products found. Please sync your store first." });
      }
      
      const activeOptimizations = await storage.getOptimizations(shop, 'active');
      const activeProductIds = activeOptimizations.map(t => t.productId).filter((id): id is string => id !== null);
      
      console.log(`[Store Analysis] Found ${products.length} products, ${activeProductIds.length} with active optimizations`);
      
      // Run intelligent product selection algorithm
      const topProducts = selectTopProducts(products, activeProductIds, 25);
      console.log(`[Store Analysis] Selected top ${topProducts.length} products for AI analysis`);
      
      if (topProducts.length === 0) {
        return res.status(400).json({ error: "No eligible products found for recommendations." });
      }
      
      // Prepare products for batch AI analysis
      const productsForAI = topProducts.map(scored => ({
        id: scored.product.id,
        title: scored.product.title,
        description: scored.product.description || "",
        price: parseFloat(scored.product.price),
        margin: scored.product.margin ? parseFloat(scored.product.margin) : undefined,
        revenue30d: scored.product.revenue30d ? parseFloat(scored.product.revenue30d) : undefined,
        totalSold: scored.product.totalSold || undefined,
      }));
      
      // Increment quota BEFORE AI call to prevent concurrent overspend
      await storage.incrementQuota(shop, quotaNeeded);
      console.log(`[Store Analysis] Reserved quota: +${quotaNeeded}`);
      
      let aiRecommendations;
      try {
        // Call batch AI service
        console.log(`[Store Analysis] Calling batch AI with ${productsForAI.length} products`);
        aiRecommendations = await generateBatchRecommendations(productsForAI, 10);
        console.log(`[Store Analysis] AI returned ${aiRecommendations.length} recommendations`);
      } catch (aiError) {
        // Rollback quota if AI fails
        await storage.incrementQuota(shop, -quotaNeeded);
        console.error(`[Store Analysis] AI failed, quota rolled back`);
        throw aiError;
      }
      
      // Store recommendations in database
      const created = await Promise.all(
        aiRecommendations.map(rec =>
          storage.createRecommendation(shop, {
            productId: rec.productId,
            title: rec.title,
            description: rec.description,
            optimizationType: rec.optimizationType,
            proposedChanges: rec.proposedChanges,
            insights: rec.insights,
          })
        )
      );
      
      res.json({
        recommendations: created,
        quotaUsed: quotaNeeded,
      });
    } catch (error) {
      console.error("Error generating store-wide recommendations:", error);
      res.status(500).json({ error: "Failed to generate recommendations" });
    }
  });

  // Product-specific recommendation generation (uses 1 quota)
  app.post("/api/recommendations/product/:productId/generate", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { productId } = req.params;
      
      // Get shop data (beta testing: quota enforcement disabled)
      let shopData = await storage.getShop(shop);
      if (!shopData) {
        shopData = await storage.createOrUpdateShop(shop, {});
      }
      
      // Beta: Unlimited usage - still tracking for analytics & future pricing
      
      // Get product
      const product = await storage.getProduct(shop, productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Get active optimizations to filter conflicts
      const activeOptimizations = await storage.getActiveOptimizationsByProduct(shop, productId);
      const activeOptimizationTypes = new Set(activeOptimizations.map(t => t.optimizationType));
      
      // Increment quota BEFORE AI call to prevent concurrent overspend
      await storage.incrementQuota(shop, 1);
      
      let aiRecommendations;
      try {
        // Generate recommendation using existing AI service
        aiRecommendations = await generateOptimizationRecommendations({
          title: product.title,
          description: product.description || "",
          price: parseFloat(product.price),
        });
      } catch (aiError) {
        // Rollback quota if AI fails
        await storage.incrementQuota(shop, -1);
        throw aiError;
      }
      
      // Filter out conflicting optimization types
      const availableRecommendations = aiRecommendations.filter(rec => !activeOptimizationTypes.has(rec.optimizationType));
      
      if (availableRecommendations.length === 0) {
        // Rollback quota since we can't generate
        await storage.incrementQuota(shop, -1);
        return res.status(400).json({ 
          error: "No recommendations available. This product may already have optimizations for all recommendation types." 
        });
      }
      
      // Take first available recommendation
      const recommendation = availableRecommendations[0];
      const created = await storage.createRecommendation(shop, {
        productId: product.id,
        ...recommendation,
      });
      
      res.json({
        recommendation: created,
        quotaUsed: 1,
      });
    } catch (error) {
      console.error("Error generating product recommendation:", error);
      res.status(500).json({ error: "Failed to generate recommendation" });
    }
  });

  // Dismiss recommendation with optional replace
  app.post("/api/recommendations/:id/dismiss", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { id } = req.params;
      const { replace = false } = req.body;
      
      // Get the recommendation
      const rec = await storage.getRecommendation(shop, id);
      if (!rec) {
        return res.status(404).json({ error: "Recommendation not found" });
      }
      
      // Mark as dismissed
      await storage.updateRecommendation(shop, id, {
        status: "dismissed",
        dismissedAt: new Date(),
      });
      
      let replacement = null;
      let quotaUsed = 0;
      
      // Generate replacement if requested (beta: unlimited usage)
      if (replace) {
        // Get product and active optimizations
        const product = await storage.getProduct(shop, rec.productId);
        if (product) {
          const activeOptimizations = await storage.getActiveOptimizationsByProduct(shop, rec.productId);
          const activeOptimizationTypes = new Set(activeOptimizations.map(t => t.optimizationType));
          
          // Increment quota BEFORE AI call
          await storage.incrementQuota(shop, 1);
          quotaUsed = 1;
          
          let aiRecommendations;
          try {
            // Generate new recommendations
            aiRecommendations = await generateOptimizationRecommendations({
              title: product.title,
              description: product.description || "",
              price: parseFloat(product.price),
            });
          } catch (aiError) {
            // Rollback quota if AI fails
            await storage.incrementQuota(shop, -1);
            quotaUsed = 0;
            throw aiError;
          }
          
          // Filter conflicts and already-dismissed type
          const availableRecommendations = aiRecommendations.filter(
            r => !activeOptimizationTypes.has(r.optimizationType) && r.optimizationType !== rec.optimizationType
          );
          
          if (availableRecommendations.length > 0) {
            replacement = await storage.createRecommendation(shop, {
              productId: product.id,
              ...availableRecommendations[0],
            });
          } else {
            // Rollback quota if no recommendations available
            await storage.incrementQuota(shop, -1);
            quotaUsed = 0;
          }
        }
      }
      
      res.json({
        dismissed: true,
        replacement,
        quotaUsed,
      });
    } catch (error) {
      console.error("Error dismissing recommendation:", error);
      res.status(500).json({ error: "Failed to dismiss recommendation" });
    }
  });

  // Get archived (dismissed) recommendations
  app.get("/api/recommendations/archived", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const archived = await storage.getRecommendations(shop, "dismissed");
      res.json(archived);
    } catch (error) {
      console.error("Error fetching archived recommendations:", error);
      res.status(500).json({ error: "Failed to fetch archived recommendations" });
    }
  });

  // Restore dismissed recommendation
  app.post("/api/recommendations/:id/restore", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { id } = req.params;
      
      const rec = await storage.getRecommendation(shop, id);
      if (!rec) {
        return res.status(404).json({ error: "Recommendation not found" });
      }
      
      if (rec.status !== "dismissed") {
        return res.status(400).json({ error: "Only dismissed recommendations can be restored" });
      }
      
      const updated = await storage.updateRecommendation(shop, id, {
        status: "pending",
        dismissedAt: null,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error restoring recommendation:", error);
      res.status(500).json({ error: "Failed to restore recommendation" });
    }
  });

  // Optimizations API (protected)
  app.get("/api/optimizations", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const status = req.query.status as string | undefined;
      const optimizations = await storage.getOptimizations(shop, status);
      
      // Enrich with product data
      const enrichedOptimizations = await Promise.all(
        optimizations.map(async (optimization) => {
          const product = optimization.productId ? await storage.getProduct(shop, optimization.productId) : null;
          return {
            ...optimization,
            productName: product?.title || "Unknown Product",
          };
        })
      );
      
      res.json(enrichedOptimizations);
    } catch (error) {
      console.error("Error fetching optimizations:", error);
      res.status(500).json({ error: "Failed to fetch optimizations" });
    }
  });

  // Get evolution snapshots for an optimization
  app.get("/api/optimizations/:id/evolution", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const optimization = await storage.getOptimization(shop, req.params.id);
      
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }
      
      const snapshots = await storage.getOptimizationEvolutionSnapshots(req.params.id);
      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching optimization evolution snapshots:", error);
      res.status(500).json({ error: "Failed to fetch evolution snapshots" });
    }
  });

  // Get single optimization with Bayesian state and metrics
  app.get("/api/optimizations/:id", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const optimization = await storage.getOptimization(shop, req.params.id);
      
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }
      
      // Enrich with product data
      const product = optimization.productId ? await storage.getProduct(shop, optimization.productId) : null;
      
      // Calculate derived metrics
      const controlConversions = optimization.controlConversions ?? 0;
      const variantConversions = optimization.variantConversions ?? 0;
      const controlImpressions = optimization.controlImpressions ?? 0;
      const variantImpressions = optimization.variantImpressions ?? 0;
      const controlRevenue = parseFloat(optimization.controlRevenue ?? '0');
      const variantRevenue = parseFloat(optimization.variantRevenue ?? '0');
      
      const controlARPU = controlConversions > 0 
        ? controlRevenue / controlConversions 
        : 0;
      const variantARPU = variantConversions > 0 
        ? variantRevenue / variantConversions 
        : 0;
      const arpuLift = controlARPU > 0 
        ? ((variantARPU - controlARPU) / controlARPU) * 100 
        : 0;
      
      res.json({
        ...optimization,
        productName: product?.title || "Unknown Product",
        metrics: {
          control: {
            impressions: controlImpressions,
            conversions: controlConversions,
            revenue: controlRevenue,
            arpu: controlARPU,
            conversionRate: controlImpressions > 0 
              ? (controlConversions / controlImpressions) * 100 
              : 0,
          },
          variant: {
            impressions: variantImpressions,
            conversions: variantConversions,
            revenue: variantRevenue,
            arpu: variantARPU,
            conversionRate: variantImpressions > 0 
              ? (variantConversions / variantImpressions) * 100 
              : 0,
          },
          arpuLift,
        },
        bayesianState: optimization.bayesianConfig || null,
      });
    } catch (error) {
      console.error("Error fetching optimization:", error);
      res.status(500).json({ error: "Failed to fetch optimization" });
    }
  });

  app.post("/api/optimizations", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const validatedData = insertOptimizationSchema.parse(req.body);
      const optimization = await storage.createOptimization(shop, validatedData);
      res.json(optimization);
    } catch (error) {
      console.error("Error creating optimization:", error);
      res.status(400).json({ error: "Invalid optimization data" });
    }
  });

  app.patch("/api/optimizations/:id", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const updated = await storage.updateOptimization(shop, req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Optimization not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating optimization:", error);
      res.status(500).json({ error: "Failed to update optimization" });
    }
  });

  // Activate optimization - enable A/B testing
  // For price optimizations: Deploy variant prices to Shopify
  // For other optimizations: Storefront JavaScript handles display
  app.post("/api/optimizations/:id/activate", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const optimizationId = req.params.id;
      
      // Get the optimization
      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }
      
      if (optimization.status !== "draft") {
        return res.status(400).json({ error: "Only draft optimizations can be activated" });
      }
      
      if (!optimization.productId) {
        return res.status(400).json({ error: "Optimization has no associated product" });
      }
      
      // Check for conflicting active optimizations (same product + optimization type)
      const conflictingOptimizations = await storage.getActiveOptimizationsByProduct(shop, optimization.productId, optimization.optimizationType);
      if (conflictingOptimizations.length > 0) {
        const optimizationTypeLabel = optimization.optimizationType === 'price' ? 'price' : 
                             optimization.optimizationType === 'title' ? 'title' : 
                             optimization.optimizationType === 'description' ? 'description' : optimization.optimizationType;
        return res.status(409).json({ 
          error: `Cannot activate optimization: This product already has an active ${optimizationTypeLabel} optimization. Please stop the existing optimization first.`,
          conflictingOptimizationId: conflictingOptimizations[0].id
        });
      }
      
      // Get the product
      const product = await storage.getProduct(shop, optimization.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      console.log(`[Optimization Activation] Activating optimization ${optimizationId} for product ${product.title}`);
      console.log(`[Optimization Activation] Optimization type: ${optimization.optimizationType}`);
      console.log(`[Optimization Activation] Control:`, optimization.controlData);
      console.log(`[Optimization Activation] Variant:`, optimization.variantData);
      
      // For price optimizations, deploy variant prices to Shopify
      if (optimization.optimizationType === "price" && optimization.variantData.variantPrices) {
        try {
          const session = await sessionStorage.getSessionByShop(shop);
          if (!session) {
            throw new Error("No Shopify session found");
          }
          
          console.log(`[Optimization Activation] Deploying variant prices to Shopify...`);
          await updateProduct(session, product.shopifyProductId, {
            variants: optimization.variantData.variantPrices,
          });
          console.log(`[Optimization Activation] Variant prices deployed successfully`);
        } catch (error) {
          console.error("[Optimization Activation] Failed to deploy prices to Shopify:", error);
          throw new Error("Failed to deploy price changes to Shopify");
        }
      }
      
      // Initialize Bayesian state (all optimizations now use Bayesian allocation)
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
      
      const updateData: any = {
        status: "active",
        startDate: new Date(),
        bayesianConfig: bayesianState,
        controlAllocation: "50", // Start balanced: 50% control
        variantAllocation: "50",  // 50% variant
      };
      
      console.log(`[Optimization Activation] Initialized Bayesian state with balanced allocation (50/50)`);
      
      // Activate the optimization in our database
      const activatedOptimization = await storage.updateOptimization(shop, optimizationId, updateData);
      
      console.log(`[Optimization Activation] Optimization activated successfully`);
      
      res.json({
        success: true,
        optimization: activatedOptimization,
        message: "Optimization activated successfully",
      });
    } catch (error) {
      console.error("Error activating optimization:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to activate optimization";
      res.status(500).json({ error: errorMessage });
    }
  });
  
  // Deactivate optimization - stop A/B testing and rollback changes
  // For price optimizations: Restore original variant prices
  // For other optimizations: No Shopify changes needed
  app.post("/api/optimizations/:id/deactivate", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const optimizationId = req.params.id;
      
      // Get the optimization
      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }
      
      if (optimization.status !== "active") {
        return res.status(400).json({ error: "Only active optimizations can be deactivated" });
      }
      
      if (!optimization.productId) {
        return res.status(400).json({ error: "Optimization has no associated product" });
      }
      
      // Get the product
      const product = await storage.getProduct(shop, optimization.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      console.log(`[Optimization Deactivation] Stopping optimization ${optimizationId}`);
      console.log(`[Optimization Deactivation] Optimization type: ${optimization.optimizationType}`);
      
      // For price optimizations, restore original variant prices
      if (optimization.optimizationType === "price" && optimization.controlData.variantPrices) {
        try {
          const session = await sessionStorage.getSessionByShop(shop);
          if (!session) {
            throw new Error("No Shopify session found");
          }
          
          console.log(`[Optimization Deactivation] Restoring original variant prices...`);
          await updateProduct(session, product.shopifyProductId, {
            variants: optimization.controlData.variantPrices,
          });
          console.log(`[Optimization Deactivation] Original prices restored successfully`);
        } catch (error) {
          console.error("[Optimization Deactivation] Failed to restore prices:", error);
          throw new Error("Failed to restore original prices in Shopify");
        }
      }
      
      // Mark optimization as completed
      const deactivatedOptimization = await storage.updateOptimization(shop, optimizationId, {
        status: "completed",
        endDate: new Date(),
      });
      
      console.log(`[Optimization Deactivation] Optimization stopped successfully`);
      
      res.json({
        success: true,
        optimization: deactivatedOptimization,
        message: "Optimization deactivated successfully",
      });
    } catch (error) {
      console.error("Error deactivating optimization:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to deactivate optimization";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Pause optimization - temporarily stop serving variants while keeping data
  app.post("/api/optimizations/:id/pause", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const optimizationId = req.params.id;
      
      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }
      
      if (optimization.status !== "active") {
        return res.status(400).json({ error: "Only active optimizations can be paused" });
      }
      
      console.log(`[Optimization Pause] Pausing optimization ${optimizationId}`);
      
      // Mark optimization as paused - SDK will stop serving variants but data is preserved
      const pausedOptimization = await storage.updateOptimization(shop, optimizationId, {
        status: "paused",
      });
      
      console.log(`[Optimization Pause] Optimization paused successfully`);
      
      res.json({
        success: true,
        optimization: pausedOptimization,
        message: "Optimization paused successfully",
      });
    } catch (error) {
      console.error("Error pausing optimization:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to pause optimization";
      res.status(500).json({ error: errorMessage });
    }
  });
  
  // Resume optimization - reactivate a paused optimization
  app.post("/api/optimizations/:id/resume", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const optimizationId = req.params.id;
      
      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }
      
      if (optimization.status !== "paused") {
        return res.status(400).json({ error: "Only paused optimizations can be resumed" });
      }
      
      console.log(`[Optimization Resume] Resuming optimization ${optimizationId}`);
      
      // Reactivate the optimization
      const resumedOptimization = await storage.updateOptimization(shop, optimizationId, {
        status: "active",
      });
      
      console.log(`[Optimization Resume] Optimization resumed successfully`);
      
      res.json({
        success: true,
        optimization: resumedOptimization,
        message: "Optimization resumed successfully",
      });
    } catch (error) {
      console.error("Error resuming optimization:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to resume optimization";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Bayesian allocation update
  app.post("/api/optimizations/:id/update-allocation", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const optimizationId = req.params.id;
      
      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }
      
      if (optimization.status !== "active") {
        return res.status(400).json({ 
          error: "Can only update allocation for active optimizations" 
        });
      }
      
      // Import allocation service
      const { computeAllocationUpdate, updateBayesianState } = await import('./statistics/allocation-service');
      
      // Update Bayesian state with current metrics
      const bayesianConfig = optimization.bayesianConfig as BayesianState || {} as BayesianState;
      const metrics = {
        controlImpressions: optimization.controlImpressions || 0,
        variantImpressions: optimization.variantImpressions || 0,
        controlConversions: optimization.controlConversions || 0,
        variantConversions: optimization.variantConversions || 0,
        controlRevenue: parseFloat(optimization.controlRevenue || "0"),
        variantRevenue: parseFloat(optimization.variantRevenue || "0"),
      };
      
      const updatedState = updateBayesianState(bayesianConfig, metrics);
      
      // Compute new allocation
      const result = computeAllocationUpdate(updatedState, metrics);
      
      // Update optimization in database
      const updatedOptimization = await storage.updateOptimization(shop, optimizationId, {
        controlAllocation: (result.allocation.control * 100).toFixed(2),
        variantAllocation: (result.allocation.variant * 100).toFixed(2),
        bayesianConfig: result.bayesianState,
      });
      
      console.log(`[Bayesian Update] Optimization ${optimizationId}: Control ${(result.allocation.control * 100).toFixed(1)}% / Variant ${(result.allocation.variant * 100).toFixed(1)}%`);
      console.log(`[Bayesian Update] ${result.reasoning}`);
      
      res.json({
        optimization: updatedOptimization,
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
  app.post("/api/optimizations/:id/check-promotion", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const optimizationId = req.params.id;
      
      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }
      
      if (optimization.status !== "active") {
        return res.status(400).json({ 
          error: "Can only check promotion for active optimizations" 
        });
      }
      
      // Import allocation service
      const { computeAllocationUpdate } = await import('./statistics/allocation-service');
      
      const bayesianConfig = optimization.bayesianConfig as BayesianState || {} as BayesianState;
      const metrics = {
        controlImpressions: optimization.controlImpressions || 0,
        variantImpressions: optimization.variantImpressions || 0,
        controlConversions: optimization.controlConversions || 0,
        variantConversions: optimization.variantConversions || 0,
        controlRevenue: parseFloat(optimization.controlRevenue || "0"),
        variantRevenue: parseFloat(optimization.variantRevenue || "0"),
      };
      
      // Compute allocation to get promotion check
      const result = computeAllocationUpdate(bayesianConfig, metrics);
      
      // If promotion criteria met, upgrade to 100% variant
      if (result.promotionCheck.shouldPromote && result.promotionCheck.winner === "variant") {
        const updatedOptimization = await storage.updateOptimization(shop, optimizationId, {
          controlAllocation: "0",
          variantAllocation: "100",
          status: "completed",
          endDate: new Date(),
          bayesianConfig: {
            ...result.bayesianState,
            promotionCheckCount: (result.bayesianState.promotionCheckCount || 0) + 1,
          },
        });
        
        console.log(`[Auto-Promotion] Optimization ${optimizationId} promoted to 100% variant`);
        console.log(`[Auto-Promotion] Criteria: ${result.reasoning}`);
        
        return res.json({
          promoted: true,
          winner: "variant",
          optimization: updatedOptimization,
          promotionCheck: result.promotionCheck,
          reasoning: result.reasoning,
        });
      }
      
      // If should stop due to budget exhaustion, cancel optimization
      if (result.shouldStop) {
        const updatedOptimization = await storage.updateOptimization(shop, optimizationId, {
          status: "cancelled",
          endDate: new Date(),
          bayesianConfig: result.bayesianState,
        });
        
        console.log(`[Auto-Stop] Optimization ${optimizationId} stopped: safety budget exhausted`);
        
        return res.json({
          promoted: false,
          stopped: true,
          optimization: updatedOptimization,
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

  // Preview Sessions API - for previewing recommendations before activation
  app.post("/api/preview/sessions", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { recommendationId } = req.body;
      
      if (!recommendationId) {
        return res.status(400).json({ error: "recommendationId is required" });
      }
      
      // Get recommendation
      const recommendation = await storage.getRecommendation(shop, recommendationId);
      if (!recommendation) {
        return res.status(404).json({ error: "Recommendation not found" });
      }
      
      // Get product
      const product = await storage.getProduct(shop, recommendation.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // Build control data from current product state
      const controlData: Record<string, any> = {
        title: product.title,
        description: product.description,
        price: product.price,
      };
      
      // Build variant data from proposed changes
      const proposedChanges = recommendation.proposedChanges as Record<string, any>;
      const variantData: Record<string, any> = { ...controlData };
      const changes: string[] = [];
      
      // Apply proposed changes - check both AI field names (title, description, price)
      // and legacy names (newTitle, newDescription, newPrice) for compatibility
      if (proposedChanges.title || proposedChanges.newTitle) {
        variantData.title = proposedChanges.title || proposedChanges.newTitle;
        changes.push("title");
      }
      if (proposedChanges.description || proposedChanges.newDescription) {
        variantData.description = proposedChanges.description || proposedChanges.newDescription;
        changes.push("description");
      }
      if (proposedChanges.price !== undefined || proposedChanges.newPrice !== undefined) {
        const priceValue = proposedChanges.price !== undefined ? proposedChanges.price : proposedChanges.newPrice;
        variantData.price = priceValue.toString();
        changes.push("price");
      }
      
      // Generate unique token for preview URL
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      
      // Create preview session (expires in 15 minutes)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      
      const session = await storage.createPreviewSession(shop, {
        token,
        productId: product.id,
        recommendationId: recommendation.id,
        controlData,
        variantData,
        changes,
        insights: recommendation.insights || [],
        expiresAt,
      });
      
      // Return preview URL that will render the comparison
      const previewUrl = `/preview/${token}`;
      
      res.json({
        sessionId: session.id,
        token,
        previewUrl,
        expiresAt,
        controlData,
        variantData,
        changes,
      });
    } catch (error) {
      console.error("Error creating preview session:", error);
      res.status(500).json({ error: "Failed to create preview session" });
    }
  });
  
  // Get preview session by token and render HTML
  app.get("/preview/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      const session = await storage.getPreviewSession(token);
      if (!session) {
        return res.status(404).send(`
          <html>
            <head><title>Preview Not Found</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center;">
              <h1>Preview Not Found</h1>
              <p>This preview link has expired or is invalid.</p>
              <a href="/">Return to Dashboard</a>
            </body>
          </html>
        `);
      }
      
      // Check if expired
      if (new Date() > new Date(session.expiresAt)) {
        return res.status(410).send(`
          <html>
            <head><title>Preview Expired</title></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center;">
              <h1>Preview Expired</h1>
              <p>This preview link has expired. Please generate a new preview from the dashboard.</p>
              <a href="/">Return to Dashboard</a>
            </body>
          </html>
        `);
      }
      
      const control = session.controlData as Record<string, any>;
      const variant = session.variantData as Record<string, any>;
      const changes = (session.changes as string[]) || [];
      const insights = session.insights || [];
      
      // Render side-by-side comparison HTML
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Preview Changes - Shoptimizer</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background: #f4f6f8;
              color: #1a1a1a;
              line-height: 1.5;
            }
            .header {
              background: linear-gradient(135deg, #5C6AC4 0%, #3b4199 100%);
              color: white;
              padding: 24px 40px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .header h1 { font-size: 24px; font-weight: 600; }
            .header-actions { display: flex; gap: 12px; }
            .btn {
              padding: 10px 20px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              border: none;
              transition: all 0.2s;
            }
            .btn-primary { background: white; color: #5C6AC4; }
            .btn-primary:hover { background: #f0f0f0; }
            .btn-secondary { background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); }
            .btn-secondary:hover { background: rgba(255,255,255,0.3); }
            .container { max-width: 1400px; margin: 0 auto; padding: 32px; }
            .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
            @media (max-width: 900px) { .comparison { grid-template-columns: 1fr; } }
            .card {
              background: white;
              border-radius: 12px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.08);
              overflow: hidden;
            }
            .card-header {
              padding: 16px 24px;
              border-bottom: 1px solid #e5e5e5;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .card-header.control { background: #f5f5f5; }
            .card-header.variant { background: #e8f5e9; }
            .badge {
              padding: 4px 10px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
            }
            .badge-control { background: #e0e0e0; color: #616161; }
            .badge-variant { background: #c8e6c9; color: #2e7d32; }
            .card-content { padding: 24px; }
            .field { margin-bottom: 20px; }
            .field:last-child { margin-bottom: 0; }
            .field-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
            .field-value { font-size: 16px; }
            .field-value.title { font-size: 20px; font-weight: 600; }
            .field-value.price { font-size: 24px; font-weight: 700; color: #2e7d32; }
            .field-value.description { color: #444; white-space: pre-wrap; }
            .changed { background: #fff3cd; padding: 4px 8px; border-radius: 4px; }
            .insights {
              background: white;
              border-radius: 12px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.08);
              padding: 24px;
            }
            .insights h3 { margin-bottom: 16px; font-size: 18px; }
            .insight {
              display: flex;
              align-items: flex-start;
              gap: 12px;
              padding: 12px 0;
              border-bottom: 1px solid #eee;
            }
            .insight:last-child { border-bottom: none; }
            .insight-icon {
              width: 32px;
              height: 32px;
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
              flex-shrink: 0;
            }
            .insight-icon.psychology { background: #e3f2fd; }
            .insight-icon.competitor { background: #fff3e0; }
            .insight-icon.seo { background: #e8f5e9; }
            .insight-icon.data { background: #f3e5f5; }
            .insight-content h4 { font-size: 14px; margin-bottom: 4px; }
            .insight-content p { font-size: 13px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Preview Changes</h1>
            <div class="header-actions">
              <button class="btn btn-secondary" onclick="window.close()">Close Preview</button>
            </div>
          </div>
          <div class="container">
            <div class="comparison">
              <div class="card">
                <div class="card-header control">
                  <span class="badge badge-control">Current (Control)</span>
                </div>
                <div class="card-content">
                  <div class="field">
                    <div class="field-label">Title</div>
                    <div class="field-value title">${escapeHtml(control.title || '')}</div>
                  </div>
                  <div class="field">
                    <div class="field-label">Price</div>
                    <div class="field-value price">$${parseFloat(control.price || '0').toFixed(2)}</div>
                  </div>
                  <div class="field">
                    <div class="field-label">Description</div>
                    <div class="field-value description">${escapeHtml(control.description || '(No description)')}</div>
                  </div>
                </div>
              </div>
              <div class="card">
                <div class="card-header variant">
                  <span class="badge badge-variant">Proposed (Variant)</span>
                </div>
                <div class="card-content">
                  <div class="field">
                    <div class="field-label">Title</div>
                    <div class="field-value title ${changes.includes('title') ? 'changed' : ''}">${escapeHtml(variant.title || '')}</div>
                  </div>
                  <div class="field">
                    <div class="field-label">Price</div>
                    <div class="field-value price ${changes.includes('price') ? 'changed' : ''}">$${parseFloat(variant.price || '0').toFixed(2)}</div>
                  </div>
                  <div class="field">
                    <div class="field-label">Description</div>
                    <div class="field-value description ${changes.includes('description') ? 'changed' : ''}">${escapeHtml(variant.description || '(No description)')}</div>
                  </div>
                </div>
              </div>
            </div>
            ${insights.length > 0 ? `
              <div class="insights">
                <h3>AI Insights</h3>
                ${(insights as Array<{type: string; title: string; description: string}>).map(insight => `
                  <div class="insight">
                    <div class="insight-icon ${insight.type}">
                      ${insight.type === 'psychology' ? '🧠' : insight.type === 'competitor' ? '🏆' : insight.type === 'seo' ? '🔍' : '📊'}
                    </div>
                    <div class="insight-content">
                      <h4>${escapeHtml(insight.title)}</h4>
                      <p>${escapeHtml(insight.description)}</p>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("Error fetching preview:", error);
      res.status(500).send(`
        <html>
          <head><title>Preview Error</title></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center;">
            <h1>Preview Error</h1>
            <p>Something went wrong loading this preview.</p>
            <a href="/">Return to Dashboard</a>
          </body>
        </html>
      `);
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

  // Helper function to calculate incremental metrics from optimizations
  function calculateIncrementalMetrics(optimizations: any[]) {
    const optimizationCount = optimizations.length;
    
    if (optimizationCount === 0) {
      return {
        optimizationCount: 0,
        incrementalRPV: 0,
        incrementalRevenue: 0,
        totalRevenue: 0,
        incrementalConversions: 0,
        totalConversions: 0,
      };
    }

    let totalIncrementalRevenue = 0;
    let totalVariantRevenue = 0;
    let totalIncrementalConversions = 0;
    let totalVariantConversions = 0;
    let weightedRPVLiftSum = 0;
    let totalImpressions = 0;

    for (const optimization of optimizations) {
      const controlImpressions = optimization.controlImpressions || 0;
      const variantImpressions = optimization.variantImpressions || 0;
      const controlConversions = optimization.controlConversions || 0;
      const variantConversions = optimization.variantConversions || 0;
      const controlRevenue = parseFloat(optimization.controlRevenue || "0");
      const variantRevenue = parseFloat(optimization.variantRevenue || "0");

      // Calculate RPV for each arm
      const controlRPV = controlImpressions > 0 ? controlRevenue / controlImpressions : 0;
      const variantRPV = variantImpressions > 0 ? variantRevenue / variantImpressions : 0;
      
      // Incremental revenue = actual variant revenue - what control would have earned
      const expectedControlRevenue = variantImpressions * controlRPV;
      const incrementalRevenue = variantRevenue - expectedControlRevenue;
      totalIncrementalRevenue += incrementalRevenue;
      totalVariantRevenue += variantRevenue;

      // Incremental conversions = actual variant conversions - what control rate would have achieved
      const controlConversionRate = controlImpressions > 0 ? controlConversions / controlImpressions : 0;
      const expectedControlConversions = variantImpressions * controlConversionRate;
      const incrementalConversions = variantConversions - expectedControlConversions;
      totalIncrementalConversions += incrementalConversions;
      totalVariantConversions += variantConversions;

      // Weight RPV lift by impressions for proper averaging
      const rpvLift = variantRPV - controlRPV;
      const optimizationImpressions = controlImpressions + variantImpressions;
      weightedRPVLiftSum += rpvLift * optimizationImpressions;
      totalImpressions += optimizationImpressions;
    }

    // Calculate weighted average incremental RPV
    const incrementalRPV = totalImpressions > 0 ? weightedRPVLiftSum / totalImpressions : 0;

    return {
      optimizationCount,
      incrementalRPV,
      incrementalRevenue: totalIncrementalRevenue,
      totalRevenue: totalVariantRevenue,
      incrementalConversions: totalIncrementalConversions,
      totalConversions: totalVariantConversions,
    };
  }

  // Dashboard summary (protected)
  app.get("/api/dashboard", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const [products, recommendations, allOptimizations, latestMetric, syncStatus] = await Promise.all([
        storage.getProducts(shop),
        storage.getRecommendations(shop, "pending"),
        storage.getOptimizations(shop), // Get ALL optimizations for metrics calculation
        storage.getLatestMetric(shop),
        Promise.resolve(getSyncStatus(shop)),
      ]);

      // Calculate all-time metrics (all optimizations regardless of status)
      const allTimeMetrics = calculateIncrementalMetrics(allOptimizations);

      // Calculate active optimization metrics (only active optimizations)
      const activeOptimizations = allOptimizations.filter(opt => opt.status === "active");
      const activeMetrics = calculateIncrementalMetrics(activeOptimizations);

      res.json({
        totalProducts: products.length,
        pendingRecommendations: recommendations.length,
        activeOptimizations: activeOptimizations.length,
        latestMetric,
        syncStatus,
        allTimeMetrics,
        activeMetrics,
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
      
      // Create a map of optimizationId -> variant for quick lookup
      const assignmentMap = new Map(
        sessionAssignments.map(a => [a.optimizationId, a.variant])
      );
      
      // For each product, check if there's an active optimization and attribute to correct variant
      for (const product of orderedProducts) {
        const activeOptimizations = await storage.getActiveOptimizationsByProduct(shop, product.id);
        const activeOptimization = activeOptimizations.find((opt: any) => opt.status === "active");
        
        if (activeOptimization) {
          // Find the line item for this product to get quantity and price
          const lineItem = orderData.line_items.find((item: any) => 
            `gid://shopify/Product/${item.product_id}` === product.shopifyProductId
          );
          
          if (lineItem) {
            const revenue = parseFloat(lineItem.price) * lineItem.quantity;
            
            // Look up which variant this session saw for this optimization
            const variant = assignmentMap.get(activeOptimization.id);
            
            if (!variant) {
              console.log(`[Webhook] No variant assignment found for optimization ${activeOptimization.id}, skipping attribution`);
              // Session didn't see this optimization (maybe optimization was created after they visited)
              continue;
            }
            
            console.log(`[Webhook] Session saw "${variant}" variant for optimization ${activeOptimization.id}`);
            
            // Update per-variant metrics
            const updates: any = {
              conversions: (activeOptimization.conversions || 0) + lineItem.quantity,
              revenue: (parseFloat(activeOptimization.revenue || "0") + revenue).toString(),
            };
            
            if (variant === 'control') {
              updates.controlConversions = (activeOptimization.controlConversions || 0) + lineItem.quantity;
              updates.controlRevenue = (parseFloat(activeOptimization.controlRevenue || "0") + revenue).toString();
            } else {
              updates.variantConversions = (activeOptimization.variantConversions || 0) + lineItem.quantity;
              updates.variantRevenue = (parseFloat(activeOptimization.variantRevenue || "0") + revenue).toString();
            }
            
            // Calculate overall ARPU
            const newConversions = updates.conversions;
            const newRevenue = parseFloat(updates.revenue);
            const arpu = newConversions > 0 ? newRevenue / newConversions : 0;
            updates.arpu = arpu.toString();
            
            console.log(`[Webhook] Attributing conversion to ${variant} for optimization ${activeOptimization.id}: ${lineItem.quantity}x ${product.title} = $${revenue}`);
            console.log(`[Webhook] Control metrics - Conversions: ${updates.controlConversions || 0}, Revenue: $${parseFloat(updates.controlRevenue || "0").toFixed(2)}`);
            console.log(`[Webhook] Variant metrics - Conversions: ${updates.variantConversions || 0}, Revenue: $${parseFloat(updates.variantRevenue || "0").toFixed(2)}`);
            console.log(`[Webhook] Overall metrics - Conversions: ${newConversions}, Revenue: $${newRevenue.toFixed(2)}, ARPU: $${arpu.toFixed(2)}`);
            
            // Update optimization metrics
            await storage.updateOptimization(shop, activeOptimization.id, updates);
            console.log(`[Webhook] Successfully attributed conversion for optimization ${activeOptimization.id}`);
          }
        }
      }
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error("[Webhook] Error processing order webhook:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  // ============================================================
  // MANDATORY GDPR COMPLIANCE WEBHOOKS
  // Required for Protected Customer Data access (Level 1)
  // ============================================================

  // Helper function to verify Shopify webhook HMAC using manual crypto verification
  // This is more reliable than the Shopify library method
  function verifyShopifyWebhookHmac(req: any): boolean {
    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const shop = req.get("X-Shopify-Shop-Domain");
    
    if (!hmac || !shop) {
      console.error('[GDPR Webhook] Missing required headers (HMAC or Shop-Domain)');
      return false;
    }
    
    const rawBody = req.rawBody as Buffer;
    if (!rawBody) {
      console.error('[GDPR Webhook] Missing raw body for HMAC verification');
      return false;
    }
    
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    if (!apiSecret) {
      console.error('[GDPR Webhook] SHOPIFY_API_SECRET not configured');
      return false;
    }
    
    try {
      // Generate HMAC using the same algorithm Shopify uses
      const generatedHmac = createHmac('sha256', apiSecret)
        .update(rawBody)
        .digest('base64');
      
      // Convert to buffers for comparison
      const providedBuffer = Buffer.from(hmac, 'base64');
      const expectedBuffer = Buffer.from(generatedHmac, 'base64');
      
      // Check buffer lengths first to avoid timingSafeEqual exceptions
      // (which happen when lengths differ and cause noisy logs)
      if (providedBuffer.length !== expectedBuffer.length) {
        console.error('[GDPR Webhook] HMAC verification failed - invalid signature length');
        return false;
      }
      
      // Constant-time comparison to prevent timing attacks
      const valid = timingSafeEqual(providedBuffer, expectedBuffer);
      
      if (!valid) {
        console.error('[GDPR Webhook] HMAC verification failed - signature mismatch');
      }
      
      return valid;
    } catch (error) {
      console.error('[GDPR Webhook] HMAC verification error:', error);
      return false;
    }
  }

  // customers/data_request - Customer requests their data (GDPR Article 15)
  // Shopify sends this when a customer requests their data via the store
  app.post("/api/webhooks/customers/data_request", async (req, res) => {
    try {
      const topic = req.get("X-Shopify-Topic");
      const shop = req.get("X-Shopify-Shop-Domain");
      
      console.log(`[GDPR Webhook] Received ${topic} from ${shop}`);
      
      const verified = verifyShopifyWebhookHmac(req);
      if (!verified) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const payload = req.body;
      console.log(`[GDPR Webhook] Customer data request for shop: ${shop}`);
      console.log(`[GDPR Webhook] Customer ID: ${payload.customer?.id}, Email: ${payload.customer?.email}`);
      console.log(`[GDPR Webhook] Orders requested: ${payload.orders_requested?.length || 0}`);
      
      // Shoptimizer stores minimal customer data:
      // - Session assignments (anonymous session IDs, no PII)
      // - Impressions (anonymous visitor IDs, no PII)
      // - Conversion data (tied to orders, not individual customers)
      // 
      // We do NOT store customer email, name, address, or any PII.
      // Therefore, there is no customer-specific data to export.
      
      console.log(`[GDPR Webhook] Data request acknowledged - Shoptimizer stores no customer PII`);
      
      // Respond with success - Shopify requires 200 response
      res.status(200).json({ 
        received: true,
        message: "Data request acknowledged. Shoptimizer does not store customer personal information."
      });
    } catch (error) {
      console.error("[GDPR Webhook] Error processing customers/data_request:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  // customers/redact - Request to delete customer data (GDPR Article 17)
  // Shopify sends this when a customer requests data deletion
  app.post("/api/webhooks/customers/redact", async (req, res) => {
    try {
      const topic = req.get("X-Shopify-Topic");
      const shop = req.get("X-Shopify-Shop-Domain");
      
      console.log(`[GDPR Webhook] Received ${topic} from ${shop}`);
      
      const verified = verifyShopifyWebhookHmac(req);
      if (!verified) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const payload = req.body;
      console.log(`[GDPR Webhook] Customer redact request for shop: ${shop}`);
      console.log(`[GDPR Webhook] Customer ID: ${payload.customer?.id}, Email: ${payload.customer?.email}`);
      console.log(`[GDPR Webhook] Orders to redact: ${payload.orders_to_redact?.length || 0}`);
      
      // Shoptimizer stores minimal customer data:
      // - Session assignments use anonymous UUIDs (no customer linkage)
      // - Impressions use anonymous visitor IDs (no customer linkage)
      // - We do NOT store customer email, name, or any PII
      //
      // Since we have no customer-specific data, no deletion action is needed.
      // However, we log the request for compliance auditing.
      
      console.log(`[GDPR Webhook] Redact request acknowledged - Shoptimizer stores no customer PII to delete`);
      
      // Respond with success - Shopify requires 200 response
      res.status(200).json({ 
        received: true,
        message: "Redact request acknowledged. Shoptimizer does not store customer personal information."
      });
    } catch (error) {
      console.error("[GDPR Webhook] Error processing customers/redact:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  // shop/redact - Request to delete all shop data (app uninstall)
  // Shopify sends this 48 hours after a merchant uninstalls the app
  app.post("/api/webhooks/shop/redact", async (req, res) => {
    try {
      const topic = req.get("X-Shopify-Topic");
      const shopDomain = req.get("X-Shopify-Shop-Domain");
      
      console.log(`[GDPR Webhook] Received ${topic} from ${shopDomain}`);
      
      const verified = verifyShopifyWebhookHmac(req);
      if (!verified) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const payload = req.body;
      console.log(`[GDPR Webhook] Shop redact request for: ${shopDomain}`);
      console.log(`[GDPR Webhook] Shop ID: ${payload.shop_id}`);
      
      // Delete all data associated with this shop
      // This is the complete cleanup when a merchant uninstalls the app
      
      if (shopDomain) {
        console.log(`[GDPR Webhook] Deleting all data for shop: ${shopDomain}`);
        
        // Delete all shop-specific data
        // The storage interface should handle cascading deletes
        try {
          // Delete products, optimizations, recommendations, sessions, etc.
          await storage.deleteAllShopData(shopDomain);
          console.log(`[GDPR Webhook] Successfully deleted all data for shop: ${shopDomain}`);
        } catch (deleteError) {
          console.error(`[GDPR Webhook] Error deleting shop data:`, deleteError);
          // Continue anyway - we still acknowledge the webhook
        }
      }
      
      // Respond with success - Shopify requires 200 response
      res.status(200).json({ 
        received: true,
        message: "Shop data deletion completed."
      });
    } catch (error) {
      console.error("[GDPR Webhook] Error processing shop/redact:", error);
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

  // Simulation endpoints for optimization allocation and tracking
  // POST /api/simulate/traffic - Simulates product impressions
  app.post("/api/simulate/traffic", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { optimizationId, impressions = 100 } = req.body;

      if (!optimizationId) {
        return res.status(400).json({ error: "optimizationId is required" });
      }

      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }

      if (optimization.status !== "active") {
        return res.status(400).json({ error: "Optimization must be active to simulate traffic" });
      }

      console.log(`[Simulate Traffic] START - optimizationId: ${optimizationId}, requested impressions: ${impressions}`);
      console.log(`[Simulate Traffic] Optimization state BEFORE: impressions=${optimization.impressions}, control=${optimization.controlImpressions}, variant=${optimization.variantImpressions}`);
      
      // Use current allocation percentages for realistic simulation
      const controlAllocation = parseFloat(optimization.controlAllocation || "50") / 100;
      const variantAllocation = parseFloat(optimization.variantAllocation || "50") / 100;
      const totalAllocation = controlAllocation + variantAllocation;
      
      const controlImpressions = Math.floor(impressions * (controlAllocation / totalAllocation));
      const variantImpressions = impressions - controlImpressions;

      console.log(`[Simulate Traffic] Will create ${controlImpressions} control + ${variantImpressions} variant = ${controlImpressions + variantImpressions} total records`);

      // Create individual impression records with unique session IDs
      const { randomUUID } = await import("crypto");
      for (let i = 0; i < controlImpressions; i++) {
        await storage.createOptimizationImpression({
          optimizationId,
          sessionId: randomUUID(),
          variant: "control",
        });
      }
      console.log(`[Simulate Traffic] Created ${controlImpressions} control impression records`);
      
      for (let i = 0; i < variantImpressions; i++) {
        await storage.createOptimizationImpression({
          optimizationId,
          sessionId: randomUUID(),
          variant: "variant",
        });
      }
      console.log(`[Simulate Traffic] Created ${variantImpressions} variant impression records`);

      // Update optimization with new aggregate impressions
      // Parse bigint fields as numbers (they come from DB as strings)
      const newControlImpressions = (Number(optimization.controlImpressions) || 0) + controlImpressions;
      const newVariantImpressions = (Number(optimization.variantImpressions) || 0) + variantImpressions;
      const newImpressions = (Number(optimization.impressions) || 0) + impressions;
      
      await storage.updateOptimization(shop, optimizationId, {
        impressions: newImpressions,
        controlImpressions: newControlImpressions,
        variantImpressions: newVariantImpressions,
      });

      console.log(`[Simulation] Generated ${impressions} impressions for optimization ${optimizationId} (${controlImpressions} control, ${variantImpressions} variant)`);

      res.json({
        success: true,
        optimizationId,
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
        optimizationId, 
        orders = 10, 
        avgOrderValue,
        conversionRate 
      } = req.body;

      if (!optimizationId) {
        return res.status(400).json({ error: "optimizationId is required" });
      }

      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }

      if (optimization.status !== "active") {
        return res.status(400).json({ error: "Optimization must be active to simulate orders" });
      }

      if (!optimization.productId) {
        return res.status(400).json({ error: "Optimization has no associated product" });
      }

      // Get the product to use realistic pricing
      const product = await storage.getProduct(shop, optimization.productId);
      if (!product) {
        return res.status(400).json({ error: "Product not found" });
      }

      // Use provided avgOrderValue or product price
      const basePrice = avgOrderValue || parseFloat(product.price);

      // Use current allocation percentages for realistic simulation
      const controlAllocation = parseFloat(optimization.controlAllocation || "50") / 100;
      const variantAllocation = parseFloat(optimization.variantAllocation || "50") / 100;
      const totalAllocation = controlAllocation + variantAllocation;
      
      const controlOrders = Math.floor(orders * (controlAllocation / totalAllocation));
      const variantOrders = orders - controlOrders;

      // Create individual conversion records with revenue tracking
      const { randomUUID } = await import("crypto");
      let totalRevenue = 0;
      let controlRevenue = 0;
      let variantRevenue = 0;

      for (let i = 0; i < controlOrders; i++) {
        const orderValue = basePrice;
        totalRevenue += orderValue;
        controlRevenue += orderValue;
        
        await storage.createOptimizationConversion({
          optimizationId,
          sessionId: randomUUID(),
          variant: "control",
          revenue: orderValue.toFixed(2),
        });
      }

      for (let i = 0; i < variantOrders; i++) {
        const orderValue = basePrice;
        totalRevenue += orderValue;
        variantRevenue += orderValue;
        
        await storage.createOptimizationConversion({
          optimizationId,
          sessionId: randomUUID(),
          variant: "variant",
          revenue: orderValue.toFixed(2),
        });
      }

      // Update optimization metrics with aggregate counters
      const newControlConversions = (optimization.controlConversions || 0) + controlOrders;
      const newVariantConversions = (optimization.variantConversions || 0) + variantOrders;
      const newConversions = (optimization.conversions || 0) + orders;
      const newControlRevenue = parseFloat(optimization.controlRevenue || "0") + controlRevenue;
      const newVariantRevenue = parseFloat(optimization.variantRevenue || "0") + variantRevenue;
      const newRevenue = parseFloat(optimization.revenue || "0") + totalRevenue;
      
      // Calculate ARPU for each variant
      const controlArpu = newControlConversions > 0 ? newControlRevenue / newControlConversions : 0;
      const variantArpu = newVariantConversions > 0 ? newVariantRevenue / newVariantConversions : 0;
      const arpu = newConversions > 0 ? newRevenue / newConversions : 0;

      await storage.updateOptimization(shop, optimizationId, {
        conversions: newConversions,
        controlConversions: newControlConversions,
        variantConversions: newVariantConversions,
        revenue: newRevenue.toString(),
        controlRevenue: newControlRevenue.toString(),
        variantRevenue: newVariantRevenue.toString(),
        arpu: arpu.toString(),
      });

      console.log(`[Simulation] Generated ${orders} orders for optimization ${optimizationId}`);
      console.log(`[Simulation] Control: ${controlOrders}, Variant: ${variantOrders}`);
      console.log(`[Simulation] Revenue: $${totalRevenue.toFixed(2)}, ARPU: $${arpu.toFixed(2)}`);

      res.json({
        success: true,
        optimizationId,
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

  // POST /api/simulate/batch - Realistic simulator that uses actual assignment flow
  app.post("/api/simulate/batch", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { 
        optimizationId, 
        visitors = 1000,
        controlConversionRate = 0.03, // 3% default for control
        variantConversionRate = 0.03, // 3% default for variant (can be different to measure lift)
        avgOrderValue
      } = req.body;

      if (!optimizationId) {
        return res.status(400).json({ error: "optimizationId is required" });
      }

      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }

      if (optimization.status !== "active") {
        return res.status(400).json({ error: "Optimization must be active to simulate batch" });
      }

      if (!optimization.productId) {
        return res.status(400).json({ error: "Optimization has no associated product" });
      }

      // Get product for pricing
      const product = await storage.getProduct(shop, optimization.productId);
      if (!product) {
        return res.status(400).json({ error: "Product not found" });
      }

      const basePrice = avgOrderValue || parseFloat(product.price);
      const { randomUUID } = await import("crypto");
      const { assignVisitor } = await import('./assignment-service');

      // Capture allocation BEFORE simulation
      const allocationBefore = {
        control: parseFloat(optimization.controlAllocation || "50"),
        variant: parseFloat(optimization.variantAllocation || "50"),
      };

      // Track assignments for each visitor
      const assignments: Array<{ sessionId: string; variant: 'control' | 'variant' }> = [];
      const impressionRecords = [];
      const conversionRecords = [];
      
      let controlImpressions = 0;
      let variantImpressions = 0;
      let controlConversions = 0;
      let variantConversions = 0;
      let controlRevenue = 0;
      let variantRevenue = 0;

      // Track evolution at 100-impression intervals for charts
      const evolutionData: Array<{
        impressions: number;
        controlRPV: number;
        variantRPV: number;
        controlAllocation: number;
        variantAllocation: number;
      }> = [];

      console.log(`[Simulator] Starting batch simulation for ${visitors} visitors`);
      console.log(`[Simulator] Current allocation - Control: ${allocationBefore.control}%, Variant: ${allocationBefore.variant}%`);
      console.log(`[Simulator] Conversion rates - Control: ${controlConversionRate * 100}%, Variant: ${variantConversionRate * 100}%`);

      // REALISTIC FLOW: Simulate each visitor going through the actual assignment logic
      for (let i = 0; i < visitors; i++) {
        const sessionId = randomUUID();
        
        // Step 1: Assign visitor using CURRENT allocation (respects Bayesian updates)
        const assignment = await assignVisitor(storage, {
          shop,
          optimizationId,
          sessionId,
          optimization, // Pass optimization to avoid redundant lookup
        });
        
        assignments.push({ sessionId, variant: assignment.variant });
        
        // Step 2: Track impression
        impressionRecords.push({
          optimizationId,
          sessionId,
          variant: assignment.variant,
        });
        
        if (assignment.variant === 'control') {
          controlImpressions++;
        } else {
          variantImpressions++;
        }
        
        // Step 3: Probabilistically convert based on variant-specific conversion rate
        const conversionRate = assignment.variant === 'control' 
          ? controlConversionRate 
          : variantConversionRate;
        
        const converts = Math.random() < conversionRate;
        
        if (converts) {
          // Step 4: Generate order value with variance
          const variance = 0.8 + Math.random() * 0.4; // ±20% variance
          const orderValue = basePrice * variance;
          
          conversionRecords.push({
            optimizationId,
            sessionId,
            variant: assignment.variant,
            revenue: orderValue.toFixed(2),
          });
          
          if (assignment.variant === 'control') {
            controlConversions++;
            controlRevenue += orderValue;
          } else {
            variantConversions++;
            variantRevenue += orderValue;
          }
        }

        // Capture snapshot every 100 impressions for evolution charts
        if ((i + 1) % 100 === 0) {
          const totalImpressions = controlImpressions + variantImpressions;
          const controlRPV = controlImpressions > 0 ? controlRevenue / controlImpressions : 0;
          const variantRPV = variantImpressions > 0 ? variantRevenue / variantImpressions : 0;
          const currentControlAlloc = totalImpressions > 0 ? (controlImpressions / totalImpressions) * 100 : 50;
          const currentVariantAlloc = totalImpressions > 0 ? (variantImpressions / totalImpressions) * 100 : 50;

          evolutionData.push({
            impressions: i + 1,
            controlRPV: parseFloat(controlRPV.toFixed(2)),
            variantRPV: parseFloat(variantRPV.toFixed(2)),
            controlAllocation: parseFloat(currentControlAlloc.toFixed(1)),
            variantAllocation: parseFloat(currentVariantAlloc.toFixed(1)),
          });
        }
      }

      // Capture final snapshot if not on a 100-impression boundary
      if (visitors % 100 !== 0) {
        const totalImpressions = controlImpressions + variantImpressions;
        const controlRPV = controlImpressions > 0 ? controlRevenue / controlImpressions : 0;
        const variantRPV = variantImpressions > 0 ? variantRevenue / variantImpressions : 0;
        const currentControlAlloc = totalImpressions > 0 ? (controlImpressions / totalImpressions) * 100 : 50;
        const currentVariantAlloc = totalImpressions > 0 ? (variantImpressions / totalImpressions) * 100 : 50;

        evolutionData.push({
          impressions: visitors,
          controlRPV: parseFloat(controlRPV.toFixed(2)),
          variantRPV: parseFloat(variantRPV.toFixed(2)),
          controlAllocation: parseFloat(currentControlAlloc.toFixed(1)),
          variantAllocation: parseFloat(currentVariantAlloc.toFixed(1)),
        });
      }

      console.log(`[Simulator] Assignments - Control: ${controlImpressions}, Variant: ${variantImpressions}`);
      console.log(`[Simulator] Conversions - Control: ${controlConversions}, Variant: ${variantConversions}`);
      console.log(`[Simulator] Revenue - Control: $${controlRevenue.toFixed(2)}, Variant: $${variantRevenue.toFixed(2)}`);

      // Bulk insert for performance (avoid 1000+ individual database operations)
      await storage.createOptimizationImpressionsBulk(impressionRecords);
      if (conversionRecords.length > 0) {
        await storage.createOptimizationConversionsBulk(conversionRecords);
      }

      const totalRevenue = controlRevenue + variantRevenue;
      const totalConversions = controlConversions + variantConversions;

      // Update optimization metrics
      // Parse bigint fields as numbers (they come from DB as strings)
      const newControlImpressions = (Number(optimization.controlImpressions) || 0) + controlImpressions;
      const newVariantImpressions = (Number(optimization.variantImpressions) || 0) + variantImpressions;
      const newControlConversions = (Number(optimization.controlConversions) || 0) + controlConversions;
      const newVariantConversions = (Number(optimization.variantConversions) || 0) + variantConversions;
      const newControlRevenue = parseFloat(optimization.controlRevenue || "0") + controlRevenue;
      const newVariantRevenue = parseFloat(optimization.variantRevenue || "0") + variantRevenue;
      
      const newImpressions = (Number(optimization.impressions) || 0) + visitors;
      const newConversions = (Number(optimization.conversions) || 0) + totalConversions;
      const newRevenue = parseFloat(optimization.revenue || "0") + totalRevenue;
      const arpu = newConversions > 0 ? newRevenue / newConversions : 0;

      const updatedOptimization = await storage.updateOptimization(shop, optimizationId, {
        impressions: newImpressions,
        conversions: newConversions,
        revenue: newRevenue.toString(),
        arpu: arpu.toString(),
        controlImpressions: newControlImpressions,
        variantImpressions: newVariantImpressions,
        controlConversions: newControlConversions,
        variantConversions: newVariantConversions,
        controlRevenue: newControlRevenue.toString(),
        variantRevenue: newVariantRevenue.toString(),
      });

      // Update Bayesian allocation if using Bayesian strategy
      let bayesianUpdate = null;
      let allocationAfter = allocationBefore;
      
      if (updatedOptimization) {
        try {
          const { computeAllocationUpdate, updateBayesianState } = await import('./statistics/allocation-service');
          
          const bayesianConfig = updatedOptimization.bayesianConfig as BayesianState || {} as BayesianState;
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
          await storage.updateOptimization(shop, optimizationId, {
            controlAllocation: (result.allocation.control * 100).toFixed(2),
            variantAllocation: (result.allocation.variant * 100).toFixed(2),
            bayesianConfig: result.bayesianState,
          });
          
          allocationAfter = {
            control: parseFloat((result.allocation.control * 100).toFixed(1)),
            variant: parseFloat((result.allocation.variant * 100).toFixed(1)),
          };
          
          bayesianUpdate = {
            newAllocation: allocationAfter,
            metrics: result.metrics,
            reasoning: result.reasoning,
          };
          
          console.log(`[Bayesian Update] Allocation shifted - Control: ${allocationBefore.control}% → ${allocationAfter.control}%, Variant: ${allocationBefore.variant}% → ${allocationAfter.variant}%`);
          console.log(`[Bayesian Update] ${result.reasoning}`);
        } catch (error) {
          console.error("[Bayesian Update] Failed to update allocation:", error);
        }
      }

      res.json({
        success: true,
        optimizationId,
        impressions: visitors,
        conversions: totalConversions,
        revenue: totalRevenue.toFixed(2),
        arpu: arpu.toFixed(2),
        allocationBefore,
        allocationAfter,
        variantPerformance: {
          control: {
            impressions: controlImpressions,
            conversions: controlConversions,
            revenue: controlRevenue.toFixed(2),
            conversionRate: controlImpressions > 0 ? (controlConversions / controlImpressions * 100).toFixed(2) : '0',
            arpu: controlConversions > 0 ? (controlRevenue / controlConversions).toFixed(2) : '0',
          },
          variant: {
            impressions: variantImpressions,
            conversions: variantConversions,
            revenue: variantRevenue.toFixed(2),
            conversionRate: variantImpressions > 0 ? (variantConversions / variantImpressions * 100).toFixed(2) : '0',
            arpu: variantConversions > 0 ? (variantRevenue / variantConversions).toFixed(2) : '0',
          },
        },
        bayesianUpdate,
        evolutionData, // Time-series data for charts
      });
    } catch (error) {
      console.error("Error simulating batch:", error);
      res.status(500).json({ error: "Failed to simulate batch" });
    }
  });

  // GET /api/simulate/batch-stream - SSE streaming version for live updates (uses GET for EventSource compatibility)
  app.get("/api/simulate/batch-stream", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      const { 
        optimizationId, 
        visitors = '1000',
        controlConversionRate = '0.03',
        variantConversionRate = '0.03',
        avgOrderValue
      } = req.query;

      if (!optimizationId) {
        return res.status(400).json({ error: "optimizationId is required" });
      }
      
      // Convert query params to proper types and validate
      const optimizationIdStr = optimizationId as string;
      const visitorsNum = parseInt(visitors as string);
      const controlCR = parseFloat(controlConversionRate as string);
      const variantCR = parseFloat(variantConversionRate as string);
      const avgOV = avgOrderValue ? parseFloat(avgOrderValue as string) : undefined;
      
      // Validate parsed values BEFORE setting SSE headers
      if (isNaN(visitorsNum) || visitorsNum <= 0) {
        return res.status(400).json({ error: "Invalid visitors parameter" });
      }
      if (isNaN(controlCR) || controlCR < 0 || controlCR > 1) {
        return res.status(400).json({ error: "Invalid controlConversionRate parameter" });
      }
      if (isNaN(variantCR) || variantCR < 0 || variantCR > 1) {
        return res.status(400).json({ error: "Invalid variantConversionRate parameter" });
      }
      if (avgOV !== undefined && (isNaN(avgOV) || avgOV <= 0)) {
        return res.status(400).json({ error: "Invalid avgOrderValue parameter" });
      }

      const optimization = await storage.getOptimization(shop, optimizationIdStr);
      if (!optimization) {
        return res.status(404).json({ error: "Optimization not found" });
      }

      if (optimization.status !== "active") {
        return res.status(400).json({ error: "Optimization must be active to simulate batch" });
      }

      if (!optimization.productId) {
        return res.status(400).json({ error: "Optimization has no associated product" });
      }

      // Get product for pricing
      const product = await storage.getProduct(shop, optimization.productId);
      if (!product) {
        return res.status(400).json({ error: "Product not found" });
      }

      // Setup SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders();

      const sendEvent = (event: string, data: any) => {
        const eventData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        console.log(`[SSE] Sending ${event} event:`, event === 'progress' ? `impressions=${data.impressions}` : 'full data');
        res.write(eventData);
        
        // Force flush to send data immediately
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      };

      const basePrice = avgOV || parseFloat(product.price);
      const { randomUUID } = await import("crypto");
      const { assignVisitor } = await import('./assignment-service');

      const allocationBefore = {
        control: parseFloat(optimization.controlAllocation || "50"),
        variant: parseFloat(optimization.variantAllocation || "50"),
      };

      const impressionRecords = [];
      const conversionRecords = [];
      const snapshotRecords = [];
      
      let controlImpressions = 0;
      let variantImpressions = 0;
      let controlConversions = 0;
      let variantConversions = 0;
      let controlRevenue = 0;
      let variantRevenue = 0;

      sendEvent('start', {
        optimizationId: optimizationIdStr,
        totalVisitors: visitorsNum,
        allocationBefore,
      });

      console.log(`[Simulator Stream] Starting batch simulation for ${visitorsNum} visitors`);

      // REALISTIC FLOW: Simulate each visitor and stream progress
      for (let i = 0; i < visitorsNum; i++) {
        const sessionId = randomUUID();
        
        const assignment = await assignVisitor(storage, {
          shop,
          optimizationId: optimizationIdStr,
          sessionId,
          optimization,
        });
        
        impressionRecords.push({
          optimizationId: optimizationIdStr,
          sessionId,
          variant: assignment.variant,
        });
        
        if (assignment.variant === 'control') {
          controlImpressions++;
        } else {
          variantImpressions++;
        }
        
        const conversionRate = assignment.variant === 'control' 
          ? controlCR 
          : variantCR;
        
        const converts = Math.random() < conversionRate;
        
        if (converts) {
          const variance = 0.8 + Math.random() * 0.4;
          const orderValue = basePrice * variance;
          
          conversionRecords.push({
            optimizationId: optimizationIdStr,
            sessionId,
            variant: assignment.variant,
            revenue: orderValue.toFixed(2),
          });
          
          if (assignment.variant === 'control') {
            controlConversions++;
            controlRevenue += orderValue;
          } else {
            variantConversions++;
            variantRevenue += orderValue;
          }
        }

        // Stream progress every 100 impressions
        if ((i + 1) % 100 === 0) {
          const totalImpressions = controlImpressions + variantImpressions;
          const controlRPV = controlImpressions > 0 ? controlRevenue / controlImpressions : 0;
          const variantRPV = variantImpressions > 0 ? variantRevenue / variantImpressions : 0;
          const currentControlAlloc = totalImpressions > 0 ? (controlImpressions / totalImpressions) * 100 : 50;
          const currentVariantAlloc = totalImpressions > 0 ? (variantImpressions / totalImpressions) * 100 : 50;

          // Save snapshot for evolution charts
          const cumulativeImpressions = (optimization.impressions || 0) + (i + 1);
          const cumulativeControlImpressions = (optimization.controlImpressions || 0) + controlImpressions;
          const cumulativeVariantImpressions = (optimization.variantImpressions || 0) + variantImpressions;
          const cumulativeControlConversions = (optimization.controlConversions || 0) + controlConversions;
          const cumulativeVariantConversions = (optimization.variantConversions || 0) + variantConversions;
          const cumulativeControlRevenue = parseFloat(optimization.controlRevenue || "0") + controlRevenue;
          const cumulativeVariantRevenue = parseFloat(optimization.variantRevenue || "0") + variantRevenue;

          snapshotRecords.push({
            optimizationId: optimizationIdStr,
            impressions: cumulativeImpressions,
            controlImpressions: cumulativeControlImpressions,
            variantImpressions: cumulativeVariantImpressions,
            controlConversions: cumulativeControlConversions,
            variantConversions: cumulativeVariantConversions,
            controlRevenue: cumulativeControlRevenue.toFixed(2),
            variantRevenue: cumulativeVariantRevenue.toFixed(2),
            controlRPV: parseFloat(controlRPV.toFixed(2)).toString(),
            variantRPV: parseFloat(variantRPV.toFixed(2)).toString(),
            controlAllocation: parseFloat(currentControlAlloc.toFixed(1)).toString(),
            variantAllocation: parseFloat(currentVariantAlloc.toFixed(1)).toString(),
          });

          sendEvent('progress', {
            impressions: i + 1,
            controlImpressions,
            variantImpressions,
            controlConversions,
            variantConversions,
            controlRevenue: controlRevenue.toFixed(2),
            variantRevenue: variantRevenue.toFixed(2),
            controlRPV: parseFloat(controlRPV.toFixed(2)),
            variantRPV: parseFloat(variantRPV.toFixed(2)),
            controlAllocation: parseFloat(currentControlAlloc.toFixed(1)),
            variantAllocation: parseFloat(currentVariantAlloc.toFixed(1)),
            percentage: ((i + 1) / visitorsNum * 100).toFixed(1),
          });
          
          // Add actual time delay to force network flush (setImmediate doesn't flush buffers)
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Send final snapshot if not on 100-impression boundary
      if (visitorsNum % 100 !== 0) {
        const totalImpressions = controlImpressions + variantImpressions;
        const controlRPV = controlImpressions > 0 ? controlRevenue / controlImpressions : 0;
        const variantRPV = variantImpressions > 0 ? variantRevenue / variantImpressions : 0;
        const currentControlAlloc = totalImpressions > 0 ? (controlImpressions / totalImpressions) * 100 : 50;
        const currentVariantAlloc = totalImpressions > 0 ? (variantImpressions / totalImpressions) * 100 : 50;

        sendEvent('progress', {
          impressions: visitorsNum,
          controlImpressions,
          variantImpressions,
          controlConversions,
          variantConversions,
          controlRevenue: controlRevenue.toFixed(2),
          variantRevenue: variantRevenue.toFixed(2),
          controlRPV: parseFloat(controlRPV.toFixed(2)),
          variantRPV: parseFloat(variantRPV.toFixed(2)),
          controlAllocation: parseFloat(currentControlAlloc.toFixed(1)),
          variantAllocation: parseFloat(currentVariantAlloc.toFixed(1)),
          percentage: 100,
        });
      }

      // Persist to database
      await storage.createOptimizationImpressionsBulk(impressionRecords);
      if (conversionRecords.length > 0) {
        await storage.createOptimizationConversionsBulk(conversionRecords);
      }
      if (snapshotRecords.length > 0) {
        await storage.createOptimizationEvolutionSnapshotsBulk(snapshotRecords);
      }

      const totalRevenue = controlRevenue + variantRevenue;
      const totalConversions = controlConversions + variantConversions;

      // Parse bigint fields as numbers (they come from DB as strings)
      const newControlImpressions = (Number(optimization.controlImpressions) || 0) + controlImpressions;
      const newVariantImpressions = (Number(optimization.variantImpressions) || 0) + variantImpressions;
      const newControlConversions = (Number(optimization.controlConversions) || 0) + controlConversions;
      const newVariantConversions = (Number(optimization.variantConversions) || 0) + variantConversions;
      const newControlRevenue = parseFloat(optimization.controlRevenue || "0") + controlRevenue;
      const newVariantRevenue = parseFloat(optimization.variantRevenue || "0") + variantRevenue;
      
      const newImpressions = (Number(optimization.impressions) || 0) + visitors;
      const newConversions = (Number(optimization.conversions) || 0) + totalConversions;
      const newRevenue = parseFloat(optimization.revenue || "0") + totalRevenue;
      const arpu = newConversions > 0 ? newRevenue / newConversions : 0;

      const updatedOptimization = await storage.updateOptimization(shop, optimizationIdStr, {
        impressions: newImpressions,
        conversions: newConversions,
        revenue: newRevenue.toString(),
        arpu: arpu.toString(),
        controlImpressions: newControlImpressions,
        variantImpressions: newVariantImpressions,
        controlConversions: newControlConversions,
        variantConversions: newVariantConversions,
        controlRevenue: newControlRevenue.toString(),
        variantRevenue: newVariantRevenue.toString(),
      });

      // Update Bayesian allocation
      let allocationAfter = allocationBefore;
      let bayesianUpdate = null;
      
      if (updatedOptimization) {
        try {
          const { computeAllocationUpdate, updateBayesianState } = await import('./statistics/allocation-service');
          
          const bayesianConfig = updatedOptimization.bayesianConfig as BayesianState || {} as BayesianState;
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
          
          await storage.updateOptimization(shop, optimizationIdStr, {
            controlAllocation: (result.allocation.control * 100).toFixed(2),
            variantAllocation: (result.allocation.variant * 100).toFixed(2),
            bayesianConfig: result.bayesianState,
          });
          
          allocationAfter = {
            control: parseFloat((result.allocation.control * 100).toFixed(1)),
            variant: parseFloat((result.allocation.variant * 100).toFixed(1)),
          };
          
          bayesianUpdate = {
            newAllocation: allocationAfter,
            metrics: result.metrics,
            reasoning: result.reasoning,
          };
        } catch (error) {
          console.error("[Bayesian Update] Failed to update allocation:", error);
        }
      }

      // Send completion event
      sendEvent('complete', {
        optimizationId: optimizationIdStr,
        impressions: visitors,
        conversions: totalConversions,
        revenue: totalRevenue.toFixed(2),
        arpu: arpu.toFixed(2),
        allocationBefore,
        allocationAfter,
        variantPerformance: {
          control: {
            impressions: controlImpressions,
            conversions: controlConversions,
            revenue: controlRevenue.toFixed(2),
            conversionRate: controlImpressions > 0 ? (controlConversions / controlImpressions * 100).toFixed(2) : '0',
            arpu: controlConversions > 0 ? (controlRevenue / controlConversions).toFixed(2) : '0',
          },
          variant: {
            impressions: variantImpressions,
            conversions: variantConversions,
            revenue: variantRevenue.toFixed(2),
            conversionRate: variantImpressions > 0 ? (variantConversions / variantImpressions * 100).toFixed(2) : '0',
            arpu: variantConversions > 0 ? (variantRevenue / variantConversions).toFixed(2) : '0',
          },
        },
        bayesianUpdate,
      });

      res.end();
    } catch (error) {
      console.error("Error in streaming simulation:", error);
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: "Simulation failed" })}\n\n`);
      res.end();
    }
  });

  // ==========================================
  // STOREFRONT API (PUBLIC - No Auth Required)
  // ==========================================
  
  // Get all active optimizations for a shop (new unified endpoint)
  app.get("/api/storefront/optimizations", async (req, res) => {
    try {
      const shop = req.query.shop as string;
      
      if (!shop) {
        return res.status(400).json({ error: "Missing shop parameter" });
      }
      
      // Get all active optimizations
      const optimizations = await storage.getOptimizations(shop);
      const activeOptimizations = optimizations.filter(opt => opt.status === "active");
      
      // Get products to map product IDs to Shopify IDs
      const products = await storage.getProducts(shop);
      const productMap = new Map(products.map(p => [p.id, p.shopifyProductId]));
      
      // Format optimizations for storefront use
      const formattedOptimizations = activeOptimizations.map(optimization => ({
        id: optimization.id,
        shopifyProductId: productMap.get(optimization.productId || ''),
        optimizationType: optimization.optimizationType,
        controlData: optimization.controlData,
        variantData: optimization.variantData,
        scope: optimization.scope || 'product',
      }));
      
      res.json({ optimizations: formattedOptimizations });
    } catch (error) {
      console.error("Error fetching storefront optimizations:", error);
      res.status(500).json({ error: "Failed to fetch optimizations" });
    }
  });
  
  // Record session assignment (persistent variant assignment)
  // NOTE: SDK sends variant pre-selected by client-side logic.
  // For simulator and future server-side assignment, use assignVisitor from assignment-service.ts
  app.post("/api/storefront/assign", async (req, res) => {
    try {
      const { sessionId, optimizationId, variant, shop } = req.body;
      
      if (!sessionId || !optimizationId || !variant || !shop) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      if (variant !== "control" && variant !== "variant") {
        return res.status(400).json({ error: "Invalid variant value" });
      }
      
      // Check if optimization exists and is active
      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization || optimization.status !== "active") {
        return res.status(404).json({ error: "Active optimization not found" });
      }
      
      // Record the assignment (90-day expiry)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
      
      await storage.createSessionAssignment(shop, {
        sessionId,
        optimizationId,
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
      const { optimizationId, variant, sessionId, shop } = req.body;
      
      if (!optimizationId || !variant || !shop) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      if (variant !== "control" && variant !== "variant") {
        return res.status(400).json({ error: "Invalid variant value" });
      }
      
      // Get the optimization
      const optimization = await storage.getOptimization(shop, optimizationId);
      if (!optimization || optimization.status !== "active") {
        return res.status(404).json({ error: "Active optimization not found" });
      }
      
      // Increment the appropriate impression counter
      // Parse bigint fields as numbers (they come from DB as strings)
      const updates: any = {
        impressions: (Number(optimization.impressions) || 0) + 1,
      };
      
      if (variant === "control") {
        updates.controlImpressions = (Number(optimization.controlImpressions) || 0) + 1;
      } else {
        updates.variantImpressions = (Number(optimization.variantImpressions) || 0) + 1;
      }
      
      await storage.updateOptimization(shop, optimizationId, updates);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking impression:", error);
      res.status(500).json({ error: "Failed to track impression" });
    }
  });

  // Migration endpoint: Backfill legacy fixed optimizations to Bayesian
  app.post("/api/migrate/bayesian", requireShopifySessionOrDev, async (req, res) => {
    try {
      const shop = (req as any).shop;
      
      // Get all optimizations (any status) that need migration
      const allOptimizations = await storage.getOptimizations(shop);
      const legacyOptimizations = allOptimizations.filter(opt => opt.allocationStrategy !== "bayesian");
      
      if (legacyOptimizations.length === 0) {
        return res.json({ 
          success: true, 
          migrated: 0, 
          message: "No legacy optimizations found - all optimizations are already using Bayesian allocation" 
        });
      }
      
      console.log(`[Migration] Found ${legacyOptimizations.length} legacy optimizations to migrate`);
      
      const { initializeBayesianState } = await import('./statistics/allocation-service');
      let migratedCount = 0;
      
      for (const optimization of legacyOptimizations) {
        // Get product for price estimation
        const product = await storage.getProduct(shop, optimization.productId);
        if (!product) {
          console.log(`[Migration] Skipping optimization ${optimization.id} - product not found`);
          continue;
        }
        
        // Initialize Bayesian state
        const estimatedCR = 0.02; // 2% default
        const estimatedAOV = parseFloat(product.price);
        
        const bayesianState = initializeBayesianState({
          conversionRate: estimatedCR,
          avgOrderValue: estimatedAOV,
          riskMode: 'cautious',
          safetyBudget: 50,
        });
        
        // Update optimization to Bayesian with proper initial allocation
        await storage.updateOptimization(shop, optimization.id, {
          allocationStrategy: "bayesian",
          bayesianConfig: bayesianState,
          controlAllocation: "75", // Cautious start
          variantAllocation: "5",
        });
        
        migratedCount++;
        console.log(`[Migration] Migrated optimization ${optimization.id} (${optimization.optimizationType}) to Bayesian`);
      }
      
      res.json({
        success: true,
        migrated: migratedCount,
        message: `Successfully migrated ${migratedCount} optimizations to Bayesian allocation`,
      });
    } catch (error) {
      console.error("[Migration] Error migrating optimizations:", error);
      const errorMessage = error instanceof Error ? error.message : "Migration failed";
      res.status(500).json({ error: errorMessage });
    }
  });

  const httpServer = createServer(app);
  
  return httpServer;
}