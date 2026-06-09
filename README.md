# Shamagama (Yaksha FAQ Portal)

Full-stack FAQ portal with semantic vector search, AI-powered community moderation, and an expert promotion layer. Built to handle 1 million registered users.

GitHub: https://github.com/vicharanashala/cs15
Refer More Here -> [`docs/`](docs/README.md)

---

## Tech Stack

### Frontend
- React 18, React Router 6
- Vite, TypeScript, Tailwind CSS (with PostCSS + Autoprefixer)
- Framer Motion (animations)
- Axios (HTTP client)
- Recharts (admin dashboard charts)
- React Testing Library, jsdom, Vitest

### Backend
- Node.js, Express 4
- TypeScript (ES modules), tsx (dev runner), nodemon
- Mongoose 8 (MongoDB ODM)
- JWT (jsonwebtoken), bcryptjs
- Helmet (security headers), CORS, Morgan (request logging), Multer (file uploads)
- Zod (runtime validation)
- express-rate-limit (rate limiting)
- dotenv (env loading)
- OpenAI SDK (direct client for non-pipeline calls)
- Vitest (testing)

### Database & Storage
- MongoDB Atlas (with Vector Search for semantic search)
- Upstash Redis (caching, optional)
- LRU cache (in-memory fallback)
- Cloudinary (file / image storage)

### Search & AI
- Xenova/transformers (`multi-qa-mpnet-base-dot-v1`, 768-dim, local)
- MongoDB Atlas Vector Search (cosine similarity)
- MongoDB $text search (keyword)
- Reciprocal Rank Fusion (hybrid merge)

### AI Providers (per-pipeline configurable)
- Anthropic (Claude)
- OpenAI (GPT)
- XAI (Grok)
- MiniMax

### DevOps & Tooling
- Sentry (error tracking, `@sentry/node`)
- Ngrok (webhook tunnel for local Zoom dev)
- Twilio (SMS notifications)
- SMTP (email notifications)
- Vitest (unit + integration tests)

---

## Quick Start

```bash
./run.sh        # Full-stack runner: env setup, ngrok tunnel, backend + frontend
# OR
cd backend && npm run dev    # tsx server.ts on :6767
cd frontend && npm run dev   # Vite on :5173
cd backend && npm run seed   # 130 FAQs + users
```

`run.sh` prompts for `MONGODB_URI` and `JWT_SECRET` on first run, then starts the full stack with session logs in `logs/`.

---

## Documentation

Full reference in [`docs/`](docs/README.md):

| Topic | File |
|---|---|
| Architecture overview | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Pipelines (auto-answer, FAQ audit, search, Zoom) | [docs/PIPELINES.md](docs/PIPELINES.md) |
| MCP integration | [docs/MCP.md](docs/MCP.md) |
| AI provider configuration | [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) |
| Project context | [docs/context.md](docs/context.md) |
| Issues tracking | [docs/issues.md](docs/issues.md) |
| Wire protocol | [docs/wire.md](docs/wire.md) |

---

## Key Features

Four flagship capabilities define this platform:

