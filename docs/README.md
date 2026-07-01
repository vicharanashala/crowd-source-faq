# Shamagama Documentation

## Contents

- [Architecture Overview](ARCHITECTURE.md) — Complete codebase map: routes, controllers, models, services, utils, frontend pages, middleware, patterns, environment variables
- [Pipelines](PIPELINES.md) — All automated pipelines: auto-answer, FAQ audit, FAQ freshness, search, Zoom ingestion, support escalation; includes flows, configuration, and API endpoints
- [MCP Integration](MCP.md) — Model Context Protocol: Hermes MCP client setup, CodeGraphContext MCP server tools, adding new servers, troubleshooting
- [AI Provider System](AI_PROVIDERS.md) — Per-pipeline AI provider configuration, chatWithConfig usage, provider resolution, adding new providers
- [Backup & Restore](BACKUP.md) — MongoDB dump/restore workflow for the live data
- [Issue Tracking](ISSUES.md) — Open / resolved P0 + P1 issues
- [Context](context.md) — Original project brief, preserved for reference
- [Progress Log](PROGRESS.md) — Task and feature implementation history

### Design Blueprints (`docs/design/`)
- [Batch Management Plan](design/batch-management-plan.md) — Cohort-scoped FAQ + first-class `Category` model + guest portal design
- [Public FAQ Plan](design/public-faq-plan.md) — Anonymous-friendly FAQ portal: routes, controllers, page redesign
- [Schema-Driven Context Plan](design/schema-driven-context-plan.md) — Admin-editable per-support-category field schema, dynamic frontend inputs
- [Knowledge Lifecycle Design](design/knowledge-lifecycle-design.md) — closed-loop community Q&A FAQ pipeline
- [Multi-Program CMS Design](design/multi-program-cms-design.md) — multiple batch & category mapping
- [Wire Protocol](design/wire.md) — Low-level API event shapes

### Reference & Audits (`docs/reference/`)
- [OpenAPI Specification](reference/openapi.yaml) — Full REST API reference in Swagger/OpenAPI 3.0 format
- [Codebase Audit](reference/codebase-audit.md) — Monolithic/modular file maps & complexity metrics
- [Database Schema Reference](reference/database-schema.md) — Fields, types, enums, & TTL indexes
- [Routes Reference](reference/routes-reference.md) — Complete endpoint-to-controller mapping
- [Schema Audit](reference/schema-audit.md) — Mongoose model audit notes

### Archive & History (`docs/archive/`)
- [June 4 Temp Context](archive/june-4-temp-context.md) — Snapshots of light-mode glassmorphism and rate limiting releases

## Project Overview

Shamagama is a semantic search-powered FAQ and community Q&A platform targeting 1 million registered users. Questions are resolved through a hybrid vector + keyword search. Unanswered questions flow into a community board where subject-matter experts and community votes surface the best answers. Approved answers are promoted back into the official FAQ.

**GitHub:** https://github.com/Sarthak-Kushwah/crowd-source-faq
**Production Backend:** https://yaksha-faq-backend.vercel.app
**Production Frontend:** https://yaksha-faq-frontend.vercel.app

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Tailwind CSS, Vite |
| Backend | Node.js, Express.js, TypeScript (ES modules) |
| Database | MongoDB Atlas |
| Search | MongoDB Atlas Vector Search (cosine similarity) + MongoDB $text keyword search, merged via Reciprocal Rank Fusion |
| Embeddings | `@xenova/transformers` `Xenova/multi-qa-mpnet-base-dot-v1` (768-dim, local singleton pipeline) |
| Auth | JWT (7-day expiry) + bcrypt (salt factor 12) |
| Rate limiting | `express-rate-limit` (300 req/15min general, 1000 req/15min admin) |
| AI providers | Anthropic, OpenAI, XAI, MiniMax (auto-detected, per-pipeline override supported) |

## Key Architecture Decisions

- **Community Board purpose:** The board is not a social media feed. Its purpose is to transform community questions into verified FAQs. Every feature should ladder up to that goal.
- **Zero-human path:** TranscriptKnowledge (from Zoom transcripts) is auto-approved with inline embedding, immediately vector-searchable via RAG, without admin review.
- **Curated path:** ZoomInsights require admin review before becoming FAQs. Expert answers and peer-voted content also enter this path.
- **ESM throughout:** All backend code uses ES modules with `.js` extensions on all relative imports.
- **Soft delete:** User deletion anonymizes accounts rather than hard-deleting, preserving referential integrity and audit logs.
- **Circuit breakers:** External service calls (Zoom OAuth, AI APIs) are wrapped in circuit breakers to prevent cascading failures.
- **Per-pipeline AI config:** Each pipeline (FAQ audit, auto-answer) can override the AI provider and model independently via environment variables.

## Running Locally

```bash
# Option 1: Full-stack runner (recommended)
./run.sh

# Option 2: Manual (via pnpm workspaces)
pnpm install                  # Install workspace dependencies
pnpm dev                      # Starts both apps concurrently

# Or individual apps:
cd apps/backend && pnpm dev   # tsx server.ts on port 6767
cd apps/frontend && pnpm dev  # Vite on port 5173

# Seed data:
cd apps/backend && pnpm run seed  # 130 FAQs + users
```

### run.sh details

`run.sh` at the project root orchestrates the full local dev environment:

| Step | What it does |
|---|---|
| Env setup | Prompts for `MONGODB_URI` and `JWT_SECRET` if not in `.env`/`.env.local`, saves to `.env.local` |
| Optional vars | Prompts for `MINIMAX_API_KEY`, `NGROK_AUTH_TOKEN`, `ZOOM_CLIENT_ID/SECRET`, `REDIS_URL/TOKEN`, `SENTRY_DSN` |
| Port check | Kills any existing process on ports 5173 or 6767 before starting |
| Ngrok tunnel | Starts ngrok on port 6767 if `NGROK_AUTH_TOKEN` is set; auto-updates `ZOOM_REDIRECT_URI` in `.env.local` |
| Backend | `tsx watch server.ts` — PID written to `/tmp/yaksha-backend.pid`, logs to `logs/session_*.txt` |
| Health check | Polls `http://localhost:6767/csfaq/api/health` until MongoDB is connected (max 20s) |
| Frontend | `npm run dev` — appends to the same session log |
| Cleanup | `pkill -f "tsx.*server"` + kills PIDs on SIGINT/SIGTERM |

Session logs are stored in `logs/session_YYYY-MM-DD_HH-MM-SS.txt` with a `main_log.txt` symlink to the latest.

### Environment Variables

See [ARCHITECTURE.md](ARCHITECTURE.md#10-env-variables-reference) for the full environment variable reference including AI provider keys, Zoom OAuth credentials, Cloudinary config, and notification settings.