# Shoptimizer - AI-Powered Shopify Conversion Optimization

## Overview
Shoptimizer is an embedded Shopify application designed to boost sales for store owners. It utilizes AI to analyze product performance, generate optimization recommendations, and facilitate A/B testing for critical product elements such as titles, descriptions, and prices. The project's core purpose is to enhance Average Revenue Per User (ARPU) through intelligent automation and real-time conversion tracking, providing Shopify merchants with a powerful tool to improve store performance and drive sales.

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

## System Architecture
Shoptimizer employs a full-stack architecture featuring a React frontend with Shopify Polaris React components (`@shopify/polaris`), Wouter, and TanStack Query, integrated via Shopify App Bridge. The backend is built with Express.js and uses PostgreSQL with Drizzle ORM for multi-tenant data storage. It integrates with the Shopify Admin GraphQL API for product management and leverages webhooks for conversion tracking. OpenAI's GPT-5-mini powers the AI-driven recommendation system.

**UI Framework (Polaris React)**:
- All frontend UI uses `@shopify/polaris` React components (Page, Card, Text, Button, Badge, Banner, BlockStack, InlineStack, InlineGrid, Box, Modal, TextField, Select, etc.)
- Icons from `@shopify/polaris-icons`
- Polaris CSS imported via `@shopify/polaris/build/esm/styles.css` in App.tsx
- AppProvider wraps the app with Polaris theme and i18n
- Frame with Navigation sidebar for page navigation using wouter
- Recharts retained for data visualization (Polaris has no chart components)
- Shadcn Toaster retained for toast notifications (kept in `components/ui/` for compatibility)
- Migrated from Shadcn UI + Tailwind CSS → Polaris Web Components → Polaris React (Feb 2026)

**Key Architectural Decisions & Features:**
- **Multi-Tenant PostgreSQL**: Ensures data isolation between Shopify stores with shop-scoped data.
- **Profit-Optimized AI Recommendation System**: Generates intelligent AI recommendations with quota management, profit-based product selection, and cost-optimized batch processing, including a two-stage filtering algorithm and conflict prevention for active optimizations.
- **Impact Score Tracking**: AI recommendations are assigned impact scores (1-10) based on revenue potential for prioritization.
- **Multi-Variant Price Optimization**: Supports A/B optimization for products with multiple variants, ensuring proportional price updates and safe rollbacks.
- **UUID Session-Based Attribution**: Uses UUIDs for persistent variant assignments across user sessions for accurate conversion attribution.
- **Bayesian A/B Optimization Engine**: All A/B optimizations use Bayesian allocation with Thompson Sampling for dynamic traffic distribution (up to 99/1 splits) with CVaR downside protection and safety budget controls.
- **Settings Page**: Provides instructions for enabling the Theme App Extension (CRO Runtime App Embed) and adding Experiment Slot App Blocks.
- **Auto-Activation Flow**: Accepted AI recommendations are automatically created and activated with 50/50 allocation.
- **Dashboard & Optimizations Page**: Displays real-time metrics, performance charts, AI recommendations, and monitors optimizations with ARPU lift tracking. Features a redesigned card layout with inline change previews.
- **Pause/Resume Functionality**: Allows active optimizations to be paused and resumed without losing data, distinct from cancellation.
- **Advanced Filtering System**: Comprehensive filtering on the Optimizations page by status, type, and product name.
- **Product Sync System**: Automates and manually synchronizes Shopify product data.
- **Smart Automation System**: Includes auto-sync, AI recommendation generation, and dismissal with replacement.
- **Two-Layer Conflict Prevention**: Prevents conflicting active optimizations on the same product element.
- **Optimization Deployment & Conversion Tracking**: Activates A/B optimizations, captures control states for rollback, and uses `ORDERS_CREATE` webhooks for conversion attribution.
- **Safe Rollback**: Deactivates optimizations and restores original product values.
- **Traffic & Conversion Simulator**: Validates A/B optimization tracking and performance through batch and live-streaming simulations.
- **Optimization Evolution Charts**: Visualizes optimization performance over time.
- **Shopify Billing API Integration**: Manages Free, Growth, and Pro subscription plans with a 14-day free trial, all via Shopify's Billing API.
- **Security Headers**: Implements CSP and anti-clickjacking headers for embedded Shopify app compliance.
- **CORS Configuration**: App Proxy endpoints are configured with CORS headers.
- **UI/UX**: Utilizes Shopify Polaris React components (`@shopify/polaris`) for native Shopify admin look and feel.
- **GDPR Compliance (Level 1 Protected Customer Data)**: Implements mandatory Shopify GDPR webhooks for data requests and redaction, with a focus on data minimization.
- **Theme App Extension Architecture**: Implements Shopify App Store compliant A/B testing using Theme App Extensions (`cro-embed.liquid`, `experiment-slot.liquid`) and a lightweight `runtime.js` script, rendering content only inside owned App Block containers.

## External Dependencies
- **Shopify Admin GraphQL API**: For interacting with Shopify store data (products, orders).
- **OpenAI GPT-5-mini**: Powers the AI recommendation engine.
- **PostgreSQL (Neon)**: Used for persistent multi-tenant data storage.
- **Shopify App Bridge**: Facilitates the embedded app experience within Shopify.
- **Wouter**: Client-side routing library.
- **Shopify Polaris React** (`@shopify/polaris`): Native Shopify UI component library with `@shopify/polaris-icons`.
- **Shadcn Toaster**: Retained for toast notifications only (legacy, in `components/ui/`).
- **TanStack Query**: For data fetching, caching, and state management.
- **Recharts**: Used for data visualization and charting.