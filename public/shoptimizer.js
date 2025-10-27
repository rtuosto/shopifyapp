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
  // Preview Mode (Storefront Overlay)
  // ============================================

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

    // Apply title
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
          console.log('[Shoptimizer Preview] Updated title');
          break;
        }
      }
    }

    // Apply price
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
      });
      console.log('[Shoptimizer Preview] Updated price');
    }

    // Apply description - handle both adding and removing
    // First, remove any previously injected description
    const injectedDesc = document.querySelector('.shoptimizer-injected');
    if (injectedDesc) {
      injectedDesc.remove();
      console.log('[Shoptimizer Preview] Removed injected description');
    }
    
    // If variant has a description, apply it
    if (data.description) {
      const descSelectors = [
        '.product-single__description',
        '.product__description',
        '[data-product-description]',
        '.product-description:not(.shoptimizer-injected)',
        '[itemprop="description"]',
        '.rte' // Common Shopify theme class for rich text
      ];
      
      let descElement = null;
      for (const selector of descSelectors) {
        descElement = document.querySelector(selector);
        if (descElement) {
          descElement.innerHTML = data.description;
          descElement.style.display = 'block'; // Make sure it's visible
          console.log('[Shoptimizer Preview] Updated description');
          break;
        }
      }
      
      // If no description element found, create one
      if (!descElement) {
        // Find product info area to inject description
        const productInfoSelectors = [
          '.product-single',
          '.product__info',
          '.product-form',
          '.product-details',
          'form[action*="/cart/add"]'
        ];
        
        for (const selector of productInfoSelectors) {
          const container = document.querySelector(selector);
          if (container) {
            // Create description container
            const newDesc = document.createElement('div');
            newDesc.className = 'product-description shoptimizer-injected';
            newDesc.innerHTML = `<div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 3px solid #5C6AC4; border-radius: 4px;">
              <strong style="display: block; margin-bottom: 8px; color: #202223;">Product Description (Preview)</strong>
              <div style="color: #6D7175; line-height: 1.6;">${data.description}</div>
            </div>`;
            
            // Insert at the top of the container
            container.insertBefore(newDesc, container.firstChild);
            console.log('[Shoptimizer Preview] Created description element');
            break;
          }
        }
      }
    } else {
      // If control has no description, make sure any existing description is hidden
      const descSelectors = [
        '.product-single__description',
        '.product__description',
        '[data-product-description]',
        '.product-description:not(.shoptimizer-injected)',
        '[itemprop="description"]',
        '.rte'
      ];
      
      for (const selector of descSelectors) {
        const descElement = document.querySelector(selector);
        if (descElement) {
          descElement.style.display = 'none';
          console.log('[Shoptimizer Preview] Hid description (control has none)');
          break;
        }
      }
    }
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
  // Preview Mode Support (for iframe testing)
  // ============================================

  let previewMode = null;
  let previewData = {};
  let previewHighlights = [];
  let previewEditable = false;

  function enterPreviewMode(mode, data, highlights, editable) {
    previewMode = mode;
    previewData = data || {};
    previewHighlights = highlights || [];
    previewEditable = editable || false;

    console.log('[Shoptimizer Preview] Entering preview mode:', { mode, data, highlights, editable });

    if (mode === 'variant') {
      applyIframePreviewVariant(data, highlights, editable);
    } else {
      // Control mode - restore originals or do nothing
      removePreviewHighlights();
    }
  }

  function applyIframePreviewVariant(data, highlights, editable) {
    // Apply changes similar to applyVariant but with preview highlighting
    console.log('[Shoptimizer Preview] Applying variant:', data);

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
          // Store original if not already stored
          if (!titleElement.dataset.originalText) {
            titleElement.dataset.originalText = titleElement.textContent;
          }
          titleElement.textContent = data.title;
          
          if (highlights.includes('title') && editable) {
            addPreviewHighlight(titleElement, 'title', data.title);
          }
          console.log(`[Shoptimizer Preview] Updated title via ${selector}`);
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
          if (!descElement.dataset.originalHtml) {
            descElement.dataset.originalHtml = descElement.innerHTML;
          }
          descElement.innerHTML = data.description;
          
          if (highlights.includes('description') && editable) {
            addPreviewHighlight(descElement, 'description', data.description);
          }
          console.log(`[Shoptimizer Preview] Updated description via ${selector}`);
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
      
      const priceElements = document.querySelectorAll(priceSelectors.join(', '));
      const formattedPrice = formatPrice(data.price);
      
      priceElements.forEach(el => {
        if (!el.dataset.originalPrice) {
          el.dataset.originalPrice = el.textContent;
        }
        el.textContent = formattedPrice;
        
        if (highlights.includes('price') && editable) {
          addPreviewHighlight(el, 'price', data.price);
        }
        console.log(`[Shoptimizer Preview] Updated price to ${formattedPrice}`);
      });
    }
  }

  function addPreviewHighlight(element, field, value) {
    // Add visual highlight for editable fields
    element.style.position = 'relative';
    element.style.cursor = 'pointer';
    element.style.outline = '2px dashed #3b82f6';
    element.style.outlineOffset = '4px';
    element.dataset.shoptimizerField = field;
    element.dataset.shoptimizerValue = value;

    // Add click handler for editing
    if (!element.dataset.shoptimizerClickAdded) {
      element.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        handleFieldEdit(field, value);
      });
      element.dataset.shoptimizerClickAdded = 'true';
    }

    // Add tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'shoptimizer-preview-tooltip';
    tooltip.textContent = `Click to edit ${field}`;
    tooltip.style.cssText = `
      position: absolute;
      top: -30px;
      left: 0;
      background: #3b82f6;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 10000;
      pointer-events: none;
    `;
    element.style.position = 'relative';
    element.appendChild(tooltip);
  }

  function removePreviewHighlights() {
    // Remove all preview highlights and restore originals
    document.querySelectorAll('[data-shoptimizer-field]').forEach(el => {
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.cursor = '';
      
      // Restore originals
      if (el.dataset.originalText) {
        el.textContent = el.dataset.originalText;
        delete el.dataset.originalText;
      }
      if (el.dataset.originalHtml) {
        el.innerHTML = el.dataset.originalHtml;
        delete el.dataset.originalHtml;
      }
      if (el.dataset.originalPrice) {
        el.textContent = el.dataset.originalPrice;
        delete el.dataset.originalPrice;
      }
      
      // Remove tooltip
      const tooltip = el.querySelector('.shoptimizer-preview-tooltip');
      if (tooltip) {
        tooltip.remove();
      }
      
      delete el.dataset.shoptimizerField;
      delete el.dataset.shoptimizerValue;
      delete el.dataset.shoptimizerClickAdded;
    });
  }

  function handleFieldEdit(field, currentValue) {
    // Notify parent window that user wants to edit this field
    sendToParent({
      type: 'preview:edit',
      payload: {
        field: field,
        value: prompt(`Edit ${field}:`, currentValue) || currentValue
      }
    });
  }

  function sendToParent(message) {
    if (window.parent === window) return;
    window.parent.postMessage(message, '*');
  }

  // Listen for preview commands from parent window (iframe mode - legacy)
  function initIframePreviewMode() {
    // Check if we're in an iframe
    if (window.self !== window.parent) {
      console.log('[Shoptimizer Preview] Running in iframe, listening for preview commands');
      
      window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;
        
        if (event.data.type === 'preview:apply') {
          const { mode, variantData, highlights, editable } = event.data.payload;
          enterPreviewMode(mode, variantData, highlights, editable);
        }
      });

      // Notify parent that we're ready
      sendToParent({
        type: 'preview:ready',
        payload: {}
      });

      // Send height updates
      const sendHeight = () => {
        const height = Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.clientHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        );
        sendToParent({
          type: 'preview:height',
          payload: { height }
        });
      };

      // Send initial height
      setTimeout(sendHeight, 1000);
      
      // Watch for height changes
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(sendHeight);
        resizeObserver.observe(document.body);
      }
    }
  }

  // Initialize iframe preview mode if in iframe
  initIframePreviewMode();

  // Expose API
  window.Shoptimizer = {
    init: initShoptimizer,
    config: SHOPTIMIZER_CONFIG,
    getSessionId: getSessionId,
    enterPreviewMode: enterPreviewMode, // For manual preview mode activation
  };
})();
