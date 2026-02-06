# Settings & Setup

## Overview

The Settings page lets you configure Shoptimizer's theme integration, view your webhook status, and access technical details. Most store owners only need to visit this page once during initial setup.

---

## Two Types of A/B Testing

Shoptimizer supports two ways to run A/B tests. Understanding the difference will help you decide what setup you need.

### Product Optimizations (Easiest — No Theme Setup Needed)

Product optimizations change your actual Shopify product data — titles, descriptions, and prices. These changes are made through Shopify's Admin API and work immediately with no additional setup.

When a product optimization is active:
- Some shoppers see the original product data.
- Others see the modified version.
- Shoptimizer tracks which version leads to more sales.

**This is the simplest way to get started.** Just accept an AI recommendation and the optimization begins.

### Slot Experiments (Requires Theme Setup)

Slot experiments let you test different content in specific areas of your store pages — like a different promotional banner on your product page or alternative content on your home page.

These require adding special blocks to your Shopify theme. See the setup instructions below and the [Slot Experiments](slot-experiments.md) guide for more details.

---

## Theme App Extension Setup

The Shoptimizer theme extension adds two components to your Shopify theme. Here's how to set up each one.

### Step 1: Enable the CRO Runtime (App Embed)

The CRO Runtime is a small script that runs across your entire store. It handles visitor tracking and manages which version of an optimization each shopper sees.

**How to enable it:**

1. In your Shopify admin, go to **Online Store** then **Themes**.
2. Click **Customize** on your active theme.
3. In the theme editor, look for **App embeds** in the left sidebar (you may need to click the puzzle piece icon or look under the "App embeds" section).
4. Find **Shoptimizer CRO Runtime** in the list.
5. Toggle it **on**.
6. Click **Save**.

That's it. The runtime will now load on every page of your store.

**Note:** If you don't see "Shoptimizer CRO Runtime" in the App embeds list, the theme extension may not be deployed yet. Contact support for assistance.

### Step 2: Add Experiment Slot Blocks (Optional)

If you want to run **slot experiments** (content A/B tests in specific areas of your pages), you'll need to add Experiment Slot blocks to your theme.

**How to add them:**

1. In the theme editor, navigate to the page where you want to add a slot (for example, your product page template).
2. Click **Add block** or **Add section** (depending on your theme).
3. Look for **Experiment Slot** under the Shoptimizer app blocks.
4. Add it to the desired location on your page.
5. In the block settings, choose the **Slot Type**:
   - **Product Page (PDP)** — For experiments on product pages
   - **Home Page** — For experiments on your home page
   - **Collection Page** — For experiments on collection pages
6. Optionally, add **fallback content** that will be shown if JavaScript is disabled.
7. Click **Save**.

You can add multiple slots to different pages. Each slot can run its own experiment.

---

## Webhook Status

The Settings page shows the status of your Shopify webhooks. Webhooks are automated notifications that tell Shoptimizer when something happens in your store — like when an order is placed.

### What the Status Means

- **Connected / Active** — Webhooks are working properly. Shoptimizer is receiving order data and tracking conversions.
- **Not configured** — Webhooks haven't been set up yet. Shoptimizer may not be tracking conversions automatically.

In most cases, webhooks are set up automatically when you install the app. If you see any issues, try reinstalling the app or contact support.

---

## API Configuration

The Settings page also displays technical information like your API endpoint URL and webhook URL. These are primarily for reference and troubleshooting.

**You generally don't need to do anything with this information.** It's there in case our support team asks for it.

### Development Mode Notice

If you see a "Development Mode" notice on the Settings page, it means you're running the app in a test environment. URLs shown may change when the app is published to production.

---

## Quick Setup Summary

Here's the minimum you need to do to get started:

| What You Want to Do | What to Set Up |
|---------------------|----------------|
| Run product optimizations (title, price, description) | Nothing extra — works immediately |
| Track visitor behavior and conversions more accurately | Enable the CRO Runtime (App Embed) |
| Run slot experiments with custom content | Enable the CRO Runtime AND add Experiment Slot blocks |

---

## Troubleshooting

**I don't see the Shoptimizer extension in my theme editor.**
The extension needs to be deployed to your Shopify Partner app first. If it's not appearing, contact support.

**Product optimizations aren't showing changes to shoppers.**
Make sure the optimization is in **Active** status on the Optimizations page. Product optimizations modify your Shopify data directly, so they should take effect immediately once activated.

**Slot experiments aren't displaying.**
Check that the CRO Runtime app embed is enabled, and that you've added an Experiment Slot block to the correct page in your theme editor.
