# Shamagama (Yaksha FAQ Portal)

Full-stack FAQ portal with semantic vector search, AI-powered community moderation, and an expert promotion layer. Built to handle 1 million registered users.

GitHub: https://github.com/vicharanashala/crowd-source-faq
Full reference: [`docs/`](docs/README.md) · [Contributing](./CONTRIBUTING.md) · [Code of Conduct](./CODE_OF_CONDUCT.md) · [License](./LICENSE)

---

## Vision

**Automate the FAQ lifecycle end-to-end. Zero people in the loop. Reduce the operational FAQ culture.**

Every question a user has has been asked before — and most will be asked again. The right answer should be there before the user finishes typing. The platform achieves this through four zero-touch pillars:

- **Zero-touch ingestion** — Zoom meetings, webhooks, and manual uploads feed the knowledge base without human scheduling, categorising, or approval.
- **Zero-touch answering** — A 24-hour scheduler matches unanswered posts against the knowledge base; high-confidence matches auto-post, low-confidence escalate to humans.
- **Zero-touch quality control** — Approved FAQs are re-evaluated every 6 hours; drift, contradictions, and staleness are detected and flagged automatically.
- **Zero-touch user lifecycle** — Deletion is anonymisation, not destruction. Reputation, attribution, and audit history persist.

The platform is the operator. People handle exceptions, not the steady state.

---

## About

Samagama (internally "Yaksha FAQ Portal") turns an organisation's accumulated conversations into a searchable, self-maintaining FAQ. It combines hybrid vector + keyword search with a community Q&A board and a fully automated ingestion pipeline that pulls transcripts from Zoom, extracts Q&A with AI, and indexes them for retrieval in seconds.

Built for organisations whose community generates more questions than a human team can answer — student cohorts, open-source projects, internal forums, customer-success communities. Target scale: 1 million registered users with constant conversational input.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture deep-dive and [docs/PIPELINES.md](docs/PIPELINES.md) for pipeline internals.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Framer Motion, Axios, Recharts, React Router 6, Vitest |
| Backend | Node.js, Express 4, TypeScript (ESM), Mongoose 8, JWT, bcryptjs, Helmet, CORS, Morgan, Multer, Zod, express-rate-limit, dotenv, OpenAI SDK, Vitest |
| Database & Storage | MongoDB Atlas (with Vector Search), Upstash Redis (optional), LRU cache, Cloudinary |
| Search & AI | Xenova/transformers (768-dim local embeddings), Atlas Vector Search, $text search, Reciprocal Rank Fusion |
| AI Providers | Anthropic, OpenAI, XAI, MiniMax (per-pipeline configurable) |
| DevOps | Sentry, Ngrok (local webhook tunnel), Twilio (SMS), SMTP, Vitest |

---

## Quick Start

```bash
./run.sh        # Full-stack runner: env setup, ngrok, backend + frontend
```

`run.sh` prompts for `MONGODB_URI` and `JWT_SECRET` on first run, then saves them to `backend/.env.local`. The script will not overwrite existing values. Session logs are written to `logs/session_*.txt`.

---

## Key Features

Key platform capabilities include:

