# Project Context — Crowd Source FAQ FAQ & Community Platform

> Semantic search-powered FAQ and community Q&A platform targeting **10,00,000 users (10 lakh / 1 million)**.
> Project name: **Crowd Source FAQ** (also known internally as "yaksha-faq-portal").

---

## 1. Overview

**What it does:** Resolves FAQs and manages community Q&A for internship students at scale. Users search for answers semantically; unanswered questions flow into a community board; admins moderate and respond.

**Target scale:** 10 lakh (1 million) registered users, high concurrent search load.

> **Current status:** MVP complete. TypeScript migration done. Local embeddings (`@xenova/transformers`) working. 130 FAQs seeded. Admin features (role edit, notification persistence) implemented. Notification system live. Vercel-deploy skill created. Production: Atlas autoEmbed (Option B) pending. Runtime smoke test pending Atlas setup.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 18, Tailwind CSS, Vite | SPA; no SSR; deployed on Vercel |
| Backend | Node.js, Express.js | ES modules; deployed on Vercel serverless |
| Database | MongoDB Atlas | M0 free tier at dev; M10+ for production |
| Search | MongoDB Atlas Vector Search (cosine similarity) + MongoDB $text keyword search | Hybrid merge via Reciprocal Rank Fusion (RRF_K=60) |
| Embeddings | **`@xenova/transformers` `Xenova/multi-qa-mpnet-base-dot-v1`** (768-dim, singleton pipeline) | Local dev: no API key needed. Production: switch to Atlas autoEmbed (Option B) |
| Auth | JWT (7d expiry) + bcrypt (salt factor 12) | Passwords hashed pre-save via Mongoose pre-hook |
| Rate limiting | `express-rate-limit` | 300 req/15min general; 1000 req/15min admin routes |
| Security | Helmet.js, CORS (whitelist + Vercel subdomain auto-allow) | |

---

## 3. Project Structure

```
crowd-source-faq/
├── apps/
│   ├── backend/               # Express + TypeScript API
│   │   ├── src/
│   │   │   ├── bootstrap/     # App startup & routes registration
│   │   │   ├── config/        # Environment and DB loaders
│   │   │   ├── core/          # Shared core infrastructure
│   │   │   ├── integrations/  # Zoom, Discord, and Cloudinary integrations
│   │   │   ├── middleware/    # Auth, RBAC, and validation middlewares
│   │   │   ├── modules/       # Modular features (FAQ, Community, Search, Auth, etc.)
│   │   │   │   ├── admin/     # Admin routes and controller
│   │   │   │   ├── community/ # Community posts & comments controller and routes
│   │   │   │   ├── faq/       # FAQ logic, freshness & review queues
│   │   │   │   └── search/    # Hybrid semantic vector search controller and routes
│   │   │   ├── scripts/       # Seeding and migration scripts
│   │   │   └── utils/         # Common utility helpers
│   │   ├── Dockerfile
│   │   └── package.json
│   └── frontend/              # React + Vite SPA
│       ├── src/
│       │   ├── admin/         # Admin pages and sub-components
│       │   ├── components/    # Reusable UI & modular feature components (FAQ, community, search)
│       │   ├── context/       # Program, Auth, and Batch React contexts
│       │   ├── hooks/         # Custom React hooks (notifications, auth, etc.)
│       │   ├── pages/         # User pages (HomePage, FAQPage, CommunityPage, etc.)
│       │   ├── routes/        # App routing definitions and route guards
│       │   └── styles/        # Global styles & Tailwind tokens
│       ├── index.html
│       └── package.json
├── packages/                  # Workspace shared packages
│   ├── config/                # Shared typescript & workspace configs
│   ├── types/                 # Shared TypeScript models and API types
│   ├── utils/                 # Common shared javascript utilities
│   └── validation/            # Centralized Zod request schemas
├── docs/                      # Centralized documentation
│   ├── design/                # System design plans & blueprints
│   ├── reference/             # Database schemas & route lists
│   └── ARCHITECTURE.md        # Technical architecture document
├── run.sh                     # Full-stack developer runner
├── docker-compose.yml         # Local development Docker Compose
└── pnpm-workspace.yaml        # Workspace package layout
```