- **Zoom transcript ingestion with per-user OAuth** — Each user connects their own Zoom account via OAuth. Webhook-fired downloads parse VTT transcripts, extract Q&A pairs via AI, and dual-publish: `ZoomInsight` (admin-reviewed) and `TranscriptKnowledge` (auto-approved, immediately vector-searchable). Includes retry + dead-letter queue for failed meetings and admin backfill for historical meetings. See [docs/PIPELINES.md#4-zoom-ingestion-pipeline](docs/PIPELINES.md).

- **AI auto-answer pipeline for community posts** — A scheduler (every 24h) finds unanswered posts, searches the knowledge base, and either auto-posts an answer (≥0.85 confidence), queues for human review (0.60–0.84), or escalates (<0.60 or sensitive topics). Three AI providers compete: per-pipeline configurable. See [docs/PIPELINES.md#1-auto-answer-pipeline](docs/PIPELINES.md).

- **FAQ audit pipeline** — A scheduler (every 6h) re-evaluates approved FAQs against the live knowledge base (TranscriptKnowledge + ZoomInsights). Uses AI to judge correctness and emits verdicts: `correct` (≥0.80), `drift_detected` (0.60–0.79), `contradiction` (<0.60), or `stale` (no KB context + old + never verified). Flagged FAQs land in `/admin/faqs/review` with `reviewStatus='pending_review'`, `flagType='auto'`, and an incremented `reviewCycle`. See [docs/PIPELINES.md#2-faq-audit-pipeline](docs/PIPELINES.md).

- **Soft-delete with anonymization** — Deleting a user never hard-deletes their records. The account is anonymized: `isDeleted=true`, `deletedAt` timestamp, `name` becomes `Deleted User`, `email` is rewritten to a non-routable placeholder, `password` is replaced with a random UUID to break login. All posts, comments, votes, reputation logs, and audit trail entries remain intact and queryable — preserving referential integrity, attribution history, and regulatory compliance.

Other features:

- **Semantic hybrid search** — vector search (768-dim) + keyword search merged via Reciprocal Rank Fusion
- **Community board** — posts, comments, threaded replies, upvotes, bookmarks, expert verification
- **Reputation system** — points for accepted answers, badges, leaderboard
- **SpillTheTea notifications** — event-driven notification system

---

## Admin Dashboard

The admin panel at `/admin` (mounted at `/api/admin/*`) provides full operational visibility and control:

### Telemetry & Analytics
- **Live stats** — `/api/admin/stats`: counts of users, FAQs, community posts, comments, recent activity
- **FAQ growth chart** — `/api/admin/faq-growth`: time-series of FAQ creation
- **Top categories** — `/api/admin/top-categories`: most-viewed FAQ categories
- **Search insights** — `/api/admin/search-insights`: aggregated search analytics (popular queries, no-result queries, success rate)
- **User activity chart** — `/api/admin/user-activity-chart`: daily active users, signups, post activity
- **Activity feed** — `/api/admin/activity-feed`: chronological admin-event log
- **Failed-query analytics** — `/api/analytics/failed-queries`: top 30 zero-result searches in the last 7 days (catches knowledge-base gaps)
- **Unresolved search tracker** — `/api/analytics/`: queries with no FAQ match (admin can promote them to FAQs)

### Operational Pages
- **AdminDashboard** — overview cards with animated count-up + trend badges
- **AdminFAQs** — full FAQ CRUD, review queue for flagged content
- **FaqReview** — peer-vote freshness + AI-audit flagged FAQs
- **AdminFAQAudit** — AI audit results (correct / drift_detected / contradiction / stale)
- **AdminAutoAnswerQueue** — review queue for AI-suggested answers
- **AdminCommunity** — post management, comments moderation
- **AdminUsers** — user listing, role management, ban / suspend / warn actions
- **AdminModeration** — moderation logs, ban queue
- **AdminZoomMeetings** — Zoom meeting records, retry/DLQ management, backfill
- **AdminZoomInsights** — review AI-extracted Q&A from transcripts, convert to FAQ
- **AdminLeaderboard** — reputation leaderboard with badge progress
- **AdminUnresolvedSearch** — track and resolve search queries with no FAQ match
- **AdminAISettings** — per-pipeline AI provider/model configuration
- **AdminSettings** — app-wide settings, 2FA setup
- **AdminLogin** — dedicated admin login with 2FA enforcement

### Moderation
- **Moderation logs** — every ban, suspend, warn, soft-delete recorded with admin id, reason, timestamp
- **Reputation logs** — every point change (+2 post upvote, +5 comment accepted) recorded for audit

### AI Pipeline Visibility
- **PipelineResult collection** — unified log of every auto-answer and audit outcome (30-day TTL)
- **Zoom health** — `/api/zoom/health`: OAuth circuit state, API circuit state, cache hit rate, failing-meetings count, dead-letter count, pending-retry count
- **Prometheus metrics** — `/api/metrics`: search latency, cache hits, RAG duration, queue depth

---

## User Experience

The user-facing app (`/`, `/faq`, `/community`, `/saved`, `/account`) gives authenticated users full participation in the knowledge loop.

### Pages
- **HomePage** — hero search bar (floating bottom-center glassmorphism), trending FAQs, category grid
- **FAQPage** — FAQ category browser with full-text + semantic search
- **CommunityPage** — community Q&A board with stats banner, post cards, sort + filter
- **SavedKnowledgePage** — bookmarked FAQs and community posts in one place
- **AccountPage** — profile management, Zoom OAuth connect/disconnect, manual transcript upload
- **LeaderboardPage** — public reputation leaderboard

### Ask the Community
- **Post creation** — `/api/community/` with Zod-validated title + body
- **Duplicate detection** — `/api/community/check-duplicate` (debounced 500ms, min 10 chars) shows clickable banner when similar FAQ exists, blocks form submission on match
- **Tags** — auto-normalized to lowercase for consistent search
- **Attachments** — Cloudinary image uploads inline with the post body

### Read & Engage
- **Search** — `/api/search` (public): hybrid vector + keyword, RRF-merged, LRU + Redis cached
- **Semantic suggest** — `/api/search/suggest` (public, rate-limited 30/min)
- **Post detail modal** — full thread with status pill, lifecycle badge, vote counts, bookmark, share, attachments lightbox, comments
- **Comment thread** — nested comments (max depth rendered), upvote/downvote with optimistic UI
- **Accept answer** — post author can mark a comment as the accepted answer (locks verified/expert comments from edit)
- **Edit & delete comments** — author can edit/delete own comments; admins can delete any
- **Upvote posts** — `/api/community/:id/upvote` with reputation farming prevention (reverses +2 on removal)
- **Bookmark** — `/api/community/:id/bookmark` toggle; bookmarks appear at `/saved`
- **Share** — clipboard copy with confirmation toast
- **Report** — flag inappropriate posts and FAQs for admin review
- **Flag outdated** — `/api/faq/:id/flag` for FAQs that are no longer accurate

### Notifications
- **In-app bell** — `NotificationBell` component with unread count
- **SpillTheTea events** — `post_answered`, `post_deleted`, `post_answered_user` etc. push to relevant users
- **Notification settings** — per-event-type opt-in
- **Email/SMS** — Twilio + SMTP for out-of-app delivery

### Reputation
- **Points** — +2 per post upvote, +5 per accepted comment, -2/-5 on removal
- **Badges** — earned at thresholds (Newcomer, Contributor, Expert, etc.)
- **Promotion to expert** — automatic review at reputation threshold; peers vote
- **Leaderboard** — public ranking at `/leaderboard`

### AI Assistant (`/ask-ai`)
- **RAG-powered Q&A** — `/api/ask-ai` (public, 5/day anonymous quota via localStorage)
- **Authenticated** — unlimited usage tied to account
- **Sources cited** — every answer returns the top-k source FAQs / transcript knowledge used

### Zoom Integration
- **Per-user OAuth** — connect your own Zoom account from `/account`
- **Manual upload** — upload `.vtt`, `.txt`, or paste raw text directly
- **Status card** — shows last synced timestamp, OAuth health, failing-meeting count
- **No admin required** — users own their ingestion flow end-to-end

### Search Feedback
- **"Report missing FAQ"** — when no results match, submit a query for admin follow-up
- **Zero-result tracker** — admins can promote popular no-result queries to FAQs

---

## Project Structure

```
shamagama/
├── backend/           # Express + TypeScript API
├── frontend/          # React + Vite SPA
├── docs/              # Full documentation
├── run.sh             # Local dev runner (env setup, ngrok, backend + frontend)
└── logs/              # Session logs from run.sh
```

---

## Environment Variables

Required: `MONGODB_URI`, `JWT_SECRET`
Optional: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY` / `MINIMAX_API_KEY` (AI providers), Zoom OAuth credentials, Cloudinary, Sentry, Twilio, SMTP, Upstash Redis

See [docs/ARCHITECTURE.md#10-env-variables-reference](docs/ARCHITECTURE.md#10-env-variables-reference) for the full list.

---

## License

[MIT](./LICENSE) © 2026 vicharanashala
