# Architecture

## Overview

The project is a full-stack TypeScript monorepo that combines a backend API server with a compiled single-page application (SPA) frontend. In production, the backend serves the frontend as static assets -- there is no separate frontend server.

## Monorepo Layout

```
crowd-source-faq/
  apps/
    backend/                   # Express API server (TypeScript, ESM)
      src/
        bootstrap/             # App creation, middleware, routes registration
        config/                # YAML config loader, Zod schema, env validator
        core/                  # Scheduler (cronManager)
        integrations/          # Discord, Zoom, GCS, Cloudinary
        middleware/            # Auth, rate limiting, validation
        models/                # AdminAuditLog, AdminConfig, AdminSession
        modules/               # Feature modules (see below)
        scripts/               # Retention policies, migrations
        types/                 # TypeScript type declarations
        utils/                 # AI, auth, HTTP, jobs
        server.ts              # Entry point
        env.ts                 # dotenv loader
      config.default.yaml      # All tunable defaults
      Dockerfile               # Multi-stage unified build
    frontend/                  # React SPA (Vite)
      src/
        admin/                 # Admin panel pages
        components/            # Reusable UI components
        context/               # React context providers
        hooks/                 # Custom hooks
        pages/                 # Route pages
        routes/                # React Router configuration
        styles/                # CSS/Tailwind styles
        utils/                 # Frontend utilities
  packages/
    types/                     # @csfaq/types -- shared TypeScript interfaces
    utils/                     # @csfaq/utils -- pure utility functions
    validation/                # @csfaq/validation -- shared Zod schemas
    config/                    # @csfaq/config -- shared tooling configs
  .github/workflows/           # CI/CD pipelines
  infra/                       # Infrastructure scripts (GCP setup)
  scripts/                     # Development and migration scripts
  wiki/                        # This documentation
```

## Backend Module Structure

Each module under `apps/backend/src/modules/` follows this pattern:

| Module | Purpose |
|--------|---------|
| `admin` | Admin dashboard, audit logs, config, auto-answer, mentors, timeline |
| `ai` | Ask-AI endpoint, auto-answer scheduler, FAQ audit |
| `auth` | User registration, login, JWT, sessions, password reset |
| `community` | Community posts, comments, voting, escalation |
| `faq` | FAQ CRUD, freshness review, public FAQ, popularity |
| `health` | Health check endpoints |
| `knowledge` | Knowledge base documents, document pipeline |
| `moderation` | Content moderation, reputation system |
| `notification` | In-app notifications, TEA (Toast Event API) |
| `program` | Multi-tenant programs, batches, courses, enrollment |
| `search` | Hybrid search, analytics, trending queries |
| `support` | Support tickets, golden tickets, troubleshoot flow |
| `upload` | Image upload (GCS) |
| `zoom` | Zoom OAuth, webhooks, meeting processing |

## Data Flow

### Question Resolution Flow

1. User submits a question via the search bar
2. Backend performs hybrid search (vector similarity + keyword matching)
3. Results are ranked using Reciprocal Rank Fusion (RRF)
4. If a match is found above the confidence threshold, the answer is returned
5. If no match is found, the question is posted to the community board
6. Community members can answer; votes surface the best responses
7. Accepted answers are promoted to the official FAQ

### Zoom Ingestion Pipeline

1. Zoom webhook fires when a recording is ready
2. Backend downloads the transcript (VTT format)
3. AI extracts Q&A pairs from the transcript
4. Extracted FAQs are embedded and indexed for search
5. Admin reviews and approves extracted content

### Auto-Answer Pipeline

1. Cron scheduler runs every 6 hours
2. Scans unanswered community posts
3. For each post, queries the FAQ knowledge base via embeddings
4. High-confidence matches (>0.85) are auto-posted as answers
5. Low-confidence matches are queued for human review

## Request Lifecycle

1. Request arrives at Express
2. Middleware chain: DB connection check, request ID, logging, CORS, Helmet, body parsing, cookie parsing
3. Router dispatches to the appropriate module controller
4. Controller validates input (Zod), executes business logic
5. Response sent with appropriate status code
6. Request logged (structured JSON)
7. ALERT-level events forwarded to Discord webhook

## API Base Path

All API routes are mounted under `/csfaq/api/`. The frontend SPA is served at `/csfaq/`. This base path is consistent across development and production.