---

## 4. Features

### 4.1 Semantic Search (Core Feature)

- **Hybrid search** merges vector similarity + keyword text search via **Reciprocal Rank Fusion** (RRF_K=60)
- User types query → backend generates embedding via **`@xenova/transformers` `Xenova/multi-qa-mpnet-base-dot-v1`** (768-dim, singleton pipeline in Node.js)
- 4 parallel queries: FAQ vector, community vector, FAQ text, community text
- Results filtered by threshold: `textScore > 0 || vectorScore > 0.80`
- Returns top 5 merged + ranked results
- In-memory LRU cache (500 items, 1-hour TTL) for repeated queries
- **SearchLog** records every query for analytics: `{ query, resultsCount, topResultId, topResultSource }`
- `GET /api/search/trending` returns top 6 queries by search volume

### 4.2 FAQ System

- FAQs grouped by **category** on the frontend
- Each FAQ has: `question`, `answer`, `category`, `searchCount`, `views`, `helpfulVotes`, `status` (pending/approved/rejected)
- `embedding` field stored but `select: false` — never returned in normal queries
- `POST /api/faq/check-match` — detects if a user's community post question already has a high-similarity FAQ match (threshold 0.82) and surfaces the FAQ inline
- **Pagination:** `/faq` supports `?page=&limit=&category=` for paginated flat responses; `/faq/paginated` is the dedicated paginated endpoint
- **Freshness system:** `freshnessTier` (evergreen/seasonal/volatile) + daily cron flags expired FAQs for review; peer voting auto-verifies/escalates; moderator verifies or dismisses
- **FAQ Promotion tiers:** community answer promoted to FAQ → `trustLevel: 'medium'` (Community Approved); admin upgrades → `expert` (Admin Approved) or `high` (Official). Source tracked: `community_promotion | expert_verified | zoom_transcript | manual`

### 4.3 Community Q&A Board

- Users post questions (title + body + tags, 150/2000 char limits, max 3 tags)
- Post creation auto-checks FAQ duplicates via `check-match` before allowing submission
- **Post statuses:** `unanswered` | `answered`
- **Answer acceptance:** post author can accept any comment as the official answer (`PATCH /community/:id/comments/:commentId/accept-answer`) → sets `answer`, `answerAuthorId`, `status: 'answered'`, comment marked `verified: true`. Accepted answer can be from Zoom knowledge base (`answeredFromKnowledgeId`).
- **Voting:** Upvote posts; upvote/downvote comments (stored as user ID arrays)
- **Comment auto-delete:** Net score ≤ −5 → comment deleted + "Faah" sound effect on frontend
- **Verified comments:** Moderators can mark a comment as the verified top answer (`PATCH .../verify`)
- **Solution DNA:** Admin can add structured answer metadata (steps, tools, timeToComplete, difficulty) at post level or comment level
- **Time-Trial:** 16h unanswered → `pending`; first top-level comment wins `FirstResponder` badge + 20 points
- **Escalation:** posts with 3+ unanswered comments can be escalated to moderators; resolved/dismissed by admin
- Community search via `GET /community/search?q=` uses the same hybrid search against community posts
- **Auto-promotion:** answered posts with 10+ upvotes enter 24h review window → auto-promoted to `Community Approved` FAQ

### 4.4 Admin Dashboard

- **5 tabs:** Analytics, FAQs, Community, Users, Moderation
- **Analytics:** Total searches, popular queries, failed queries, fail rate, recent activity chart
- **FAQ management:** Create/edit/delete/approve/reject FAQs; FreshnessTierSelector; filter by status/category; search; sort
- **Community moderation:** View all posts, resolve unanswered posts with official answers, escalation management
- **User management:** List users (paginated), search by name/email, update user roles, suspend/unsuspend
- **AdminLog:** Every admin action is logged with `{ adminId, action, targetId, targetType, details }`
- **Promotion review:** admin can upgrade `community_approved` FAQs → `admin_approved` or `official`; moderator can raise objection

### 4.5 Notifications (SpillTheTea)

