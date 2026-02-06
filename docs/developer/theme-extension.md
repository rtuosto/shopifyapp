# Theme App Extension

## Extension Structure

```
extensions/cro-theme-extension/
├── shopify.extension.toml    # Extension configuration
├── assets/
│   └── runtime.js            # Minified storefront runtime (~5KB)
├── blocks/
│   ├── cro-embed.liquid       # App Embed block (loads runtime.js)
│   └── experiment-slot.liquid # App Block (experiment container)
└── locales/
    └── en.default.json        # Localization strings
```

### shopify.extension.toml

```toml
api_version = "2024-10"

[[extensions]]
type = "theme_app_extension"
name = "CRO Optimizer"
handle = "cro-optimizer"

[extensions.capabilities]
assets = true
blocks = true
snippets = false
```

## App Embed: cro-embed.liquid

The App Embed block loads `runtime.js` site-wide. It targets the `<body>` and is enabled via the Shopify theme editor.

```liquid
<script src="{{ 'runtime.js' | asset_url }}" defer></script>

{% schema %}
{
  "name": "CRO Runtime",
  "target": "body",
  "settings": [
    {
      "type": "paragraph",
      "content": "This embed loads the CRO optimization runtime across your entire store."
    }
  ]
}
{% endschema %}
```

Merchants enable this once in Theme Editor → App Embeds. It loads on every page.

## App Block: experiment-slot.liquid

The App Block creates a container `<div>` where experiments render their content. Merchants place this block in theme sections via the theme editor.

```liquid
<div
  id="cro-slot-{{ block.id }}"
  class="cro-experiment-slot"
  data-cro-slot="{{ block.settings.slot_id }}"
  data-cro-block-id="{{ block.id }}"
  data-shop="{{ shop.permanent_domain }}"
>
  <noscript>
    {{ block.settings.fallback_content }}
  </noscript>
</div>
```

**Settings:**

| Setting | Type | Options | Description |
|---------|------|---------|-------------|
| `slot_id` | select | `pdp`, `home`, `collection` | Which experiment type this slot displays |
| `fallback_content` | textarea | Free text | Content shown when JavaScript is disabled |

**Target:** `"section"` — can be placed inside any theme section.

## runtime.js

Minified JavaScript runtime (~5KB) that runs on every storefront page. Handles experiment rendering and event tracking.

### Key Functions

| Function | Description |
|----------|-------------|
| `init()` | Entry point. Detects preview mode, identifies shop, generates/loads visitor ID, fetches config |
| `getShop()` | Identifies the shop domain from meta tags, `window.Shopify.shop`, `data-shop` attributes, or hostname |
| `genVid()` | Generates a UUID v4 visitor ID using `crypto.randomUUID()` with fallback |
| `getVid()` | Loads or creates a persistent visitor ID from localStorage (falls back to cookies) |
| `ldAsgn()` / `svAsgn()` | Loads/saves variant assignments from/to localStorage |
| `hash(string)` | Simple hash function for deterministic bucketing |
| `asgnVar(experimentId, allocation, forcedVariant)` | Assigns a visitor to variant A or B based on `hash(vid + experimentId)` |
| `fetchCfg()` | Fetches experiment config from App Proxy (`/apps/cro-proxy/config`) |
| `renderExps(experiments, isPreview)` | Iterates experiments, finds matching slots, assigns variants, renders content |
| `renderSlot(slot, content, experiment, variant)` | Injects HTML/text content into a slot container |
| `track(experimentId, variant, eventType, metadata)` | Sends event to App Proxy (`/apps/cro-proxy/event`) |

### Visitor ID Storage

Visitor IDs persist across sessions using this priority:

1. **localStorage** (`cro_vid` key) — preferred
2. **Cookie** (`cro_vid`) — fallback if localStorage is unavailable

Assignments are stored in localStorage under the `cro_assignments` key as a JSON object mapping experiment IDs to variants.

### Deterministic Bucketing

Visitor assignment uses a deterministic hash of the visitor ID and experiment ID:

