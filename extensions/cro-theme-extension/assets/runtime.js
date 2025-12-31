(function() {
  'use strict';

  // CRO Runtime - Lightweight experiment renderer
  // This script is loaded via Theme App Extension App Embed
  // It does NOT manipulate any theme DOM - only renders inside owned slots

  const CRO_VERSION = '2.0.0';
  const CRO_STORAGE_KEY = 'cro_vid';
  const CRO_ASSIGNMENTS_KEY = 'cro_assignments';
  
  // Configuration - will be set via App Proxy
  let config = {
    apiUrl: '', // Set by detecting current script src or app proxy
    shop: '',
  };

  // State
  let visitorId = null;
  let assignments = {};
  let isPreviewMode = false;
  let previewToken = null;

  // Check for preview mode query parameter
  function checkPreviewMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('shoptimizer_preview');
    if (token) {
      console.log(`[CRO] Preview mode detected with token: ${token}`);
      isPreviewMode = true;
      previewToken = token;
      return true;
    }
    return false;
  }

  // Initialize
  function init() {
    console.log(`[CRO] Runtime v${CRO_VERSION} initializing...`);
    
    // Check for preview mode first
    checkPreviewMode();
    
    // Get shop domain from page
    config.shop = getShopDomain();
    if (!config.shop) {
      console.warn('[CRO] Could not detect shop domain');
      return;
    }

    // Generate or retrieve visitor ID (skip persistence in preview mode)
    if (isPreviewMode) {
      visitorId = 'preview-' + previewToken;
      console.log(`[CRO] Preview mode - using temporary visitor ID: ${visitorId}`);
    } else {
      visitorId = getOrCreateVisitorId();
      console.log(`[CRO] Visitor ID: ${visitorId}`);
    }

    // Load persisted assignments (skip in preview mode)
    if (!isPreviewMode) {
      assignments = loadAssignments();
    }

    // Fetch experiment config and render
    fetchConfigAndRender();
  }

  // Get shop domain from various sources
  function getShopDomain() {
    // Try meta tag first
    const metaShop = document.querySelector('meta[name="shopify-shop-domain"]');
    if (metaShop) return metaShop.content;

    // Try Shopify global
    if (window.Shopify?.shop) return window.Shopify.shop;

    // Try from slot element
    const slot = document.querySelector('[data-cro-slot]');
    if (slot?.dataset.shop) return slot.dataset.shop;

    // Try hostname as fallback
    const hostname = window.location.hostname;
    if (hostname.includes('.myshopify.com')) return hostname;

    return null;
  }

  // Generate stable visitor ID using crypto
  function generateVisitorId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Get or create visitor ID (persisted in localStorage with cookie fallback)
  function getOrCreateVisitorId() {
    // Try localStorage first
    try {
      let vid = localStorage.getItem(CRO_STORAGE_KEY);
      if (vid) return vid;
      
      vid = generateVisitorId();
      localStorage.setItem(CRO_STORAGE_KEY, vid);
      return vid;
    } catch (e) {
      // localStorage blocked, try cookies
      const cookieMatch = document.cookie.match(new RegExp(`${CRO_STORAGE_KEY}=([^;]+)`));
      if (cookieMatch) return cookieMatch[1];
      
      const vid = generateVisitorId();
      document.cookie = `${CRO_STORAGE_KEY}=${vid}; path=/; max-age=31536000; SameSite=Lax`;
      return vid;
    }
  }

  // Load persisted variant assignments
  function loadAssignments() {
    try {
      const stored = localStorage.getItem(CRO_ASSIGNMENTS_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  }

  // Save variant assignments
  function saveAssignments() {
    try {
      localStorage.setItem(CRO_ASSIGNMENTS_KEY, JSON.stringify(assignments));
    } catch (e) {
      console.warn('[CRO] Could not persist assignments');
    }
  }

  // Deterministic hash for variant bucketing
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // Assign variant deterministically based on visitor ID
  function assignVariant(experimentId, allocation, forcedVariant) {
    // In preview mode with forced variant, use that directly
    if (isPreviewMode && forcedVariant) {
      console.log(`[CRO] Preview mode - forced variant: ${forcedVariant}`);
      return forcedVariant;
    }
    
    // Check if already assigned
    if (assignments[experimentId]) {
      return assignments[experimentId];
    }

    // Deterministic bucketing using hash of visitorId + experimentId
    const bucketKey = `${visitorId}:${experimentId}`;
    const hash = hashString(bucketKey);
    const bucket = (hash % 100) / 100; // 0.00 to 0.99

    // Assign variant based on allocation
    const variant = bucket < allocation ? 'B' : 'A';
    
    // Persist assignment (skip in preview mode)
    if (!isPreviewMode) {
      assignments[experimentId] = variant;
      saveAssignments();
    }

    console.log(`[CRO] Assigned ${experimentId} -> ${variant} (bucket: ${bucket.toFixed(2)}, allocation: ${allocation})`);
    return variant;
  }

  // Fetch experiment config from App Proxy
  async function fetchConfigAndRender() {
    try {
      // In preview mode, fetch from preview endpoint
      let proxyUrl;
      if (isPreviewMode && previewToken) {
        proxyUrl = `/apps/cro-proxy/preview/${previewToken}`;
        console.log(`[CRO] Preview mode - fetching config from: ${proxyUrl}`);
      } else {
        proxyUrl = `/apps/cro-proxy/config?shop=${encodeURIComponent(config.shop)}`;
        console.log(`[CRO] Fetching config from: ${proxyUrl}`);
      }
      
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[CRO] Config fetch failed: ${response.status}`);
        return;
      }

      const data = await response.json();
      
      // Log preview mode indicator
      if (data.preview) {
        console.log('[CRO] Running in PREVIEW MODE - no tracking, forced variants');
      }
      
      console.log(`[CRO] Received ${data.experiments?.length || 0} experiments`);

      // Process and render experiments
      if (data.experiments && data.experiments.length > 0) {
        renderExperiments(data.experiments, data.preview);
      }
    } catch (error) {
      console.error('[CRO] Error fetching config:', error);
    }
  }

  // Render experiments into slots
  function renderExperiments(experiments, isPreview) {
    experiments.forEach(experiment => {
      if (experiment.status !== 'LIVE') return;

      // Find ALL matching slots (support multiple blocks with same slot_id)
      const slots = document.querySelectorAll(`[data-cro-slot="${experiment.slot_id}"]`);
      if (!slots || slots.length === 0) {
        console.log(`[CRO] No slots found for ${experiment.slot_id}`);
        return;
      }

      // Assign variant (same for all slots of this experiment)
      // In preview mode, use forced_variant if provided
      const variant = assignVariant(experiment.id, experiment.allocation || 0.5, experiment.forced_variant);

      // Get variant content
      const variantContent = experiment.variants?.[variant];
      if (!variantContent) {
        console.warn(`[CRO] No content for variant ${variant} in experiment ${experiment.id}`);
        return;
      }

      // Render content into ALL matching slots
      slots.forEach((slot, index) => {
        console.log(`[CRO] Rendering experiment ${experiment.id} into slot ${index + 1}/${slots.length}`);
        renderSlotContent(slot, variantContent, experiment, variant);
      });

      // Track slot view once per experiment (not per slot)
      // Skip tracking in preview mode to avoid polluting data
      if (!isPreview && !isPreviewMode) {
        trackEvent(experiment.id, variant, 'slot_view');
      } else {
        console.log(`[CRO] Preview mode - skipping slot_view tracking for ${experiment.id}`);
      }
    });
  }

  // Render content into a slot
  function renderSlotContent(slot, content, experiment, variant) {
    console.log(`[CRO] Rendering experiment ${experiment.id} variant ${variant} into slot`);

    // Create experiment container
    const container = document.createElement('div');
    container.className = 'cro-experiment-content';
    container.dataset.experimentId = experiment.id;
    container.dataset.variant = variant;

    // Handle different content types
    if (typeof content === 'string') {
      // HTML string content
      container.innerHTML = content;
    } else if (content.html) {
      // Object with html property
      container.innerHTML = content.html;
    } else if (content.text) {
      // Plain text
      container.textContent = content.text;
    } else {
      // JSON payload - let the slot decide how to render
      container.dataset.payload = JSON.stringify(content);
      container.textContent = content.display || '';
    }

    // Clear slot and insert content
    slot.innerHTML = '';
    slot.appendChild(container);

    // Add any inline styles from variant
    if (content.styles) {
      const styleEl = document.createElement('style');
      styleEl.textContent = content.styles;
      slot.appendChild(styleEl);
    }
  }

  // Track experiment event via App Proxy
  async function trackEvent(experimentId, variant, eventType, metadata = {}) {
    try {
      const proxyUrl = '/apps/cro-proxy/event';
      
      await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          experiment_id: experimentId,
          variant: variant,
          event_type: eventType,
          cro_vid: visitorId,
          path: window.location.pathname,
          timestamp: Date.now(),
          ...metadata,
        }),
      });

      console.log(`[CRO] Tracked ${eventType} for ${experimentId}:${variant}`);
    } catch (error) {
      console.warn('[CRO] Event tracking failed:', error);
    }
  }

  // Expose tracking function for external use (e.g., add-to-cart buttons)
  window.CRORuntime = {
    version: CRO_VERSION,
    trackEvent: function(eventType, metadata) {
      // Track for all active experiments on the page
      Object.keys(assignments).forEach(experimentId => {
        trackEvent(experimentId, assignments[experimentId], eventType, metadata);
      });
    },
    getVisitorId: function() {
      return visitorId;
    },
    getAssignments: function() {
      return { ...assignments };
    },
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
