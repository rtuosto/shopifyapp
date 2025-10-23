# Shoptimizer - AI-Powered Shopify Conversion Optimization

## Overview
Shoptimizer is an embedded Shopify app designed to enhance sales for store owners by leveraging AI for conversion rate optimization. It automatically analyzes products, recommends optimization tests, and facilitates A/B testing for key product elements like titles, descriptions, and prices. The core objective is to improve Average Revenue Per User (ARPU) through intelligent automation and real-time conversion tracking.

## Recent Changes (October 23, 2025)

**Smart Automation System - Production Ready**
- ✅ Auto-sync on dashboard load: Automatically syncs products when none exist (one-time per session)
- ✅ Auto-generate on load: Automatically generates 4 AI recommendations when products exist but none pending
- ✅ Dismiss with replacement: Dismissing a recommendation triggers generation of new one for same product
- ✅ Fixed infinite retry loops: Added `attemptedRef` flags to prevent continuous mutation calls on failure
- ✅ Fixed AIRecommendationCard state desync: Removed optimistic local state, relies on server state only
- ✅ Fixed async handling: Use mutateAsync and proper finally blocks to prevent double-clicks
- ✅ All automation features reviewed and approved by architect for production use

**Implementation Details:**
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