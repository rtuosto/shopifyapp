# Shoptimizer Deployment Guide

**✨ NEW: Automatic Configuration**
The SDK now automatically detects your Replit URL and Shopify store domain. Just add one line to your theme - no manual configuration needed!

---

## Overview
This guide explains how to deploy the Shoptimizer A/B testing SDK to a Shopify store for accurate conversion tracking and persistent variant assignments.

## Architecture Overview

The Shoptimizer system consists of three components:

1. **Shopify Admin App** - Embedded app in Shopify Admin for creating tests
2. **Storefront JavaScript SDK** - Client-side script that runs on product pages (auto-configured)
3. **Webhook Handler** - Backend endpoint that receives order events for conversion attribution

## Prerequisites

- Shopify store with API access
- Shoptimizer app installed via OAuth
- Access to Shopify theme code (Admin → Online Store → Themes → Actions → Edit code)
- Your Replit app URL (e.g., `https://your-app-name.replit.dev`)

---

## Step 1: Inject Shoptimizer SDK into Shopify Theme (One Line!)

### Quick Installation (Recommended)

Add **one line** to your theme's `theme.liquid` file before the closing `</head>` tag:

```liquid
{% if template == 'product' %}
  <script src="https://YOUR-REPLIT-APP-URL/shoptimizer.js" defer></script>
{% endif %}
```

**Replace `YOUR-REPLIT-APP-URL`** with your actual Replit app URL:
- Published apps: `https://your-app-name.replit.app`
- Dev mode: Check your Replit environment variable `REPLIT_DOMAINS` for the exact URL

**That's it!** The SDK automatically:
- ✅ Detects your Replit backend URL from environment
- ✅ Detects your Shopify store domain from Shopify context
- ✅ Generates persistent UUID session IDs (90-day expiry)
- ✅ Fetches active tests and modifies product pages
- ✅ Tracks impressions and injects session IDs into cart

### (Optional) Manual Configuration Override

If you need custom configuration (rare), add this **before** the SDK script:

```liquid
<script>
  window.ShoptimizerConfig = {
    apiUrl: 'https://custom-backend.com',  // Override backend URL
    shop: 'custom-shop.myshopify.com'      // Override shop domain
  };
</script>
```

### Alternative: Script Tag API

Auto-inject without manual theme edits:

```bash
POST https://{shop}.myshopify.com/admin/api/2024-01/script_tags.json

Headers:
  X-Shopify-Access-Token: {access_token}
  Content-Type: application/json

Body:
{
  "script_tag": {
    "event": "onload",
    "src": "https://YOUR-REPLIT-APP-URL/shoptimizer.js",
    "display_scope": "online_store"
  }
}
```

Replace `YOUR-REPLIT-APP-URL` with your actual Replit app URL.

### Verification

Visit any product page and check browser console (F12). You should see:

```
[SDK] Serving auto-configured SDK with API URL: https://your-app.replit.app
[Shoptimizer] Session ID: abc-123-def-456
[Shoptimizer] Checking for active tests on product: gid://shopify/Product/123456
```

The `[SDK]` log confirms the backend auto-configured the SDK with the correct URL.

---

## Step 2: Register Order Webhook

Shoptimizer needs to receive order events to attribute conversions correctly.

### Automatic Registration (Preferred)

The webhook is automatically registered when you install the app via OAuth. No manual setup needed!

**Verification:**
1. Go to Shopify Admin → Settings → Notifications
2. Scroll to "Webhooks"
3. Look for webhook with URL: `https://your-replit-app.replit.app/api/webhooks/orders/create`
4. Event should be: "Order creation"

### Manual Registration (If Needed)

If the webhook wasn't auto-registered, create it manually:

**Via Shopify Admin:**
1. Settings → Notifications → Webhooks → Create webhook
2. Event: "Order creation"
3. Format: JSON
4. URL: `https://your-replit-app.replit.app/api/webhooks/orders/create`
5. API version: 2024-01 (or latest)

**Via API:**

```bash
POST https://{shop}.myshopify.com/admin/api/2024-01/webhooks.json

Headers:
  X-Shopify-Access-Token: {access_token}
  Content-Type: application/json

Body:
{
  "webhook": {
    "topic": "orders/create",
    "address": "https://your-replit-app.replit.app/api/webhooks/orders/create",
    "format": "json"
  }
}
```

---

## Step 4: Push Database Schema

The new session-based attribution requires updating your database schema:

```bash
npm run db:push
```

If you see a data-loss warning, use:
```bash
npm run db:push --force
```

This adds the `session_assignments` table required for persistent variant tracking.

---

## Step 5: Test the Integration

### Test 1: Verify SDK Loading

1. Visit any product page on your store
2. Open browser DevTools (F12) → Console
3. Look for Shoptimizer logs:
   ```
   [Shoptimizer] Session ID: {uuid}
   [Shoptimizer] Checking for active tests on product: gid://shopify/Product/{id}
   ```

**If you see errors:**
- `CORS error`: Your API URL might be wrong or backend isn't running
- `No product ID found`: SDK couldn't detect product ID (check theme compatibility)

### Test 2: Verify Variant Assignment