- `TeaNotification` model: events for `post_answered` (admin/AI resolved), `post_deleted`, `post_answered_user` (community reply), `faq_published`, `post_upvoted`, `comment_received`
- `Notification` model: `post_resolved`, `comment_received`, `faq_match_found`, `mention`, `accepted_answer`
- `SpillTheTea` frontend component: ☕ button with unread badge, dropdown with events, background polling every 30s
- Toast shown on `post_answered` when user is on the community page (dropdown closed, new event detected)
- `NotificationBell` dropdown: mark all read, click-to-navigate to post/FAQ

### 4.6 Zoom Integration

- OAuth flow: admin connects Zoom account → user grants scopes (`recording:read`, `meeting:read`)
- `GET /api/zoom/meetings` — paginated list with participant counts
- `POST /api/zoom/transcripts` — webhook processes completed recordings → extracts insights (FAQ type or Announcement)
- Circuit breaker: trips after 3 failures → 30s open → serve stale cache
- Fallback: `zoomCache.ts` TTL cache (60s lists, 5min items) with stale-while-revalidate
- `TranscriptKnowledge` collection stores extracted knowledge for AI duplicate detection

### 4.7 AI Duplicate Detection

- Multi-provider: `ANTHROPIC_API_KEY` > `OPENAI_API_KEY` > `XAI_API_KEY` > `MINIMAX_API_KEY` (priority order)
- `duplicateDetector.ts`: semantic similarity check against all FAQs + community posts
- On community post submit: if similarity ≥ 0.82, banner shown with link to matching FAQ
- `SpillTheTea` events emitted on `post_answered` and `post_deleted`

### 4.8 Analytics

- `GET /api/analytics` — popular queries, failed queries (0 results), total searches (admin/mod only)
- `GET /api/admin/faq-growth` — FAQ creation trend over configurable days
- `GET /api/admin/top-categories` — FAQ count + views per category
- `GET /api/admin/search-insights` — top 15 queries, fail rate, daily activity
- `GET /api/admin/user-activity-chart` — daily search volume over N days
- `GET /api/community/solved` — posts resolved in last 24h (for "Top Solved Today" on home page)

---

## 5. Data Models

### User
```js
{ name, email, password (hashed, select:false), role: 'user'|'moderator'|'admin'|'ai_moderator' }
// Pre-save: bcrypt salt factor 12
// comparePassword() instance method
```

### FAQ
```js
{ question, answer, category, embedding (select:false), searchCount, views, helpfulVotes, unhelpfulVotes,
  status: 'pending'|'approved'|'rejected', createdBy,
  // Freshness system
  freshnessTier: 'evergreen'|'seasonal'|'volatile',
  reviewIntervalDays, reviewStatus: 'verified'|'pending_review'|'update_requested',
  lastVerifiedDate, flaggedAt, flagType: 'auto'|'manual'|null, flagReason, flaggedBy, reviewCycle,
  // Promotion system
  trustLevel: 'low'|'medium'|'high'|'expert', sourceType: 'manual'|'community_promotion'|'expert_verified'|'zoom_transcript',
  sourceMeetingId, sourceCommunityPostId, sourceCommentId, promotedAt, objectionStatus: 'none'|'objected'|'resolved',
  promotionMetadata: { upvotesAtPromotion, helpfulVotesAtPromotion, communityAnswerAuthorId, promotedBy, objectionReason, objectionRaisedBy, objectionRaisedAt }
}
// Text index on question + answer
// Collection: yaksha_faq_faqs
```

### CommunityPost
```js
{ title, body, tags[], author, status: 'unanswered'|'answered', answer, answerAuthorId, answerIsExpert,
  upvotes[], embedding (select:false),
  comments: [{ author, body, upvotes[], downvotes[], verified, isExpertAnswer, isFirstResponder,
    firstResponderAwardedAt, parentId, depth, replies, solutionDNA: { keyPoints, summary, tags } }],
  dna: { steps[], tools[], timeToComplete, difficulty: 'Easy'|'Moderate'|'Tricky' },
  reports: [{ reportedBy, reason, createdAt }],
  escalationStatus: 'none'|'escalated'|'resolved'|'dismissed',
  escalatedAt, escalationReason, escalatedBy, escalationResolvedAt, escalationResolvedBy, escalationOutcome,
  answeredFromKnowledgeId, // ID from Zoom transcript knowledge base
  timeTrialStatus: 'none'|'pending'|'awarded', timeTrialStartedAt, timeTrialFirstResponder, timeTrialFirstResponderAt,
  // Promotion
  eligibleForPromotion, promotionPendingAt, promotionCandidateCommentId,
  promotionObjectedBy, promotionObjectedAt, promotionObjectionReason
}
// Text index on title + body
// Collection: yaksha_faq_communityposts
```

