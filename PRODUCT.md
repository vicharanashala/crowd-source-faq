# Crowd Source FAQ — Product Overview

A self-maintaining FAQ + community Q&A portal. Combines semantic vector search, AI-powered ingestion, and an expert promotion layer so the right answer is in front of a user before they finish typing.

---

## What it does

Four zero-touch pillars, in order of automation:

1. **Ingest** — Zoom recordings, manual uploads (PDF/DOCX/XLSX/images), and webhooks feed a knowledge base. No human scheduling or categorising.
2. **Answer** — Unanswered community posts are auto-matched against the knowledge base every 24h via semantic search. High-confidence matches are auto-posted; low-confidence escalate to admins.
3. **Quality** — Approved FAQs are re-evaluated every 6h for drift, contradictions, and staleness. Drift is auto-flagged.
4. **Lifecycle** — User deletion is anonymisation, not destruction. Reputation, attribution, and audit history persist.

---

## Key features

- **Hybrid search** — vector + keyword + Reciprocal Rank Fusion. Auto-falls-back to keyword when vector search is empty.
- **AI-Clarifications** — Generates "Did you mean?" search suggestions automatically if search results are empty.
- **Interactive Practice Quizzes** — Dynamic AI category quizzes with progress trackers, immediate option highlights, and score completion screens.
- **Multi-Language Translation** — Localizes FAQ pages instantly (English, Hindi, Spanish, French, Telugu) cached in Redis, with matching local SpeechSynthesis voices.
- **Weekly Digest Generator** — Mentors can build, preview, edit, and copy formatted Markdown digests/newsletters summarizing weekly activity.
- **Public FAQ portal** — no-auth browse path, batch-scoped, with popularity ranking and guest analytics.
- **Community Q&A** — posts + threaded comments + upvotes + AI auto-answer; admin escalation flow.
- **Pre-emptive Collision Warnings** — Dialogue editor splits into split-screen when matching duplicates are detected.
- **Session Support** — student issue tracker with 4-step troubleshooting checklists, evidence uploads, admin follow-ups.
- **Hardware & Network Diagnostics** — Step 2 checklists trigger client camera, mic, battery, and VPN-latency check.
- **Golden Tickets** — admin-promoted high-priority support requests with Spurti Points (SP) economy and 48h cooldown.
- **Reputation system** — points, tier ladder (newcomer → knowledge_master), auto-awarded badges.
- **Admin panel** — FAQs, users, golden tickets, support inbox, AI settings, feature flags, batches, categories.
- **Real-time observability** — tagged colored logs (`[ INFO ] [ cron ]` etc.), Discord ALERT webhook, optional Sentry.
- **Email Domain Restriction** — Gating self-registration to a configured list of email domains (e.g. `@university.edu`), acting as a spam guard.
- **Bulk FAQ CSV Import** — Client-side CSV parser that maps, validates, and bulk-inserts FAQs into the system in a single request.
- **AI Answer Co-pilot** — Refines user's draft answer in community comments using retrieved RAG context.
- **AI-Powered Content Moderation** — Scans new posts/comments for toxicity/spam on submission and auto-hides violations.
- **AI FAQ Auto-Translation Pre-Generation** — Pre-translates and caches FAQs in all supported languages immediately upon creation/approval.
- **AI Search Query Expander** — Uses LLM to expand search queries with synonyms and keyphrases to increase semantic search recall.

---

## Tech stack (one-liner per layer)

| Layer | Pick |
|---|---|
| Frontend | React 18 + Vite + TS + Tailwind + Framer Motion |
| Backend | Node 22 + Express 4 + TS (ESM) + Mongoose 8 |
| DB | MongoDB Atlas (with Vector Search) + Upstash Redis (vector caching & translations) + Cloudinary (uploads) |
| Search & AI | `mixedbread-ai/mxbai-embed-large-v1` (1024-dim, via HF Inference API; falls back to in-process ONNX), RRF, Atlas `$vectorSearch` |
| AI providers | Anthropic, OpenAI, XAI, MiniMax, Gemini, custom — admin-configurable per-pipeline |
| Infra | Sentry, Ngrok (webhook dev tunnel), Twilio (SMS), SMTP, Helmet, express-rate-limit, JWT, bcryptjs |

---

## Recent changes (v2.0.0)

