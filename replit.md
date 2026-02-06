# Shoptimizer - AI-Powered Shopify Conversion Optimization

## Overview
Shoptimizer is an embedded Shopify app designed to enhance sales for store owners. It leverages AI to analyze products, recommend optimizations, and facilitate A/B optimization for key product elements like titles, descriptions, and prices. The primary goal is to improve Average Revenue Per User (ARPU) through intelligent automation and real-time conversion tracking, providing Shopify merchants with a powerful tool to boost sales and store performance.

## Terminology
To avoid confusion between different types of "testing" in the codebase, we use these terms consistently:

- **Optimization** / **A/B Optimization** - The customer-facing experiments that merchants create to improve their product performance (formerly called "tests" or "A/B tests"). These are the core feature of Shoptimizer.
  - Database: `optimizations` table
  - API endpoints: `/api/optimizations/*`
  - Frontend: "Optimizations" page, "Active Optimizations"
  
- **Validation** / **Automated Tests** / **QA Tests** - Internal quality assurance testing to validate that the application works correctly. These are NOT user-facing features.
  - Examples: Unit tests, integration tests, end-to-end tests
  - NOT stored in the database
  - Used by developers only

This distinction ensures clarity in documentation, code comments, and user-facing language.

## User Preferences
- I prefer clear, concise explanations for any proposed changes or architectural decisions.
- I like to be asked before any major changes are made to the codebase.
- I prefer an iterative development approach, with regular updates on progress.
- I value detailed explanations, but also appreciate summaries.
- Ensure that the project adheres to Shopify's app development best practices.
- Focus on delivering functional, well-tested features that directly impact conversion optimization.

## Personas to consider 
- Always plan and test/validate new updates considering each of the following user personas.
- **Shopper**
  - This is the end user who is browsing and shopping on the shopify store.
  - If they are in an experiment variant, they should always see the same variant even across multiple sessions
  - The variant change should never break the core shopping experience for this user
- **Store Owner**
  - This is the owner of the shopify store, and the user of this application.
  - They may or may not have technical experience and our goal is to make their store perform better with minimal effort on their part.
  - This is the customer and purchaser of our app so their positive experience is a top priority
- **App Developer**
  - This is you the Replit agent, and me the prompter.
  - In the future we have have additional developers working on this app so the code must be understandable and scalable for team development.
  - Documentation must be kept up to date
  - Proper version control must be in place
  - Follow best practices for CI/CO and deployment
  - App security is a top priority - never expose secrets, security keys, or personal information to the storefront or app UI.

- 
## System Architecture
Shoptimizer utilizes a full-stack architecture. The frontend uses React with Shadcn UI, Wouter, and TanStack Query, integrated via Shopify App Bridge. The backend is built with Express.js and uses PostgreSQL with Drizzle ORM for multi-tenant data storage. It integrates with the Shopify Admin GraphQL API for product management and uses webhooks for conversion tracking. OpenAI's GPT-5-mini (October 2025 upgrade) powers AI-driven recommendations with enhanced reasoning and 45% fewer hallucinations.