- **Zoom Transcript Pipeline** — Automates transcript ingestion from recorded meetings via per-user Zoom OAuth. Webhook-fired integrations parse transcripts, extract QA pairs via AI, and publish them to admin review queues and auto-approved knowledge bases for immediate retrieval. See [docs/PIPELINES.md#4-zoom-ingestion-pipeline](docs/PIPELINES.md).
- **AI Auto Answer Pipeline** — Processes unanswered community posts against all available knowledge sources in parallel. Employs AI to automatically post high-confidence answers while routing lower-confidence results to moderator queues for human review. See [docs/PIPELINES.md#1-auto-answer-pipeline](docs/PIPELINES.md).
- **FAQ Audit Pipeline** — Periodically evaluates published FAQs against the live knowledge base. Detects content drift, staled facts, or direct contradictions, and automatically flags affected entries for moderator re-evaluation. See [docs/PIPELINES.md#2-faq-audit-pipeline](docs/PIPELINES.md).
- **FAQ Freshness Pipeline** — Automatically manages content lifecycle based on custom validity tiers (evergreen, seasonal, and volatile). Stale FAQs trigger peer-review windows where the community can vote to verify accuracy or request updates. See [docs/PIPELINES.md#7-faq-freshness-pipeline](docs/PIPELINES.md).
- **Golden Ticket Escalation** — Enables premium users to spend earned reputation points (Spurti Points) to bump critical, unresolved questions to the top of the admin support queue for prioritized response.
- **Batch Management** — Scopes categories, FAQs, and portal analytics to specific organizational cohorts, academic terms, or programs. Supports public guest access for explore-and-browse queries without requiring user accounts. See [docs/BATCH_MANAGEMENT_PLAN.md](docs/BATCH_MANAGEMENT_PLAN.md).
- **Dynamic Context Schema** — Allows administrators to define and configure custom context form fields per support category. The user interface dynamically updates form layouts from live configurations, avoiding code redeployments. See [docs/SCHEMA_DRIVEN_CONTEXT_PLAN.md](docs/SCHEMA_DRIVEN_CONTEXT_PLAN.md).
- **Soft Delete System** — Deactivates user accounts and anonymizes personal details while preserving historical contributions. Ensures database integrity, comment attribution history, and compliance with data deletion protocols.
- **Community Platform** — Facilitates collaborative learning and knowledge sharing through interactive Q&A discussion boards and threaded discussions. Users can engage via voting, while a structured reputation system with badges and leaderboards motivates active community participation.
- **Redis Caching** — Speeds up portal response times by caching frequently accessed FAQ content, system analytics, and search results. This reduces database load and ensures smooth scalability and performance under heavy traffic. See [docs/REDIS_CONFIG.md](docs/REDIS_CONFIG.md).
- **Voice Search** — Enables a faster and more accessible search experience by allowing users to input queries via spoken natural language. Spoken queries integrate directly with semantic search to locate precise answers instantly. See [docs/VOICE_SEARCH.md](docs/VOICE_SEARCH.md).
- **Search Alias Engine** — Improves search quality by automatically expanding abbreviations and matching synonyms (e.g., `noc` ↔ `No Objection Certificate` and `sp` ↔ `spurti points`). This ensures users discover relevant FAQs even when using varied vocabulary. See [docs/ALIAS_EMBEDDINGS.md](docs/ALIAS_EMBEDDINGS.md).
- **Admin Analytics Dashboard** — A highly scalable telemetry console that allows administrators to monitor KPI cards, view search trends, analyze user activity, and explore category insights. It enables quick discovery of popular searches, failed searches monitoring, program or batch filtering, time range adjustments, and CSV report exports to drive operational improvement. See [docs/ADMIN_ANALYTICS.md](docs/ADMIN_ANALYTICS.md).

Other capabilities: semantic hybrid search, SpillTheTea event-driven notifications, per-user Zoom OAuth, RAG-powered `/ask-ai` assistant with image + file attachments, soft user lifecycle, experimental feature flags, support tickets (troubleshoot → admin triage → resolution).

---

## Admin Dashboard

The admin panel at `/admin` (mounted at `/api/admin/*`) provides administrative oversight and operational control. Administrators have access to:

- **Admin Console** — Provides comprehensive management capabilities including the Dashboard, Analytics, FAQ Management, Community Moderation, AI Queue, User Management, Leaderboards, Search Monitoring, and Settings.
- **Operational pages** — AdminDashboard, AdminAnalytics, AdminFAQs, FaqReview, AdminFAQAudit, AdminAutoAnswerQueue, AdminCommunity, AdminUsers, AdminModeration, AdminZoomMeetings, AdminZoomInsights, AdminLeaderboard, AdminUnresolvedSearch, AdminAISettings, AdminSettings, AdminLogin
- **Moderation** — every ban, suspend, warn, and soft-delete recorded in `ModerationLog`; every reputation change (+2 upvote, +5 accepted answer, -2/-5 on removal) recorded in `ReputationLog`
- **AI pipeline visibility** — unified `PipelineResult` collection (30-day TTL) for both auto-answer and audit outcomes; Zoom health endpoint reports OAuth/API circuit state, cache hit rate, failing-meetings count, dead-letter count, pending-retry count; Prometheus metrics at `/api/metrics` (search latency, cache hits, RAG duration, queue depth)

For the full admin route map and per-page behaviour, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## User Experience

The user-facing app (`/`, `/faq`, `/community`, `/saved`, `/account`, `/leaderboard`) gives authenticated users full participation in the knowledge loop:

- **Discover** — hybrid semantic + keyword search at `/api/search` (public), semantic suggestions at `/api/search/suggest`, category browsing
- **Ask the community** — post creation with Zod validation, debounced duplicate detection against the FAQ base (banner + block on match), auto-normalised tags, Cloudinary image attachments
- **Engage** — upvotes with reputation-farming prevention (reverses on removal), bookmarks at `/saved`, nested comment threads with optimistic UI, accept-answer (locks verified/expert comments from edit), edit/delete own comments, share via clipboard, report and flag-outdated
- **Notifications** — in-app bell, SpillTheTea event stream (`post_answered`, `post_deleted`, etc.), per-event-type settings, email + SMS delivery
- **Reputation** — points for accepted answers, badges at thresholds, expert promotion by peer vote, public leaderboard
- **AI assistant** — RAG-powered `/ask-ai` (5/day anonymous quota via localStorage, unlimited for authenticated users), sources cited, **accepts file and image attachments (max 4 files, 10 MB each) — images sent as vision input, text files inlined into the prompt**
- **Zoom integration** — per-user OAuth from `/account`, manual `.vtt` / `.txt` / raw-text upload, last-synced status card, no admin required
- **Search feedback** — "Report missing FAQ" on zero results, admin-promotable to FAQ

For per-route behaviour and field schemas, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Project Structure

```
Shamagama/
├── backend/           # Express + TypeScript API
├── frontend/          # React + Vite SPA
├── docs/              # Full documentation      
└── run.sh             # Local dev runner (env setup, ngrok, backend + frontend)
```

---

## Environment Variables

Required: `MONGODB_URI`, `JWT_SECRET`
Optional: at least one AI provider key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY` / `MINIMAX_API_KEY`), Zoom OAuth credentials, `CLOUDINARY_*`, `SENTRY_DSN`, Twilio + SMTP for notifications, `UPSTASH_REDIS_*`

See [docs/ARCHITECTURE.md#10-env-variables-reference](docs/ARCHITECTURE.md#10-env-variables-reference) for the full list.

---

## License

[MIT](./LICENSE) © 2026 vicharanashala
