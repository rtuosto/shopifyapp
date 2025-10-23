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
- Express.js server
- Shopify Admin GraphQL API integration
- OpenAI GPT-4 for AI recommendations (via Replit AI Integrations)
- In-memory storage (can be upgraded to PostgreSQL)

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
- `GET /api/dashboard` - Get dashboard summary

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

## Development

The app runs in Shopify's embedded iframe and uses App Bridge for authentication and navigation. To run:

```bash
npm run dev
```

## Recent Changes (October 23, 2025)
- Implemented full-stack architecture with Shopify integration
- Created AI recommendation engine with OpenAI
- Built test preview system with device toggles
- Added comprehensive data schema for products, tests, and metrics
- Integrated Shopify Admin GraphQL API

## Next Steps
- Deploy test changes to actual Shopify products
- Implement webhook handlers for order tracking
- Add billing integration for subscription tiers
- Create automated test scheduling
- Build advanced competitor scraping