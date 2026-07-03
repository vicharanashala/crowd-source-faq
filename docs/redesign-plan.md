# Master Redesign Plan — shamagama

**Status:** draft (audits complete, no code changed yet)
**Date:** 2026-07-01
**Owner:** Yashhwanth + Claude

---

## 1. Goal (what success looks like)

> "Program-scoped auto-answer for community posts, using FAQ + Zoom transcripts + document insights as context. When the system doesn't know, it flags the question to admin/moderator with the context window + what's missing. The admin's answer is stored as part of the program's knowledge. Future auto-answers get smarter."

Translated into acceptance criteria:

1. **`autoAnswer(communityPost, programContext)`** produces one of: `answer | suggest | askHuman` — never silently guesses.
2. **Context window** for any post is composed from program-scoped: FAQ + KB (Zoom transcripts + promoted docs) + sibling community posts + already-posted comments. All four sources, scoped by `batchId`.
3. **Ask-human path**: when top score < threshold, post enters `adminAnswer queue` with `aiAnswerStatus='ask_human'`, snapshot of what context was tried, and a one-click admin reply. Admin's answer is stored as a `ProgramKnowledge` row tagged `seedSource='admin_response'`.
4. **Feedback loop**: when admin approves a `suggest`, the AI's source citations + admin's diff become a new `ProgramKnowledge` row tagged `seedSource='admin_corrected'`. Next auto-answer that uses those sources gets a confidence boost from the correction.
5. **Every feature behind a flag.** No feature is wired into production that can't be turned off by an admin in the running UI without a redeploy.
6. **No silent data loss.** Notification, reputation, embedding, scheduler — none of them catch-and-swallow without observability.

---

## 2. What's broken (cross-cutting)

The 9 audits surfaced these patterns. Fix them as part of Phase 0 before building the new feature.

### 2.1 Cross-cutting critical bugs

| Pattern | Where | Severity |
|---|---|---|
| **`assertSameProgram` returns false on missing context** → silent cross-tenant writes via community moderation routes | `scopedQuery.ts:81-93`, `community.routes.ts:86`, `post-moderation.controller.ts:108` | **HIGH — security** |
| **`admin-projects.routes.ts` has no `protect` middleware** | unscoped project CRUD | **HIGH — security** |
| **Frontend role check excludes `ai_moderator`** but backend allows it | `routes/guards/AdminRoute.tsx:21`, `admin/hooks/useAdminAuth.tsx:13`, `middleware/admin.ts:15` | **HIGH — UX broken** |
| **`isFeatureEnabled(key)` without batchId on hot paths** — per-program overrides silently ignored | `support-core.controller.ts:225`, `support-requests.controller.ts:152`, `startup.ts:128` | HIGH |
| **`OnboardingAuditLog` missing from `cascade-delete.service.ts`** | orphans audit data forever | MEDIUM |
| **`resolvePost` H3 regression was real, fixed in `60c1af0`** but `acceptCommentAnswer` has the same shape (`comment.controller.ts:341`) and still in-memory-mutates before save | race + idempotency | HIGH |
| **`deleteComment` doesn't un-award `+20` from deleted accepted answer** | dangling points | MEDIUM |
| **`aiAnswer` persisted on escalated posts** (`auto-answer.controller.ts:139`) | defeats human-review | HIGH |
| **`AUTO_ANSWER_INTERVAL_HOURS` no NaN guard** | `setInterval(fn, NaN)` ≈ 1ms tick → tight loop | HIGH |
| **Webhook HMAC `timingSafeEqual` crashes on header length mismatch** | Zoom webhook | MEDIUM |
| **Zoom OAuth token refresh has write race** | concurrent callers clobber tokens | MEDIUM |
| **`addComment` flattens replies into top-level array** — `comments.length` is wrong on threads with replies | comment-count badge off | LOW |
| **`getAllPosts sort=popular` pagination broken** — every "load more" returns the same 20 | LOW |
| **`/api/auth/refresh` has no rate limit** | brute-force refresh tokens | MEDIUM |
| **`deleteUser` doesn't invalidate refresh tokens** | deleted user still has live sessions | MEDIUM |
| **`comment.controller.ts:626` `new ObjectId(decoded.id)` throws on malformed token** | 500 instead of 401 | LOW |
| **Five duplicate admin auth-failure response shapes** — `(err as Error).message` leaks internals | queue controller | LOW |
| **Search cache is per-process LRU** — `invalidateCache()` no longer cross-instance | `cache.ts:13-18` | MEDIUM (multi-instance) |
| **Three provider-resolution paths for the same AI call** — Anthropic > OpenAI > xAI > MiniMax ordering not honored uniformly | `aiProvider.ts`, `ai-client.service.ts`, `rag.service.ts:chatCompletion`, `duplicateDetector.ts:aiChat`, `knowledge-base.service.ts:aiChat` | MEDIUM |
| **`features[feature].enabled` schema field is dead code** — never read | `AiConfig.features.enabled` | MEDIUM |
| **`community.escalation.days` env var name is the literal string `readConfig().days`** — never reads | `escalation.controller.ts:36-38` | HIGH |
| **`faq-audit.controller.ts:42` env var name is `FAQ_AUDIT_readAuditIntervalH()OURS` (with parens)** — never reads | line 42 | MEDIUM |
| **`OnboardingAuditLog` orphan** | cascade-delete.service.ts | MEDIUM |