### Notification
```js
{ recipient, type: 'post_resolved'|'comment_received'|'faq_match_found'|'mention'|'accepted_answer',
  title, message, link, read, createdAt }
```

### TeaNotification (SpillTheTea)
```js
{ userId, eventType: 'faq_published'|'post_answered'|'post_deleted'|'post_answered_user'|'post_upvoted'|'comment_received',
  faqId, faqQuestion, postId, postTitle, triggeredBy, triggeredByName, content, read, createdAt }
```

### SearchLog
```js
{ query, resultsCount, topResultId, topResultSource: 'faq'|'community'|null }
// TTL index: auto-delete after 90 days
// Collection: yaksha_faq_searchlogs
```

### AdminLog
```js
{ adminId, action, targetId, targetType, details }
// Collection: yaksha_faq_adminlogs
```

---

## 6. API Reference (Summary)

### Public
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Create account, returns JWT |
| POST | `/api/auth/login` | Login, returns JWT |

### User (Authenticated)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/auth/me` | Current user profile |
| GET | `/api/faq` | All FAQs grouped by category |
| GET | `/api/faq/paginated` | Paginated flat FAQ list |
| GET | `/api/faq/:id` | Single FAQ |
| POST | `/api/faq/check-match` | Check if query has FAQ duplicate |
| GET | `/api/community` | Paginated community posts (cursor-based) |
| GET | `/api/community/:id` | Single post with comments |
| POST | `/api/community` | Create post |
| POST | `/api/community/:id/upvote` | Toggle upvote |
| PATCH | `/api/community/:id/resolve` | Mark post answered (mod/admin) |
| PATCH | `/api/community/:id/comments/:commentId/accept-answer` | Accept comment as official answer (post author) |
| PATCH | `/api/community/:id/comments/:commentId/verify` | Mark comment verified (mod/admin) |
| PATCH | `/api/community/:id/comments/:commentId/upvote` | Toggle comment upvote |
| POST | `/api/community/:id/comments/:commentId/downvote` | Toggle comment downvote (auto-deletes at net −5) |
| POST | `/api/community/:id/comments` | Add comment |
| GET | `/api/community/solved` | Posts resolved in last 24h |
| GET | `/api/community/search?q=` | Hybrid search of community posts |
| GET | `/api/notifications` | User notifications |
| PATCH | `/api/notifications/:id/read` | Mark notification read |
| PATCH | `/api/notifications/read-all` | Mark all read |
| GET | `/api/notifications/tea` | SpillTheTea events |
| PATCH | `/api/notifications/tea/read-all` | Mark all tea read |
| GET | `/api/community/review-queue` | FAQs pending peer review |
| POST | `/api/search` | Hybrid semantic search |
| GET | `/api/search/trending` | Top 6 trending queries |

