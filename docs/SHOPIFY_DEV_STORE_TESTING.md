# Shopify Dev Store Testing Guide

This guide provides step-by-step instructions to test the complete Shoptimizer attribution pipeline on a Shopify dev store, from SDK installation to conversion tracking.

---

## Prerequisites

- ✅ Shopify development store with admin access
- ✅ Shoptimizer backend running and accessible via HTTPS (e.g., `https://your-replit-app.replit.app`)
- ✅ Shoptimizer app installed on your dev store via OAuth
- ✅ At least one product in your Shopify store

---

## Phase 1: Install Storefront SDK

### ✨ One-Line Installation (Automatic Configuration)

Add this single line to your theme's `theme.liquid` file **before the closing `</head>` tag**:

```liquid
{% if template == 'product' %}
  <script src="https://YOUR-REPLIT-APP-URL/shoptimizer.js" defer></script>
{% endif %}
```

**Replace `YOUR-REPLIT-APP-URL`** with your actual Replit app URL:
- **Published apps**: `https://your-app-name.replit.app`
- **Dev mode**: Find your URL in Replit's address bar or check the `REPLIT_DOMAINS` environment variable

**Example:**
```liquid
{% if template == 'product' %}
  <script src="https://shoptimizer.replit.app/shoptimizer.js" defer></script>
{% endif %}
```