1. Create a test in Shoptimizer Admin
2. Activate the test
3. Visit the product page
4. Console should show:
   ```
   [Shoptimizer] Active test found for this product: {testId}
   [Shoptimizer] User assigned to: control (or variant)
   [Shoptimizer] Applying control for test {testId}
   ```
5. Reload page → Should see SAME variant (persistent assignment)

### Test 3: Verify Content Modification

If test modifies title from "Blue Snowboard" to "Premium Blue Snowboard":

1. Visit product page
2. Check if title changed
3. Inspect element → Should show modified title
4. Check localStorage: `shoptimizer_assignments` should contain assignment

### Test 4: Verify Session Injection into Cart

1. Add product to cart (from tested product page)
2. Go to cart or checkout
3. Check browser Network tab → Look for `/cart/add` request
4. Request body should include:
   ```json
   {
     "attributes": {
       "_shoptimizer_session": "abc-123-def-456"
     }
   }
   ```

**Alternative Check:**
- Complete a test order
- In Shopify Admin → Orders → View order
- Check "Additional details" section
- Should see custom attribute: `_shoptimizer_session: {uuid}`

### Test 5: Verify Conversion Attribution

1. Complete a test purchase
2. Check Shoptimizer backend logs (or database)
3. You should see:
   ```
   [Webhook] Found session ID: abc-123-def-456
   [Webhook] Session saw "variant" variant for test {testId}
   [Webhook] Attributing conversion to variant...
   ```
4. In Shoptimizer Admin → Active Tests
5. Metrics should update for the correct variant (control or variant)

---

## Troubleshooting

### SDK Not Loading

**Symptom:** No console logs, tests don't work

**Solutions:**
1. Check API URL is correct in `ShoptimizerConfig`
2. Ensure backend is running and accessible
3. Check browser console for CORS errors
4. Verify script tag is properly closed: `</script>`

### Variant Assignment Not Persisting

**Symptom:** User sees different variants on each page reload

**Solutions:**
1. Check localStorage is enabled in browser
2. Look for `shoptimizer_session_id` and `shoptimizer_assignments` in localStorage
3. Ensure SDK is running on product pages (check console logs)

### Product Content Not Changing

**Symptom:** SDK loads, assignment works, but title/price doesn't change

**Solutions:**
1. Check theme's CSS selectors match SDK's defaults
2. Inspect element to find correct selector
3. Update `applyVariant()` function in `shoptimizer.js` if needed
4. Common selectors:
   - Title: `.product__title`, `.product-single__title`, `h1`
   - Price: `.product__price`, `.price`, `[itemprop="price"]`

### Session ID Not in Orders

**Symptom:** Orders don't have `_shoptimizer_session` attribute

**Solutions:**
1. Verify session injection code is running (check console)
2. Test with different add-to-cart methods (button vs AJAX)
3. Some themes override cart behavior - may need custom integration
4. Check cart/checkout data in Network tab before completing order

### Webhook Not Receiving Orders

**Symptom:** Orders complete but conversions don't track

**Solutions:**
1. Verify webhook is registered (Settings → Notifications → Webhooks)
2. Check webhook URL is correct and backend is accessible
3. Look for webhook delivery attempts in Shopify Admin
4. Check Shoptimizer backend logs for webhook errors
5. Ensure HMAC verification is passing (check `[Webhook] Webhook verified successfully`)

---

## Production Checklist

Before going live with real customers:

- [ ] Backend is deployed and accessible via HTTPS
- [ ] API URL is configured correctly in `ShoptimizerConfig`
- [ ] SDK loads on all product pages (check console logs)
- [ ] Variant assignments persist across page reloads
- [ ] Product content modifications work correctly
- [ ] Session ID appears in cart/order attributes
- [ ] Webhook is registered and verified in Shopify Admin
- [ ] Test order successfully attributed to correct variant
- [ ] Active Tests page shows correct metrics after test order
- [ ] SSL/TLS certificate is valid (avoid mixed content warnings)

---

## Advanced: Custom Theme Integration

If your theme uses non-standard selectors or you need custom behavior:

### Custom Selectors

Edit `applyVariant()` in `public/shoptimizer.js`:

```javascript
function applyVariant(test, variant) {
  const data = variant === 'control' ? test.controlData : test.variantData;
  
  // Custom title selector for your theme
  if (data.title) {
    const titleElement = document.querySelector('.your-custom-title-class');
    if (titleElement) {
      titleElement.textContent = data.title;
    }
  }
  
  // Add custom logic here...
}
```

### Custom Cart Integration

If your theme uses a custom cart system, modify `injectSessionIntoCart()`:

```javascript
// Example: Custom theme with special cart API
function injectSessionIntoCart(sessionId) {
  // Hook into your theme's cart system
  if (window.YourTheme && window.YourTheme.Cart) {
    window.YourTheme.Cart.on('add', function(item) {
      item.attributes = item.attributes || {};
      item.attributes['_shoptimizer_session'] = sessionId;
    });
  }
}
```

---

## Support

**Issues with deployment?**
1. Check browser console for errors
2. Review backend logs for webhook issues
3. Verify all configuration steps were completed
4. Test with a simple product first before complex cases

**Need help?**
Contact the Shoptimizer team with:
- Store URL
- Browser console logs
- Backend webhook logs
- Steps to reproduce the issue
