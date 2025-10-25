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
    shop: window.ShoptimizerConfig?.shop || window.Shopify?.shop || '',
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

  async function assignUserToVariant(sessionId, testId, controlAllocation, variantAllocation) {
    // Check if user already has a local assignment
    const existing = getLocalAssignment(testId);
    if (existing) {
      console.log(`[Shoptimizer] Using existing assignment: ${existing}`);
      return existing;
    }

    // Use dynamic allocation percentages (Bayesian or fixed)
    // controlAllocation and variantAllocation are in range 0-100
    const controlPct = parseFloat(controlAllocation) || 50;
    const variantPct = parseFloat(variantAllocation) || 50;
    
    // Normalize to ensure they sum to 100
    const total = controlPct + variantPct;
    const normalizedControlPct = (controlPct / total) * 100;
    
    // Randomly assign based on allocation percentages
    const random = Math.random() * 100;
    const variant = random < normalizedControlPct ? 'control' : 'variant';
    
    console.log(`[Shoptimizer] Assigned to ${variant} (allocation: control=${controlPct}%, variant=${variantPct}%)`);
    
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
  // Collection/Listing Page Support
  // ============================================

  // Track which product cards we've already processed to avoid duplicates
  const processedProductCards = new Set();

  /**
   * Apply variant to a product card on collection/listing pages
   * Scoped to the card element to avoid affecting PDP elements
   */
  function applyVariantToCard(cardElement, test, variant) {
    // Double-check: skip if already processed with the same variant
    if (cardElement.dataset.shoptimizerProcessed === 'true' && 
        cardElement.dataset.shoptimizerVariant === variant) {
      return;
    }

    const data = variant === 'control' ? test.controlData : test.variantData;
    const productId = getProductIdFromCard(cardElement);

    console.log(`[Shoptimizer] Applying ${variant} to product card:`, productId);

    // Apply title change (scoped to card)
    if (data.title) {
      const titleSelectors = [
        '.card__heading',
        '.card-title',
        '.product-card__title',
        '.product-item__title',
        '[data-product-title]',
        'a.product-title',
        'h3',
        'h2'
      ];
      
      for (const selector of titleSelectors) {
        const titleElement = cardElement.querySelector(selector);
        if (titleElement) {
          // Skip if already has this exact value (prevents unnecessary DOM updates)
          if (titleElement.textContent === data.title) {
            break;
          }
          
          // Store original for potential rollback
          if (!titleElement.dataset.originalTitle) {
            titleElement.dataset.originalTitle = titleElement.textContent;
          }
          titleElement.textContent = data.title;
          console.log(`[Shoptimizer] Updated card title via ${selector}`);
          break;
        }
      }
    }

    // Apply price change (scoped to card)
    if (data.price) {
      const priceSelectors = [
        '.price__regular .price-item--regular',
        '.price-item--regular',
        '.product-card__price',
        '.product-item__price',
        '[data-product-price]',
        '.price',
        '.money'
      ];
      
      const priceElements = cardElement.querySelectorAll(priceSelectors.join(', '));
      const formattedPrice = formatPrice(data.price);
      
      priceElements.forEach(el => {
        // Skip if already has this exact value (prevents unnecessary DOM updates)
        if (el.textContent === formattedPrice) {
          return;
        }
        
        // Store original for potential rollback
        if (!el.dataset.originalPrice) {
          el.dataset.originalPrice = el.textContent;
        }
        el.textContent = formattedPrice;
        console.log(`[Shoptimizer] Updated card price to ${formattedPrice}`);
      });
    }

    // Mark card as processed
    cardElement.dataset.shoptimizerProcessed = 'true';
    cardElement.dataset.shoptimizerVariant = variant;
  }

  /**
   * Extract product ID from a product card element
   */
  function getProductIdFromCard(cardElement) {
    // Method 1: data-product-id attribute
    if (cardElement.dataset.productId) {
      const id = cardElement.dataset.productId;
      return id.includes('gid://') ? id : `gid://shopify/Product/${id}`;
    }

    // Method 2: data-product-handle (need to match with test data)
    if (cardElement.dataset.productHandle) {
      return cardElement.dataset.productHandle;
    }

    // Method 3: Extract from product URL in card
    const productLink = cardElement.querySelector('a[href*="/products/"]');
    if (productLink) {
      const match = productLink.href.match(/\/products\/([^?/#]+)/);
      if (match) {
        return match[1]; // Return handle, will match against test data
      }
    }

    return null;
  }

  /**
   * Find product test by ID or handle
   */
  function findTestForProduct(tests, productIdentifier) {
    if (!productIdentifier) return null;

    return tests.find(test => {
      // Direct GID match
      if (test.shopifyProductId === productIdentifier) {
        return true;
      }

      // Handle match (extract from GID)
      if (test.shopifyProductId && test.shopifyProductId.includes('Product/')) {
        const testId = test.shopifyProductId.split('Product/')[1];
        if (testId === productIdentifier || testId === productIdentifier.replace('gid://shopify/Product/', '')) {
          return true;
        }
      }

      // Handle-based match (if test stores handle)
      if (test.productHandle === productIdentifier) {
        return true;
      }

      return false;
    });
  }

  /**
   * Process all product cards on collection/listing pages
   * Returns true if any cards were modified (to signal observer to disconnect/reconnect)
   */
  async function processCollectionPageProducts(sessionId, tests) {
    if (!tests || tests.length === 0) return false;

    // Common product card selectors across Shopify themes
    const cardSelectors = [
      '.product-card',
      '.product-item',
      '.grid-product',
      '.card-wrapper',
      '[data-product-id]',
      '.product-grid-item',
      'li.grid__item'
    ];

    const productCards = document.querySelectorAll(cardSelectors.join(', '));
    
    if (productCards.length === 0) {
      return false;
    }

    let modifiedCount = 0;
    let newCardsProcessed = 0;

    for (const card of productCards) {
      // Skip if already processed (check the specific flag we set)
      if (card.dataset.shoptimizerProcessed === 'true') {
        continue;
      }

      const productId = getProductIdFromCard(card);
      if (!productId) {
        continue;
      }

      // Find active test for this product
      const productTest = findTestForProduct(tests, productId);
      if (!productTest) {
        continue; // No test for this product, skip
      }

      // Assign variant (reuse existing logic with dynamic allocations)
      const variant = await assignUserToVariant(sessionId, productTest.id, productTest.controlAllocation, productTest.variantAllocation);
      
      // Apply variant to this card
      applyVariantToCard(card, productTest, variant);
      modifiedCount++;
      newCardsProcessed++;

      // Track collection page impression (once per card)
      const cardKey = `${productTest.id}-${productId}`;
      if (!processedProductCards.has(cardKey)) {
        trackImpression(sessionId, productTest.id, variant, 'collection');
        processedProductCards.add(cardKey);
      }
    }

    if (newCardsProcessed > 0) {
      console.log(`[Shoptimizer] Processed ${newCardsProcessed} new product card(s) on collection page`);
    }

    return modifiedCount > 0;
  }

  /**
   * Watch for lazy-loaded product cards (infinite scroll, AJAX)
   */
  function watchForLazyLoadedProducts(sessionId, tests) {
    if (!tests || tests.length === 0) return null;

    let debounceTimer;
    let isProcessing = false;
    let needsRecheck = false;
    
    const observer = new MutationObserver((mutations) => {
      // If we're currently processing, set flag to recheck after current batch
      if (isProcessing) {
        needsRecheck = true;
        return;
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        // Set processing flag to prevent re-entry during our DOM modifications
        isProcessing = true;
        needsRecheck = false;

        try {
          const modified = await processCollectionPageProducts(sessionId, tests);
          
          if (modified) {
            console.log('[Shoptimizer] Applied variants to new product cards');
          }
          
          // If new mutations occurred while we were processing, do another sweep
          if (needsRecheck) {
            console.log('[Shoptimizer] New cards detected during processing, rechecking...');
            needsRecheck = false;
            await processCollectionPageProducts(sessionId, tests);
          }
        } catch (err) {
          console.error('[Shoptimizer] Error processing cards:', err);
        } finally {
          isProcessing = false;
          
          // Final check in case mutations happened during the finally block
          if (needsRecheck) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
              if (!isProcessing) {
                isProcessing = true;
                needsRecheck = false;
                try {
                  await processCollectionPageProducts(sessionId, tests);
                } finally {
                  isProcessing = false;
                }
              }
            }, 100);
          }
        }
      }, 300); // Debounce 300ms to avoid excessive processing
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[Shoptimizer] MutationObserver active for lazy-loaded products');
    
    return observer;
  }

  // ============================================
  // Impression Tracking
  // ============================================

  function trackImpression(sessionId, testId, variant, context = 'product') {
    fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testId,
        variant,
        sessionId,
        shop: SHOPTIMIZER_CONFIG.shop,
        context, // 'product' for PDP, 'collection' for listing pages
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
    try {
      // Get or create persistent session ID
      const sessionId = getSessionId();
      console.log('[Shoptimizer] Session ID:', sessionId);
      
      // Inject session ID into cart for conversion attribution
      injectSessionIntoCart(sessionId);

      // Validate configuration
      if (!SHOPTIMIZER_CONFIG.apiUrl || SHOPTIMIZER_CONFIG.apiUrl.includes('your-app.replit.app')) {
        console.error('[Shoptimizer] Invalid API URL. Please check your installation.');
        return;
      }

      // Fetch all active tests from backend (once for all page types)
      const testUrl = `${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/tests?shop=${SHOPTIMIZER_CONFIG.shop}`;
      console.log('[Shoptimizer] Fetching active tests from:', testUrl);
      
      const response = await fetch(testUrl);
      
      if (!response.ok) {
        console.error('[Shoptimizer] Failed to fetch tests:', response.status, response.statusText);
        return;
      }
      
      const data = await response.json();
      
      if (!data.tests || data.tests.length === 0) {
        console.log('[Shoptimizer] No active tests found');
        console.log('[Shoptimizer] Initialized successfully (session tracking only)');
        return;
      }
      
      console.log(`[Shoptimizer] Found ${data.tests.length} active test(s)`);
      
      // Check if this is a product detail page
      const shopifyProductId = getShopifyProductId();
      
      if (shopifyProductId) {
        // PRODUCT DETAIL PAGE LOGIC
        console.log('[Shoptimizer] Product page detected:', shopifyProductId);
        
        const productTest = data.tests.find(t => t.shopifyProductId === shopifyProductId);
        
        if (!productTest) {
          console.log('[Shoptimizer] No test for this specific product on PDP');
          // Still check for collection cards below
        } else {
          console.log('[Shoptimizer] Active test found for this product:', productTest.id);
          
          // Assign user to variant (or retrieve existing assignment with dynamic allocations)
          const variant = await assignUserToVariant(sessionId, productTest.id, productTest.controlAllocation, productTest.variantAllocation);
          console.log('[Shoptimizer] User assigned to:', variant);
          
          // Apply variant changes to product page
          applyVariant(productTest, variant);
          
          // Track impression
          trackImpression(sessionId, productTest.id, variant, 'product');
          
          // Store for potential JS access
          window.shoptimizerSession = sessionId;
          window.shoptimizerVariant = variant;
          window.shoptimizerTestId = productTest.id;
          
          console.log('[Shoptimizer] Initialized successfully (PDP A/B testing active)');
        }
      }
      
      // COLLECTION/LISTING PAGE LOGIC (runs on all pages including PDP)
      // Process product cards on collection/listing/homepage/search results
      await processCollectionPageProducts(sessionId, data.tests);
      
      // Watch for lazy-loaded products (infinite scroll, AJAX pagination)
      watchForLazyLoadedProducts(sessionId, data.tests);
      
      console.log('[Shoptimizer] Initialized successfully (all page types)');
      
    } catch (err) {
      console.error('[Shoptimizer] Initialization error:', err.message || err);
      // Still track session even if A/B testing fails
      console.log('[Shoptimizer] Session tracking active despite error');
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