### 2.2 Cross-cutting design issues

- **Per-process LRU caches everywhere.** `cache.ts`, `feature-flag.controller.ts:138`, `search.controller.ts`, `public-faq.controller.ts`. No shared protocol.
- **`batchId` threading inconsistent.** `ai-promotion.controller.ts:140`, `rag.service.searchFaqs/searchCommunity`, `search.controller.ts:316`, `welcome.controller.ts`, `admin-mentor.controller.ts`, `admin-timeline.controller.ts`, `admin-project.controller.ts`. Many read endpoints skip scope.
- **Two parallel reputation systems that don't dual-write.** `User.points` vs `ProgramReputation` — neither path writes the other.
- **Three scoping middlewares with overlapping semantics.** `programScope`, `withProgramScope/withCurrentProgram`, `assertSameProgram`. Default is permissive.
- **God-files.** `admin.controller.ts` 612, `admin-welcome.controller.ts` 1181, `faq.controller.ts` 709, `comment.controller.ts` 562, `search.controller.ts` 447, `rag.service.ts` 412, `zoom.controller.ts` 775, `knowledge-base.service.ts` 569, `AdminZoomTab.tsx` 1075.
- **No UI for feature flags.** `FEATURE_FLAGS` allow-list is closed, no admin UI to flip. Adding a flag requires code change.
- **Two competing project controllers.** `admin-project.controller.ts` (unscoped, no auth) vs `admin-welcome.controller.ts` projects section (scoped, auth).
- **Notification / reputation / ban logic leaks into 8 controllers** — every community/community-adjacent controller imports `User`, `ReputationLog`, `awardToUser`, `autoAwardBadges`, `dispatchNotification`, `createTeaDrop`, `assertCanCreateContent`.

### 2.3 Cross-cutting quick wins (target: ship in Phase 0)

1. Add `OnboardingAuditLog` to cascade-delete (1 line)
2. Fix `escalation.controller.ts` env var typo (1 line)
3. Fix `faq-audit.controller.ts` env var typo (1 line)
4. Add `NaN` guard to `AUTO_ANSWER_INTERVAL_HOURS` (1 line)
5. Fix `acceptCommentAnswer` mutate-then-save race (mirror the resolvePost H3 fix pattern from `60c1af0`) (~15 lines)
6. Stop persisting `aiAnswer` on escalated posts (~3 lines)
7. Add `protect + adminOnly` to `admin-projects.routes.ts` (1 line)
8. Add `ai_moderator` to frontend admin route guard (~2 lines)
9. Make `assertSameProgram` strict by default for non-admin routes (or add `strict: true` flag) (~10 lines)
10. Add `refreshLimiter` to `/api/auth/refresh` (~10 lines)
11. `deleteUser` invalidates refresh tokens (~3 lines)
12. Cache invalidation in `feature-flag.controller.ts` when per-program override set: `_cache.clear()` not just `delete key` (~3 lines)
13. Wire `requireFeatureOn('welcomePackage')` into `welcome.routes.ts` (~3 lines)
14. `isFeatureEnabled(key, req.programContext?.batchId ?? null)` on support hot paths (~3 lines)
15. Replace dynamic `await import('mongoose')` in `faq.controller.ts:495` with static (~1 line)
16. Wire `features[feature].enabled` in `ai-client.service.ts:299` — was dead schema (~3 lines)