### Admin / Moderator
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/stats` | Dashboard summary |
| GET | `/api/admin/faq-growth` | FAQ creation trend |
| GET | `/api/admin/top-categories` | Category breakdown |
| GET | `/api/admin/search-insights` | Search analytics |
| GET | `/api/admin/users` | User list (paginated) |
| GET | `/api/admin/faqs` | FAQ list (paginated, filterable) |
| GET | `/api/admin/reports` | Date-range report export |
| GET | `/api/admin/activity-feed` | Recent admin actions |
| GET | `/api/admin/user-activity-chart` | Daily activity chart |
| POST | `/api/admin/faq` | Create FAQ |
| POST | `/api/admin/faq/approve` | Approve FAQ |
| POST | `/api/admin/faq/reject` | Reject FAQ |
| PUT | `/api/admin/faq/:id` | Update FAQ |
| DELETE | `/api/admin/faq/:id` | Delete FAQ |
| PATCH | `/api/auth/users/:id/role` | Update user role |
| GET | `/api/analytics` | Search log analytics |
| GET | `/api/community` | Paginated community posts |
| DELETE | `/api/community/:id` | Delete community post |
| PATCH | `/api/community/:id/tags` | Update post tags |
| PATCH | `/api/community/:id/dna` | Set solution DNA |
| GET | `/api/admin/escalated` | Escalated posts |
| PATCH | `/api/admin/escalated/:id/verify` | Mod verifies escalated FAQ |
| PATCH | `/api/admin/escalated/:id/dismiss` | Mod dismisses |
| POST | `/api/admin/community/:id/object` | Object to promotion |
| GET | `/api/admin/community/pending-promotions` | Pending promotions list |
| POST | `/api/admin/community/pending-promotions/:id/promote` | Promote to admin-approved/official |
| GET | `/api/zoom/health` | Zoom integration health |
| GET | `/api/zoom/meetings` | Paginated Zoom meetings |
| POST | `/api/zoom/transcripts` | Ingest transcript |
| GET | `/api/admin/zoom-insights` | Zoom insights (FAQ/Announcements) |

### Test Credentials
| Role | Email | Password |
|------|-------|----------|
| Student | user@yaksha.com | password123 |
| Admin | admin@yaksha.com | admin123 |

---

## 7. Architecture Decisions

### 7.1 Embedding: Local Transformers (not OpenAI)
- **Current:** `@xenova/transformers` runs `Xenova/multi-qa-mpnet-base-dot-v1` in-process in Node.js — no API key needed, works offline
- **Model:** 768-dim, cosine similarity
- **First call:** downloads ~500MB to `~/.cache/huggingface/`, cached thereafter
- **Production (Option B):** Switch to MongoDB Atlas autoEmbed with Voyage AI — Atlas fetches embeddings at query time, no model download needed in serverless

### 7.2 Hybrid Search — RRF over naive union
- Vector search captures semantic similarity; text search captures exact keyword matches
- Merging with RRF (Reciprocal Rank Fusion) outperforms simple score addition
- `RRF_K=60` is the standard academic default; `k=0` would overweight top-rank documents too heavily

### 7.3 Embedding field `select: false`
- Prevents accidental exposure of 1536-float arrays in API responses
- Always explicitly `.select('-embedding')` in query chains

### 7.4 Lazy DB connection
- `connectDB()` uses a module-level cache; calling it on every request handles Vercel serverless cold starts gracefully without a singleton guarantee at the process level

### 7.5 Community posts go live immediately
- No moderation queue for user posts — they appear instantly
- Moderators resolve and delete post-create; the `deletePost` admin route exists
- **Planned:** moderation queue for pending review before public visibility

---

## 8. Scale Readiness — What's Done vs. What's Pending

### ✅ Done (v0.2)

| Feature | Details |
|---------|---------|
| **Pagination** | Community posts paginated (20/page); FAQ paginated endpoint (`/faq/paginated`) |
| **SearchLog TTL** | 90-day auto-expiry via MongoDB TTL index; prevents unbounded growth |
| **Compound indexes** | `{ category, status, createdAt }` on FAQs; `{ status, createdAt }` on posts; `{ query, createdAt }` for search logs |
| **Local embeddings** | `@xenova/transformers` runs `Xenova/multi-qa-mpnet-base-dot-v1` in-process in Node.js — no API key needed |
| **Redis shared cache** | Upstash Redis (TTL cache for search results and Zoom data, shared across serverless instances) |
| **Graceful shutdown** | SIGTERM/SIGINT handlers flush search log buffer before exit |
| **Sentry** | Error tracking wired to `server.ts` |
| **Cursor-based pagination** | Community posts use keyset cursor on `_id` desc; `nextCursor` base64 encoded |
| **FAQ Freshness system** | Backend fully implemented; frontend FreshnessBadge on FAQ cards |
| **Solution DNA** | Post-level and comment-level structured answer metadata (steps, tools, time, difficulty) |
| **Community FAQ promotion** | Auto-promotion: answered posts with 10+ upvotes → Community Approved FAQ after 24h review window |

### ⚠️ Partially Done

| Feature | Status |
|---------|--------|
| **Zoom OAuth** | OAuth flow implemented, scopes configured, Zoom insights extraction working, circuit breaker + fallback cache active |
| **Time-Trial** | 16h countdown → first top-level comment wins FirstResponder badge + 20 points; atomic findOneAndUpdate prevents race |
| **Escalation** | Posts with 3+ unanswered comments can be escalated; admin resolves/dismisses via escalationController |

### ❌ Not Yet Done (blocking 1M users)

| Priority | Feature | Why It Matters |
|----------|---------|---------------|
| **P0** | **User-level rate limiting** | IP-based 300 req/15min breaks legitimate users behind corporate NAT; need per-user JWT-based limits |
| **P0** | **Auth endpoint rate limiting** | `/api/auth/login` and `/api/auth/register` have NO per-IP rate limit — brute-force possible |
| **P0** | **XSS sanitization** | User-generated `answer` and `body` fields have no HTML sanitization; stored XSS possible |
| **P0** | **JWT token refresh revocation** | `refreshTokenHash` set on login but NOT verified on refresh — stolen token valid for 7 days |
| **P1** | **Email domain restriction** | Anyone can register; no spam guard |
| **P1** | **Admin 2FA (TOTP)** | No 2FA for admin accounts |
| **P1** | **Freshness cron wired** | `runFreshnessCheck()` defined in `freshnessController.ts` but NOT called by any scheduler |
| **P1** | **FAQ FreshnessBadge on public FAQ page** | Only visible to admins; public FAQ page does not show freshness status |
| **P2** | **GDPR data export** | No `GET /api/auth/export` endpoint |
| **P2** | **Failed search → FAQ workflow** | Failed queries identify gaps but not routed to admin FAQ creation |
| **P2** | **Bulk CSV FAQ import** | Admins must create FAQs one-by-one |
| **P3** | **Sentry / error tracking** | Wired but not verified end-to-end |
| **P3** | **Load testing suite** | No k6/Artillery tests |
| **P3** | **Multi-language support** | Embedding model + UI are English-only; India user base needs Indic language support |

---

## 9. MongoDB Atlas — Required Setup

### 9.1 Vector Search Index

Each collection (`faqs`, `communityposts`) needs a search index named `vector_index`:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    }
  ]
}
```