**That's it!** The SDK automatically:
- ✅ Detects your Replit backend URL (no manual config needed)
- ✅ Detects your Shopify store domain (from Shopify's context)
- ✅ Generates and persists session IDs
- ✅ Fetches active tests and modifies product pages

### (Optional) Manual Configuration Override

If you need to override the automatic detection (rare), you can add this **before** the SDK script:

```liquid
<script>
  window.ShoptimizerConfig = {
    apiUrl: 'https://custom-backend-url.com',  // Optional: Override backend URL
    shop: '{{ shop.domain }}'                   // Optional: Override shop domain
  };
</script>
```

### Step 1.3: Verify SDK Loading

1. Visit any product page on your dev store
2. Open browser DevTools (F12) → Console
3. Look for logs like:
   ```
   [Shoptimizer] Session ID: abc-123-def-456
   [Shoptimizer] Checking for active tests on product: gid://shopify/Product/123
   [Shoptimizer] No active tests for this product
   ```

**✅ Success criteria:** You see Shoptimizer logs with a UUID session ID

**❌ Troubleshooting:**
- No logs at all? Check API URL is correct and backend is running
- CORS error? Backend needs to allow your Shopify domain
- `Cannot read property` errors? Check `ShoptimizerConfig` is defined before SDK loads

---

## Phase 2: Create and Activate A/B Test

### Step 2.1: Create Test in Shoptimizer Admin

1. Log into Shoptimizer admin (embedded in Shopify Admin)
2. Navigate to Dashboard
3. Click "Accept & Launch Test" on any AI recommendation
   - This creates and immediately activates the test
   - Test will appear in "Active Tests" page

**Alternative:** Manually create a test:
1. Go to a product
2. Generate recommendations
3. Accept a recommendation to create the test

### Step 2.2: Note Test Details

Record the following for verification:
- **Product ID**: `gid://shopify/Product/123...`
- **Test ID**: Copy from Active Tests page
- **Control value**: Original title/price/description
- **Variant value**: The optimized version

Example:
```
Product: Blue Snowboard (gid://shopify/Product/7891011121314)
Test: Title optimization
Control: "Blue Snowboard"
Variant: "Premium Blue Snowboard - Professional Grade"
```

---

## Phase 3: Test Variant Assignment & Persistence

### Step 3.1: Visit Product Page

1. Open the product page for your test product in an **incognito/private window**
2. Open DevTools → Console
3. Look for logs:
   ```
   [Shoptimizer] Active test found for this product: test-abc-123
   [Shoptimizer] User assigned to: variant (or control)
   [Shoptimizer] Applying variant for test test-abc-123
   ```

**✅ Success:** You see an assignment (either "control" or "variant")

### Step 3.2: Verify Content Modification

Check if the page content changed based on your assignment:

**If assigned to VARIANT:**
- Title should match variant value ("Premium Blue Snowboard")
- Price should match variant price (if testing price)
- Description should match variant description (if testing description)

**If assigned to CONTROL:**
- Everything stays original (no visible changes)

**🔍 How to check:** Right-click the title → Inspect Element → See if it matches expected value

### Step 3.3: Test Assignment Persistence

1. **Reload the page** (F5) multiple times
2. Check console logs - you should see **the SAME variant assignment** every time:
   ```
   [Shoptimizer] User assigned to: variant
   [Shoptimizer] User assigned to: variant
   [Shoptimizer] User assigned to: variant
   ```

3. Check localStorage:
   - DevTools → Application tab → Local Storage → Your domain
   - Look for keys:
     - `shoptimizer_session_id`: Your UUID (should persist)
     - `shoptimizer_assignments`: JSON object with your test assignments

**✅ Success:** Same variant every reload, localStorage persists UUID and assignments

**❌ Troubleshooting:**
- Different variants on reload? localStorage might be disabled
- No content change? Check theme selectors in `shoptimizer.js` `applyVariant()`
- Test not detected? Verify test is active in Shoptimizer admin

---

## Phase 4: Test Impression Tracking

### Step 4.1: Verify Impression Sent

1. Visit product page (already tested above)
2. Check Network tab → Filter by XHR/Fetch
3. Look for POST request to `/api/storefront/impression`
4. Inspect request payload:
   ```json
   {
     "testId": "test-abc-123",
     "variant": "control",
     "sessionId": "your-uuid-here"
   }
   ```

**✅ Success:** Impression request sent with correct test ID, variant, and session ID

### Step 4.2: Verify Metrics Update

1. Go to Shoptimizer Admin → Active Tests
2. Find your test
3. Check impressions counter incremented

**Expected behavior:**
- First visit: Impressions = 1
- Reload page: Impressions stays 1 (same session, doesn't double-count)
- New incognito window: Impressions = 2 (new session)

---

## Phase 5: Test Cart Session Injection

### Step 5.1: Add Product to Cart

1. On the tested product page, click "Add to Cart"
2. Open DevTools → Network tab
3. Find the `/cart/add` or `/cart/add.js` request
4. Check the request payload includes:
   ```json
   {
     "items": [{
       "id": "variant-id",
       "quantity": 1
     }],
     "attributes": {
       "_shoptimizer_session": "your-uuid-here"
     }
   }
   ```

**✅ Success:** Cart add request includes `attributes._shoptimizer_session`

**❌ Troubleshooting:**
- No `attributes` in request? Theme might use custom cart system
- Check `shoptimizer.js` `injectSessionIntoCart()` function
- May need custom integration for your theme

### Step 5.2: Verify Session in Cart

1. Go to cart page: `/cart`
2. Open DevTools → Console
3. Type: `fetch('/cart.js').then(r => r.json()).then(console.log)`
4. Check response for:
   ```json
   {
     "attributes": {
       "_shoptimizer_session": "your-uuid-here"
     }
   }
   ```

**✅ Success:** Session ID appears in cart attributes

---

## Phase 6: Test Webhook Attribution (Complete Order)

### Step 6.1: Complete Test Order

1. **Important:** Stay in the same browser session (don't switch browsers)
2. Go to cart → Proceed to checkout
3. Use Shopify test payment gateway:
   - Card: `1` (Bogus Gateway)
   - Or use any test card if configured
4. Complete the order

### Step 6.2: Check Backend Webhook Logs

Immediately after completing the order, check your backend logs:

```bash
# In your Replit console or logs viewer
grep "Webhook" /path/to/logs
```

Look for output like:
```
[Webhook] Received orders/create webhook from your-store.myshopify.com
[Webhook] Processing order 123456 with 1 items
[Webhook] Found 1 matching products in database
[Webhook] Found session ID: your-uuid-here
[Webhook] Found 1 variant assignment(s) for session
[Webhook] Session saw "variant" variant for test test-abc-123
[Webhook] Attributing conversion to variant for test test-abc-123: 1x Blue Snowboard = $149.99
[Webhook] Control metrics - Conversions: 0, Revenue: $0.00
[Webhook] Variant metrics - Conversions: 1, Revenue: $149.99
[Webhook] Overall metrics - Conversions: 1, Revenue: $149.99, ARPU: $149.99
[Webhook] Successfully attributed conversion for test test-abc-123
```

**✅ Success indicators:**
- ✓ Webhook received order
- ✓ Session ID extracted from `note_attributes`
- ✓ Variant assignment found for session
- ✓ Conversion attributed to correct variant (control OR variant)
- ✓ Metrics updated

**❌ Troubleshooting:**
- "No Shoptimizer session ID found" → Session not in order attributes
  - Check Phase 5 (cart injection) worked
  - Theme might be stripping attributes
- "No variant assignments found" → Session assignment not in database
  - Check Phase 3 (assignment creation) worked
  - Backend might have restarted and lost in-memory data
- Webhook not firing at all:
  - Check webhook is registered in Shopify Admin → Settings → Notifications → Webhooks
  - Verify webhook URL is correct
  - Check backend is accessible from Shopify servers

### Step 6.3: Verify Metrics in Shoptimizer Admin

1. Go to Shoptimizer Admin → Active Tests
2. Find your test
3. Verify metrics updated:

**Example (if you were assigned to VARIANT):**
```
Control:
  Impressions: 50% of total
  Conversions: 0
  Revenue: $0.00
  ARPU: $0.00

Variant:
  Impressions: 50% of total
  Conversions: 1
  Revenue: $149.99
  ARPU: $149.99
```

**✅ Success:** Conversion appears under the correct variant you were assigned to

---

## Phase 7: Test Multiple Sessions

### Step 7.1: Simulate Different Users

1. **Session A** (current browser):
   - Visit product → Should see same assignment as before
   - Complete order if not done → Should attribute to same variant

2. **Session B** (new incognito window):
   - Visit product → Gets NEW assignment (might be control or variant, 50/50 chance)
   - Add to cart → New session ID injected
   - Complete order → Should attribute to Session B's variant

3. **Session C** (different browser or device):
   - Visit product → Another new assignment
   - Complete order → Another conversion tracked

### Step 7.2: Verify Split Distribution

After 10+ test orders from different sessions:

1. Check Active Tests page
2. Verify roughly 50/50 split in impressions:
   - Control: ~45-55% of impressions
   - Variant: ~45-55% of impressions

3. Verify conversions attributed to correct variants:
   - If Session A saw "control" → order attributed to control
   - If Session B saw "variant" → order attributed to variant

**✅ Success:** Each session consistently sees same variant, conversions attribute correctly

---

## Phase 8: Edge Case Testing

### Test 8.1: Order Without Session (Direct Cart Link)

1. Create a cart URL manually: `/cart/add?id=VARIANT_ID`
2. Add product without visiting product page
3. Complete order
4. Check webhook logs:
   ```
   [Webhook] No Shoptimizer session ID found in order attributes
   ```

**✅ Expected:** Order completes, but not attributed to any test (graceful handling)

### Test 8.2: Multiple Products in One Order

1. Visit Product A (test active) → Assigned to control
2. Visit Product B (test active) → Assigned to variant
3. Add both to cart
4. Complete order
5. Check logs:
   ```
   [Webhook] Session saw "control" variant for test A
   [Webhook] Session saw "variant" variant for test B
   [Webhook] Attributing conversion to control for test A
   [Webhook] Attributing conversion to variant for test B
   ```

**✅ Expected:** Each product's conversion attributed to its specific variant

### Test 8.3: Test Deactivation

1. Stop a test in Shoptimizer Admin
2. Visit product page (same session)
3. Check logs:
   ```
   [Shoptimizer] No active tests for this product
   ```

**✅ Expected:** 
- SDK detects no active test
- Content shows original values (no modifications)
- No impression tracked
- Future orders not attributed to stopped test

---

## Common Issues & Solutions

### Issue: Session ID not in order

**Symptoms:**
- Webhook logs show "No Shoptimizer session ID found"
- Orders don't attribute to variants

**Solutions:**
1. Check cart injection (Phase 5)
2. Verify theme's cart system compatibility
3. Test with different "Add to Cart" methods (button vs AJAX)
4. Check if checkout strips custom attributes

### Issue: Content not changing

**Symptoms:**
- SDK loads, assignment works, but title/price doesn't change
- Logs show "Applying variant" but no visual change

**Solutions:**
1. Inspect element to find correct CSS selector
2. Update `applyVariant()` in `public/shoptimizer.js`
3. Common selectors:
   - Title: `.product__title`, `.product-single__title`, `h1.product-title`
   - Price: `.product__price`, `.price`, `[itemprop="price"]`
   - Description: `.product__description`, `.product-single__description`

### Issue: Same user sees different variants

**Symptoms:**
- Reload page → different assignment
- localStorage shows different session IDs

**Solutions:**
1. Check if cookies/localStorage are enabled
2. Verify domain consistency (www vs non-www)
3. Check if browser is in private mode (new session each time)
4. Inspect `shoptimizer_session_id` in localStorage

### Issue: Webhook not firing

**Symptoms:**
- Order completes but no webhook logs
- No conversion tracking

**Solutions:**
1. Verify webhook registered in Shopify Admin
2. Check webhook URL is correct and accessible
3. Test webhook delivery in Shopify Admin → Webhooks → View recent deliveries
4. Check HMAC verification isn't failing (logs would show "Failed to verify")

---

## Success Checklist

Use this checklist to confirm full end-to-end attribution works:

- [ ] SDK loads on product pages (console logs visible)
- [ ] Session UUID persists in localStorage
- [ ] User gets assigned to variant (control or variant)
- [ ] Same user sees same variant on reload
- [ ] Product content changes based on variant assignment
- [ ] Impression tracked when user visits page
- [ ] Session ID injected into cart attributes
- [ ] Session ID persists through checkout
- [ ] Order webhook receives session ID
- [ ] Webhook looks up variant assignment for session
- [ ] Conversion attributed to correct variant
- [ ] Metrics update in Active Tests page
- [ ] Multiple sessions get different assignments (50/50 split)
- [ ] Edge cases handled gracefully (no session, stopped test)

---

## Next Steps

Once all tests pass:

1. **Production deployment:**
   - Move to production Shopify store (not dev store)
   - Update API URL to production backend
   - Re-register webhook for production domain

2. **Monitor real traffic:**
   - Watch Active Tests page for real user impressions
   - Verify conversions attribute correctly
   - Check for any theme incompatibilities

3. **Iterate:**
   - Create more tests for different products
   - Test different optimization types (title, price, description)
   - Analyze ARPU lift for winning variants

---

## Support

**Having issues?**

1. Check browser console for SDK errors
2. Check backend logs for webhook processing
3. Verify all prerequisites are met
4. Test in a fresh incognito window

**Contact with:**
- Store URL
- Browser console logs (screenshot)
- Backend webhook logs
- Steps to reproduce the issue