- **AI Category Quizzes & Flashcards** — Dynamically compiles interactive MCQs to test user knowledge inside category views.
- **Newsletter digests** — Exposes `/admin/digest` to automatically assemble Markdown digests from new FAQs, community threads, and search logs.
- **Dynamic Translation & Audio Localizations** — Swaps details instantly to English, Hindi, Spanish, French, or Telugu, cached in Redis for 30 days, adjusting browser SpeechSynthesis speaking voice dynamically.
- **Submission Collision Warning** — Compares titles/descriptions during drafting to warn users about duplicate threads in real-time.
- **Diagnostics Checklist** — Integrates browser hardware (mic/camera) and server-vpn indicators directly inside the troubleshooting wizard.
- **Semantic Vector Caching** — Added `ioredis` cache layer bypassing Hugging Face API vector generation.
- **Aggregated Analytics** — Added `DashboardMetric` tracking daily counts atomically on write, accelerating admin dashboard loading.
- **Drift-Guard cron** — Registers weekly cron that automatically audits approved FAQs for deprecations or drift.
- **Build Cleanups** — Removed dead code pages from the bundle compiler.
- **Email Domain Restriction (P1)** — Added allowedDomains configuration array to the controlled registration singleton, allowing admins to restrict access to specific organization domains.
- **Bulk CSV FAQ Import (P2)** — Introduced POST `/api/faq/bulk-import` and a client-side CSV paste-and-parse interface on the Admin FAQ page for importing batches of questions.
- **AI/ML Core Enhancements (v2.2.0)**:
  - *AI Answer Co-pilot*: Integrated a RAG-powered co-pilot text refiner and previewer in the community thread detail Q&A comment form.
  - *AI Content Moderation*: Automatic toxicity and spam gating on post and comment creation.
  - *AI FAQ Auto-Translation Pre-Generation*: Translates newly approved FAQs into Hindi, Spanish, French, and Telugu immediately to populate Redis caches.
  - *AI Search Query Expander*: Automatically enriches brief user queries with technical synonyms before hybrid database text search.
- **AI/ML Core Enhancements (v2.1.0)**:
  - *Cross-Encoder Search Reranker*: Added Cross-Encoder LLM reranking to refine hybrid candidate queries and boost precision.
  - *Hallucination Guard*: Implemented LLM-as-a-Judge faithfulness check in the auto-answer pipeline to prevent hallucinated answers.
  - *Voice Search integration*: Added Web Speech API mic button for local/server speech-to-text search.
  - *Topic Map Graph*: Visualized FAQ knowledge base using an interactive 2D node map (`/explore/map`).
  - *Student Telemetry & Distress Index*: Created user telemetry tracking to compute distress indices.
  - *Smart Expert Routing*: Dynamically routes new community questions to top contributors.
  - *Hybrid TTS*: Synthesizes and streams FAQ audio with local web speech fallback.
  - *Embedded Code Sandboxes*: Allows inline Javascript/HTML execution for coding FAQs.

---

## Reference docs

| Topic | File |
|---|---|
| Full architecture deep-dive | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| AI provider configuration | [`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md) |
| Pipelines (Zoom / doc / AI extraction) | [`docs/PIPELINES.md`](docs/PIPELINES.md) |
| Batch + category scoping | [`docs/BATCH MANAGEMENT_PLAN.md`](docs/BATCH%20MANAGEMENT_PLAN.md) |
| Public FAQ page design | [`docs/PUBLIC_FAQ_PLAN.md`](docs/PUBLIC_FAQ_PLAN.md) |
| Schema-driven context fields | [`docs/SCHEMA_DRIVEN_CONTEXT_PLAN.md`](docs/SCHEMA_DRIVEN_CONTEXT_PLAN.md) |
| Public API surface | [`docs/openapi.yaml`](docs/openapi.yaml) |
| Backup strategy | [`docs/BACKUP.md`](docs/BACKUP.md) |
| MCP server integration | [`docs/MCP.md`](docs/MCP.md) |
| Schema + data audit (v1.68) | [`docs/schema-audit.md`](docs/schema-audit.md) |
| Code audit (issues tracker) | [`docs/issues.md`](docs/issues.md) |
| Progress log | [`docs/progress.md`](docs/progress.md) |
| Wire diagram | [`docs/wire.md`](docs/wire.md) |
| Context | [`docs/context.md`](docs/context.md) |
| Project README | [`README.md`](README.md) |
| Contributing | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Code of Conduct | [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |
| License | [`LICENSE`](LICENSE) |

---

## Useful npm scripts (backend)

| Script | What it does |
|---|---|
| `npm start` | Run backend (tsx server.ts) |
| `npm run dev` | Run with watch |
| `npm run seed` | Seed 130 FAQs from `faqs.json` |
| `npm run seed:live` | Seed realistic test data (posts, tickets, badges, zoom, etc.) |
| `npm run audit:data` | Read-only data-quality report |
| `npm run cleanup:seed` | Undo `seed:live` |
| `npm run cleanup:orphan-notifications` | Delete orphan notifications |
| `npm run recompute:tier` | Fix stale user `tier` values |
| `npm run backfill:embeddings` | Regenerate all stored vectors with the current model |
| `npm run create:vector-index -- --drop` | Drop + recreate the Atlas vector search index |
| `npm run migrate` | Add / update Mongo indexes |

---

## Repository

- GitHub: https://github.com/vicharanashala/crowd-source-faq
- License: see [`LICENSE`](LICENSE)
- Branch: `main` (active), with `MCSFAQ/main-v2` for the next iteration