### 2.4 Cross-cutting big redesigns (Phase 0 + Phase 1)

- **R1: Feature flag registry.** Typed registry shared between backend (`FEATURE_FLAGS`) and frontend (`FeatureFlagContext`). UI to flip flags. Default = `required: false` for admin routes, `required: true` for non-admin. (`feature-flag.controller.ts:10-55`, `feature-flag.controller.ts:138`, `FeatureFlagContext.tsx`)
- **R2: Single reputation service.** Consolidate `User.points`, `ProgramReputation`, `ReputationLog`, `autoAwardBadges`, `awardToUser`, `awardPromotionReputation` into `services/reputation.service.ts`. One dual-write path. Atomic. The two reputation systems get a backfill migration.
- **R3: Single notification service + outbox.** `services/notifications.service.ts`. Best-effort with retry queue or outbox table. Replace three call sites (`notificationDispatcher.ts`, `notification.controller.ts`, `tea-notification.controller.ts`).
- **R4: Single ban service.** `services/ban.service.ts` wrapping `banUtils.ts`. Sanity-check the `clearExpiredGoldenBans()` cron exists and is scheduled.
- **R5: Unified provider abstraction.** One `AIClient` interface, one `ProviderRegistry`, one `resolveProvider({ feature, batchId })`. Replaces 5 parallel paths. Honors `features[feature].enabled`. Centralizes prompt registry.
- **R6: Embedding pipeline as a queued job.** All `generateEmbedding()` calls go through `queue.embed(text, source)` with retries and per-doc `embeddingVersion`.
- **R7: Per-program context strict by default.** `programScope({ required: true })` is default. Admin routes opt out. Cross-tenant writes become impossible to introduce silently.
- **R8: Soft-delete everywhere.** FAQ, CommunityPost, ZoomInsight, DocumentInsight, TranscriptKnowledge, OnboardingAuditLog all gain `deletedAt/deletedBy`. All reads filter. Cascades become logical.

---

## 3. Feature: auto-answer feedback loop

### 3.1 The pipeline

