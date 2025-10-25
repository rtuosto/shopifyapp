# Shoptimizer - AI-Powered Shopify Conversion Optimization

## Overview
Shoptimizer is an embedded Shopify app designed to enhance sales for store owners by leveraging AI for conversion rate optimization. It automatically analyzes products, recommends optimization tests, and facilitates A/B testing for key product elements like titles, descriptions, and prices. The core objective is to improve Average Revenue Per User (ARPU) through intelligent automation and real-time conversion tracking. Shoptimizer aims to provide a seamless and powerful tool for Shopify merchants to boost their sales and improve their store's performance.

## User Preferences
- I prefer clear, concise explanations for any proposed changes or architectural decisions.
- I like to be asked before any major changes are made to the codebase.
- I prefer an iterative development approach, with regular updates on progress.
- I value detailed explanations, but also appreciate summaries.
- Ensure that the project adheres to Shopify's app development best practices.
- Focus on delivering functional, well-tested features that directly impact conversion optimization.

## System Architecture
Shoptimizer utilizes a full-stack architecture with a React, Shadcn UI, Wouter, and TanStack Query frontend, integrated via Shopify App Bridge. The backend runs on Express.js with PostgreSQL for persistent multi-tenant storage using Drizzle ORM. It integrates with the Shopify Admin GraphQL API v12 for product management and uses webhooks for conversion tracking. OpenAI's GPT-4 powers AI-driven recommendations.

**Storage Architecture:**
- **Multi-Tenant PostgreSQL**: All data is shop-scoped with composite unique constraints to ensure complete data isolation between Shopify stores
- **DbStorage Implementation**: Production storage layer that enforces shop boundaries on all database operations (SELECT, INSERT, UPDATE, DELETE)
- **Persistence**: AI recommendations, products, tests, metrics, and session assignments persist across server restarts, eliminating redundant LLM API calls and reducing costs
- **Security**: Shop reassignment attacks prevented by stripping shop field from all update operations

**Key Architectural Decisions & Features:**
- **AI Recommendations**: GPT-4 analyzes product data to provide actionable optimization suggestions with psychological insights and SEO explanations. Recommendations are cached in PostgreSQL to avoid unnecessary API calls on server restarts.
- **UUID Session-Based Attribution**: A robust system using UUIDs stored in localStorage ensures persistent variant assignments across user sessions, accurately attributing conversions for A/B tests. This includes backend API endpoints for managing assignments and impressions, and webhook integration for conversion tracking.
- **Extensible Testing Architecture**: The database schema supports diverse test scopes (product, template, page, global) and advanced allocation strategies (fixed, Bayesian, bandit) for future optimization features.
- **Test Preview System**: Offers side-by-side control vs. variant comparison with multi-device views and visual diff highlighting.
- **Dashboard & Active Tests Page**: Provides real-time metrics, performance charts, AI recommendation cards, and a dedicated page for monitoring live tests with ARPU lift tracking.
- **Product Sync System**: Automated and manual synchronization of Shopify products with real-time status and error notifications.
- **Smart Automation System**: Includes auto-sync, auto-generation of AI recommendations, and dismissal with replacement for recommendations.
- **Test Deployment & Conversion Tracking**: Activates A/B tests by deploying variants, captures control states for safe rollback, and registers `ORDERS_CREATE` webhooks for automatic conversion attribution and ARPU calculation.
- **Safe Rollback**: Deactivates tests and restores original product values.
- **Traffic & Conversion Simulator**: A comprehensive system for validating A/B test tracking and performance before live deployment, including batch and advanced controls for traffic and order simulation.
- **Collection Page Variant Support**: Ensures consistent variant display on collection pages, homepages, and search results to prevent test contamination. Uses DOM manipulation and MutationObserver for dynamic content with intelligent infinite loop prevention (isProcessing guard + needsRecheck pattern) to avoid redundant processing while catching lazy-loaded cards.
- **Auto-Configuration**: The SDK automatically detects the backend URL from `REPLIT_DOMAINS` for simplified one-line installation and deployment.
- **CORS Configuration**: Public SDK endpoints are configured with CORS headers (`Access-Control-Allow-Origin: *`) to enable seamless cross-origin requests from Shopify stores.
- **UI/UX**: Leverages Shadcn UI components and Tailwind CSS for an intuitive and embedded Shopify app experience.

## External Dependencies
- **Shopify Admin GraphQL API v12**: For store data interaction (products, orders).
- **OpenAI GPT-4**: Powers the AI recommendation engine.
- **PostgreSQL (Neon)**: Used for multi-tenant persistent storage of products, recommendations, tests, metrics, session assignments, and OAuth tokens.
- **Shopify App Bridge**: Enables the embedded app experience.
- **Wouter**: Client-side routing.
- **Shadcn UI & Tailwind CSS**: UI component library and styling.
- **TanStack Query**: Data fetching and caching.
- **Recharts**: Data visualization.