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
- `POST /api/tests/:id/activate` - Activate test (deploys variant to Shopify)
- `POST /api/tests/:id/deactivate` - Deactivate test (reverts to control values)

### Metrics
- `GET /api/metrics` - Get performance metrics
- `GET /api/dashboard` - Get dashboard summary with sync status

### Sync
- `POST /api/sync/products` - Manually sync products from Shopify

### Webhooks
- `POST /api/webhooks/orders/create` - Shopify webhook for order conversion tracking

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

### Test Deployment & Conversion Tracking
- **Live Product Deployment**
  - Start Test button activates A/B tests by deploying variant to Shopify
  - Captures live product state before changes for safe rollback
  - Updates product title, description, and price in Shopify store
  - Handles edge cases: empty descriptions, price updates via variant IDs
  
- **Automatic Webhook Registration**
  - ORDERS_CREATE webhook registered during OAuth callback
  - Non-blocking registration (doesn't fail installation)
  - HMAC signature verification using raw body for security
  
- **Conversion Attribution**
  - Order webhooks automatically attribute conversions to active tests
  - Matches ordered products to running tests by Shopify product ID
  - Updates test metrics: conversions, revenue, performance
  - Real-time tracking without manual intervention
  
- **Safe Rollback**
  - Stop Test button deactivates tests and reverts to original values
  - Restores all modified fields: title, description, price
  - Works even if product was edited after test creation
  - Field existence checking handles empty values correctly

## Development

The app runs in Shopify's embedded iframe and uses App Bridge for authentication and navigation. To run:

```bash
npm run dev
```

## Recent Changes (October 23, 2025)

### Test Deployment & Conversion Tracking System
- **Test Activation Endpoint** (`POST /api/tests/:id/activate`)
  - Fetches current product state from Shopify before making changes
  - Captures complete control snapshot: title, descriptionHtml, price
  - Handles empty descriptions (always captures, even if empty string)
  - Deploys variant changes to Shopify via GraphQL productUpdate
  - Updates test status to "active" with activation timestamp
  
- **Test Deactivation Endpoint** (`POST /api/tests/:id/deactivate`)
  - Reverts Shopify product to original control values
  - Field existence checking (`"field" in controlData`) handles empty values
  - Updates price via variant IDs for multi-variant products
  - Marks test as "completed" with end timestamp
  
- **Webhook System** (`POST /api/webhooks/orders/create`)
  - Raw body HMAC verification for security (uses `req.rawBody` Buffer)
  - Automatic conversion attribution to active tests
  - Matches line items to products by Shopify product ID
  - Updates test metrics: conversions, revenue, performance
  - Proper error handling and logging
  
- **Frontend Integration**
  - Start Test button in TestHistoryTable for draft tests
  - Stop Test button for active tests
  - Toast notifications for success/error states
  - Automatic query invalidation to refresh UI
  - Loading states during activation/deactivation
  
- **Critical Bug Fixes**
  - Fixed control data capture: now fetches live state at activation time
  - Fixed webhook HMAC: uses raw body instead of parsed JSON
  - Fixed empty description handling: always captures, checks field existence
  - Updated GraphQL query to include descriptionHtml field

## Recent Changes (October 23, 2025) - Previous

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
✅ **Test Deployment**: Live A/B test activation/deactivation with Shopify product updates
✅ **Conversion Tracking**: Webhook-based order attribution with automatic metric updates
✅ **Safe Rollback**: Complete product state restoration including edge cases

## Next Steps
- End-to-end testing: Activate test → place order → verify metrics → deactivate test
- Add automated tests for control snapshot persistence and rollback edge cases
- Monitor webhook logs to verify ongoing HMAC validation success
- Add billing integration for subscription tiers
- Create automated test scheduling
- Build advanced competitor scraping
- Optimize logging for production (consider redacting sensitive data)