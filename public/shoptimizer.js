/**
 * Shoptimizer A/B Optimization SDK v2.0
 * 
 * Persistent session-based A/B optimization with accurate conversion attribution.
 * - Generates UUID session ID, stored in localStorage
 * - Persistent variant assignments (90-day expiry) - same user always sees same variant
 * - Fetches all active optimizations from backend
 * - Dynamically modifies product page content (title, price, description)
 * - Tracks impressions with session ID
 * - Injects session ID into cart for conversion attribution
 */

(function() {
  'use strict';

  const SHOPTIMIZER_CONFIG = {
    apiUrl: window.ShoptimizerConfig?.apiUrl || 'https://your-app.replit.app',
    dashboardUrl: window.ShoptimizerConfig?.dashboardUrl || '',
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
      for (const optimizationId in assignments) {
        const assignment = assignments[optimizationId];
        if (assignment.expiresAt > now) {
          validAssignments[optimizationId] = assignment;
        }
      }
      
      return validAssignments;
    } catch (e) {
      console.error('[Shoptimizer] Failed to load assignments:', e);
      return {};
    }
  }

  function saveLocalAssignment(optimizationId, variant) {
    try {
      const assignments = getLocalAssignments();
      const expiresAt = Date.now() + (SHOPTIMIZER_CONFIG.sessionExpireDays * 24 * 60 * 60 * 1000);
      
      assignments[optimizationId] = {
        variant,
        assignedAt: Date.now(),
        expiresAt,
      };
      
      localStorage.setItem(SHOPTIMIZER_CONFIG.assignmentsKey, JSON.stringify(assignments));
      console.log(`[Shoptimizer] Saved ${variant} assignment for optimization ${optimizationId} (expires in 90 days)`);
    } catch (e) {
      console.error('[Shoptimizer] Failed to save assignment:', e);
    }
  }

  function getLocalAssignment(optimizationId) {
    const assignments = getLocalAssignments();
    return assignments[optimizationId]?.variant;
  }

  // ============================================
  // Variant Assignment (with backend sync)
  // ============================================

  async function assignUserToVariant(sessionId, optimizationId, controlAllocation, variantAllocation) {
    // Check if user already has a local assignment
    const existing = getLocalAssignment(optimizationId);
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
    
    // Guard against 0/0 edge case (if both allocations are zero, default to 50/50)
    const normalizedControlPct = total > 0 ? (controlPct / total) * 100 : 50;
    
    // Randomly assign based on allocation percentages
    const random = Math.random() * 100;
    const variant = random < normalizedControlPct ? 'control' : 'variant';
    
    console.log(`[Shoptimizer] Assigned to ${variant} (allocation: control=${controlPct}%, variant=${variantPct}%)`);
    
    // Save locally
    saveLocalAssignment(optimizationId, variant);
    
    // Sync to backend for conversion attribution
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SHOPTIMIZER_CONFIG.sessionExpireDays);
      
      await fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          optimizationId,
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

  // Shared helper functions for updating DOM elements
  // These are used by all variant application functions to eliminate code duplication

  /**
   * Update product title with visibility checks
   * @param {string} title - The new title text
   * @param {Object} options - Configuration options
   * @param {string} options.logPrefix - Prefix for console logs (e.g., '[Shoptimizer]')
   * @param {HTMLElement} options.scope - Optional scope element (for card updates)
   * @param {boolean} options.storeOriginal - Whether to store original value in dataset
   * @param {Array<string>} options.selectors - Optional custom selectors (defaults to product page selectors)
   * @returns {boolean} - Whether the update was successful
   */
  function updateTitle(title, options = {}) {
    if (!title) return false;

    const {
      logPrefix = '[Shoptimizer]',
      scope = document,
      storeOriginal = false,
      selectors = null
    } = options;

    // Use custom selectors if provided, otherwise use product page defaults
    const titleSelectors = selectors || [
      '.product-single__title',
      '.product__title',
      '[data-product-title]',
      '.product-title',
      'h1[itemprop="name"]',
      'h1'
    ];
    
    let titleUpdated = false;
    for (const selector of titleSelectors) {
      const titleElements = scope.querySelectorAll(selector);
      for (const titleElement of titleElements) {
        // Skip hidden elements (templates, etc.)
        const isVisible = titleElement.offsetParent !== null && 
                         window.getComputedStyle(titleElement).display !== 'none' &&
                         window.getComputedStyle(titleElement).visibility !== 'hidden';
        
        if (isVisible) {
          const oldTitle = titleElement.textContent;
          
          // Store original if requested
          if (storeOriginal && !titleElement.dataset.originalText) {
            titleElement.dataset.originalText = oldTitle;
          }
          
          titleElement.textContent = title;
          console.log(`${logPrefix} Updated title via ${selector}: "${oldTitle}" → "${title}"`);
          titleUpdated = true;
          break;
        }
      }
      if (titleUpdated) break;
    }
    
    if (!titleUpdated) {
      console.error(`${logPrefix} Failed to update title - no visible title element found`);
      console.log(`${logPrefix} Title data:`, title);
      console.log(`${logPrefix} Tried selectors:`, titleSelectors);
    }

    return titleUpdated;
  }

  /**
   * Update product price
   * @param {string|number} price - The new price
   * @param {Object} options - Configuration options
   * @param {string} options.logPrefix - Prefix for console logs
   * @param {HTMLElement} options.scope - Optional scope element (for card updates)
   * @param {boolean} options.storeOriginal - Whether to store original value in dataset
   * @param {Array<string>} options.selectors - Optional custom selectors (defaults to product page selectors)
   * @returns {boolean} - Whether the update was successful
   */
  function updatePrice(price, options = {}) {
    if (!price) return false;

    const {
      logPrefix = '[Shoptimizer]',
      scope = document,
      storeOriginal = false,
      selectors = null
    } = options;

    // Use custom selectors if provided, otherwise use product page defaults
    const priceSelectors = selectors || [
      '.product__price',
      '.product-single__price',
      '[data-product-price]',
      '.price',
      '[itemprop="price"]'
    ];
    
    const formattedPrice = formatPrice(price);
    const priceElements = scope.querySelectorAll(priceSelectors.join(', '));
    
    if (priceElements.length === 0) {
      console.warn(`${logPrefix} No price elements found`);
      return false;
    }

    priceElements.forEach(el => {
      // Store original if requested
      if (storeOriginal && !el.dataset.originalPrice) {
        el.dataset.originalPrice = el.textContent;
      }
      
      el.textContent = formattedPrice;
    });

    console.log(`${logPrefix} Updated ${priceElements.length} price element(s) to ${formattedPrice}`);
    return true;
  }

  /**
   * Update product description
   * @param {string} description - The new description HTML
   * @param {Object} options - Configuration options
   * @param {string} options.logPrefix - Prefix for console logs
   * @param {HTMLElement} options.scope - Optional scope element
   * @param {boolean} options.storeOriginal - Whether to store original value in dataset
   * @returns {boolean} - Whether the update was successful
   */
  function updateDescription(description, options = {}) {
    if (!description) return false;

    const {
      logPrefix = '[Shoptimizer]',
      scope = document,
      storeOriginal = false
    } = options;

    const descSelectors = [
      '.product-single__description',
      '.product__description',
      '[data-product-description]',
      '.product-description',
      '[itemprop="description"]'
    ];
    
    for (const selector of descSelectors) {
      const descElement = scope.querySelector(selector);
      if (descElement) {
        // Store original if requested
        if (storeOriginal && !descElement.dataset.originalHtml) {
          descElement.dataset.originalHtml = descElement.innerHTML;
        }
        
        descElement.innerHTML = description;
        console.log(`${logPrefix} Updated description via ${selector}`);
        return true;
      }
    }

    console.warn(`${logPrefix} No description element found`);
    return false;
  }

  function applyVariant(optimization, variant) {
    const data = variant === 'control' ? optimization.controlData : optimization.variantData;
    console.log(`[Shoptimizer] Applying ${variant} for optimization ${optimization.id}`, data);

    // Use shared helper functions
    updateTitle(data.title, { logPrefix: '[Shoptimizer]' });
    updateDescription(data.description, { logPrefix: '[Shoptimizer]' });
    updatePrice(data.price, { logPrefix: '[Shoptimizer]' });
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
  function applyVariantToCard(cardElement, optimization, variant) {
    // Double-check: skip if already processed with the same variant
    if (cardElement.dataset.shoptimizerProcessed === 'true' && 
        cardElement.dataset.shoptimizerVariant === variant) {
      return;
    }

    const data = variant === 'control' ? optimization.controlData : optimization.variantData;
    const productId = getProductIdFromCard(cardElement);

    console.log(`[Shoptimizer] Applying ${variant} to product card:`, productId);

    // Card-specific selectors (different from product detail pages)
    const cardTitleSelectors = [
      '.card__heading',
      '.card-title',
      '.product-card__title',
      '.product-item__title',
      '[data-product-title]',
      'a.product-title',
      'h3',
      'h2'
    ];

    const cardPriceSelectors = [
      '.price__regular .price-item--regular',
      '.price-item--regular',
      '.product-card__price',
      '.product-item__price',
      '[data-product-price]',
      '.price',
      '.money'
    ];

    // Use shared helpers with card-specific selectors and scope
    updateTitle(data.title, {
      logPrefix: '[Shoptimizer]',
      scope: cardElement,
      storeOriginal: true,
      selectors: cardTitleSelectors
    });

    updatePrice(data.price, {
      logPrefix: '[Shoptimizer]',
      scope: cardElement,
      storeOriginal: true,
      selectors: cardPriceSelectors
    });

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

    // Method 2: data-product-handle (need to match with optimization data)
    if (cardElement.dataset.productHandle) {
      return cardElement.dataset.productHandle;
    }

    // Method 3: Extract from product URL in card
    const productLink = cardElement.querySelector('a[href*="/products/"]');
    if (productLink) {
      const match = productLink.href.match(/\/products\/([^?/#]+)/);
      if (match) {
        return match[1]; // Return handle, will match against optimization data
      }
    }

    return null;
  }

  /**
   * Find product optimization by ID or handle
   */
  function findOptimizationForProduct(optimizations, productIdentifier) {
    if (!productIdentifier) return null;

    return optimizations.find(optimization => {
      // Direct GID match
      if (optimization.shopifyProductId === productIdentifier) {
        return true;
      }

      // Handle match (extract from GID)
      if (optimization.shopifyProductId && optimization.shopifyProductId.includes('Product/')) {
        const optimizationId = optimization.shopifyProductId.split('Product/')[1];
        if (optimizationId === productIdentifier || optimizationId === productIdentifier.replace('gid://shopify/Product/', '')) {
          return true;
        }
      }

      // Handle-based match (if optimization stores handle)
      if (optimization.productHandle === productIdentifier) {
        return true;
      }

      return false;
    });
  }

  /**
   * Process all product cards on collection/listing pages
   * Returns true if any cards were modified (to signal observer to disconnect/reconnect)
   */
  async function processCollectionPageProducts(sessionId, optimizations) {
    if (!optimizations || optimizations.length === 0) return false;

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

      // Find active optimization for this product
      const productOptimization = findOptimizationForProduct(optimizations, productId);
      if (!productOptimization) {
        continue; // No optimization for this product, skip
      }

      // Assign variant (reuse existing logic with dynamic allocations)
      const variant = await assignUserToVariant(sessionId, productOptimization.id, productOptimization.controlAllocation, productOptimization.variantAllocation);
      
      // Apply variant to this card
      applyVariantToCard(card, productOptimization, variant);
      modifiedCount++;
      newCardsProcessed++;

      // Track collection page impression (once per card)
      const cardKey = `${productOptimization.id}-${productId}`;
      if (!processedProductCards.has(cardKey)) {
        trackImpression(sessionId, productOptimization.id, variant, 'collection');
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
  function watchForLazyLoadedProducts(sessionId, optimizations) {
    if (!optimizations || optimizations.length === 0) return null;

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
          const modified = await processCollectionPageProducts(sessionId, optimizations);
          
          if (modified) {
            console.log('[Shoptimizer] Applied variants to new product cards');
          }
          
          // If new mutations occurred while we were processing, do another sweep
          if (needsRecheck) {
            console.log('[Shoptimizer] New cards detected during processing, rechecking...');
            needsRecheck = false;
            await processCollectionPageProducts(sessionId, optimizations);
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
                  await processCollectionPageProducts(sessionId, optimizations);
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

  function trackImpression(sessionId, optimizationId, variant, context = 'product') {
    fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        optimizationId,
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
  // Preview Mode (Storefront Overlay)
  // ============================================

  // Global variable to store theme positioning rules for preview mode
  let themePositioningRules = null;

  function getPreviewToken() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('shoptimizer_preview');
  }

  async function initPreviewMode(token) {
    console.log('[Shoptimizer Preview] ========================================');
    console.log('[Shoptimizer Preview] Initializing preview mode');
    console.log('[Shoptimizer Preview] Token:', token.substring(0, 12) + '...');
    console.log('[Shoptimizer Preview] API URL:', SHOPTIMIZER_CONFIG.apiUrl);
    console.log('[Shoptimizer Preview] ========================================');

    // Fetch preview session data from backend
    try {
      const sessionUrl = `${SHOPTIMIZER_CONFIG.apiUrl}/api/preview/sessions/${token}`;
      console.log('[Shoptimizer Preview] Fetching session from:', sessionUrl);
      
      const response = await fetch(sessionUrl);
      console.log('[Shoptimizer Preview] Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        console.error('[Shoptimizer Preview] ❌ Failed to fetch session:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('[Shoptimizer Preview] Error response:', errorText);
        return;
      }

      const session = await response.json();
      console.log('[Shoptimizer Preview] ✅ Session loaded successfully');
      console.log('[Shoptimizer Preview] Session data:', session);

      // Fetch theme positioning rules from backend
      try {
        const rulesResponse = await fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/theme/rules?shop=${SHOPTIMIZER_CONFIG.shop}`);
        if (rulesResponse.ok) {
          const rulesData = await rulesResponse.json();
          themePositioningRules = rulesData.rules;
          console.log('[Shoptimizer Preview] Theme positioning rules loaded:', themePositioningRules);
        } else {
          console.log('[Shoptimizer Preview] No theme rules found, using fallback selectors');
        }
      } catch (rulesError) {
        console.error('[Shoptimizer Preview] Error fetching theme rules:', rulesError);
      }

      // Render preview overlay UI
      renderPreviewOverlay(session, token);
      
    } catch (error) {
      console.error('[Shoptimizer Preview] Error loading preview session:', error);
    }
  }

  function renderPreviewOverlay(session, token) {
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'shoptimizer-preview-overlay';
    overlay.innerHTML = `
      <style>
        #shoptimizer-preview-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #shoptimizer-preview-toolbar {
          background: linear-gradient(135deg, #5C6AC4 0%, #4959BD 100%);
          border-bottom: 3px solid #3B4A9F;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          padding: 12px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .shoptimizer-toolbar-left {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          flex: 1;
          min-width: 200px;
        }
        .shoptimizer-toolbar-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }
        .shoptimizer-preview-changes {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 13px;
          color: white;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .shoptimizer-preview-changes strong {
          font-weight: 600;
        }
        .shoptimizer-preview-changes span {
          opacity: 0.9;
        }
        .shoptimizer-toolbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .shoptimizer-preview-variant-toggle {
          display: flex;
          gap: 4px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 4px;
        }
        .shoptimizer-preview-variant-btn {
          padding: 8px 16px;
          border: none;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          color: white;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .shoptimizer-preview-variant-btn.active {
          background: white;
          color: #5C6AC4;
        }
        .shoptimizer-preview-variant-btn:hover:not(.active) {
          background: rgba(255, 255, 255, 0.1);
        }
        .shoptimizer-preview-actions {
          display: flex;
          gap: 8px;
        }
        .shoptimizer-preview-btn {
          padding: 8px 16px;
          border: 2px solid white;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .shoptimizer-preview-btn-primary {
          background: white;
          color: #5C6AC4;
          border-color: white;
        }
        .shoptimizer-preview-btn-primary:hover {
          background: #F1F2F4;
          transform: translateY(-1px);
        }
        .shoptimizer-preview-btn-secondary {
          background: transparent;
          color: white;
          border-color: rgba(255, 255, 255, 0.5);
        }
        .shoptimizer-preview-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: white;
        }
        
        @media (max-width: 768px) {
          #shoptimizer-preview-toolbar {
            padding: 10px 12px;
            gap: 12px;
          }
          .shoptimizer-toolbar-left {
            gap: 12px;
            min-width: auto;
            width: 100%;
          }
          .shoptimizer-toolbar-title {
            font-size: 14px;
          }
          .shoptimizer-preview-changes {
            font-size: 12px;
            padding: 5px 10px;
            width: 100%;
          }
          .shoptimizer-toolbar-right {
            width: 100%;
            justify-content: space-between;
          }
          .shoptimizer-preview-variant-toggle {
            flex: 1;
          }
          .shoptimizer-preview-variant-btn {
            padding: 6px 12px;
            font-size: 12px;
            flex: 1;
          }
          .shoptimizer-preview-btn {
            padding: 6px 12px;
            font-size: 12px;
          }
        }
      </style>
      <div id="shoptimizer-preview-toolbar">
        <div class="shoptimizer-toolbar-left">
          <div class="shoptimizer-toolbar-title">
            <span>PREVIEW MODE</span>
          </div>
          <div class="shoptimizer-preview-changes" id="shoptimizer-preview-changes">
            Loading changes...
          </div>
        </div>
        
        <div class="shoptimizer-toolbar-right">
          <div class="shoptimizer-preview-variant-toggle">
            <button class="shoptimizer-preview-variant-btn active" data-variant="control">
              Current
            </button>
            <button class="shoptimizer-preview-variant-btn" data-variant="variant">
              Optimized
            </button>
          </div>
          
          <div class="shoptimizer-preview-actions">
            <button class="shoptimizer-preview-btn shoptimizer-preview-btn-secondary" id="shoptimizer-preview-close">
              Close
            </button>
            <button class="shoptimizer-preview-btn shoptimizer-preview-btn-primary" id="shoptimizer-preview-approve">
              Accept & Launch
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Display what changed
    displayChanges(session.changes);

    // Set up variant toggle
    let currentVariant = 'control';
    const variantBtns = overlay.querySelectorAll('.shoptimizer-preview-variant-btn');
    
    variantBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const variant = btn.dataset.variant;
        if (variant === currentVariant) return;
        
        currentVariant = variant;
        
        // Update button states
        variantBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Apply variant to page
        const data = variant === 'control' ? session.controlData : session.variantData;
        applyPreviewVariant(data);
      });
    });

    // Set up action buttons
    overlay.querySelector('#shoptimizer-preview-close').addEventListener('click', async () => {
      await completePreview(token, 'no');
      notifyDashboard({ action: 'closed', approved: false });
      window.close(); // Close preview tab
    });

    overlay.querySelector('#shoptimizer-preview-approve').addEventListener('click', async () => {
      await completePreview(token, 'yes');
      notifyDashboard({ action: 'approved', approved: true });
      window.close(); // Close preview tab
    });

    // Apply initial variant (control)
    applyPreviewVariant(session.controlData);
  }

  function displayChanges(changes) {
    const changesDiv = document.getElementById('shoptimizer-preview-changes');
    const changeParts = [];

    if (changes.includes('title')) {
      changeParts.push('<strong>Title</strong>');
    }
    if (changes.includes('price')) {
      changeParts.push('<strong>Price</strong>');
    }
    if (changes.includes('description')) {
      changeParts.push('<strong>Description</strong>');
    }

    if (changeParts.length > 0) {
      changesDiv.innerHTML = '<span>Optimized:</span> ' + changeParts.join(' • ');
    } else {
      changesDiv.innerHTML = 'No changes detected';
    }
  }

  function applyPreviewVariant(data) {
    console.log('[Shoptimizer Preview] Applying variant:', data);

    // Use shared helpers for title and price
    updateTitle(data.title, { logPrefix: '[Shoptimizer Preview]' });
    updatePrice(data.price, { logPrefix: '[Shoptimizer Preview]' });

    // Apply description - handle both adding and removing
    // First, remove any previously injected description
    const injectedDesc = document.querySelector('.shoptimizer-injected');
    if (injectedDesc) {
      injectedDesc.remove();
      console.log('[Shoptimizer Preview] Removed injected description');
    }
    
    // Helper: Find the main product container (not recommendation widgets)
    function findMainProductContainer() {
      const mainProductSelectors = [
        'main[id*="product"]',
        'main[class*="product"]',
        '[id*="MainProduct"]',
        '.product-single',
        '.product-template',
        '#product',
        '.main-product'
      ];
      
      for (const selector of mainProductSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          console.log(`[Shoptimizer Preview] Found main product container: ${selector}`);
          return container;
        }
      }
      
      // Fallback to main or body
      return document.querySelector('main') || document.body;
    }
    
    // Helper: Check if element is inside unwanted sections
    function isInUnwantedSection(element) {
      let currentEl = element;
      while (currentEl && currentEl !== document.body) {
        const className = currentEl.className || '';
        const id = currentEl.id || '';
        
        // Check for recommendation widgets, related products, etc.
        if (
          className.includes('recommend') ||
          className.includes('related') ||
          className.includes('upsell') ||
          className.includes('product-card') ||
          className.includes('product-item') ||
          className.includes('collection') ||
          id.includes('recommend') ||
          id.includes('related') ||
          // Price containers
          currentEl.tagName?.toLowerCase() === 'product-price' ||
          className.includes('price') ||
          (currentEl.hasAttribute('itemprop') && 
           (currentEl.getAttribute('itemprop') === 'price' || 
            currentEl.getAttribute('itemprop') === 'offers'))
        ) {
          return true;
        }
        
        currentEl = currentEl.parentElement;
      }
      return false;
    }
    
    // If variant has a description, apply it
    if (data.description) {
      // First, find the main product container to scope our search
      const mainContainer = findMainProductContainer();
      
      const descSelectors = [
        '.product-single__description',
        '.product__description',
        '[data-product-description]',
        '.product-description:not(.shoptimizer-injected)',
        '[itemprop="description"]',
        '.rte'
      ];
      
      let descElement = null;
      
      // Search for description elements ONLY within main product container
      for (const selector of descSelectors) {
        const candidates = mainContainer.querySelectorAll(selector);
        
        // Find first candidate that's NOT in an unwanted section
        for (const candidate of candidates) {
          if (!isInUnwantedSection(candidate)) {
            descElement = candidate;
            console.log(`[Shoptimizer Preview] Found description element via ${selector} in main container`);
            break;
          } else {
            console.log(`[Shoptimizer Preview] Skipping ${selector} - in unwanted section`);
          }
        }
        
        if (descElement) {
          descElement.innerHTML = data.description;
          descElement.style.display = 'block';
          console.log('[Shoptimizer Preview] Updated existing description');
          break;
        }
      }
      
      // If no description element found, create one using theme positioning rules
      if (!descElement) {
        console.log('[Shoptimizer Preview] No existing description found, creating new one');
        
        // Create description element
        const newDesc = document.createElement('div');
        newDesc.className = 'product-description shoptimizer-injected';
        
        // Use theme rules if available for insertion
        if (themePositioningRules && themePositioningRules.descriptionInsertionPoint) {
          const insertionPoint = themePositioningRules.descriptionInsertionPoint;
          console.log('[Shoptimizer Preview] Using theme positioning rules for insertion:', insertionPoint);
          
          // Add class from theme rules if specified
          if (insertionPoint.className) {
            newDesc.className = `${insertionPoint.className} shoptimizer-injected`;
          }
          
          // Set description content
          newDesc.innerHTML = data.description;
          
          // Find target element for insertion
          const targetEl = document.querySelector(insertionPoint.targetSelector);
          if (targetEl) {
            // Insert using the method specified in rules
            if (insertionPoint.method === 'insertBefore') {
              targetEl.parentNode.insertBefore(newDesc, targetEl);
              console.log('[Shoptimizer Preview] Inserted description before target');
            } else if (insertionPoint.method === 'insertAfter') {
              targetEl.parentNode.insertBefore(newDesc, targetEl.nextSibling);
              console.log('[Shoptimizer Preview] Inserted description after target');
            } else if (insertionPoint.method === 'appendChild') {
              targetEl.appendChild(newDesc);
              console.log('[Shoptimizer Preview] Appended description to target');
            }
          } else {
            console.warn('[Shoptimizer Preview] Target element not found for theme rules, using fallback');
            // Fallback to default insertion
            insertDescriptionFallback(newDesc, mainContainer, data.description);
          }
        } else {
          // No theme rules available, use fallback
          insertDescriptionFallback(newDesc, mainContainer, data.description);
        }
      }
    } else {
      // If control has no description, hide any existing ones in main product area
      const mainContainer = findMainProductContainer();
      const descSelectors = [
        '.product-single__description',
        '.product__description',
        '[data-product-description]',
        '.product-description:not(.shoptimizer-injected)',
        '[itemprop="description"]',
        '.rte'
      ];
      
      for (const selector of descSelectors) {
        const candidates = mainContainer.querySelectorAll(selector);
        for (const candidate of candidates) {
          if (!isInUnwantedSection(candidate)) {
            candidate.style.display = 'none';
            console.log('[Shoptimizer Preview] Hid description (control has none)');
            return; // Only hide the first one we find
          }
        }
      }
    }
    
    // Helper function for fallback insertion
    function insertDescriptionFallback(newDesc, mainContainer, description) {
      console.log('[Shoptimizer Preview] Using fallback insertion logic');
      
      // Find product info area within main container
      const productInfoSelectors = [
        '.product__info',
        '.product-form',
        '.product-details',
        'form[action*="/cart/add"]',
        '.product-single',
        '[class*="product-info"]'
      ];
      
      let targetContainer = null;
      for (const selector of productInfoSelectors) {
        const containers = mainContainer.querySelectorAll(selector);
        for (const container of containers) {
          if (!isInUnwantedSection(container)) {
            targetContainer = container;
            console.log(`[Shoptimizer Preview] Found target container: ${selector}`);
            break;
          }
        }
        if (targetContainer) break;
      }
      
      // Fallback to main container itself
      if (!targetContainer) {
        targetContainer = mainContainer;
        console.log('[Shoptimizer Preview] Using main container as fallback');
      }
      
      // Set styled preview content
      newDesc.innerHTML = `<div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 3px solid #5C6AC4; border-radius: 4px;">
        <strong style="display: block; margin-bottom: 8px; color: #202223;">Product Description (Preview)</strong>
        <div style="color: #6D7175; line-height: 1.6;">${description}</div>
      </div>`;
      
      // Insert at the top of the container
      targetContainer.insertBefore(newDesc, targetContainer.firstChild);
      console.log('[Shoptimizer Preview] Created description element in main product area');
    }
  }
  
  function hideDescriptionForControl(isInUnwantedSection) {
    // If control has no description, hide any existing ones in main product area
    const mainContainer = findMainProductContainer();
    
    function findMainProductContainer() {
      const mainProductSelectors = [
        'main[id*="product"]',
        'main[class*="product"]',
        '[id*="MainProduct"]',
        '.product-single',
        '.product-template',
        '#product',
        '.main-product'
      ];
      
      for (const selector of mainProductSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          return container;
        }
      }
      
      // Fallback to main or body
      return document.querySelector('main') || document.body;
    }
    
    const descSelectors = [
      '.product-single__description',
      '.product__description',
      '[data-product-description]',
      '.product-description:not(.shoptimizer-injected)',
      '[itemprop="description"]',
      '.rte'
    ];
    
    for (const selector of descSelectors) {
      const candidates = mainContainer.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (!isInUnwantedSection(candidate)) {
          candidate.style.display = 'none';
          console.log('[Shoptimizer Preview] Hid description (control has none)');
          return; // Only hide the first one we find
        }
      }
    }
  }
  
  function removeHiddenDescriptions() {
    // Remove logic moved inside applyPreviewVariant
    const descSelectors = [
      '.product-single__description',
      '.product__description',
      '[data-product-description]',
      '.product-description:not(.shoptimizer-injected)',
      '[itemprop="description"]',
      '.rte'
    ];
    
    const mainContainer = findMainProductContainer();
    
    function findMainProductContainer() {
      const mainProductSelectors = [
        'main[id*="product"]',
        'main[class*="product"]',
        '[id*="MainProduct"]',
        '.product-single',
        '.product-template',
        '#product',
        '.main-product'
      ];
      
      for (const selector of mainProductSelectors) {
        const container = document.querySelector(selector);
        if (container) {
          return container;
        }
      }
      
      return document.querySelector('main') || document.body;
    }
    
    for (const selector of descSelectors) {
      const candidates = mainContainer.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (candidate.style.display === 'none') {
          candidate.style.display = '';
          console.log('[Shoptimizer Preview] Restored hidden description');
          return;
        }
      }
    }
  }
  
  function cleanupInjectedContent() {
    const injectedDesc = document.querySelector('.shoptimizer-injected');
    if (injectedDesc) {
      injectedDesc.remove();
      console.log('[Shoptimizer Preview] Removed injected description');
    }
  }
  
  // Cleanup function to restore original state  
  function restoreOriginalContent() {
    cleanupInjectedContent();
    removeHiddenDescriptions();
  }

  async function completePreview(token, approved) {
    try {
      await fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/preview/sessions/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      console.log('[Shoptimizer Preview] Completed:', approved);
    } catch (error) {
      console.error('[Shoptimizer Preview] Error completing preview:', error);
    }
  }

  function notifyDashboard(data) {
    // Send message to parent window (dashboard)
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: 'shoptimizer-preview-complete',
        ...data
      }, '*'); // In production, restrict to specific origin
      console.log('[Shoptimizer Preview] Notified dashboard:', data);
    }
  }

  // ============================================
  // Editor Mode (Storefront Navigation & Testing)
  // ============================================

  // Editor mode state
  let editorState = {
    token: null,
    session: null,
    currentProduct: null,
    recommendations: {},
    heartbeatInterval: null,
  };

  function getEditorToken() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('shoptimizer_editor');
  }

  async function initEditorMode(token) {
    console.log('[Shoptimizer Editor] ========================================');
    console.log('[Shoptimizer Editor] Initializing editor mode');
    console.log('[Shoptimizer Editor] Token:', token.substring(0, 12) + '...');
    console.log('[Shoptimizer Editor] API URL:', SHOPTIMIZER_CONFIG.apiUrl);
    console.log('[Shoptimizer Editor] ========================================');

    // Store token
    editorState.token = token;

    // Validate session
    try {
      const validateUrl = `${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/editor/validate/${token}`;
      console.log('[Shoptimizer Editor] Validating session:', validateUrl);
      
      const response = await fetch(validateUrl);
      
      if (!response.ok) {
        console.error('[Shoptimizer Editor] ❌ Session validation failed:', response.status);
        showEditorError('Session expired or invalid. Please restart from the dashboard.');
        return;
      }

      const session = await response.json();
      editorState.session = session;
      
      console.log('[Shoptimizer Editor] ✅ Session validated successfully');
      console.log('[Shoptimizer Editor] Shop:', session.shop);
      console.log('[Shoptimizer Editor] Expires:', new Date(session.expiresAt).toLocaleString());

      // Render editor toolbar
      renderEditorToolbar();

      // Start heartbeat system
      startHeartbeat();

      // Detect current product and load recommendations
      await detectAndLoadProduct();

      // Set up navigation handling
      setupNavigationHandling();

    } catch (error) {
      console.error('[Shoptimizer Editor] Error initializing editor mode:', error);
      showEditorError('Failed to initialize editor mode. Please try again.');
    }
  }

  function showEditorError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; background: #D72C0D; color: white; padding: 16px; text-align: center; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <strong>Editor Mode Error:</strong> ${message}
      </div>
    `;
    document.body.appendChild(errorDiv);
  }

  function startHeartbeat() {
    // Send heartbeat every 5 minutes (300000ms)
    editorState.heartbeatInterval = setInterval(async () => {
      try {
        console.log('[Shoptimizer Editor] Sending heartbeat...');
        
        const response = await fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/editor/heartbeat/${editorState.token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          console.error('[Shoptimizer Editor] Heartbeat failed:', response.status);
          exitEditorMode('Session expired');
          return;
        }

        const data = await response.json();
        editorState.session.expiresAt = data.expiresAt;
        console.log('[Shoptimizer Editor] Heartbeat successful, new expiry:', new Date(data.expiresAt).toLocaleString());

      } catch (error) {
        console.error('[Shoptimizer Editor] Heartbeat error:', error);
        exitEditorMode('Connection lost');
      }
    }, 300000); // 5 minutes

    console.log('[Shoptimizer Editor] Heartbeat system started (5 min intervals)');
  }

  async function detectAndLoadProduct() {
    const product = detectCurrentProduct();
    
    if (!product) {
      console.log('[Shoptimizer Editor] No product detected on current page');
      updateEditorToolbar({ productName: 'Navigate to a product page' });
      return;
    }

    editorState.currentProduct = product;
    console.log('[Shoptimizer Editor] Product detected:', product);

    // Update toolbar with product name
    updateEditorToolbar({ productName: product.title || product.handle });

    // Fetch recommendations for this product
    await fetchRecommendations(product);
  }

  function detectCurrentProduct() {
    // Method 1: Extract handle from URL
    const urlMatch = window.location.pathname.match(/\/products\/([^?/#]+)/);
    if (!urlMatch) {
      return null;
    }

    const handle = urlMatch[1];
    
    // Method 2: Try to get Shopify product ID
    let productId = null;
    
    if (window.ShopifyAnalytics?.meta?.product?.gid) {
      productId = window.ShopifyAnalytics.meta.product.gid;
    } else if (window.meta?.product?.id) {
      productId = `gid://shopify/Product/${window.meta.product.id}`;
    } else {
      // Try to extract from product JSON
      const productJsonScript = document.querySelector('script[data-product-json]');
      if (productJsonScript) {
        try {
          const productData = JSON.parse(productJsonScript.textContent);
          if (productData.id) {
            productId = `gid://shopify/Product/${productData.id}`;
          }
        } catch (e) {
          console.warn('[Shoptimizer Editor] Failed to parse product JSON:', e);
        }
      }
    }

    // Method 3: Try to get product title from page
    let title = null;
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
      if (titleElement && titleElement.offsetParent !== null) {
        title = titleElement.textContent.trim();
        break;
      }
    }

    return {
      handle,
      productId,
      title,
    };
  }

  async function fetchRecommendations(product) {
    // Check cache first
    const cacheKey = product.productId || product.handle;
    if (editorState.recommendations[cacheKey]) {
      console.log('[Shoptimizer Editor] Using cached recommendations for:', cacheKey);
      return editorState.recommendations[cacheKey];
    }

    try {
      const params = new URLSearchParams({
        shop: editorState.session.shop,
      });

      if (product.productId) {
        params.set('productId', product.productId);
      } else if (product.handle) {
        params.set('handle', product.handle);
      }

      const url = `${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/editor/recommendations?${params}`;
      console.log('[Shoptimizer Editor] Fetching recommendations:', url);

      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn('[Shoptimizer Editor] Failed to fetch recommendations:', response.status);
        return null;
      }

      const recommendations = await response.json();
      
      // Cache the recommendations
      editorState.recommendations[cacheKey] = recommendations;
      
      console.log('[Shoptimizer Editor] Recommendations loaded:', recommendations);
      return recommendations;

    } catch (error) {
      console.error('[Shoptimizer Editor] Error fetching recommendations:', error);
      return null;
    }
  }

  function renderEditorToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'shoptimizer-editor-toolbar';
    toolbar.innerHTML = `
      <style>
        #shoptimizer-editor-toolbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #shoptimizer-editor-bar {
          background: linear-gradient(135deg, #5C6AC4 0%, #4959BD 100%);
          border-bottom: 3px solid #3B4A9F;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          padding: 12px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .shoptimizer-editor-left {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          flex: 1;
          min-width: 200px;
        }
        .shoptimizer-editor-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }
        .shoptimizer-editor-product {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 13px;
          color: white;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .shoptimizer-editor-product strong {
          font-weight: 600;
        }
        .shoptimizer-editor-product span {
          opacity: 0.9;
        }
        .shoptimizer-editor-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .shoptimizer-editor-btn {
          padding: 8px 16px;
          border: 2px solid white;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          background: transparent;
          color: white;
        }
        .shoptimizer-editor-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: white;
        }
        
        @media (max-width: 768px) {
          #shoptimizer-editor-bar {
            padding: 10px 12px;
            gap: 12px;
          }
          .shoptimizer-editor-left {
            gap: 12px;
            min-width: auto;
            width: 100%;
          }
          .shoptimizer-editor-title {
            font-size: 14px;
          }
          .shoptimizer-editor-product {
            font-size: 12px;
            padding: 5px 10px;
            width: 100%;
          }
          .shoptimizer-editor-right {
            width: 100%;
            justify-content: flex-end;
          }
          .shoptimizer-editor-btn {
            padding: 6px 12px;
            font-size: 12px;
          }
        }
      </style>
      <div id="shoptimizer-editor-bar">
        <div class="shoptimizer-editor-left">
          <div class="shoptimizer-editor-title">
            <span>EDITOR MODE</span>
          </div>
          <div class="shoptimizer-editor-product" id="shoptimizer-editor-product">
            <span id="shoptimizer-product-name">Loading...</span>
          </div>
        </div>
        
        <div class="shoptimizer-editor-right">
          <button class="shoptimizer-editor-btn" id="shoptimizer-editor-exit">
            Exit
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(toolbar);

    // Set up exit button
    document.getElementById('shoptimizer-editor-exit').addEventListener('click', async () => {
      await exitEditorMode('User clicked exit');
    });

    console.log('[Shoptimizer Editor] Toolbar rendered');
  }

  function updateEditorToolbar(updates) {
    if (updates.productName !== undefined) {
      const productNameEl = document.getElementById('shoptimizer-product-name');
      if (productNameEl) {
        productNameEl.textContent = updates.productName;
      }
    }
  }

  function setupNavigationHandling() {
    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', async () => {
      console.log('[Shoptimizer Editor] Navigation detected (popstate)');
      await detectAndLoadProduct();
    });

    // Listen for clicks on internal links
    const handleLinkClick = async (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const url = link.href;
      
      // Check if it's an internal link to a product page
      if (url && url.includes(window.location.origin) && url.includes('/products/')) {
        // Let the navigation happen naturally, then detect the new product
        setTimeout(async () => {
          console.log('[Shoptimizer Editor] Navigation detected (link click)');
          await detectAndLoadProduct();
        }, 100);
      }
    };

    document.addEventListener('click', handleLinkClick);

    console.log('[Shoptimizer Editor] Navigation handling set up');
  }

  async function exitEditorMode(reason) {
    console.log('[Shoptimizer Editor] Exiting editor mode:', reason);

    // Stop heartbeat
    if (editorState.heartbeatInterval) {
      clearInterval(editorState.heartbeatInterval);
      editorState.heartbeatInterval = null;
    }

    // Delete session
    try {
      await fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/editor/${editorState.token}`, {
        method: 'DELETE',
      });
      console.log('[Shoptimizer Editor] Session deleted');
    } catch (error) {
      console.error('[Shoptimizer Editor] Error deleting session:', error);
    }

    // Redirect to dashboard
    const dashboardUrl = SHOPTIMIZER_CONFIG.dashboardUrl || 
                        SHOPTIMIZER_CONFIG.apiUrl.replace(/\/api$/, '') || 
                        SHOPTIMIZER_CONFIG.apiUrl;
    
    console.log('[Shoptimizer Editor] Redirecting to dashboard:', dashboardUrl);
    window.location.href = dashboardUrl;
  }

  // ============================================
  // Main Initialization
  // ============================================

  async function initShoptimizer() {
    console.log('[Shoptimizer SDK] Starting initialization...');
    console.log('[Shoptimizer SDK] API URL:', SHOPTIMIZER_CONFIG.apiUrl);
    console.log('[Shoptimizer SDK] Shop:', SHOPTIMIZER_CONFIG.shop);
    console.log('[Shoptimizer SDK] Page URL:', window.location.href);
    
    // Check if editor mode
    const editorToken = getEditorToken();
    if (editorToken) {
      console.log('[Shoptimizer SDK] ✅ Editor mode detected - token:', editorToken.substring(0, 8) + '...');
      await initEditorMode(editorToken);
      return; // Don't run normal A/B testing in editor mode
    }
    
    // Check if preview mode
    const previewToken = getPreviewToken();
    if (previewToken) {
      console.log('[Shoptimizer SDK] ✅ Preview mode detected - token:', previewToken.substring(0, 8) + '...');
      await initPreviewMode(previewToken);
      return; // Don't run normal A/B testing in preview mode
    }
    
    console.log('[Shoptimizer SDK] No editor or preview token found, running normal A/B optimization mode');
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

      // Fetch all active optimizations from backend (once for all page types)
      const optimizationUrl = `${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/optimizations?shop=${SHOPTIMIZER_CONFIG.shop}`;
      console.log('[Shoptimizer] Fetching active optimizations from:', optimizationUrl);
      
      const response = await fetch(optimizationUrl);
      
      if (!response.ok) {
        console.error('[Shoptimizer] Failed to fetch optimizations:', response.status, response.statusText);
        return;
      }
      
      const data = await response.json();
      
      if (!data.optimizations || data.optimizations.length === 0) {
        console.log('[Shoptimizer] No active optimizations found');
        console.log('[Shoptimizer] Initialized successfully (session tracking only)');
        return;
      }
      
      console.log(`[Shoptimizer] Found ${data.optimizations.length} active optimization(s)`);
      
      // Check if this is a product detail page
      const shopifyProductId = getShopifyProductId();
      
      if (shopifyProductId) {
        // PRODUCT DETAIL PAGE LOGIC
        console.log('[Shoptimizer] Product page detected:', shopifyProductId);
        
        const productOptimization = data.optimizations.find(o => o.shopifyProductId === shopifyProductId);
        
        if (!productOptimization) {
          console.log('[Shoptimizer] No optimization for this specific product on PDP');
          // Still check for collection cards below
        } else {
          console.log('[Shoptimizer] Active optimization found for this product:', productOptimization.id);
          
          // Assign user to variant (or retrieve existing assignment with dynamic allocations)
          const variant = await assignUserToVariant(sessionId, productOptimization.id, productOptimization.controlAllocation, productOptimization.variantAllocation);
          console.log('[Shoptimizer] User assigned to:', variant);
          
          // Apply variant changes to product page
          applyVariant(productOptimization, variant);
          
          // Track impression
          trackImpression(sessionId, productOptimization.id, variant, 'product');
          
          // Store for potential JS access
          window.shoptimizerSession = sessionId;
          window.shoptimizerVariant = variant;
          window.shoptimizerOptimizationId = productOptimization.id;
          
          console.log('[Shoptimizer] Initialized successfully (PDP A/B optimization active)');
        }
      }
      
      // COLLECTION/LISTING PAGE LOGIC (runs on all pages including PDP)
      // Process product cards on collection/listing/homepage/search results
      await processCollectionPageProducts(sessionId, data.optimizations);
      
      // Watch for lazy-loaded products (infinite scroll, AJAX pagination)
      watchForLazyLoadedProducts(sessionId, data.optimizations);
      
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

  // ============================================
  // Preview Mode Support (for window.open overlay)
  // ============================================
  
  // Preview mode now handled via window.open() in the app
  // The SDK applies variants directly when preview token is detected

  // Expose API
  window.Shoptimizer = {
    init: initShoptimizer,
    config: SHOPTIMIZER_CONFIG,
    getSessionId: getSessionId,
  };
})();