```javascript
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h &= h;
  }
  return Math.abs(h);
}

function asgnVar(experimentId, allocation, forcedVariant) {
  // In preview mode with forced variant, return it directly
  if (isPM && forcedVariant) return forcedVariant;

  // Check cached assignment
  if (assignments[experimentId]) return assignments[experimentId];

  // Deterministic bucketing
  const bucket = hash(visitorId + ':' + experimentId) % 100 / 100;
  const variant = bucket < allocation ? 'B' : 'A';

  // Cache assignment
  assignments[experimentId] = variant;
  saveAssignments();
  return variant;
}
```

### Global API

`runtime.js` exposes a global `window.CRORuntime` object:

```javascript
window.CRORuntime = {
  version: '2.0.0',
  trackEvent: (eventType, metadata) => { /* tracks event for all assigned experiments */ },
  getVisitorId: () => visitorId,
  getAssignments: () => ({ ...assignments }),
};
```

## App Proxy Endpoints

The runtime communicates with the backend through Shopify's App Proxy, which routes requests through `https://{shop}/apps/cro-proxy/...`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/apps/cro-proxy/config` | GET | Returns all LIVE experiments for the shop |
| `/apps/cro-proxy/preview/:token` | GET | Returns forced experiment config for preview mode |
| `/apps/cro-proxy/event` | POST | Receives tracking events (slot_view, add_to_cart, purchase) |

All App Proxy requests include Shopify's HMAC signature in query parameters, validated server-side. In dev mode, HMAC validation is bypassed if the `shop` parameter is present.

### Config Response Format

```json
{
  "experiments": [
    {
      "id": "uuid-here",
      "name": "Homepage Banner Test",
      "slot_id": "home",
      "status": "LIVE",
      "allocation": 0.50,
      "variants": {
        "A": { "html": "<div>Control content</div>" },
        "B": { "html": "<div>Variant content</div>", "styles": ".cro-experiment-content { color: blue; }" }
      }
    }
  ],
  "timestamp": 1706000000000
}
```

### Event Payload Format

```json
{
  "experiment_id": "uuid-here",
  "variant": "A",
  "event_type": "slot_view",
  "cro_vid": "visitor-uuid",
  "path": "/products/blue-snowboard",
  "timestamp": 1706000000000,
  "revenue": 49.99
}
```

**Allowed event types:** `slot_view`, `add_to_cart`, `purchase`

**Validation:** Events are rejected if the experiment doesn't exist for the authenticated shop, the variant is invalid, or the timestamp is older than 5 minutes.

## Data Flow

```
1. Page Load
   └→ runtime.js loads via App Embed (deferred)

2. Initialization
   ├→ Check for preview mode (?shoptimizer_preview=TOKEN)
   ├→ Detect shop domain
   ├→ Generate or load visitor ID (localStorage/cookie)
   └→ Load cached assignments from localStorage

3. Fetch Config
   ├→ Normal mode: GET /apps/cro-proxy/config?shop=...
   └→ Preview mode: GET /apps/cro-proxy/preview/TOKEN

4. Render Experiments
   ├→ For each LIVE experiment:
   │   ├→ Find <div data-cro-slot="..."> containers in DOM
   │   ├→ Assign visitor to variant via deterministic hash
   │   ├→ Render variant content (HTML/text) into slot
   │   └→ Track slot_view event (skipped in preview mode)

5. Conversion Tracking
   └→ Merchants or custom code calls CRORuntime.trackEvent('purchase', { revenue: 49.99 })
```

## Preview Mode

When the URL contains `?shoptimizer_preview=TOKEN`:

1. `chkPM()` detects the parameter and sets preview mode
2. Visitor ID is set to `preview-{token}` (not persisted)
3. Config is fetched from `/apps/cro-proxy/preview/{token}` instead of `/config`
4. The preview endpoint returns forced variant configuration
5. Event tracking is skipped in preview mode

## App Store Compliance

The Theme App Extension follows Shopify's requirements for App Store approval:

- **No DOM manipulation**: Content is ONLY rendered inside owned `<div data-cro-slot="...">` containers created by the App Block
- **No theme file modifications**: All functionality is delivered through App Embed and App Block primitives
- **Deferred loading**: `runtime.js` uses the `defer` attribute to avoid blocking page render
- **Graceful degradation**: `<noscript>` fallback content is available when JavaScript is disabled
- **Minimal footprint**: ~5KB minified runtime