> **Note:** Vector search is free on M0 (free tier) as of 2024+. No cluster upgrade needed. The `apps/backend/src/scripts/addIndexes.ts` creates non-vector indexes only — vector index must be created manually in Atlas UI.

### 9.2 Running the Migration

After pulling, set env vars and run:
```bash
cd apps/backend
export MONGODB_URI="mongodb+srv://<user>:***@cluster0.xxxxx.mongodb.net/yaksha_faq"
npm run migrate        # Creates TTL + compound indexes
npm run backfill:embeddings  # Regenerate stored embeddings (if switching models)
```

---

## 10. Environment Variables

### Backend (`apps/backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | — | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiry |
| `PORT` | No | `6767` | Server port (Vercel overrides automatically) |
| `CLIENT_URL` | No | — | Frontend URL for CORS |

### Frontend (`apps/frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:6767/api` | Backend API base URL |

---

## 11. Database Collections

| Collection | Purpose |
|------------|---------|
| `yaksha_faq_users` | User accounts |
| `yaksha_faq_faqs` | FAQ entries with embeddings |
| `yaksha_faq_communityposts` | Community Q&A posts with embedded comments |
| `yaksha_faq_searchlogs` | Search analytics (90-day TTL) |
| `yaksha_faq_adminlogs` | Admin action audit log |

---

## 12. Role-Based Access Control

| Role | Access |
|------|--------|
| `user` | Browse FAQs, community, search |
| `moderator` | All user access + resolve posts, delete posts, verify comments, manage FAQs |
| `admin` | All moderator access + user management, all admin endpoints |
| `ai_moderator` | Placeholder for future AI auto-moderation integration |

---

## 13. Key Implementation Notes

