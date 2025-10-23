# Shoptimizer - AI-Powered Shopify Conversion Optimization

## Overview
Shoptimizer is an embedded Shopify app that uses AI to automatically analyze products and recommend conversion rate optimization tests. The app helps Shopify store owners improve sales on autopilot by:

- Generating AI-powered product optimization recommendations
- Creating and managing A/B tests for product titles, descriptions, and prices
- Analyzing competitor pricing and market positioning
- Tracking performance metrics and revenue lift

## Tech Stack

### Frontend
- React with Wouter routing
- Shadcn UI components with Tailwind CSS
- TanStack Query for data fetching
- Shopify App Bridge for embedded app experience
- Recharts for data visualization

### Backend
- Express.js server with PostgreSQL session storage
- Shopify Admin GraphQL API v12 integration
- OpenAI GPT-4 for AI recommendations (via Replit AI Integrations)
- PostgreSQL database for persistent session and OAuth token storage
- In-memory storage for application data (products, tests, recommendations)

## Project Structure

```
client/
  ├── src/
  │   ├── components/     # Reusable UI components
  │   │   ├── MetricCard.tsx
  │   │   ├── AIRecommendationCard.tsx
  │   │   ├── TestPreviewModal.tsx
  │   │   └── ...
  │   ├── pages/          # Page components
  │   │   └── Dashboard.tsx
  │   └── App.tsx         # Main app with sidebar navigation
server/
  ├── index.ts           # Express server entry
  ├── routes.ts          # API routes
  ├── shopify.ts         # Shopify API integration
  ├── ai-service.ts      # OpenAI integration for recommendations
  ├── sync-service.ts    # Product sync from Shopify
  ├── sync-status.ts     # Sync status tracking per shop
  └── storage.ts         # Data storage interface
shared/
  └── schema.ts          # Shared TypeScript types and Drizzle schemas
```

## Shopify Integration

### Dev Store
- URL: https://cro-autopilot-dev-store.myshopify.com/
- API credentials stored in Replit Secrets:
  - `SHOPIFY_API_KEY`
  - `SHOPIFY_API_SECRET`

### Required Scopes
- `read_products` - Fetch product data
- `write_products` - Update products for A/B tests
- `read_orders` - Track conversion metrics

## API Endpoints

### Products
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get single product

### Recommendations
- `GET /api/recommendations` - List AI recommendations
- `POST /api/recommendations/generate/:productId` - Generate new recommendations
- `PATCH /api/recommendations/:id` - Update recommendation status

### Tests
- `GET /api/tests` - List all A/B tests
- `POST /api/tests` - Create new test
- `PATCH /api/tests/:id` - Update test

### Metrics
- `GET /api/metrics` - Get performance metrics
- `GET /api/dashboard` - Get dashboard summary with sync status

### Sync
- `POST /api/sync/products` - Manually sync products from Shopify

## Features

### AI Recommendations
- Powered by OpenAI GPT-4
- Analyzes product titles, descriptions, and prices
- Provides confidence scores and estimated impact
- Includes psychological insights, SEO optimization, and competitor analysis

### Test Preview System
- Side-by-side comparison of control vs. variant
- Multiple device viewports (desktop, tablet, mobile)
- Visual diff highlighting of changes
- AI insights panel explaining why changes will work
- Confidence scores and risk assessment

### Dashboard
- Real-time metrics (conversion rate, AOV, revenue lift)
- Active test tracking
- Performance charts
- AI recommendation cards
- Live sync status indicator with last sync time

### Product Sync System
- **Automatic sync** on app installation via OAuth callback
- **Manual sync button** in dashboard header with loading state
- **Real-time status tracking** - Dashboard shows "Syncing...", "Just now", "5 min ago", etc.
- **Smart polling** - Checks every 2 seconds during sync, every 30 seconds otherwise
- **Error notifications** - Toast messages surface specific sync failures to merchants
- **Background sync** - Products sync automatically without blocking installation flow
- All sync operations properly isolated by shop (multi-tenant safe)

## Development

The app runs in Shopify's embedded iframe and uses App Bridge for authentication and navigation. To run:

```bash
npm run dev
```

## Recent Changes (October 23, 2025)

### Session Persistence & OAuth Fixes
- **PostgreSQL Session Storage**
  - Migrated from in-memory to PostgreSQL-backed session storage for production reliability
  - Sessions now persist across server restarts (critical for embedded Shopify apps)
  - Created `shopify_sessions` table with proper indexing for shop-based lookups
  - Configured express-session with connect-pg-simple for HTTP session management
  - Added SESSION_SECRET validation - server fails fast if not configured
  
- **GraphQL API Compatibility**
  - Fixed deprecated API calls - updated from `.query()` to `.request()` for Shopify API v12
  - Fixed product query schema - removed invalid `compareAtPriceRange.minVariantPrice`
  - Using `priceRangeV2` with proper Money subfields (amount, currencyCode)
  
- **Enhanced Logging & Debugging**
  - Comprehensive OAuth flow logging throughout initialization and callback
  - Session lifecycle tracking with shop parameter detection
  - Middleware logging for authentication and authorization flows
  - Clear error messages surfaced to merchants when sync fails

### Product Sync Implementation
- **Automatic sync** on app installation via OAuth callback
- **Manual sync button** in dashboard header with loading state
- **Real-time status tracking** - Dashboard shows "Syncing...", "Just now", "5 min ago", etc.
- **Smart polling** - Checks every 2 seconds during sync, every 30 seconds otherwise
- **Error notifications** - Toast messages surface specific sync failures to merchants
- **Background sync** - Products sync automatically without blocking installation flow
- All sync operations properly isolated by shop (multi-tenant safe)

### Core Architecture
- Implemented full-stack architecture with Shopify integration
- Created AI recommendation engine with OpenAI
- Built test preview system with device toggles
- Added comprehensive data schema for products, tests, and metrics
- Integrated Shopify Admin GraphQL API v12

### Security & Isolation
- Shop-based tenant isolation in all endpoints and storage
- Proper session validation and error handling
- Sanitized shop domain validation to prevent malformed domain attacks
- Stable SESSION_SECRET requirement for cookie verification across restarts

## Current Status
✅ **Product Sync Working**: Successfully syncing all products from Shopify dev store (20 products confirmed)
✅ **Session Persistence**: PostgreSQL-backed session storage prevents logout on server restart  
✅ **OAuth Flow**: Complete installation flow with automatic product sync on first install
✅ **Pagination Support**: Handles stores with more than 50 products via cursor-based pagination

## Next Steps
- Deploy test changes to actual Shopify products
- Implement webhook handlers for order tracking
- Add billing integration for subscription tiers
- Create automated test scheduling
- Build advanced competitor scraping
- Optimize logging for production (consider redacting sensitive data)