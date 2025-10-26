# Shoptimizer - AI-Powered Shopify Conversion Optimization

## Overview
Shoptimizer is an embedded Shopify app designed to enhance sales for store owners. It leverages AI to analyze products, recommend optimization tests, and facilitate A/B testing for key product elements like titles, descriptions, and prices. The primary goal is to improve Average Revenue Per User (ARPU) through intelligent automation and real-time conversion tracking, providing Shopify merchants with a powerful tool to boost sales and store performance.

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
- **Profit-Optimized AI Recommendation System**: Generates intelligent AI recommendations with quota management, profit-based product selection, and cost-optimized batch processing. It includes a two-stage filtering algorithm for product selection, an archive and replace system for recommendations, and conflict prevention for active tests.
- **Impact Score Tracking & Sorting**: GPT-5-mini assigns impact scores (1-10) to recommendations based on revenue potential, which are then used to prioritize recommendations in the UI.
- **Multi-Variant Price Testing**: Supports A/B testing for products with multiple variants, ensuring all variant prices are updated proportionally and safely rolled back.
- **UUID Session-Based Attribution**: Uses UUIDs for persistent variant assignments across user sessions, ensuring accurate conversion attribution.
- **Bayesian-Only Testing Architecture**: All A/B tests use Bayesian allocation with Thompson Sampling for dynamic, data-driven traffic distribution.
- **Bayesian A/B Testing Engine**: Implements Top-Two Thompson Sampling (TTTS) for intelligent traffic allocation with minimal constraints (1% floors), allowing optimization up to 99/1 splits while maintaining CVaR downside protection (2% cap on risky variants) and safety budget cost controls.
- **Test Preview System**: Offers a side-by-side comparison of control vs. variant with multi-device views.
- **Auto-Activation Flow**: When users accept an AI recommendation, the test is automatically created AND activated in one action, going live immediately with 50/50 balanced allocation for faster learning instead of requiring manual activation from draft mode.
- **Dashboard & Active Tests Page**: Provides real-time metrics, performance charts, AI recommendations, and monitors live tests with ARPU lift tracking. The Active Tests page features a redesigned card layout with key information at the top (product name, status badges, dates, action buttons), inline change previews showing control → variant comparisons, and user-friendly language without technical jargon.
- **Pause/Resume Functionality**: Active tests can be paused (preserving data and prices while stopping variant serving) and resumed later, separate from canceling tests which archives them completely.
- **Product Sync System**: Automates and manually synchronizes Shopify product data, including variant details, with the database.
- **Smart Automation System**: Includes features like auto-sync, AI recommendation generation, and dismissal with replacement.
- **Two-Layer Conflict Prevention**: Prevents conflicting active tests on the same product element through proactive filtering during recommendation generation and defensive validation during test activation.
- **Test Deployment & Conversion Tracking**: Activates A/B tests, captures control states for rollback, and uses `ORDERS_CREATE` webhooks for conversion attribution.
- **Safe Rollback**: Deactivates tests and restores original product values in Shopify.
- **Traffic & Conversion Simulator**: Validates A/B test tracking and performance through batch and live-streaming simulations using Server-Sent Events (SSE).
- **Test Evolution Charts**: Visualizes test performance over time on the Active Tests page, showing RPV and allocation evolution.
- **Collection Page Variant Support**: Ensures consistent variant display on various Shopify pages using DOM manipulation and MutationObserver.
- **Auto-Configuration**: The SDK automatically detects the backend URL for simplified installation.
- **CORS Configuration**: Public SDK endpoints are configured with CORS headers for cross-origin requests.
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