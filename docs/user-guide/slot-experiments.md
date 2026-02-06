# Slot Experiments

## What Are Slot Experiments?

Slot experiments are a way to A/B test content in specific areas of your store pages. Unlike product optimizations (which change titles, prices, or descriptions), slot experiments let you test custom content in designated spots — like a promotional message, a different call-to-action, or alternative content blocks.

Think of a "slot" as a placeholder on your page where Shoptimizer can swap in different content to see what performs best.

---

## How Slot Experiments Differ from Product Optimizations

| | Product Optimizations | Slot Experiments |
|---|---|---|
| **What they change** | Product titles, descriptions, prices | Custom content in specific page areas |
| **Theme setup required?** | No | Yes — requires App Blocks |
| **Where they appear** | Anywhere the product data is shown | Only where you place the Experiment Slot block |
| **Best for** | Quick wins with existing product data | Testing promotional content, messaging, and layouts |

Both types of experiments use the same smart Bayesian system to allocate traffic and find winners.

---

## Setting Up Slots

Before you can run slot experiments, you need to add Experiment Slot blocks to your Shopify theme.

### Prerequisites

1. The **CRO Runtime** app embed must be enabled in your theme. See [Settings & Setup](settings-and-setup.md) for instructions.
2. You need access to the Shopify **theme editor**.

### Adding an Experiment Slot

1. In your Shopify admin, go to **Online Store** then **Themes**.
2. Click **Customize** on your active theme.
3. Navigate to the page template where you want the slot (for example, your product page).
4. Click **Add block** (or **Add section**, depending on your theme).
5. Find **Experiment Slot** under the Shoptimizer app section.
6. Place it where you want the experiment content to appear on the page.
7. Configure the slot settings (see below).
8. Click **Save**.

### Configuring a Slot

When you add an Experiment Slot block, you'll see these settings:

**Slot Type** — Choose what kind of page this slot is on:

- **Product Page (PDP)** — For slots on individual product pages. These experiments can show different content depending on the product being viewed.
- **Home Page** — For slots on your store's home page.
- **Collection Page** — For slots on collection/category pages.

**Fallback Content** — Optional text or content that will be shown if:
- JavaScript is disabled in the shopper's browser
- The experiment fails to load for any reason

Adding fallback content is a good practice to make sure shoppers always see something meaningful, even if the experiment can't run.

---

## Slot Types Explained

### Product Page (PDP) Slots

These appear on individual product pages. They're ideal for testing:
- Product-specific promotional messages
- Alternative calls-to-action ("Buy Now" vs. "Add to Cart" messaging)
- Trust signals or urgency messages near the purchase button

### Home Page Slots

These appear on your store's home page. They're great for testing:
- Hero banner messaging
- Featured product presentations
- Seasonal or promotional announcements

### Collection Page Slots

These appear on your collection (category) pages. Use them for testing:
- Collection-level promotions
- Sorting or filtering suggestions
- Category descriptions and positioning

---

## Creating and Managing Slot Experiments

Once your slots are set up in the theme editor, you can create experiments through the Shoptimizer app:

1. **Create the experiment** — Define what content each variant should display in the slot.
2. **Activate** — Start the experiment. Shoppers will begin seeing different content in the slot.
3. **Monitor results** — Track how each variant performs on the Optimizations page.
4. **Conclude** — Once you have clear results, keep the winning content or try new variants.

The same lifecycle applies as with product optimizations: Draft, Active, Paused, Completed, and Cancelled. See [Managing Optimizations](managing-optimizations.md) for details on each stage.

---

## Fallback Content

Fallback content is what shoppers see if the slot experiment can't run. This can happen when:

- The shopper has **JavaScript disabled** in their browser
- There's a temporary loading issue
- No active experiment is assigned to that slot

### Best Practices for Fallback Content

- Keep it simple and useful — a brief message or your default content works well.
- Don't leave it blank unless the slot area is purely supplementary.
- Think of it as your "safe default" — it should never look broken or out of place.

---

## Tips for Slot Experiments

- **Start with one slot** on your most important page (usually the product page) before adding slots everywhere.
- **Keep variants meaningfully different** — small wording changes are harder to measure than bigger content shifts.
- **Let experiments run long enough** to gather reliable data before drawing conclusions.
- **Use product page slots** for the most direct impact on sales, since those are closest to the purchase decision.
