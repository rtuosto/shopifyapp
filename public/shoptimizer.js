/**
 * Shoptimizer A/B Testing SDK
 * 
 * Handles client-side A/B testing for Shopify product pages.
 * - Assigns users to control or variant (50/50 split)
 * - Stores assignment in cookie for consistency
 * - Dynamically swaps product content based on assignment
 * - Tracks impressions back to Shoptimizer backend
 */

(function() {
  'use strict';

  const SHOPTIMIZER_CONFIG = {
    apiUrl: window.ShoptimizerConfig?.apiUrl || 'https://your-app.replit.app',
    shop: window.Shopify?.shop || '',
    cookieName: 'shoptimizer_tests',
    cookieExpireDays: 30,
  };

  // ============================================
  // Cookie Utilities
  // ============================================

  function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
  }

  function getCookie(name) {
    const nameEQ = name + '=';
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      let cookie = cookies[i].trim();
      if (cookie.indexOf(nameEQ) === 0) {
        return cookie.substring(nameEQ.length);
      }
    }
    return null;
  }

  function getTestAssignments() {
    const cookie = getCookie(SHOPTIMIZER_CONFIG.cookieName);
    return cookie ? JSON.parse(decodeURIComponent(cookie)) : {};
  }

  function saveTestAssignment(testId, variant) {
    const assignments = getTestAssignments();
    assignments[testId] = variant;
    setCookie(
      SHOPTIMIZER_CONFIG.cookieName,
      encodeURIComponent(JSON.stringify(assignments)),
      SHOPTIMIZER_CONFIG.cookieExpireDays
    );
  }

  function getTestAssignment(testId) {
    const assignments = getTestAssignments();
    return assignments[testId];
  }

  // ============================================
  // User Assignment (50/50 Split)
  // ============================================

  function assignUserToVariant(testId) {
    // Check if user already has an assignment
    const existing = getTestAssignment(testId);
    if (existing) {
      return existing;
    }

    // Randomly assign (50/50 split)
    const variant = Math.random() < 0.5 ? 'control' : 'variant';
    saveTestAssignment(testId, variant);
    return variant;
  }

  // ============================================
  // Content Swapping
  // ============================================

  function applyVariant(testData, variant) {
    const data = variant === 'control' ? testData.controlData : testData.variantData;

    console.log(`[Shoptimizer] Applying ${variant} for test ${testData.id}`, data);

    // Swap title
    if (data.title) {
      const titleElement = document.querySelector('.product-single__title, .product__title, [data-product-title], h1');
      if (titleElement) {
        titleElement.textContent = data.title;
      }
    }

    // Swap description
    if (data.description) {
      const descElement = document.querySelector('.product-single__description, .product__description, [data-product-description]');
      if (descElement) {
        descElement.innerHTML = data.description;
      }
    }

    // Swap price
    if (data.price) {
      const priceElements = document.querySelectorAll('.product__price, .product-single__price, [data-product-price]');
      priceElements.forEach(el => {
        // Format price based on Shopify's currency format
        const formattedPrice = formatPrice(data.price);
        el.textContent = formattedPrice;
      });
    }
  }

  function formatPrice(price) {
    // Use Shopify's currency formatting if available
    if (window.Shopify && window.Shopify.formatMoney) {
      return window.Shopify.formatMoney(price * 100, window.theme?.moneyFormat || '${{amount}}');
    }
    // Fallback to simple formatting
    return `$${parseFloat(price).toFixed(2)}`;
  }

  // ============================================
  // Impression Tracking
  // ============================================

  function trackImpression(testId, variant) {
    fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/impression`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        testId,
        variant,
        shop: SHOPTIMIZER_CONFIG.shop,
      }),
    }).catch(err => {
      console.error('[Shoptimizer] Failed to track impression:', err);
    });
  }

  // ============================================
  // Cart Persistence (for conversion attribution)
  // ============================================

  function persistVariantToCart(testId, variant) {
    // Store variant assignment for this specific test
    // This will be attached to line items when product is added to cart
    const variantData = {
      testId: testId,
      variant: variant,
      timestamp: Date.now(),
    };
    
    // Store in sessionStorage for attachment during add-to-cart
    const key = `shoptimizer_variant_${testId}`;
    try {
      sessionStorage.setItem(key, JSON.stringify(variantData));
      console.log(`[Shoptimizer] Variant ${variant} stored for test ${testId}`);
    } catch (e) {
      console.error('[Shoptimizer] Failed to store variant in sessionStorage:', e);
    }
    
    // Also intercept add-to-cart to attach line item properties
    interceptAddToCart(testId, variant);
  }
  
  function interceptAddToCart(testId, variant) {
    // Listen for add-to-cart form submissions
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.matches('[action*="/cart/add"]') || form.querySelector('[name="add"]')) {
        // This is an add-to-cart form
        console.log('[Shoptimizer] Intercepting add-to-cart for variant tracking');
        
        // Add hidden input with variant info as line item property
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = `properties[_shoptimizer_${testId}]`;
        input.value = variant;
        form.appendChild(input);
      }
    });
    
    // Also intercept AJAX add-to-cart calls (common in modern themes)
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const [url, options] = args;
      if (typeof url === 'string' && url.includes('/cart/add')) {
        try {
          if (options && options.body) {
            const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
            if (body.items) {
              // Multiple items being added
              body.items = body.items.map((item) => ({
                ...item,
                properties: {
                  ...item.properties,
                  [`_shoptimizer_${testId}`]: variant,
                },
              }));
            } else {
              // Single item being added
              body.properties = {
                ...body.properties,
                [`_shoptimizer_${testId}`]: variant,
              };
            }
            options.body = JSON.stringify(body);
          }
        } catch (e) {
          console.error('[Shoptimizer] Failed to attach variant to AJAX cart add:', e);
        }
      }
      return originalFetch.apply(this, args);
    };
  }

  // ============================================
  // Main Initialization
  // ============================================

  function initShoptimizer() {
    // Get Shopify product ID from the page
    const productId = getShopifyProductId();
    if (!productId) {
      console.log('[Shoptimizer] No product ID found, skipping A/B test check');
      return;
    }

    console.log('[Shoptimizer] Checking for active test on product:', productId);

    // Fetch active test data
    fetch(`${SHOPTIMIZER_CONFIG.apiUrl}/api/storefront/test/${productId}?shop=${SHOPTIMIZER_CONFIG.shop}`)
      .then(res => res.json())
      .then(data => {
        if (!data.activeTest) {
          console.log('[Shoptimizer] No active test for this product');
          return;
        }

        const testData = data.activeTest;
        console.log('[Shoptimizer] Active test found:', testData.id);

        // Assign user to control or variant
        const variant = assignUserToVariant(testData.id);
        console.log('[Shoptimizer] User assigned to:', variant);

        // Apply the appropriate version
        applyVariant(testData, variant);

        // Track impression
        trackImpression(testData.id, variant);

        // Persist variant assignment to Shopify cart for conversion attribution
        persistVariantToCart(testData.id, variant);

        // Store variant on checkout for conversion attribution (backup)
        window.shoptimizerVariant = variant;
        window.shoptimizerTestId = testData.id;
      })
      .catch(err => {
        console.error('[Shoptimizer] Failed to fetch test data:', err);
      });
  }

  function getShopifyProductId() {
    // Try multiple methods to get product ID
    
    // Method 1: From meta tag (most reliable)
    const metaProduct = document.querySelector('meta[property="og:url"]');
    if (metaProduct) {
      const match = metaProduct.content.match(/\/products\/([^?]+)/);
      if (match) {
        return `gid://shopify/Product/${match[1]}`;
      }
    }

    // Method 2: From Shopify theme data
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
      return window.ShopifyAnalytics.meta.product.gid;
    }

    // Method 3: From product JSON (common in themes)
    const productJsonScript = document.querySelector('script[type="application/ld+json"]');
    if (productJsonScript) {
      try {
        const productData = JSON.parse(productJsonScript.textContent);
        if (productData['@type'] === 'Product' && productData.productID) {
          return `gid://shopify/Product/${productData.productID}`;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    return null;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShoptimizer);
  } else {
    initShoptimizer();
  }

  // Expose API for manual initialization if needed
  window.Shoptimizer = {
    init: initShoptimizer,
    config: SHOPTIMIZER_CONFIG,
  };
})();