```
┌────────────────────────────────────────────────────────────────────┐
│  communityPost created / status=unanswered                         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  fetchContext(post, batchId)                                  │  │
│  │  ├─ searchKnowledge(post, batchId)  [KB: Zoom + admin-corrected]│  │
│  │  ├─ searchFAQ(post, batchId)         [FAQ vector + text RRF]   │  │
│  │  ├─ searchCommunity(post, batchId)   [answered posts, vector+text]│
│  │  ├─ searchComments(post)             [sibling comments]       │  │
│  │  └─ searchDocuments(post, batchId)   [document insights if flagged]│
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  composeContext(hits, post)                                  │  │
│  │  - numbered blocks [1] [2] ...                                │  │
│  │  - each block: source, score, confidence, isStale, isCorrected │  │
│  │  - sorted by score * confidenceWeight * freshnessWeight       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  triage(post, context)                                        │  │
│  │  - topHit.score >= AUTO_APPROVE → call LLM with full context   │  │
│  │  - LLM confidence >= approveThreshold  → answer + status=answered│  │
│  │  - LLM confidence < approveThreshold → suggest + admin queue  │  │
│  │  - topHit.score >= AUTO_SUGGEST  → suggest + admin queue       │  │
│  │  - topHit.score < AUTO_SUGGEST  → ask_human + admin queue      │  │
│  │                              + snapshot context in post.aiContext│
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Admin reviews queue item:                                   │  │
│  │  - approve  → status=answered, aiAnswer→answer               │  │
│  │  - approve+edit → status=answered, aiAnswer→edited,            │  │
│  │                 → create ProgramKnowledge (seedSource=admin_corrected)│
│  │  - reject   → status=unanswered, post.aiContext stays as audit  │  │
│  │  - ask_ai   → re-run with augmented context                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ProgramKnowledge rows (seedSource enum):                     │  │
│  │  - 'zoom_qa'         ← from Zoom transcript extraction         │  │
│  │  - 'doc_promoted'    ← from DocumentInsight promotion         │  │
│  │  - 'admin_response'  ← admin wrote the answer                  │  │
│  │  - 'admin_corrected' ← admin edited an AI answer              │  │
│  │                                                                │  │
│  │  All rows count toward searchKnowledge. Corrections have      │  │
│  │  higher confidenceWeight than original AI extractions.       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 What this requires that's missing today

1. **`services/contextRetriever.ts`** — single entry point. Returns ranked, weighted hits from all 5 sources, scoped by batchId. Replaces the scattered `searchKnowledge`/`searchRelevantFaqs`/`searchRelevantCommunityPosts` calls.
2. **`models/ProgramKnowledge.ts`** — new model. Stores `seedSource` enum, `originalContextId`, `confidenceBoost`, `embedding`, `embeddingVersion`, `embeddingDim`. Atlas vector indexed.
3. **`services/autoAnswer.ts`** — pipeline orchestrator. Returns `answer | suggest | askHuman`. Persists `post.aiContext` snapshot on every run. Idempotent.
4. **`controllers/adminAutoAnswerReview.ts`** — admin endpoint to approve/reject/edit queue items. On approve+edit, creates `ProgramKnowledge` row.
5. **Feature flags**:
   - `community.autoAnswer.enabled` — kill switch
   - `community.autoAnswer.feedbackLoop.enabled` — separate flag for the admin-correction → knowledge promotion loop (so admins can A/B)
   - `community.autoAnswer.askHumanThreshold` — the lower bound below which the system escalates instead of answering
   - All settable via the new flag UI (R1)
6. **UI**:
   - `AdminAutoAnswerQueue` page (already exists, needs redesign): now shows `askHuman` items with context snapshot + "ask AI again" + "approve as-is" + "approve with edit"
   - Diff view: admin sees the AI's draft answer next to their edited version, with the source citations highlighted

### 3.3 Out of scope (deferred to later phases)

- Conversation memory for AskAI
- Cross-program knowledge sharing
- Real-time auto-answer streaming to the post author

---

## 4. Phase plan

### Phase 0 — Fix what's broken (~1–2 days)

Goal: green CI, no regression risk on Phase 1 work.

- [ ] Apply all 16 cross-cutting quick wins (§2.3)
- [ ] Add OnboardingAuditLog to cascade-delete
- [ ] Fix env var typos in escalation + faq-audit controllers
- [ ] NaN guard on AUTO_ANSWER_INTERVAL_HOURS
- [ ] Re-route `ai-promotion.controller.ts` `batchId` to thread through
- [ ] Add `programScope({ required: true })` to community moderation routes
- [ ] Add `protect` middleware to `admin-projects.routes.ts`
- [ ] Add `ai_moderator` to frontend admin guard
- [ ] Fix `acceptCommentAnswer` H3 mirror of `60c1af0`
- [ ] Stop persisting `aiAnswer` on escalated posts
- [ ] Wire `features[feature].enabled` in `ai-client.service.ts`
- [ ] `deleteUser` invalidates refresh tokens
- [ ] Add `refreshLimiter` to `/api/auth/refresh`
- [ ] Cascade-delete cache invalidation
- [ ] Make `assertSameProgram` strict by default for non-admin routes

**Deliverable**: backend tests pass, lint clean, typecheck clean. No new features yet.

### Phase 1 — Foundations (~3–5 days)

Goal: architectural plumbing that the new feature needs.

- [ ] **R1: Feature flag registry**
  - `utils/featureFlags.ts` with typed registry
  - Per-batch overrides
  - Admin UI to flip (new page: `/admin/feature-flags`)
  - Fail-closed at boot if a flag is referenced but not in registry
- [ ] **R2: Single reputation service**
  - `services/reputation.service.ts`
  - Backfill migration for `User.points` → `ProgramReputation` for enrolled users
  - One `award` entry point, atomic
- [ ] **R3: Single notification service + outbox**
  - `services/notifications.service.ts`
  - Mongo-backed outbox (capped collection) for failed dispatches
  - Background drain (or expose via BullMQ if we re-add Redis later — see §6.4)
- [ ] **R4: Single ban service**
  - `services/ban.service.ts`
  - Verify `clearExpiredGoldenBans()` cron exists in `startup.ts`
- [ ] **R5: Unified provider abstraction**
  - `services/ai/provider.ts` — one `AIClient`, one `ProviderRegistry`
  - Honor `features[feature].enabled`
  - Honors per-batch config

**Deliverable**: feature flag UI shipped. Reputation / notifications / ban / AI provider all behind one service each. Migration script for reputation backfill. Tests for each service.

### Phase 2 — Context retriever + ProgramKnowledge model (~3–5 days)

Goal: the data layer that the auto-answer pipeline will read.

- [ ] **`models/ProgramKnowledge.ts`** — new collection
- [ ] **Atlas vector index on `ProgramKnowledge.embedding`** (migrate script)
- [ ] **`services/contextRetriever.ts`** — single API:
  - `fetchContext(post, batchId) → { hits: RankedHit[] }`
  - 5 sources, batchId-scoped, weighted by `confidence * freshness`
  - Honors stale knowledge (demotes `lastVerifiedDate > X` days)
  - Includes sibling comments
  - Returns ranked + weighted (so the triage step can decide)
- [ ] **Migrate existing knowledge sources into `ProgramKnowledge`**:
  - `TranscriptKnowledge` (Zoom Q&A extractions)
  - `DocumentInsight.publishedFaqId` after promotion
  - `CommunityPost.answer` where `status='answered'` (with origin tracker)
- [ ] **Tests** for `contextRetriever`:
  - Per-source top-K
  - RRF merge
  - Staleness demotion
  - batchId scope
  - Comment inclusion

**Deliverable**: `services/contextRetriever.ts` returning ranked hits. Migration script tested on staging.

### Phase 3 — Auto-answer feedback loop (~5–7 days)

Goal: ship the new feature.

- [ ] **`services/autoAnswer.ts`** — pipeline orchestrator
  - Inputs: post, batchId
  - Output: `answer | suggest | askHuman` + `confidence` + `aiContext` snapshot
  - Idempotent (skip if `aiAnswerStatus === 'suggested'` or `'ask_human'` and recent)
- [ ] **`models/CommunityPost.aiContext` snapshot field** — stores the context hits + scores used for each auto-answer attempt (audit trail)
- [ ] **`controllers/adminAutoAnswerReview.ts`** — admin endpoint
  - GET `/admin/auto-answer/queue` — paginated, filterable by status (asked / suggested)
  - POST `/admin/auto-answer/:postId/approve` — set answer, status=answered
  - POST `/admin/auto-answer/:postId/approve-edit` — set answer, create ProgramKnowledge(seedSource='admin_corrected')
  - POST `/admin/auto-answer/:postId/reject` — clear aiAnswer, status=unanswered
  - POST `/admin/auto-answer/:postId/ask-ai-again` — re-run pipeline with augmented context
- [ ] **Hooks**:
  - `addComment` fires `processPost` if post is `aiAnswerStatus === 'suggested'` AND new comment has `netScore > aiConfidence` (per Phase 3 design note in community audit)
  - `editFAQ` clears `pendingReviews` on related `CommunityPost.aiAnswer` audit fields
- [ ] **Feature flags**:
  - `community.autoAnswer.enabled` (kill switch)
  - `community.autoAnswer.feedbackLoop.enabled` (separate flag for the admin-correction → knowledge loop)
  - `community.autoAnswer.askHumanThreshold` (the lower bound)
- [ ] **Frontend: `AdminAutoAnswerQueue` redesign**:
  - Tab: `asked` / `suggested` / `all`
  - Each item: question + body + 3 source citations + admin reply box + "approve" / "approve+edit" / "reject" / "ask AI again"
  - Diff view: AI draft vs admin edit
- [ ] **Scheduler**: replace `setInterval` with `cronManager` (or hand-rolled equivalent with concurrency guard). Lock for the duration of a manual+scheduled overlap.

**Deliverable**: end-to-end flow works. Admin can answer an asked question → admin's answer becomes knowledge → next post that matches the same context gets a higher score.

### Phase 4 — Tests, observability, polish (~3–5 days)

Goal: ship confidence.

- [ ] Integration tests for auto-answer end-to-end:
  - asked → admin answers → next similar post gets higher score
  - asked → admin edits → citation added to ProgramKnowledge
- [ ] Unit tests for `reputation.service.ts`, `notifications.service.ts`, `ban.service.ts`
- [ ] Backend coverage report (target: 60% on services, 40% on controllers)
- [ ] Observability:
  - Auto-answer decision logs (PipelineResult.metadata) include: context sources, scores, LLM confidence, decision, snapshot id
  - Admin UI surfaces "why did AI decide this?" — drill-down from a queue item to the context snapshot
- [ ] Documentation:
  - README updates (feature flag usage, AI pipeline overview)
  - `docs/architecture.md` — new
  - `docs/auto-answer-feedback-loop.md` — new
  - Runbook for the new admin queue

**Deliverable**: confidence to ship. All tests pass. Docs in place.

---

## 4.5 Frontend gaps (from audit 9/9)

The frontend audit surfaced patterns specific to the React side that don't fit under backend redesigns. Adding them here.

### Frontend critical (must fix)

| Issue | File | Severity |
|---|---|---|
| **In-house vs ShadCN naming collision** — `Button.tsx` PascalCase + `components.json` ui alias = macOS case-insensitive APFS collision risk on next `npx shadcn add`. Decide in-house-wins / ShadCN-wins / hybrid **before** installing any ShadCN component | `src/components/ui/Button.tsx`, `components.json` | HIGH |
| **`AdminProgramScopeWiring` exported but no caller found** — interceptor's `lastKnownProgramId` stays null, every admin call silently omits `batchId`. Silent cross-tenant data leak | `admin/utils/adminScopedApi.ts:74-121` | **HIGH — silent data isolation** |
| **`api.ts` interceptor reads program id from `localStorage`, not from `useCurrentProgramId()`** — two sources of truth, can drift | `api.ts:166-169` | MEDIUM |
| **`Avatar` is hard-`aria-hidden`** even when representing an identity | `Avatar.tsx:49` | MEDIUM |
| **`Button`/`Card` missing `type="button"` default** — accidental form submission hazard | `Button.tsx:40-68`, `Card.tsx:27-31` | MEDIUM |
| **`useProgramScopedFetch` no cancellation** — rapid program switch leaves stale fetches to win | `useProgramScopedFetch.ts:37-46` | MEDIUM |
| **`FeatureFlagContext` treats unknown flag key identically to disabled** — admin typo == silently off feature, no diagnostic | `FeatureFlagContext.tsx:91-94` | MEDIUM |
| **`ErrorBoundary` hard-coded `/csfaq/api/log`** — fails if basename changes | `ErrorBoundary.tsx:79` | LOW |
| **`api.ts:71-78` cache invalidation is coarse** — any non-search mutation wipes the whole cache | `api.ts` | MEDIUM |
| **`useAuth` mount-fetch has no `AbortController`** — setState on unmounted component | `useAuth.tsx:79-87` | LOW |

### Frontend quick wins

1. Add `type="button"` default to `Button.tsx` and `Card.tsx` (2 lines)
2. `Avatar.tsx` — switch `aria-hidden="true"` to a `decorative?: boolean` prop
3. `ErrorBoundary.tsx:79` — read `import.meta.env.VITE_API_URL` instead of hard-coded path
4. `useAuth` mount-fetch — add `AbortController` + cleanup
5. Remove dead `useProgramQueryParam` alias (`useProgramScopedApi.ts:37-39`)
6. Remove empty `variantStyles` record in `Button.tsx:13-19`
7. Remove dead default export in `PageDoodles.tsx:276`
8. Add `aria-invalid={!!error} aria-describedby={errorId}` to `Input.tsx`
9. Wire `ErrorBoundary` per route in `AppRoutes.tsx`
10. Cancel `useProgramScopedFetch` in-flight fetches on program switch

### Frontend big redesigns

- **R9: Decide design-system ownership (in-house / ShadCN / hybrid)** before any `shadcn add`. Recommend hybrid: ShadCN for primitives (`Button`, `Input`, `Card`, `Dialog`, `Select`), in-house for product-specific (`CTA`, `PageDoodles`, `TimelineCardHeader`). Migration path: rename `Button.tsx` → `Button/index.tsx` (kebab) to free the PascalCase slot. Or keep both, document the convention.
- **R10: Migrate to TanStack Query.** The codebase explicitly says it doesn't use React Query today (`useProgramScopedApi.ts:14-22`). Migrating fixes: shared cache, dedup, optimistic-update primitives, auto-refetch on focus, admin scope interceptor problem (replace `_set` hack with `useQuery(['admin', path, activeProgramId])`). Incremental per-feature-area: install `@tanstack/react-query`, wrap in `QueryClientProvider`, replace the largest useEffect+useState+axios patterns first.
- **R11: Per-route `ErrorBoundary` + per-route `Suspense` + standardized `useApiCall` hook** returning `{ data, loading, error, refetch }`. Every page reinvents today.

### Adding Phase 1.5 to the plan

Between Phase 1 (architectural foundations) and Phase 2 (context retriever), add **Phase 1.5 — Frontend foundations (~2-3 days)**:

- R9 (design-system ownership) — explicit decision + migration of one primitive as proof
- R10 install + minimal migration — wrap App in QueryClientProvider, migrate search + community feed
- Per-route ErrorBoundary wrap

Then Phase 2 builds the context retriever against the new query layer.

---

## 5. What's NOT in scope (deliberate)

- Discord bot rewrite
- Cloudinary → GCS migration
- Replacing the in-house design-system layer with ShadCN end-to-end (already scaffolded in `b6eb0ca`; decide per-component when to `npx shadcn add`)
- Rewriting frontend thread-detail unification (PostDetailDialog vs ThreadDetail — both ~900 lines, 90% duplicate)
- Real-time updates (websocket)
- Cross-program knowledge sharing
- Conversation memory for AskAI (independent feature; out of scope)
- Auth model switch (JWT → opaque sessions) — high-leverage but big lift
- Embedding model change (mxbai → OpenAI text-embedding-3-small or similar)
- Vector DB migration (Atlas → Pinecone/Weaviate/Qdrant) — overkill at current scale

---

## 6. Decisions (user-confirmed)

| # | Decision |
|---|---|
| 1 | **No Redis.** Drop `@upstash/redis`, `rate-limit-redis`, `bullmq`. Replace queue with Mongo-backed (agenda or custom). Rate limit stays in-memory (single-instance is acceptable). |
| 2 | **No embeddings.** No vector index. Pure MongoDB `$text` indexes for retrieval. Auto-answer uses LLM for *generation* (still needed) but retrieval is text-only. |
| 3 | **ChatGPT-style auto-answer.** Context = doc insights + Zoom transcripts + FAQs + rolling context (comments, recent activity, user history). Program-scoped. Ask human when unsure. Admin answer becomes program knowledge. |
| 4 | **Admin flag UI** ships in Phase 1. |
| 5 | **No vector index** (consistent with #2). |
| 6 | **Hybrid design-system.** ShadCN for primitives (Button, Input, Card, Dialog, Select). In-house for product-specific (CTA, PageDoodles, TimelineCardHeader). Convention locked BEFORE next `shadcn add`. |
| 7 | **Selective TanStack Query** — search, community feed, auto-answer queue only. |

### Implications

- **Phase 1 adds**: dependency removal (`@upstash/redis`, `rate-limit-redis`, `bullmq`), queue replacement, rate-limit fail-closed comment, feature flag UI.
- **Phase 2 redesigns** the context retriever as text-only with no vector similarity. Atlas `$text` indexes already exist on FAQ (`faq.model.ts:306-309`); add them to `TranscriptKnowledge`, `DocumentInsight`, `CommunityPost`, and `Comment`.
- **Auto-answer pipeline** still uses an LLM to *generate* the answer from the assembled context — just no vector similarity in retrieval. Same ChatGPT-style "compose context, ask the model" pattern.
- **ProgramKnowledge** stores text (not embedding). Re-queryable by text index on `(question + answer + keywords)`.

### Future-friendly: embeddings as a pluggable retrieval source

The user wants embeddings support kept pluggable for later. **Phase 2 architecture** accommodates this without committing to embedding work now:

- `services/contextRetriever.ts` exposes a **`RetrievalSource` interface**: `{ name: string; search(query, batchId, opts): Promise<RankedHit[]> }`.
- Default implementations shipped in Phase 2: `FaqTextSource`, `KbTextSource` (Zoom + DocumentInsight), `CommunityTextSource`, `CommentsSource`, `RecentActivitySource`. Each uses MongoDB `$text` indexes.
- **The interface is intentionally identical to what an embeddings source would look like.** When embeddings come back later:
  - Add `embedding?: number[]` (optional) to `ProgramKnowledge`, `FAQ`, `TranscriptKnowledge`, `DocumentInsight`, `CommunityPost`.
  - Create an Atlas vector index per collection (kept in code, deferred).
  - Add `VectorRetrievalSource` implementing the same interface, optionally weighted higher in `RetrievalRegistry`.
- The pipeline never has to change shape. Adding a new retrieval source is a single file + a single line in config.
- `ProgramKnowledge` schema keeps `embedding: [Number]` (optional) so documents created without embeddings don't error when retrieval tries to call a vector source — the source just returns empty for those rows.

This is the "room for embeddings" the user asked for. Today it costs nothing (no vector index, no embedding model calls); tomorrow it's a config flip.

---

## 6a. Open questions (refined after user decisions)

Now that the user committed on 7 of the 9, the remaining open questions are smaller:

1. **Job queue choice** — `agenda` (Mongo-backed, mature, npm-installable) vs custom Mongo collection + cron-driven `findOneAndUpdate` lock? Recommend `agenda` for traction. **Decision needed.**
2. **Hybrid convention enforcement** — rename `Button.tsx` → `Button/index.tsx`, **OR** keep PascalCase in-house and use `button.tsx` (kebab) ShadCN? Either way document in `docs/design-system.md`. **Decision needed before any `shadcn add`.**
3. **LLM provider priority** — with no embeddings, the provider priority (Anthropic > OpenAI > xAI > MiniMax) is now only about generation cost/latency. Anthropic Claude 4 Sonnet is best for long-context answer generation. **Confirm or change.**
4. **Admin login UX** — current admin auth-failure redirects to `/?next=/admin`. Frontend audit flagged this as inconsistent with user flow. Fix in Phase 1.5? **Decision needed.**

---

## 7. Verification plan

For each phase, the deliverable includes:

- `pnpm run typecheck` — clean
- `pnpm run lint` — clean (no new warnings)
- `pnpm run test:run` — all tests pass (existing + new)
- `pnpm run build` — both apps build clean
- Manual smoke test of the user-facing flow
- For Phase 3 specifically: an integration test that exercises the feedback loop (post created → AI asked human → admin answers → similar post created → AI now answers with the admin's knowledge)

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Embedding dim change in Phase 2 breaks Atlas index | `embeddingVersion` field on every doc + migration script |
| Admin's corrections introduce noise into the knowledge base | `confidenceBoost` per seedSource; admin_corrections need 2nd admin confirmation before becoming top-scoring source |
| Phase 0 fixes accidentally break existing tests | Run all tests per commit; branch-name discipline |
| Phase 1 reputation backfill loses points during migration | Migration script is idempotent; can re-run; documents the rollback |
| Phase 3 auto-answer runs at wrong cadence | `cronManager` with `lock()` + per-program iterate (no global cron) |
| Knowledge base grows unbounded | Add `ProgramKnowledge.lastVerifiedDate` + freshness demotion in `searchKnowledge` |
| `admin-projects.routes.ts` fix breaks callers | Identify all callers via grep before removing legacy route |

---

## 9. Tracking

I'll track phase progress in:
- GitHub project board (to be created)
- This doc (status updated as phases land)

Each phase ends with a tagged release commit + a PR with the phase summary.