**Key Architectural Decisions & Features:**
- **Multi-Tenant PostgreSQL**: Ensures data isolation between Shopify stores with shop-scoped data and composite unique constraints.
- **Profit-Optimized AI Recommendation System**: Generates intelligent AI recommendations with quota management, profit-based product selection, and cost-optimized batch processing. It includes a two-stage filtering algorithm for product selection, an archive and replace system for recommendations, and conflict prevention for active optimizations.
- **Impact Score Tracking & Sorting**: GPT-5-mini assigns impact scores (1-10) to recommendations based on revenue potential, which are then used to prioritize recommendations in the UI.
- **Multi-Variant Price Optimization**: Supports A/B optimization for products with multiple variants, ensuring all variant prices are updated proportionally and safely rolled back.
- **UUID Session-Based Attribution**: Uses UUIDs for persistent variant assignments across user sessions, ensuring accurate conversion attribution.
- **Bayesian-Only Architecture**: All A/B optimizations use Bayesian allocation with Thompson Sampling for dynamic, data-driven traffic distribution.
- **Bayesian A/B Optimization Engine**: Implements Top-Two Thompson Sampling (TTTS) for intelligent traffic allocation with minimal constraints (1% floors), allowing optimization up to 99/1 splits while maintaining CVaR downside protection (2% cap on risky variants) and safety budget cost controls.
- **Settings Page**: Provides step-by-step instructions for enabling the Theme App Extension (CRO Runtime App Embed) and optionally adding Experiment Slot App Blocks to product pages. Explains the two types of A/B testing (Product Optimizations via Admin API vs Slot Experiments via App Blocks).
- **Auto-Activation Flow**: When users accept an AI recommendation, the optimization is automatically created AND activated in one action, going live immediately with 50/50 balanced allocation for faster learning instead of requiring manual activation from draft mode.
- **Dashboard & Optimizations Page**: Provides real-time metrics, performance charts, AI recommendations, and monitors all optimizations across all statuses with ARPU lift tracking. The Optimizations page features a redesigned card layout with key information at the top (product name, status badges, dates, action buttons), inline change previews showing control → variant comparisons, and user-friendly language without technical jargon.
- **Pause/Resume Functionality**: Active optimizations can be paused (preserving data and prices while stopping variant serving) and resumed later, separate from canceling optimizations which archives them completely.
- **Advanced Filtering System**: The Optimizations page includes comprehensive filtering capabilities allowing users to filter optimizations by status (Draft, Live, Paused, Completed, Cancelled), optimization type (Price, Title, Description), and product name search. All filters work together conjunctively with a "Clear" button to reset all filters at once.
- **Product Sync System**: Automates and manually synchronizes Shopify product data, including variant details, with the database.
- **Smart Automation System**: Includes features like auto-sync, AI recommendation generation, and dismissal with replacement.
- **Two-Layer Conflict Prevention**: Prevents conflicting active optimizations on the same product element through proactive filtering during recommendation generation and defensive validation during optimization activation.
- **Optimization Deployment & Conversion Tracking**: Activates A/B optimizations, captures control states for rollback, and uses `ORDERS_CREATE` webhooks for conversion attribution.
- **Safe Rollback**: Deactivates optimizations and restores original product values in Shopify.
- **Traffic & Conversion Simulator**: Validates A/B optimization tracking and performance through batch and live-streaming simulations using Server-Sent Events (SSE).
- **Optimization Evolution Charts**: Visualizes optimization performance over time on the Optimizations page, showing RPV and allocation evolution.
- **Shopify Billing API Integration**: All app charges go through Shopify's Billing API (required for App Store compliance):
  - Plans: Free, Growth ($29.99/mo), Pro ($79.99/mo) with 14-day free trials
  - GraphQL mutations: `appSubscriptionCreate`, `appSubscriptionCancel`, `currentAppInstallation` query
  - API endpoints: `GET /api/billing/status`, `POST /api/billing/subscribe`, `POST /api/billing/cancel`
  - Zod validation on all billing request bodies
  - Subscription ownership verification before cancellation
  - Plans & Billing page in the app sidebar
  - Currently in beta mode (all features unlocked)
- **Security Headers**: CSP and anti-clickjacking headers for embedded Shopify app compliance:
  - `Content-Security-Policy: frame-ancestors https://admin.shopify.com https://*.myshopify.com`
  - `X-Content-Type-Options: nosniff`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **CORS Configuration**: App Proxy endpoints are configured with CORS headers for cross-origin storefront requests.
- **UI/UX**: Utilizes Shadcn UI components and Tailwind CSS for an embedded Shopify app experience.
- **GDPR Compliance (Level 1 Protected Customer Data)**: Implements mandatory Shopify GDPR webhooks:
  - `/api/webhooks/customers/data_request` - Handles customer data export requests (no PII stored)
  - `/api/webhooks/customers/redact` - Handles customer data deletion requests (no PII stored)
  - `/api/webhooks/shop/redact` - Handles complete shop data deletion on app uninstall
  - All webhooks use HMAC-SHA256 signature verification
  - Data minimization: Only stores order line items for conversion attribution, no customer PII (name, email, address)
  - See `docs/privacy-policy.md` for full data protection documentation
- **Theme App Extension Architecture**: Implements Shopify App Store compliant A/B testing using Theme App Extensions instead of DOM manipulation:
  - **App Embed (cro-embed.liquid)**: Loads the lightweight runtime.js across the entire storefront site-wide
  - **App Block (experiment-slot.liquid)**: Creates owned containers where experiment variants render. Merchants place these blocks in their theme's product pages
  - **runtime.js**: Lightweight (~5KB) script that handles visitor ID generation (cro_vid), deterministic bucketing via hash, config fetching from App Proxy, and slot rendering. ONLY renders content inside owned App Block containers - never manipulates theme DOM
  - **App Proxy Endpoints**: `/apps/cro-proxy/config` returns LIVE experiments for the shop, `/apps/cro-proxy/event` tracks slot_view, add_to_cart, and purchase events
  - **Database Tables**: `slot_experiments` stores slot-based experiment configs (DRAFT/LIVE/PAUSED status, variantA/B content, allocation), `experiment_events` logs all storefront events for analytics
  - **Key Benefit**: Content renders ONLY inside owned slots, achieving full App Store compliance while maintaining robust A/B testing capabilities

## External Dependencies
- **Shopify Admin GraphQL API v12**: For store data interaction (products, orders).
- **OpenAI GPT-5-mini**: Powers the AI recommendation engine (upgraded October 2025 for enhanced reasoning, better accuracy, and 80% cost reduction vs GPT-4o).
- **PostgreSQL (Neon)**: Persistent multi-tenant storage.
- **Shopify App Bridge**: Enables the embedded app experience.
- **Wouter**: Client-side routing.
- **Shadcn UI & Tailwind CSS**: UI component library and styling.
- **TanStack Query**: Data fetching and caching.
- **Recharts**: Data visualization.