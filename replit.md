# Shoptimizer - AI-Powered Shopify Conversion Optimization

## Overview
Shoptimizer is an embedded Shopify app designed to enhance sales for store owners by leveraging AI for conversion rate optimization. It automatically analyzes products, recommends optimization tests, and facilitates A/B testing for key product elements like titles, descriptions, and prices. The core objective is to improve Average Revenue Per User (ARPU) through intelligent automation and real-time conversion tracking.

## Recent Changes (October 24, 2025)

**Schema Evolution: Extensible Testing Architecture - NEW**
- ✅ Extended database schema to support template-level experiments beyond product-level tests
- ✅ Added optimization strategy fields for future Bayesian and multi-armed bandit algorithms
- ✅ New fields in tests table:
  - `scope`: "product" | "template" | "page" | "global" - defines test scope
  - `productId`: Now nullable to support template tests (e.g., product page layout changes)
  - `targetSelector`: CSS selector for template tests (e.g., ".product-grid")
  - `allocationStrategy`: "fixed" | "bayesian" | "bandit" - enables dynamic traffic allocation
  - `controlAllocation` / `variantAllocation`: Dynamic percentages for advanced optimization
  - `confidenceThreshold`: Statistical significance threshold (default 95%)
  - `minSampleSize`: Minimum samples before optimization kicks in (default 100)
  - `bayesianConfig`: JSONB storing prior distributions for Bayesian optimization
- ✅ Spillover effects acknowledged: Template changes affect multiple products (industry-standard limitation)
- ✅ Architecture supports future features: Product page redesigns, listing page tests, navigation changes

**Previous Changes (October 23, 2025)**

**Active Tests Page & Streamlined Test Deployment - NEW**
- ✅ Simplified test activation flow: "Accept & Launch Test" immediately creates and activates tests
- ✅ Eliminated confusing draft state: Tests go live immediately upon acceptance
- ✅ Dedicated Active Tests page (/active-tests): Real-time monitoring with 2-second auto-refresh
- ✅ Summary metrics on Active Tests page: Total impressions, conversions, ARPU across all running tests
- ✅ Individual test cards: Show control vs variant performance with ARPU lift tracking
- ✅ Dashboard reorganization: "Active Tests" notification card with link, "Completed Tests" table for historical data
- ✅ Fixed Simulator bug: Corrected query key from `["/api/tests", "active"]` to `["/api/tests"]` for proper test fetching

**Traffic & Conversion Simulator - Production Ready**
- ✅ Built comprehensive simulation system for validating A/B test tracking before real traffic
- ✅ Backend endpoints: `/api/simulate/traffic`, `/api/simulate/orders`, `/api/simulate/batch`
- ✅ Batch simulator: Realistic traffic + conversions with configurable conversion rate
- ✅ Advanced controls: Separate traffic and order simulation for granular testing
- ✅ Allocation verification: All simulations use 50/50 control/variant split
- ✅ Revenue variance: Orders simulated with ±20% price variation for realism
- ✅ Accessible via Simulator page in navigation sidebar

**Smart Automation System - Production Ready**
- ✅ Auto-sync on dashboard load: Automatically syncs products when none exist (one-time per session)
- ✅ Auto-generate on load: Automatically generates 4 AI recommendations when products exist but none pending
- ✅ Dismiss with replacement: Dismissing a recommendation triggers generation of new one for same product
- ✅ Fixed infinite retry loops: Added `attemptedRef` flags to prevent continuous mutation calls on failure
- ✅ Fixed AIRecommendationCard state desync: Removed optimistic local state, relies on server state only
- ✅ Fixed async handling: Use mutateAsync and proper finally blocks to prevent double-clicks
- ✅ All automation features reviewed and approved by architect for production use

**Implementation Details:**
- Test activation: Dashboard "Accept" button now creates test + activates in one flow (no draft state)
- Active Tests UI: 2-second polling for live updates, pause/resume control, test stop functionality
- Simulation: Each endpoint validates test is active, simulates 50/50 allocation, updates metrics
- Ref management: `attemptedRef` prevents retry loops, `hasAutoRef` marks successful completion
- Error recovery: Failed operations require manual retry via UI buttons
- Async safety: All handlers use try/finally blocks to guarantee cleanup
- No state desync: Cards disable buttons during processing, rely on query invalidation for updates

## User Preferences
- I prefer clear, concise explanations for any proposed changes or architectural decisions.
- I like to be asked before any major changes are made to the codebase.
- I prefer an iterative development approach, with regular updates on progress.
- I value detailed explanations, but also appreciate summaries.
- Ensure that the project adheres to Shopify's app development best practices.
- Focus on delivering functional, well-tested features that directly impact conversion optimization.

## System Architecture
Shoptimizer utilizes a full-stack architecture. The frontend is built with React, Shadcn UI (Tailwind CSS), Wouter for routing, and TanStack Query for data fetching, integrated within the Shopify admin via App Bridge. Recharts is used for data visualization. The backend runs on Express.js with PostgreSQL for session and OAuth token storage, and an in-memory store for application data. It integrates with the Shopify Admin GraphQL API v12 for product management and webhooks for conversion tracking. OpenAI's GPT-4 powers AI-driven recommendations.

Key features include:
- **AI Recommendations**: GPT-4 analyzes product data to provide actionable optimization suggestions, including psychological insights and SEO explanations.
- **Test Preview System**: Offers a side-by-side comparison of control vs. variant, with multi-device views and visual diff highlighting.
- **Dashboard**: Displays real-time metrics (ARPU, total revenue, conversions, active tests), performance charts, and AI recommendation cards.
- **Product Sync System**: Automated and manual product synchronization from Shopify, with real-time status tracking and error notifications.
- **Smart Automation System**: Includes auto-sync on dashboard load, auto-generation of recommendations, and dismissal with replacement for recommendations.
- **Test Deployment & Conversion Tracking**: Activates A/B tests by deploying variants to Shopify, captures control states for safe rollback, registers Shopify `ORDERS_CREATE` webhooks for automatic conversion attribution, and calculates ARPU.
- **Safe Rollback**: Deactivates tests and restores original product values even if products were edited post-test creation.
- **Traffic & Conversion Simulator**: Dedicated simulator page with batch and advanced controls for generating simulated traffic and orders, verifying 50/50 A/B test allocation, and validating performance tracking before deploying to real customers.
- **UI/UX**: Focuses on intuitive design using Shadcn UI components, providing a seamless embedded Shopify app experience.

## External Dependencies
- **Shopify Admin GraphQL API v12**: For interacting with Shopify store data (products, orders).
- **OpenAI GPT-4**: Powers the AI recommendation engine.
- **PostgreSQL**: Used for persistent session storage and OAuth tokens.
- **Shopify App Bridge**: Enables the embedded app experience within the Shopify admin.
- **Wouter**: Client-side routing.
- **Shadcn UI & Tailwind CSS**: UI component library and styling framework.
- **TanStack Query**: Data fetching and caching.
- **Recharts**: Data visualization.