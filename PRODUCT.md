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
- **Public FAQ portal** — no-auth browse path, batch-scoped, with popularity ranking and guest analytics.
- **Community Q&A** — posts + threaded comments + upvotes + AI auto-answer; admin escalation flow.
- **Session Support** — student issue tracker with 4-step troubleshooting checklists, evidence uploads, admin follow-ups.
- **Golden Tickets** — admin-promoted high-priority support requests with Spurti Points (SP) economy and 48h cooldown.
- **Reputation system** — points, tier ladder (newcomer → knowledge_master), auto-awarded badges.
- **Admin panel** — FAQs, users, golden tickets, support inbox, AI settings, feature flags, batches, categories.
- **Real-time observability** — tagged colored logs (`[ INFO ] [ cron ]` etc.), Discord ALERT webhook, optional Sentry.

---

## Tech stack (one-liner per layer)

| Layer | Pick |
|---|---|
| Frontend | React 18 + Vite + TS + Tailwind + Framer Motion |
| Backend | Node 22 + Express 4 + TS (ESM) + Mongoose 8 |
| DB | MongoDB Atlas (with Vector Search) + Upstash Redis (optional cache) + Cloudinary (uploads) |
| Search & AI | `mixedbread-ai/mxbai-embed-large-v1` (1024-dim, via HF Inference API; falls back to in-process ONNX), RRF, Atlas `$vectorSearch` |
| AI providers | Anthropic, OpenAI, XAI, MiniMax, Gemini, custom — admin-configurable per-pipeline |
| Infra | Sentry, Ngrok (webhook dev tunnel), Twilio (SMS), SMTP, Helmet, express-rate-limit, JWT, bcryptjs |

---

## Recent changes (v1.68)

- **Embedding model swap**: `Xenova/multi-qa-mpnet-base-dot-v1` (768-dim) → `mixedbread-ai/mxbai-embed-large-v1` (1024-dim, SOTA MTEB 64.68). Now routed through the HuggingFace Inference API when `HUGGINGFACE_API_KEY` is set, with a fall-back to the in-process ONNX pipeline. The retrieval-tuned query prompt (`Represent this sentence for searching relevant passages:`) is auto-prepended for queries via `generateQueryEmbedding()`.
- **Schema + data audit pass** — 3 critical, 4 high, 7 medium, 6 low fixes across the 29 Mongoose models. See [`docs/schema-audit.md`](docs/schema-audit.md).
- **Race-condition sweep** — all 8 `findByIdAndUpdate` + `save()` anti-patterns in user-facing controllers (comments, bookmarks, FAQ, posts, golden tickets) replaced with atomic `$set` / `$addToSet` / `$pull`.
- **Observability overhaul** — 11 named loggers (`authLog`, `adminLog`, `cronLog`, etc.), background-colored level tags (`[ INFO ]`, `[ WARN ]`, `[ ERR ]`, `[ ALRT ]`), glyph-prefixed lines, Discord webhook forwarder with exponential-backoff retry queue.
- **Live-data seed** — `npm run seed:live` populates 20 community posts, 8 support tickets, 2 zoom meetings, badge awards, search logs, and a populated leaderboard. Idempotent.

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


## Recent Feature Additions

### 1. Leaderboard 
**Goal:** Gamify the student experience and encourage active community participation by highlighting top contributors.
- **Location:** Accessible via the main navigation bar (\/leaderboard\).
- **Features:** 
  - Displays a ranked list of top community contributors.
  - Users earn "Spurti Points" for helping peers and providing accepted answers.
  - Shows the logged-in user's current rank and progress toward the next tier.
  - Time filters available (e.g., All Time, This Month, This Week).

### 2. FAQ Feedback (Thumbs Up / Thumbs Down) 
**Goal:** Empower users to rate the helpfulness of official FAQs to continuously improve the knowledge base.
- **Location:** Embedded directly at the bottom of every expanded FAQ card on the FAQ detail page.
- **Features:**
  - Users can click **Yes** or **No** to the prompt "Was this answer helpful?".
  - Clicking **Yes** registers a positive vote instantly with a friendly thank-you message.
  - Clicking **No** opens a contextual feedback form asking the user to specify the issue (e.g., "Outdated information", "Hard to understand") along with an optional text comment.

### 3. FAQ Analytics Dashboard 
**Goal:** Provide administrators with actionable insights based on user engagement and FAQ feedback.
- **Location:** Admin Panel -> FAQ Analytics (\/admin/faq-analytics\).
- **Features:**
  - **Overview Cards:** High-level metrics showing Total FAQs, Total Feedback, Helpful/Not Helpful counts, and overall Helpful Rate.
  - **Most Viewed FAQs:** Ranks FAQs by view count to show what students are struggling with the most.
  - **Recent Comments:** Streams recent contextual feedback provided by users who clicked "Thumbs Down".
  - **Needs Improvement:** Highlights FAQs with low helpfulness ratings so admins can prioritize rewrites.

### 4. ViBe Quick Access Button 
**Goal:** Provide seamless, one-click access to the external ViBe student learning portal.
- **Location:** Positioned permanently in the top navigation bar, right next to the Zoom button.
- **Features:**
  - Styled as a sleek, glowing "bubble" to match the premium dashboard aesthetics.
  - Features a pulsing indicator dot.
  - Safely opens the ViBe portal (\https://vibe.vicharanashala.ai/student\) in a secure new browser tab.

### 5. Save for Later & Personal Collections 
**Goal:** Allow users to curate their own personal library of important official FAQs and community posts.
- **Location:** A "Save for Later" button on the FAQ detail page, and a "My Saved Knowledge" page (\/saved\) in the top navigation.
- **Features:**
  - Instantly bookmark FAQs with a single click.
  - The Saved Dashboard uses a tabbed interface to separate **Community Posts** and **Official FAQs**.
  - Empty states guide new users on how to populate their collections.

