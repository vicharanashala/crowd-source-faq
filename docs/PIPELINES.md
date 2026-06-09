# Pipelines — Complete Reference

> See also: `backend/utils/pipelineCommon.ts` (shared utilities), `backend/utils/aiProvider.ts` (AI provider config), `references/auto-answer-pipeline-2026-06-05.md`, `references/faq-audit-pipeline.md`, `references/zoom-pipeline-2026-05.md`, `references/search-pipeline.md`

---

## Table of Contents

1. [Auto-Answer Pipeline](#1-auto-answer-pipeline) — AI answers unanswered community posts
2. [FAQ Audit Pipeline](#2-faq-audit-pipeline) — AI monitors FAQ quality over time
3. [Search Pipeline](#3-search-pipeline) — Hybrid vector + keyword search
4. [Zoom Ingestion Pipeline](#4-zoom-ingestion-pipeline) — Per-user OAuth transcript processing
5. [Shared Infrastructure](#5-shared-infrastructure)
6. [Adding a New Pipeline](#6-adding-a-new-pipeline)

---

## 1. Auto-Answer Pipeline

**What it does:** Automatically finds unanswered community posts, searches the knowledge base for matching FAQs, and either posts a verified answer or queues it for human review.

**Files:**
- Controller: `backend/controllers/autoAnswerController.ts`
- Routes: `backend/routes/adminAutoAnswer.ts` → `/api/admin/auto-answer/*`
- Frontend: `frontend/src/admin/pages/AdminAutoAnswerQueue.tsx` → `/admin/auto-answer`
- Scheduler: `runScheduledAutoAnswer()` / `stopAutoAnswerScheduler()`
- Config env: `AUTO_ANSWER_*`

### Flow

```
Scheduler fires every 24h  (AUTO_ANSWER_INTERVAL_HOURS)
        │
        ▼
Find eligible posts:
  - status = 'open'
  - aiAnswerStatus = null | 'escalated'
  - createdAt ≥ AUTO_ANSWER_MIN_POST_AGE_HOURS (default 2h)
  - No recent aiAnswerAttempts (cooldown)
  Limit: AUTO_ANSWER_BATCH_SIZE (default 20)
        │
        ▼
Per post: findBestAnswer(title + body)
        │
        ├── 1. searchKnowledgeWithFallback(query, 3)
        │     → semantic search across TranscriptKnowledge
        │     → match score × 0.9 = confidence
        │
        └── 2. No match? → AI generation fallback
              build prompt with top-3 recent approved FAQs as context
              → chatWithConfig(cfg, messages)
              → confidence = 0.62 (conservative — generated, not matched)
        │
        ▼
isSensitiveContent(title + body)?
  → YES: escalate regardless of confidence
  → NO:  continue triage
        │
        ▼
triageByScore(confidence):
  ≥ 0.85 (AUTO_ANSWER_APPROVE_THRESHOLD) → auto_approve
  0.60–0.84                                  → queue_review
  < 0.60                                     → escalate
        │
   ┌────┴────┐
   ▼         ▼
auto_approve      queue_review / escalate
   │                │
   │           log to PipelineResult
   │           (flagged=true, verdict='suggested'|'escalated')
   │                │
   │           Admin reviews at /admin/auto-answer
   │           PATCH /admin/auto-answer/:postId
   │           { action: 'approve'|'reject'|'escalate', manualAnswer? }
   │
   ▼
Post: aiAnswer = answer text
     aiAnswerStatus = 'approved'
     aiAnswerConfidence = confidence
     aiAnswerSource = 'faq_knowledge' | 'ai_generated'
     status = 'answered'
     lastCheckedAt updated
        │
        ▼
Notification → post.author
TeaDrop → post author ("Your question was answered!")
logResult() → PipelineResult collection
```

### Env vars

| Variable | Default | Description |
|---|---|---|
| `AUTO_ANSWER_APPROVE_THRESHOLD` | `0.85` | Min confidence to auto-post |
| `AUTO_ANSWER_SUGGEST_THRESHOLD` | `0.60` | Min confidence to queue for review |
| `AUTO_ANSWER_BATCH_SIZE` | `20` | Max posts per scheduler run |
| `AUTO_ANSWER_MIN_POST_AGE_HOURS` | `2` | Post must be this old before processing |
| `AUTO_ANSWER_INTERVAL_HOURS` | `24` | Scheduler interval |
| `AUTO_ANSWER_PROVIDER` | auto-detect | `anthropic` / `openai` / `xai` / `minimax` |
| `AUTO_ANSWER_MODEL` | provider default | Model name |

### Admin endpoints

```bash
# View queue
curl http://localhost:6767/api/admin/auto-answer/queue \
  -H "Authorization: Bearer <admin_token>"

# Dry run (no changes)
curl -X POST "http://localhost:6767/api/admin/community/auto-answer?dry_run=true" \
  -H "Authorization: Bearer <admin_token>"

# Process specific post
curl -X POST "http://localhost:6767/api/admin/community/auto-answer?post_id=<id>" \
  -H "Authorization: Bearer <admin_token>"

# Process all eligible
curl -X POST "http://localhost:6767/api/admin/community/auto-answer?all=true" \
  -H "Authorization: Bearer <admin_token>"
```

### CommunityPost model fields

```ts
aiAnswer: string
aiAnswerConfidence: number
aiAnswerStatus: 'approved' | 'suggested' | 'escalated' | null
aiAnswerSource: 'faq_knowledge' | 'ai_generated'
aiAnswerSuggestedAt: Date
aiAnswerReviewedAt: Date
aiAnswerReviewedBy: ObjectId
aiAnswerEscalatedAt: Date
aiAnswerEscalatedReason: string
aiAnswerAttempts: number
lastCheckedAt: Date
```

---

## 2. FAQ Audit Pipeline

**What it does:** Periodically re-evaluates approved FAQs against the live knowledge base (Zoom transcripts + community insights). Flags drift, contradiction, or stale content for admin review.

**Files:**
- Controller: `backend/controllers/faqAuditController.ts`
- Routes: `backend/routes/adminAudit.ts` → `/api/admin/audit/*`
- Frontend: `frontend/src/admin/pages/AdminFAQAudit.tsx` → `/admin/faq-audit`
- Scheduler: `runScheduledFAQAudit()` / `stopFAQAuditScheduler()` — every 6h

### Flow

```
Scheduler fires every 6h  (FAQ_AUDIT_INTERVAL_HOURS)
        │
        ▼
Find eligible FAQs:
  - reviewStatus = 'approved'
  - Sort: oldest lastCheckedAt first (ensures even coverage)
  Limit: FAQ_AUDIT_BATCH_SIZE (default 20)
        │
        ▼
Per FAQ: auditFAQ(faq)
        │
        ├── 1. searchKnowledgeWithFallback(question, 5)
        │     → top-5 TranscriptKnowledge matches
        │     → circuit-breaker safe (returns null on failure)
        │
        ├── 2. Check ZoomInsights (pending_review or approved)
        │     → keyword match against question title
        │     → source overlap detected → boosts confidence or flags drift
        │
        ├── 3. Send to AI via getPipelineProviderConfig('faq_audit')
        │     → chatWithConfig(cfg, messages)
        │     → system prompt: judge correctness against knowledge base
        │
        ▼
Verdict logic:
  score ≥ 0.80        → correct     (no action)
  score 0.60–0.79    → drift_detected (flagged)
  score < 0.60       → contradiction  (flagged)
  No KB context + old + never verified → stale (flagged)
  confidence < 0.35  → skip (low AI confidence — don't flag)
        │
        ▼
Flagged FAQs:
  reviewStatus = 'pending_review'
  flagType = 'auto'
  flagReason = '[AI Audit] {verdict}: {reason}'
  reviewCycle incremented
  lastCheckedAt updated
        │
        ▼
logResult() → PipelineResult (pipeline='faq_audit', flagged=true for non-correct)
Result appears in existing /admin/faqs/review queue
```

### Env vars

| Variable | Default | Description |
|---|---|---|
| `FAQ_AUDIT_BATCH_SIZE` | `20` | Max FAQs per scheduler run |
| `FAQ_AUDIT_FLAG_THRESHOLD` | `0.65` | Score below this → flag |
| `FAQ_AUDIT_INTERVAL_HOURS` | `6` | Scheduler interval |
| `FAQ_AUDIT_PROVIDER` | auto-detect | `anthropic` / `openai` / `xai` / `minimax` |
| `FAQ_AUDIT_MODEL` | provider default | Model name |

### Admin endpoints

```bash
# Check stats
curl http://localhost:6767/api/admin/audit/stats \
  -H "Authorization: Bearer <admin_token>"

# View results
curl http://localhost:6767/api/admin/audit/results \
  -H "Authorization: Bearer <admin_token>"

# Dry run
curl -X POST "http://localhost:6767/api/admin/audit/faqs?dry_run=true" \
  -H "Authorization: Bearer <admin_token>"

# Live run
curl -X POST "http://localhost:6767/api/admin/audit/faqs" \
  -H "Authorization: Bearer <admin_token>"
```

### FAQ model fields

```ts
lastCheckedAt: Date | null     // Tracks last audit time
reviewCycle: number             // Increments on each audit
reviewStatus: 'approved' | 'pending_review' | 'draft'
flagType: 'manual' | 'auto' | null
flagReason: string | null
```

---

## 3. Search Pipeline

**What it does:** Hybrid search combining MongoDB Atlas vector search (semantic) with MongoDB `$text` keyword search, merged via Reciprocal Rank Fusion (RRF).

**Files:**
- Controller: `backend/controllers/searchController.ts` → `POST /api/search`
- Community-only: `backend/controllers/communitySearchController.ts`
- Utilities: `backend/utils/search.ts` (RRF + threshold), `backend/utils/embeddings.ts`
- Frontend: `SearchBar.tsx`, `SearchDropdown.tsx`, `HomePage.tsx`

### Flow

```
POST /api/search { query: "..." }
        │
        ▼
Check LRU cache  (500 items, 1h TTL)
  Key: query.trim().toLowerCase()
  Hit? → bufferSearchLog → return cached results immediately
        │
        ▼
generateEmbedding(query)
  Model: Xenova/multi-qa-mpnet-base-dot-v1
  Dimensions: 768  |  Singleton pipeline (GPU-accelerated WebAssembly)
        │
        ▼
4 parallel queries:
  runVectorSearch('yaksha_faq_faqs',         embedding, 5)
  runVectorSearch('yaksha_faq_communityposts', embedding, 5)
  runTextSearch('yaksha_faq_faqs',         query, 5)
  runTextSearch('yaksha_faq_communityposts',query, 5)
        │
        ▼
Tag results by source: 'faq' | 'community'
  allVec = faqVec + commVec
  allTxt = faqTxt + commTxt
        │
        ▼
computeRRF(allVec, allTxt)
  k = 60 (RRF_K)
  Formula: score = 1 / (k + rank)
  Same doc in both lists → scores ADD
  Sort descending by rrfScore
        │
        ▼
applySearchThreshold(results)
  Kept if: textScore > 0  OR  vectorScore ≥ 0.80
  (Note: `thresholds` param is accepted but IGNORED — filtering is hardcoded)
        │
        ▼
slice(0, 5) → setCachedResults → bufferSearchLog → log → return JSON
```

### Embedding backfill

```bash
cd backend
npm run backfill:embeddings   # FAQ embeddings
npm run backfill:community    # Community post embeddings
```

### Duplicate FAQ check (pre-submission)

```
User types title in CreatePostDialog
         │
         ▼ debounce 500ms + min 10 chars
POST /faq/check-match { query: "..." }
         │
         ▼
generateEmbedding(query)
         │
         ▼
$vectorSearch on yaksha_faq_faqs (numCandidates=5, limit=5)
         │
         ▼
topResult.vectorScore ≥ 0.82?
  → YES: { matched: true, faq: { question } } — show banner, block submit
  → NO:  { matched: false } — allow submission
```

### Search log buffering (2026-06-08 fix)

Cache hits (Redis + LRU) now also call `bufferSearchLog()` so trending queries analytics are not skewed. Previously, only non-cached searches were logged.

---

## 4. Zoom Ingestion Pipeline

**What it does:** Per-user Zoom OAuth → webhook-triggered transcript download → VTT parsing → dual output (ZoomInsights for admin review + TranscriptKnowledge for zero-human auto-approval).

**Files:**
- Routes: `backend/routes/zoom.ts`
- Auth controller: `backend/controllers/zoomAuthController.ts` — OAuth connect/callback/disconnect/status
- Main controller: `backend/controllers/zoomController.ts` — webhook, manual upload, admin CRUD
- Utilities: `zoomOAuth.ts`, `zoomExtractor.ts`, `vttParser.ts`
- Frontend: `AccountPage.tsx` (connect/disconnect), `AdminZoomInsights.tsx` (review UI)

### OAuth Flow

```
User clicks "Connect Zoom" on AccountPage
         │
         ▼
GET /api/zoom/auth/connect
  → Generate HMAC state (zoomOAuthState)
  → Store in session/Redis with 10min expiry
  → Redirect to Zoom OAuthauthorize URL
         │
         ▼
Zoom redirects to /api/zoom/auth/callback?code=...&state=...
         │
         ▼
verifyZoomState(state) — HMAC verify, reject if expired/tampered
exchange code for tokens (access_token + refresh_token)
encrypt tokens with AES-256-GCM (zoomEncryptionKey)
store in User document:
  zoomConnected: true
  zoomUserId: zoom user ID
  zoomAccessToken / zoomRefreshToken (encrypted)
  zoomConnectedAt: Date
         │
         ▼
User's tokens used for all future transcript downloads
```

### Webhook Flow (automatic)

```
Zoom fires POST /api/zoom/webhook
  → verifyZoomSignature() — HMAC verified
  → fail-closed in production if ZOOM_WEBHOOK_SECRET_TOKEN missing
  → res.status(200).json({ received: true }) immediately
  → processRecordingEvent() async [non-blocking]
        │
        ▼
processRecordingEvent():
  • sanitizeText(topic) + check ZOOM_TOPIC_BLACKLIST (skip if match)
  • find user by zoomUserId OR host_email (zoomConnected:true)
  • skip if zoomMeetingId already exists (dedup)
  • ZoomMeeting.create({ status: 'pending', sourcing: 'webhook' })
        │
        ▼
processTranscriptForUser(meeting, userId):
  • downloadTranscriptAsUser() — uses user's encrypted+auto-refreshed OAuth token
  • processTranscriptPayloadInternal()
        │
        ├── isEmptyTranscript() — reject transcripts < 30 chars
        ├── parseVTTWithSpeakers() → plainText (max 50k chars)
        ├── extractInsightsFromTranscript() → ZoomInsight docs (status: pending_review)
        └── processZoomMeetingForKnowledge() → TranscriptKnowledge (status: approved, inline embed)
        │
        ▼
ZoomMeeting: status → 'completed', insightCount updated
```

### Dual Output Paths

```
Transcript text
    │
    ├── PATH A — ZoomInsights (curated)
    │     extractInsightsFromTranscript()
    │     → ZoomInsight { status: 'pending_review' }
    │     → Admin reviews at /admin/zoom-insights
    │     → Admin approves → status: 'approved'
    │     → POST /api/zoom/insights/:id/convert-to-faq → creates FAQ
    │
    └── PATH B — TranscriptKnowledge (zero-human)
          processZoomMeetingForKnowledge()
          → TranscriptKnowledge { status: 'approved', inline embedding }
          → Immediately vector-searchable via RAG
          → Promoted to official FAQ via promoteToFAQ()
```

### Manual Upload

```bash
# Multipart file upload
curl -X POST http://localhost:6767/api/zoom/upload-transcript \
  -F "file=@meeting.vtt" \
  -F "source=manual_vtt"

# Raw text body
curl -X POST http://localhost:6767/api/zoom/upload-transcript \
  -H "Content-Type: application/json" \
  -d '{"rawText": "...", "source": "manual_raw"}'
```

Returns `{ meetingId, zoomMeetingId, topic }` for progress polling.

### Admin backfill

```bash
curl -X POST "http://localhost:6767/api/zoom/auth/backfill?fromDate=2025-01-01&toDate=2025-12-31" \
  -H "Authorization: Bearer <admin_token>"
```

### Zoom env vars

| Variable | Required | Purpose |
|---|---|---|
| `ZOOM_CLIENT_ID` | Yes | OAuth app client ID |
| `ZOOM_CLIENT_SECRET` | Yes | OAuth app client secret |
| `ZOOM_REDIRECT_URI` | No | Override callback URI (default: `http://localhost:6767/api/zoom/auth/callback`) |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Yes (prod) | Webhook HMAC verification — fail-closed without it |
| `ZOOM_TOPIC_BLACKLIST` | No | CSV of regex patterns — matching meeting titles are skipped |

### Webhook registration (production)

Server-side code is complete. Register in Zoom Marketplace:
1. Marketplace → your app → Webhooks → Add event subscription
2. Endpoint URL: `https://your-domain.com/api/zoom/webhook`
3. Subscribe to: `recording.transcript_completed` (primary) + `recording.completed` (fallback)
4. Copy secret → `ZOOM_WEBHOOK_SECRET_TOKEN`

---

## 5. Shared Infrastructure

### `pipelineCommon.ts` (`backend/utils/pipelineCommon.ts`)

Used by both Auto-Answer and FAQ Audit pipelines. Import from here — never duplicate.

```ts
import {
  searchKnowledgeWithFallback,  // KB search with circuit-breaker (null on failure)
  triageByScore,                 // threshold triage: auto_approve / queue_review / escalate
  buildAuditMetaUpdate,          // { $set: { lastCheckedAt }, $inc: { reviewCycle } }
  logPipelineEvent,              // structured logging: [pipeline] action id=... conf=... verdict=...
  isSensitiveContent,            // synchronous sensitive-topic check (always escalates)
} from '../utils/pipelineCommon.js';
```

| Function | Signature | Behavior |
|---|---|---|
| `searchKnowledgeWithFallback` | `(query, topK=5) => Promise<SearchResult[]\|null>` | Returns `null` on KB failure instead of throwing |
| `triageByScore` | `(confidence, opts?) => {verdict, confidence, reason}` | Thresholds: 0.85/0.60/0.35 (configurable) |
| `buildAuditMetaUpdate` | `(existingCycle?) => UpdateQuery` | Consistent update shape across both pipelines |
| `logPipelineEvent` | `(meta) => void` | `logger.warn "[pipeline] flagged id=... conf=62% verdict=..."` |
| `isSensitiveContent` | `(text) => boolean` | Hardcoded sensitive topics — always escalate |

### `aiProvider.ts` (`backend/utils/aiProvider.ts`)

Per-pipeline AI provider configuration. **Never hardcode `chat('openai', ...)` in pipeline controllers.**

```ts
import { chatWithConfig, getPipelineProviderConfig } from '../utils/aiProvider.js';

// Correct pattern:
const cfg = await getPipelineProviderConfig('auto_answer'); // or 'faq_audit'
const reply = await chatWithConfig(cfg, [
  { role: 'system', content: systemPrompt },
  { role: 'user',   content: userPrompt },
]);
```

Per-pipeline env var overrides:
```bash
# FAQ audit pipeline
FAQ_AUDIT_PROVIDER=anthropic
FAQ_AUDIT_MODEL=claude-sonnet-4-20250514

# Auto-answer pipeline
AUTO_ANSWER_PROVIDER=minimax
AUTO_ANSWER_MODEL=MiniMaxAI/MiniMax-M2.7
```

Without overrides, auto-detects the first available key (Anthropic → OpenAI → XAI → MiniMax).

### `PipelineResult` model (`backend/models/PipelineResult.ts`)

Unified result log for both pipelines. Single collection with TTL (30 days).

```ts
{
  pipeline: 'auto_answer' | 'faq_audit',
  targetModel: 'CommunityPost' | 'FAQ',
  targetId: ObjectId,
  targetTitle: string,
  score: number,           // confidence
  verdict: string,         // 'approved' | 'suggested' | 'escalated' | 'correct' | 'drift_detected' | 'contradiction' | 'stale'
  confidence: number,
  flagged: boolean,        // true when verdict ≠ 'approved' / 'correct'
  sources: string[],       // matched knowledge source IDs
  metadata: object,
  checkedAt: Date,         // TTL index — auto-deleted after PIPELINE_RESULT_TTL_DAYS
}
```

Indexes: `{pipeline, flagged, checkedAt}`, `{targetId, pipeline}`, `{checkedAt}` (TTL).

---

## 6. Adding a New Pipeline

1. **Import shared utilities** from `pipelineCommon.ts`:
   ```ts
   import { searchKnowledgeWithFallback, triageByScore, buildAuditMetaUpdate, logPipelineEvent, isSensitiveContent } from '../utils/pipelineCommon.js';
   ```

2. **Use `getPipelineProviderConfig` + `chatWithConfig`** for AI calls. Never hardcode provider names.

3. **Write results to `PipelineResult`** with `pipeline: 'your_pipeline_name'`.

4. **Call `buildAuditMetaUpdate(existingCycle)`** on every document update.

5. **Call `logPipelineEvent`** after each significant step (started, completed, flagged, error).

6. **Use `isSensitiveContent`** before auto-committing any content.

7. **Admin routes are mounted at `/api/admin`** — include the full path segment in the router file:
   ```ts
   // WRONG — creates /api/admin/queue (frontend expects /api/admin/your-pipeline/queue)
   router.get('/queue', handler);

   // CORRECT
   router.get('/your-pipeline/queue', handler);
   ```

8. **Always verify routes with curl** before wiring frontend:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" http://localhost:6767/api/admin/your-pipeline/queue
   ```

9. **Run `tsc --noEmit`** after creating new controller files.

10. **Add migration script** if schema changes need existing data updates — run once, make idempotent.