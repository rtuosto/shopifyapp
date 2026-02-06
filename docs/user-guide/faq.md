# Frequently Asked Questions

## Will optimizations affect my SEO?

Product optimizations change your actual Shopify product data (titles, descriptions, prices), so search engines will see those changes. However, Shoptimizer's AI is designed to improve your product content — making titles more descriptive and descriptions more compelling — which often has a **positive** effect on SEO.

If an optimization is cancelled, your product data is rolled back to the original, so any SEO impact is reversed.

Slot experiments do **not** affect SEO because the content is loaded dynamically and is not part of your page's static HTML.

---

## How long should I run an optimization?

There's no fixed answer, but here are some guidelines:

- **Minimum:** Let each version be seen by at least a few hundred visitors before drawing conclusions.
- **Ideal:** Run optimizations for at least 1–2 weeks to account for day-of-week variations in shopping behavior.
- **Watch the charts:** On the Optimizations page, the performance evolution charts will show you when results are stabilizing. If the lines are still moving around, the test needs more time.

Shoptimizer's Bayesian system helps by automatically sending more traffic to the better-performing version, so you're not losing sales while you wait.

---

## What happens if I uninstall the app?

If you uninstall Shoptimizer:

- All **active optimizations will stop**. Your products will remain in whatever state they were in at the time of uninstallation.
- It is recommended to **cancel all active optimizations before uninstalling**, which will roll your products back to their original data.
- Your data within Shoptimizer (recommendations, optimization history, analytics) may be deleted after uninstallation, in accordance with Shopify's data policies.
- The theme extension (CRO Runtime and any Experiment Slots) will be automatically removed from your theme.

---

## Do shoppers see different things?

Yes, that's how A/B testing works. When an optimization is active:

- Some shoppers see the **original version** (control).
- Others see the **improved version** (variant).

Each shopper consistently sees the same version across multiple visits — they won't see the original on one visit and the variant on the next. This ensures a fair test and a consistent shopping experience.

The changes are subtle (a different title, description, or price) and shoppers won't know they're part of a test.

---

## How does billing work?

Shoptimizer billing is managed through Shopify:

- Your subscription charge appears on your regular **Shopify bill**.
- You don't need to enter separate payment details into Shoptimizer.
- You can upgrade, downgrade, or cancel at any time from the **Plans & Billing** page.

During the current **beta period**, all features are completely free. See [Billing & Plans](billing.md) for full details.

---

## Is my customer data safe?

Yes. Shoptimizer takes data privacy seriously:

- **No personally identifiable information (PII) is stored.** Shoptimizer does not collect or store shopper names, email addresses, or payment details.
- **GDPR compliant.** The app follows data protection regulations and provides the required data handling endpoints for Shopify's privacy requirements.
- **Data stays within Shopify's ecosystem.** Product data is accessed through Shopify's official APIs and is subject to Shopify's security standards.
- **Visitor tracking is anonymous.** The CRO Runtime tracks which version a visitor sees using anonymous identifiers — no personal data is involved.

---

## What is Bayesian testing?

Bayesian testing is a smarter approach to A/B testing compared to traditional methods. Here's the simple version:

- **Traditional A/B testing** splits traffic 50/50 and waits until a fixed number of visitors is reached before declaring a winner. This can mean showing a losing version to half your shoppers for a long time.
- **Bayesian testing** (what Shoptimizer uses) starts at 50/50 but **continuously adjusts** the split as data comes in. If the variant is performing better, more shoppers are automatically sent to it.

The result: you lose fewer potential sales during testing, and you don't need to manually decide when to stop the test or how many visitors to include.

---

## Can I run multiple optimizations at once?

Yes, you can run multiple optimizations at the same time — even on the same product. However, there's one important rule:

**Don't run two optimizations on the same field of the same product at the same time.**

For example, you can run a title optimization and a price optimization on the same product simultaneously. But you should not run two different title optimizations on the same product at the same time, because they would conflict with each other.

Your plan determines how many active optimizations you can have running at once. During the beta, there's no limit.

---

## How does the AI know what to recommend?

Shoptimizer's AI analyzes several aspects of your products:

- **Product titles** — Are they descriptive enough? Do they include important keywords?
- **Descriptions** — Are they compelling? Do they highlight key benefits and features?
- **Pricing** — Is the price positioned well relative to the product's perceived value?
- **Product images and metadata** — Additional context about the product's category and market positioning.

The AI uses these signals along with e-commerce best practices to suggest specific, actionable changes. Each recommendation includes an explanation of why the change is being suggested, so you can make an informed decision.

---

## What if I don't like a recommendation?

No problem. You have full control:

- **Dismiss it** — Click the Dismiss button to remove it from your active list. Shoptimizer will automatically generate a replacement recommendation.
- **Ignore it** — You're never required to act on any recommendation. They'll stay in your list until you accept or dismiss them.
- **Restore it later** — If you dismiss a recommendation but change your mind, you can find it in the Archived tab and restore it.

The AI generates suggestions, but you always make the final decision. Nothing changes on your store unless you explicitly accept a recommendation.

---

## Can I undo an optimization after accepting it?

Yes. If you've accepted a recommendation and it created an optimization, you can:

- **Cancel the optimization** at any time from the Optimizations page. This immediately rolls back your product to its original data.
- **Pause the optimization** if you want to temporarily stop the test without rolling back.

You're always in control and can reverse any change Shoptimizer makes.

---

## Do I need any technical skills to use Shoptimizer?

No. Shoptimizer is designed for store owners of all skill levels. The AI handles the analysis and creates the A/B tests for you. All you need to do is:

1. Review the recommendations.
2. Click Accept on the ones you like.
3. Monitor your results on the Dashboard.

The only slightly technical step is enabling the theme extension, and even that is just toggling a switch in your Shopify theme editor. See [Settings & Setup](settings-and-setup.md) for a walkthrough.