- The search cache is **Upstash Redis** (shared across serverless instances). If Redis is unavailable, search falls back to direct DB queries.
- The seed script (`apps/backend/src/scripts/seed.ts`) reads from `../samagama_faq.json` at the backend root directory.
- `CommunityPost.comments` is an **embedded subdocument array** — not a separate collection. Comment `_id` values are local to the post document.
- **Comment voting** uses optimistic UI updates — upvote state is toggled locally before the API call resolves.
- The "Faah" sound effect (`fahhhhh.mp3`) is played client-side when a comment is auto-deleted at net −5 score.
- The `temp/` directory does not exist — it was removed in a prior cleanup.
- **SpillTheTea** polls every 30s when the dropdown is closed — `lastSeenIdRef` tracks the latest event ID to avoid toasting on pre-existing data.
- **FAQ promotion** is triggered automatically when an answered post accumulates 10+ upvotes and sits in the 24h review window without a moderator objection.
- **Freshness cron** (`runFreshnessCheck`) is defined in `freshnessController.ts` but NOT wired to `node-cron` — it must be connected before production deployment.
- **Zoom OAuth**: scopes `recording:read` + `meeting:read` are configured on a **user-managed OAuth app** (not Server-to-Server OAuth). The `ZOOM_REDIRECT_URI` must point to the backend callback.
- **AI duplicate detection**: provider resolution order is `ANTHROPIC > OPENAI > XAI > MINIMAX`. Server does not start without at least one of these API keys set.

---

## 14. Glossary

| Term | Definition |
|------|------------|
| RRF | Reciprocal Rank Fusion — algorithm for merging ranked lists from different rankers |
| Embedding | Dense numerical vector representation of text for semantic similarity comparison |
| Cosine similarity | Similarity metric between vectors; 1.0 = identical, 0.0 = orthogonal |
| TTL index | MongoDB feature that auto-deletes documents after a set time |
| select:false | Mongoose option that excludes a field from default queries (privacy + perf) |
| LRU | Least Recently Used — cache eviction strategy |
| RRF_K | Constant in RRF formula controlling rank smoothing (k=60 is standard) |

---

## 15. Modular Refactoring Details (v0.3)

In Version 0.3, monolithic controllers and pages were split into focused, single-responsibility files to enhance code maintainability and layout clarity.

### 15.1 Backend Controller Split
The original `communityController.ts` grew too large and covered two distinct sets of database operations (Posts and Comments). It was split into:
- **`postController.ts`**:
  - Manages posts collection queries (`getAllPosts`, `getPostById`, `createPost`, `getSolvedPosts`).
  - Handles post interaction and moderation (`toggleUpvote`, `resolvePost`, `deletePost`, `reportPost`).
  - Implements duplicate detection (`checkDuplicateController`) using vector search similarity to check if the question matches an existing FAQ.
- **`commentController.ts`**:
  - Manages the embedded comments array inside the post schema.
  - Handles comment interactions (`addComment`, `toggleCommentUpvote`, `toggleCommentDownvote`).
  - Controls verified comment status (`verifyComment`) where moderators flag top responses.

### 15.2 FAQ Page Decomposition
To improve readability and simplify state management, the monolithic `FAQPage.tsx` was decomposed into modular components in `components/faq/`:
- **`faqUtils.tsx`**: Holds centralized static icons, TypeScript interfaces (`FAQItem`, `SearchResult`, `FAQCategory`), and helper utilities.
- **`SearchDropdown.tsx`**: Renders suggestions autocomplete dropdown as the user types queries in the search bar.
- **`SearchFeedback.tsx`**: Provides a modal letting users submit questions when they can't find relevant answers.
- **`ReportFAQButton.tsx`**: A moderation component attached to FAQs to allow users to flag incorrect content.
- **`CategoryGrid.tsx`**: Renders the visual category navigation grid.
- **`QuestionList.tsx`**: Displays the accordion list of questions in the active category.
- **`QuestionDetail.tsx`**: Renders a comprehensive individual FAQ page detail view with a related queries side panel.

### 15.3 Community Page Dialogs Extraction
The dialogs for creating posts and viewing detailed discussions were extracted into `components/community/`:
- **`CreatePostDialog.tsx`**: Renders the modal form to submit a new question, including automated checks for existing FAQ duplicates.
- **`PostDetailDialog.tsx`**: Contains the full discussion view with thread details, voting states, and nested comments.