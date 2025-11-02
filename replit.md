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
- **Storefront Overlay Preview System**: Enables merchants to preview AI recommendations directly on their actual product pages with an interactive overlay UI. Uses opaque tokens (15-min TTL) and postMessage communication. Supports toggling between control/variant views before approval. Sets foundation for future WYSIWYG editing and "Copilot for Shopify" vision. Public SDK endpoints use CORS for cross-origin storefront access.
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
- **Collection Page Variant Support**: Ensures consistent variant display on various Shopify pages using DOM manipulation and MutationObserver.
- **Auto-Configuration**: The SDK automatically detects the backend URL for simplified installation.
- **CORS Configuration**: Public SDK endpoints are configured with CORS headers for cross-origin requests.
- **Theme Positioning System (Preview Enhancement)**: Implements a template clone strategy to learn theme-specific DOM positioning rules for accurate preview rendering. Creates hidden draft products with all fields populated, analyzes storefront HTML with Cheerio to extract positioning rules, and caches them per theme. SDK preview mode fetches and applies these rules for better positioning accuracy. **Current Status**: Foundation implemented (database schema, clone creation, HTML parsing, rule caching, SDK integration). **Known Limitation**: Selectors may fail on hydrated storefronts; system falls back to heuristics. **Recommended Improvements**: (1) Use sibling-relative positioning instead of absolute selectors, (2) Verify selectors post-extraction, (3) Add theme-specific automated tests.
- **UI/UX**: Utilizes Shadcn UI components and Tailwind CSS for an embedded Shopify app experience.

## External Dependencies
- **Shopify Admin GraphQL API v12**: For store data interaction (products, orders).
- **OpenAI GPT-5-mini**: Powers the AI recommendation engine (upgraded October 2025 for enhanced reasoning, better accuracy, and 80% cost reduction vs GPT-4o).
- **PostgreSQL (Neon)**: Persistent multi-tenant storage.
- **Shopify App Bridge**: Enables the embedded app experience.
- **Wouter**: Client-side routing.
- **Shadcn UI & Tailwind CSS**: UI component library and styling.
- **TanStack Query**: Data fetching and caching.
- **Recharts**: Data visualization.