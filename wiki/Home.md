# Crowd Source FAQ -- Project Wiki

A semantic search-powered FAQ and community Q&A platform. Questions are resolved through hybrid vector + keyword search. Unanswered questions flow into a community board where experts and community votes surface the best answers. Approved answers are promoted back into the official FAQ.

---

## Quick Navigation

| Page | Description |
|------|-------------|
| [Architecture](./Architecture.md) | System architecture, monorepo layout, data flow |
| [Getting Started](./Getting-Started.md) | Prerequisites, clone, install, first run |
| [Environment Variables](./Environment-Variables.md) | Complete reference for all env vars |
| [Backend API Reference](./Backend-API-Reference.md) | All API routes grouped by module |
| [Frontend Guide](./Frontend-Guide.md) | Frontend structure, build, deploy |
| [Discord Integration](./Discord-Integration.md) | Bot setup, slash commands, webhook logger |
| [Zoom Integration](./Zoom-Integration.md) | OAuth setup, webhook config, transcript extraction |
| [AI Providers](./AI-Providers.md) | Embedding + chat providers, per-pipeline config |
| [Search and Embeddings](./Search-and-Embeddings.md) | Hybrid search, vector search, Atlas setup |
| [Community and Moderation](./Community-and-Moderation.md) | Posts, comments, voting, reputation |
| [Support System](./Support-System.md) | Support tickets, golden tickets, troubleshoot flow |
| [Program Management](./Program-Management.md) | Multi-tenant batches, courses, enrollment |
| [Deployment Guide](./Deployment-Guide.md) | VPS systemd, Docker, CI/CD |
| [Database Schema](./Database-Schema.md) | MongoDB collections, indexes, relationships |
| [Configuration Reference](./Configuration-Reference.md) | config.default.yaml breakdown |
| [Production URL Checklist](./Production-URL-Checklist.md) | What to update when changing the domain |
| [Troubleshooting](./Troubleshooting.md) | Common issues and fixes |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Node.js 22, Express 4, TypeScript (ESM), Mongoose 8, Zod |
| Database | MongoDB Atlas (with Vector Search), Upstash Redis (optional) |
| Search | Hybrid vector + keyword, Reciprocal Rank Fusion |
| AI | Anthropic, OpenAI, XAI, Gemini, MiniMax (per-pipeline) |
| Integrations | Discord bot, Zoom OAuth, Google Cloud Storage |
| DevOps | Sentry, GitHub Actions CI/CD, Docker, systemd |

---

## Repository

GitHub: `vicharanashala/crowd-source-faq`
