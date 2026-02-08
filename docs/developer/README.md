# Shoptimizer Developer Documentation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, Shadcn UI, Tailwind CSS, Wouter routing, TanStack Query |
| Backend | Express.js, PostgreSQL (Neon), Drizzle ORM |
| Integrations | Shopify Admin GraphQL API (October 2024), OpenAI GPT-5-mini, Shopify App Bridge |
| Theme Extension | Liquid templates, runtime.js (~5KB minified) |
| Statistics | Bayesian Thompson Sampling with CVaR risk management |

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System architecture, multi-tenant design, data flow, experiment types, security model |
| [API Reference](./api-reference.md) | Complete REST API reference for all endpoints with request/response formats |
| [Database Schema](./database-schema.md) | All tables, columns, types, constraints, relationships, and Drizzle ORM patterns |
| [A/B Testing Engine](./ab-engine.md) | Bayesian statistical engine: Beta-LogNormal model, Thompson Sampling, CVaR risk controls |
| [Theme Extension](./theme-extension.md) | Theme App Extension architecture: Liquid blocks, runtime.js, App Proxy, storefront rendering |
| [AI System](./ai-system.md) | AI recommendation engine: product scoring, GPT-5-mini integration, quota management |
| [Shopify Integration](./shopify-integration.md) | OAuth, Admin GraphQL API, webhooks, Billing API, App Proxy, GDPR compliance |
| [Deployment](./deployment.md) | Development setup, environment variables, database migrations, production checklist |

## Quick Start

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start development server (Express + Vite on port 3000)
npm run dev
```

## Project Structure

```
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── pages/           # Route pages (Dashboard, Optimizations, etc.)
│       ├── components/      # React components + Shadcn UI
│       ├── hooks/           # Custom hooks
│       └── lib/             # Utilities, query client
├── server/                  # Express.js backend
│   ├── routes.ts            # All API route handlers
│   ├── storage.ts           # IStorage interface
│   ├── db-storage.ts        # PostgreSQL implementation
│   ├── shopify.ts           # Shopify API client + session storage
│   ├── ai-service.ts        # OpenAI integration
│   ├── recommendation-engine.ts  # Product scoring algorithm
│   ├── statistics/          # Bayesian A/B testing engine
│   │   ├── models.ts        # Beta-LogNormal ARPU model
│   │   ├── policy.ts        # TTTS allocation policy
│   │   ├── risk.ts          # CVaR throttling, promotion criteria
│   │   ├── allocation-service.ts  # Orchestration service
│   │   └── sampling.ts      # XorShift32 RNG, distribution samplers
│   └── middleware/
│       └── shopify-auth.ts  # Session authentication middleware
├── shared/
│   └── schema.ts            # Drizzle ORM schema (single source of truth)
├── extensions/
│   └── cro-theme-extension/ # Shopify Theme App Extension
│       ├── assets/runtime.js
│       ├── blocks/          # Liquid templates
│       └── shopify.extension.toml
└── docs/
    ├── developer/           # This documentation
    └── user-guide/          # End-user documentation
```
