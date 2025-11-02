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
    
    // Guard against 0/0 edge case (if both allocations are zero, default to 50/50)
    const normalizedControlPct = total > 0 ? (controlPct / total) * 100 : 50;
    
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

  function applyVariant(test, variant) {
    const data = variant === 'control' ? test.controlData : test.variantData;
    console.log(`[Shoptimizer] Applying ${variant} for test ${test.id}`, data);

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
  function applyVariantToCard(cardElement, test, variant) {
    // Double-check: skip if already processed with the same variant
    if (cardElement.dataset.shoptimizerProcessed === 'true' && 
        cardElement.dataset.shoptimizerVariant === variant) {
      return;
    }

    const data = variant === 'control' ? test.controlData : test.variantData;
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
  // Preview Mode (Storefront Overlay)
  // ============================================

  // Global variable to store theme positioning rules for preview mode
  let themePositioningRules = null;

  function getPreviewToken() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('shoptimizer_preview');
  }

  async function initPreviewMode(token) {
    console.log('[Shoptimizer Preview] Initializing preview mode with token:', token);

    // Fetch preview session data from backend
    try {
      const response = await fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/preview/sessions/${token}`);
      
      if (!response.ok) {
        console.error('[Shoptimizer Preview] Failed to fetch session:', response.status);
        return;
      }

      const session = await response.json();
      console.log('[Shoptimizer Preview] Session loaded:', session);

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
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #shoptimizer-preview-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          padding: 20px;
          max-width: 400px;
          border: 2px solid #5C6AC4;
        }
        #shoptimizer-preview-card h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
          color: #202223;
        }
        #shoptimizer-preview-card p {
          margin: 0 0 16px 0;
          font-size: 14px;
          color: #6D7175;
          line-height: 1.4;
        }
        .shoptimizer-preview-variant-toggle {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        .shoptimizer-preview-variant-btn {
          flex: 1;
          padding: 10px;
          border: 2px solid #E1E3E5;
          background: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .shoptimizer-preview-variant-btn.active {
          background: #5C6AC4;
          border-color: #5C6AC4;
          color: white;
        }
        .shoptimizer-preview-variant-btn:hover:not(.active) {
          border-color: #5C6AC4;
        }
        .shoptimizer-preview-actions {
          display: flex;
          gap: 8px;
        }
        .shoptimizer-preview-btn {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .shoptimizer-preview-btn-primary {
          background: #5C6AC4;
          color: white;
        }
        .shoptimizer-preview-btn-primary:hover {
          background: #4959BD;
        }
        .shoptimizer-preview-btn-secondary {
          background: #F1F2F4;
          color: #202223;
        }
        .shoptimizer-preview-btn-secondary:hover {
          background: #E1E3E5;
        }
        .shoptimizer-preview-changes {
          background: #F6F6F7;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
          font-size: 13px;
        }
        .shoptimizer-preview-changes strong {
          color: #202223;
          display: block;
          margin-bottom: 4px;
        }
        .shoptimizer-preview-changes span {
          color: #6D7175;
        }
      </style>
      <div id="shoptimizer-preview-card">
        <h3>🔬 Preview Mode</h3>
        <p>See how this optimization looks on your live store</p>
        
        <div class="shoptimizer-preview-variant-toggle">
          <button class="shoptimizer-preview-variant-btn active" data-variant="control">
            Current
          </button>
          <button class="shoptimizer-preview-variant-btn" data-variant="variant">
            Optimized
          </button>
        </div>
        
        <div class="shoptimizer-preview-changes" id="shoptimizer-preview-changes">
          Loading changes...
        </div>
        
        <div class="shoptimizer-preview-actions">
          <button class="shoptimizer-preview-btn shoptimizer-preview-btn-secondary" id="shoptimizer-preview-close">
            Close
          </button>
          <button class="shoptimizer-preview-btn shoptimizer-preview-btn-primary" id="shoptimizer-preview-approve">
            Accept & Test
          </button>
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
      changeParts.push('<strong>Title:</strong> <span>Updated</span>');
    }
    if (changes.includes('price')) {
      changeParts.push('<strong>Price:</strong> <span>Updated</span>');
    }
    if (changes.includes('description')) {
      changeParts.push('<strong>Description:</strong> <span>Enhanced</span>');
    }

    changesDiv.innerHTML = changeParts.join('<br>') || 'No changes detected';
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
  // Main Initialization
  // ============================================

  async function initShoptimizer() {
    // Check if preview mode
    const previewToken = getPreviewToken();
    if (previewToken) {
      console.log('[Shoptimizer] Preview mode detected');
      await initPreviewMode(previewToken);
      return; // Don't run normal A/B testing in preview mode
    }
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
