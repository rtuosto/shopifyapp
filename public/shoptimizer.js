/**
 * Shoptimizer A/B Testing SDK v2.0
 * 
 * Persistent session-based A/B testing with accurate conversion attribution.
 * - Generates UUID session ID, stored in localStorage
 * - Persistent variant assignments (90-day expiry) - same user always sees same variant
 * - Fetches all active tests from backend
 * - Dynamically modifies product page content (title, price, description)
 * - Tracks impressions with session ID
 * - Injects session ID into cart for conversion attribution
 */

(function() {
  'use strict';

  const SHOPTIMIZER_CONFIG = {
    apiUrl: window.ShoptimizerConfig?.apiUrl || 'https://your-app.replit.app',
    shop: window.Shopify?.shop || '',
    sessionKey: 'shoptimizer_session_id',
    assignmentsKey: 'shoptimizer_assignments',
    sessionExpireDays: 90, // Persistent assignments for 90 days
  };

  // ============================================
  // UUID Generation
  // ============================================

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ============================================
  // Session Management (localStorage with 90-day persistence)
  // ============================================

  function getSessionId() {
    try {
      let sessionId = localStorage.getItem(SHOPTIMIZER_CONFIG.sessionKey);
      
      if (!sessionId) {
        // Generate new session ID
        sessionId = generateUUID();
        localStorage.setItem(SHOPTIMIZER_CONFIG.sessionKey, sessionId);
        console.log('[Shoptimizer] New session ID generated:', sessionId);
      }
      
      return sessionId;
    } catch (e) {
      console.error('[Shoptimizer] localStorage not available:', e);
      // Fallback to session-only UUID
      if (!window.__shoptimizerSessionId) {
        window.__shoptimizerSessionId = generateUUID();
      }
      return window.__shoptimizerSessionId;
    }
  }

  // ============================================
  // Persistent Variant Assignments
  // ============================================

  function getLocalAssignments() {
    try {
      const stored = localStorage.getItem(SHOPTIMIZER_CONFIG.assignmentsKey);
      if (!stored) return {};
      
      const assignments = JSON.parse(stored);
      const now = Date.now();
      
      // Filter out expired assignments
      const validAssignments = {};
      for (const testId in assignments) {
        const assignment = assignments[testId];
        if (assignment.expiresAt > now) {
          validAssignments[testId] = assignment;
        }
      }
      
      return validAssignments;
    } catch (e) {
      console.error('[Shoptimizer] Failed to load assignments:', e);
      return {};
    }
  }

  function saveLocalAssignment(testId, variant) {
    try {
      const assignments = getLocalAssignments();
      const expiresAt = Date.now() + (SHOPTIMIZER_CONFIG.sessionExpireDays * 24 * 60 * 60 * 1000);
      
      assignments[testId] = {
        variant,
        assignedAt: Date.now(),
        expiresAt,
      };
      
      localStorage.setItem(SHOPTIMIZER_CONFIG.assignmentsKey, JSON.stringify(assignments));
      console.log(`[Shoptimizer] Saved ${variant} assignment for test ${testId} (expires in 90 days)`);
    } catch (e) {
      console.error('[Shoptimizer] Failed to save assignment:', e);
    }
  }

  function getLocalAssignment(testId) {
    const assignments = getLocalAssignments();
    return assignments[testId]?.variant;
  }

  // ============================================
  // Variant Assignment (with backend sync)
  // ============================================

  async function assignUserToVariant(sessionId, testId) {
    // Check if user already has a local assignment
    const existing = getLocalAssignment(testId);
    if (existing) {
      console.log(`[Shoptimizer] Using existing assignment: ${existing}`);
      return existing;
    }

    // Randomly assign (50/50 split)
    const variant = Math.random() < 0.5 ? 'control' : 'variant';
    
    // Save locally
    saveLocalAssignment(testId, variant);
    
    // Sync to backend for conversion attribution
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SHOPTIMIZER_CONFIG.sessionExpireDays);
      
      await fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          testId,
          variant,
          shop: SHOPTIMIZER_CONFIG.shop,
        }),
      });
      
      console.log(`[Shoptimizer] Assignment synced to backend: ${variant}`);
    } catch (err) {
      console.error('[Shoptimizer] Failed to sync assignment to backend:', err);
      // Continue anyway - local assignment still works
    }
    
    return variant;
  }

  // ============================================
  // Product Page Content Modification
  // ============================================

  function applyVariant(test, variant) {
    const data = variant === 'control' ? test.controlData : test.variantData;

    console.log(`[Shoptimizer] Applying ${variant} for test ${test.id}`, data);

    // Apply title change
    if (data.title) {
      const titleSelectors = [
        '.product-single__title',
        '.product__title',
        '[data-product-title]',
        '.product-title',
        'h1[itemprop="name"]',
        'h1'
      ];
      
      for (const selector of titleSelectors) {
        const titleElement = document.querySelector(selector);
        if (titleElement) {
          titleElement.textContent = data.title;
          console.log(`[Shoptimizer] Updated title via ${selector}`);
          break;
        }
      }
    }

    // Apply description change
    if (data.description) {
      const descSelectors = [
        '.product-single__description',
        '.product__description',
        '[data-product-description]',
        '.product-description',
        '[itemprop="description"]'
      ];
      
      for (const selector of descSelectors) {
        const descElement = document.querySelector(selector);
        if (descElement) {
          descElement.innerHTML = data.description;
          console.log(`[Shoptimizer] Updated description via ${selector}`);
          break;
        }
      }
    }

    // Apply price change
    if (data.price) {
      const priceSelectors = [
        '.product__price',
        '.product-single__price',
        '[data-product-price]',
        '.price',
        '[itemprop="price"]'
      ];
      
      document.querySelectorAll(priceSelectors.join(', ')).forEach(el => {
        const formattedPrice = formatPrice(data.price);
        el.textContent = formattedPrice;
        console.log(`[Shoptimizer] Updated price to ${formattedPrice}`);
      });
    }
  }

  function formatPrice(price) {
    // Use Shopify's currency formatting if available
    if (window.Shopify && window.Shopify.formatMoney) {
      const cents = Math.round(parseFloat(price) * 100);
      return window.Shopify.formatMoney(cents, window.theme?.moneyFormat || '${{amount}}');
    }
    // Fallback to simple formatting
    return `$${parseFloat(price).toFixed(2)}`;
  }

  // ============================================
  // Impression Tracking
  // ============================================

  function trackImpression(sessionId, testId, variant) {
    fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testId,
        variant,
        sessionId,
        shop: SHOPTIMIZER_CONFIG.shop,
      }),
    }).catch(err => {
      console.error('[Shoptimizer] Failed to track impression:', err);
    });
  }

  // ============================================
  // Cart Attribute Injection (for conversion attribution)
  // ============================================

  function injectSessionIntoCart(sessionId) {
    // Inject session ID into cart attributes so it flows to order webhook
    
    // Method 1: Intercept add-to-cart form submissions
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.matches('[action*="/cart/add"]') || form.querySelector('[name="add"]')) {
        console.log('[Shoptimizer] Intercepting add-to-cart form');
        
        // Add hidden input with session ID as cart attribute
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'attributes[_shoptimizer_session]';
        input.value = sessionId;
        form.appendChild(input);
        
        console.log('[Shoptimizer] Session ID injected into cart form');
      }
    });
    
    // Method 2: Intercept AJAX add-to-cart calls
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const [url, options] = args;
      
      if (typeof url === 'string' && url.includes('/cart/add')) {
        try {
          if (options && options.body) {
            const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
            
            // Add session ID to cart attributes
            if (!body.attributes) {
              body.attributes = {};
            }
            body.attributes['_shoptimizer_session'] = sessionId;
            
            options.body = JSON.stringify(body);
            console.log('[Shoptimizer] Session ID injected into AJAX cart add');
          }
        } catch (e) {
          console.error('[Shoptimizer] Failed to inject session into AJAX cart add:', e);
        }
      }
      
      return originalFetch.apply(this, args);
    };
  }

  // ============================================
  // Main Initialization
  // ============================================

  async function initShoptimizer() {
    // Get or create persistent session ID
    const sessionId = getSessionId();
    console.log('[Shoptimizer] Session ID:', sessionId);
    
    // Inject session ID into cart for conversion attribution
    injectSessionIntoCart(sessionId);
    
    // Get Shopify product ID from the page
    const shopifyProductId = getShopifyProductId();
    if (!shopifyProductId) {
      console.log('[Shoptimizer] No product ID found, skipping A/B test check');
      return;
    }

    console.log('[Shoptimizer] Checking for active tests on product:', shopifyProductId);

    try {
      // Fetch all active tests from backend
      const response = await fetch(
        `${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/tests?shop=${SHOPTIMIZER_CONFIG.shop}`
      );
      
      const data = await response.json();
      
      if (!data.tests || data.tests.length === 0) {
        console.log('[Shoptimizer] No active tests found');
        return;
      }
      
      console.log(`[Shoptimizer] Found ${data.tests.length} active test(s)`);
      
      // Find test for current product
      const productTest = data.tests.find(t => t.shopifyProductId === shopifyProductId);
      
      if (!productTest) {
        console.log('[Shoptimizer] No test for this specific product');
        return;
      }
      
      console.log('[Shoptimizer] Active test found for this product:', productTest.id);
      
      // Assign user to variant (or retrieve existing assignment)
      const variant = await assignUserToVariant(sessionId, productTest.id);
      console.log('[Shoptimizer] User assigned to:', variant);
      
      // Apply variant changes to product page
      applyVariant(productTest, variant);
      
      // Track impression
      trackImpression(sessionId, productTest.id, variant);
      
      // Store for potential JS access
      window.shoptimizerSession = sessionId;
      window.shoptimizerVariant = variant;
      window.shoptimizerTestId = productTest.id;
      
    } catch (err) {
      console.error('[Shoptimizer] Failed to initialize:', err);
    }
  }

  function getShopifyProductId() {
    // Method 1: From ShopifyAnalytics (most reliable)
    if (window.ShopifyAnalytics?.meta?.product?.gid) {
      return window.ShopifyAnalytics.meta.product.gid;
    }
    
    // Method 2: From meta tag
    const metaProduct = document.querySelector('meta[property="product:id"]');
    if (metaProduct) {
      return metaProduct.content;
    }
    
    // Method 3: From og:url
    const metaUrl = document.querySelector('meta[property="og:url"]');
    if (metaUrl) {
      const match = metaUrl.content.match(/\/products\/([^?/]+)/);
      if (match) {
        // Try to get numeric ID if available
        const productJsonScript = document.querySelector('script[data-product-json]');
        if (productJsonScript) {
          try {
            const productData = JSON.parse(productJsonScript.textContent);
            if (productData.id) {
              return `gid://shopify/Product/${productData.id}`;
            }
          } catch (e) {}
        }
      }
    }
    
    // Method 4: From window.meta (Dawn theme and variants)
    if (window.meta?.product?.id) {
      return `gid://shopify/Product/${window.meta.product.id}`;
    }
    
    return null;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShoptimizer);
  } else {
    initShoptimizer();
  }

  // Expose API
  window.Shoptimizer = {
    init: initShoptimizer,
    config: SHOPTIMIZER_CONFIG,
    getSessionId: getSessionId,
  };
})();
