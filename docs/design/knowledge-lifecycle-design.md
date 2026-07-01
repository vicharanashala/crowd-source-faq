# Knowledge Item Lifecycle — Complete Design Specification

> **Context:** Yaksha FAQ Portal (crowd-source-faq). TypeScript/Express/MongoDB backend, React/Vite frontend.
> This spec supersedes any prior partial lifecycle diagrams.

---

## 1. Overview

The platform has one core job: turn community questions into verified, searchable FAQ entries.

Every piece of knowledge passes through a 7-stage pipeline:

```
QUESTION → DISCUSSION → SOLVED → COMMUNITY_ACCEPTED → AI_VALIDATED → ADMIN_ACCEPTED → OFFICIAL_FAQ
```

The pipeline is **strictly additive** — once a post advances a stage, it never regresses. All state transitions are recorded in an **Audit Log**.

---

## 2. Status Enumeration

| Status | Value | Description | Gate |
|---|---|---|---|
| `OPEN` | `open` | New question, no accepted answer yet | Default on creation |
| `ANSWERED` | `answered` | Has an accepted answer (from author or comments) | Author accepts answer OR admin resolves |
| `SOLVED` | `solved` | Synonym for `answered` in the UI — same value | Same gate |
| `COMMUNITY_ACCEPTED` | `community_accepted` | Passed community validation, ready for AI | ≥10 upvotes + accepted answer + no open reports + 24h review window |
| `AI_VALIDATED` | `ai_validated` | AI has processed and formatted as FAQ candidate | AI review job completes |
| `ADMIN_ACCEPTED` | `admin_accepted` | Admin has reviewed and approved | Admin clicks Approve |
| `CONVERTED_TO_FAQ` | `converted_to_faq` | Moved to official FAQ database | Admin approval complete |

**Implementation note:** The existing `CommunityPost.status` field uses `'answered' | 'unanswered'`. The new pipeline uses the extended statuses above. The mapping is:
- `unanswered` → `OPEN`
- `answered` → `ANSWERED` / `SOLVED`
- `community_accepted`, `ai_validated`, `admin_accepted`, `converted_to_faq` are stored on a **new `lifecycle.status` field** added to `CommunityPost`.

```typescript
// New field on CommunityPost
lifecycle: {
  status: 'open' | 'answered' | 'community_accepted' | 'ai_validated' | 'admin_accepted' | 'converted_to_faq';
  statusHistory: Array<{
    from: string;
    to: string;
    changedBy: Types.ObjectId;
    changedAt: Date;
    note?: string;
  }>;
  // Stage metadata
  communityAcceptedAt?: Date;
  aiValidatedAt?: Date;
  adminAcceptedAt?: Date;
  convertedToFaqAt?: Date;
  // AI output (populated at Stage 5)
  aiGeneratedFaq?: {
    question: string;
    answer: string;
    category: string;
    tags: string[];
    confidenceScore: number; // 0-100
    duplicateOf?: Types.ObjectId; // FAQ ID if duplicate detected
    hallucinationFlags: string[];
    grammarIssues: string[];
  };
}
```

---

## 3. Stage-by-Stage Specification

### Stage 1: Question Creation (`OPEN`)

**Entry:** User calls `POST /api/community`

**Validations:**
- Title required, max 200 chars
- Body required, max 5000 chars
- Tags: max 3, stripped of whitespace
- Duplicate check via `detectDuplicatesWithAI()` — checks both FAQ DB and community posts

**On duplicate detection (409):**
```json
{
  "isDuplicate": true,
  "matches": [{ "type": "faq"|"community", "id": "...", "title": "...", "similarity": 0.87 }]
}
```

**On success:** Post created with `lifecycle.status = 'open'`, initial audit entry.

---

### Stage 2: Community Discussion (`OPEN`)

**Actions available:**
- `POST /api/community/:id/comments` — add answer
- `POST /api/community/:id/comments/:cid/upvote` — upvote answer (+5 pts to author)
- `POST /api/community/:id/comments/:cid/downvote` — downvote answer (auto-delete if net ≤ -5)
- `POST /api/community/:id/upvote` — upvote question (+2 pts to author)
- `POST /api/community/:id/report` — report content

**Reputation awarded during this stage:**

| Action | Points |
|---|---|
| Your question receives an upvote | +2 |
| Your answer receives an upvote | +5 |
| First Responder award (Time-Trial) | +20 |

**No points for:** comments, views, bookmarks.

---

### Stage 3: Solution Selection

**Entry:** `PATCH /api/community/:id/comments/:cid/accept-answer` (author-only) OR `PATCH /api/community/:id/resolve` (admin/mod)

**`acceptCommentAnswer` effects:**
- `post.answer = comment.body`
- `post.answerAuthorId = comment.author`
- `post.status = 'answered'`
- `post.lifecycle.status = 'answered'`
- `comment.verified = true`
- `post.promotionCandidateCommentId = commentId`

**`resolvePost` effects (admin resolves directly):**
- `post.answer = req.body.answer`
- `post.status = 'answered'`
- `post.answerIsExpert = true`
- `post.lifecycle.status = 'answered'`

**Reputation:**
- +20 pts to answer author (accepted answer)

---

### Stage 4: Community Validation (`COMMUNITY_ACCEPTED`)

**Auto-entry conditions (all must be true):**
- `lifecycle.status === 'answered'`
- `post.upvotes.length >= 10` (configurable via `FAQ_PROMOTION_UPVOTE_THRESHOLD`)
- No unresolved reports
- Not objected by moderator
- Not already pending/promoted

**Review window:** 24 hours (configurable via `FAQ_PROMOTION_REVIEW_WINDOW_HOURS`)

**Implementation:** `promotionService.checkPromotionEligibility()` and `startPromotionReview()` are called from `toggleUpvote` and `acceptCommentAnswer`. A nightly cron job (`runPromotionCycle`) promotes posts whose review window has elapsed.

**On `COMMUNITY_ACCEPTED`:**
- `lifecycle.status = 'community_accepted'`
- `lifecycle.communityAcceptedAt = new Date()`
- Audit log entry added
- `post.eligibleForPromotion = true`, `post.promotionPendingAt = new Date()`

**Moderator objection blocks promotion:**
- `POST /api/community/:id/object-to-promotion` sets `promotionObjectedBy`, clears `eligibleForPromotion`

---

### Stage 5: AI Validation (`AI_VALIDATED`)

**Trigger:** FAQ promotion cycle creates a draft FAQ. A separate AI review job (triggered by cron or webhook) processes drafts with `sourceType = 'community_promotion'` and `trustLevel = 'medium'`.

**AI performs:**
1. **Duplicate detection** — checks against existing FAQ DB using `detectDuplicatesWithAI()`. If duplicate found with similarity > 0.85, flags `duplicateOf` and sets `hallucinationFlags: ['possible_duplicate']`.
2. **Hallucination checks** — verifies answer claims against knowledge base / Zoom transcripts
3. **Grammar correction** — suggests corrections without changing meaning
4. **FAQ formatting** — reformats to canonical Q&A structure
5. **Tag generation** — suggests tags based on content analysis
6. **Category assignment** — suggests category from existing category list

**Output stored on `lifecycle.aiGeneratedFaq`:**
```typescript
{
  question: string;        // AI-refined question
  answer: string;          // AI-refined answer
  category: string;        // Suggested category
  tags: string[];          // Suggested tags
  confidenceScore: number; // 0-100
  duplicateOf?: string;    // FAQ ID if duplicate
  hallucinationFlags: string[];
  grammarIssues: string[];
}
```

**On AI validation complete:**
- `lifecycle.status = 'ai_validated'`
- `lifecycle.aiValidatedAt = new Date()`

**If duplicate detected:** Post is flagged for admin merge review instead of full approval flow.

---

### Stage 6: Admin Review (`ADMIN_ACCEPTED`)

**Entry:** Admin reviews from Admin Dashboard → Community Promotions queue.

**Admin sees:**
- Original question
- Accepted answer (from community)
- AI-generated FAQ (question, answer, category, tags)
- AI confidence score
- Hallucination flags / grammar issues
- Similar existing FAQs
- Duplicate warnings

**Admin actions:**

| Action | Result |
|---|---|
| **Approve** | Creates official FAQ, `lifecycle.status = 'admin_accepted'`, then `='converted_to_faq'`. Awards +25 to answer author, +15 to question author, +10 admin bonus. |
| **Reject** | `lifecycle.status` unchanged, post returns to `community_accepted`. Moderator objection recorded. |
| **Merge** | Admin picks a target FAQ. Merges tags/body from AI output into target FAQ. Marks this post as merged. |
| **Edit** | Admin manually edits AI output before approving. Saved as-is. |

**Implementation:**
- `POST /api/admin/community-promotions/:id/approve` → `promoteToCommunityApproved()` (creates FAQ), then `promoteToAdminApproved()` (trustLevel='expert')
- `POST /api/admin/community-promotions/:id/reject`
- `POST /api/admin/community-promotions/:id/merge` with `{ targetFaqId }`
- `POST /api/admin/community-promotions/:id/edit` with AI output overrides

---

### Stage 7: Official FAQ (`CONVERTED_TO_FAQ`)

**The FAQ document is created in `yaksha_faq_faqs` collection:**

```typescript
{
  question: string;           // From AI or admin
  answer: string;             // From accepted answer
  category: string;           // From AI or admin
  tags: string[];             // From AI or admin
  status: 'approved';
  trustLevel: 'expert';       // admin_accepted level
  sourceType: 'community_promotion';
  sourceCommunityPostId: ObjectId;
  sourceCommentId: ObjectId | null;  // Which comment was accepted
  promotedAt: Date;
  createdBy: ObjectId;        // Question author
  promotionMetadata: {
    upvotesAtPromotion: number;
    communityAnswerAuthorId: ObjectId;
    promotedBy: ObjectId;    // Admin who approved
  };
}
```

**The community post is updated:**
- `lifecycle.status = 'converted_to_faq'`
- `lifecycle.convertedToFaqAt = new Date()`
- Audit log entry

**Searchability:** The new FAQ is indexed and immediately searchable across Home, FAQ, and Community pages.

---

## 4. Audit History

Every status change appends to `lifecycle.statusHistory`:

```typescript
statusHistory: [{
  from: string;       // e.g. 'open'
  to: string;         // e.g. 'answered'
  changedBy: ObjectId;
  changedAt: Date;
  note?: string;      // e.g. 'Admin approved', 'Review window elapsed', 'Merged with FAQ xyz'
}]
```

Frontend displays audit history as a vertical timeline on the Question Details page.

---

## 5. Status Chips (Frontend)

| Status | Chip color | Label |
|---|---|---|
| `open` | Gray | Open |
| `answered` | Blue | Answered |
| `community_accepted` | Emerald | Community Approved |
| `ai_validated` | Purple | AI Validated |
| `admin_accepted` | Indigo | Admin Approved |
| `converted_to_faq` | Stone | Official FAQ |

---

## 6. Community Board — Question Card

Each card displays:

```
┌─────────────────────────────────────────────────────────────┐
│ [STATUS CHIP]                              [bookmark icon]  │
│                                                             │
│ Question Title (truncated to 2 lines)                       │
│ Short body preview (truncated to 3 lines)                   │
│                                                             │
│ [#tag] [#tag] [#tag]                                        │
│                                                             │
│ Posted by [AuthorName] · 2h ago                             │
│ ▲ 24  · 💬 7 answers  · Last activity 1h ago                │
└─────────────────────────────────────────────────────────────┘
```

**Fields on card:**
- `title`, `body` (truncated), `tags`, `author.name`, `createdAt`
- `lifecycle.status` → chip
- `upvotes.length` → upvote count
- `comments.length` → answer count
- `updatedAt` → last activity

---

## 7. Question Details Page

**Sections (vertical scroll):**

1. **Question Header** — title, body, tags, author, date, status chip, upvote button, bookmark
2. **Attachments** — image grid if any
3. **Answers** — threaded comments, verified answer highlighted at top, upvote/downvote per answer, accept-answer button (author only)
4. **Related Questions** — sidebar or bottom section, same tags
5. **Similar FAQs** — from `detectDuplicatesWithAI()`, shown below answers
6. **Activity Timeline** — audit history, each entry as `[date] [user] [action] [from → to]`

---

## 8. Bookmark System

**Routes:**
- `POST /api/bookmarks` `{ targetId, targetType: 'community'|'faq' }`
- `DELETE /api/bookmarks/:id`
- `GET /api/bookmarks` — user's bookmarks, paginated

**Behaviour:**
- Appears in "My Saved Knowledge" page
- Does NOT affect reputation
- Shows bookmark count on cards (for community/social proof only)

---

## 9. Reputation System Redesign

### Points

| Action | Points | Recipient |
|---|---|---|
| Question upvote received | +2 | Question author |
| Answer upvote received | +5 | Answer author |
| Accepted answer | +20 | Answer author |
| Question converted to FAQ | +15 | Question author |
| Answer used in FAQ | +25 | Answer author |
| Admin approves FAQ | +10 bonus | Question author |
| Confirmed spam report | -20 | Offender |

**Implementation:**
- All point awards go through `awardPoints()` in `reputationController.ts`
- Each award logs to `ReputationLog` with `action` field for filtering
- Auto badge check runs after every point change

### Badge Tiers (replace existing)

| Points | Badge | Label |
|---|---|---|
| 0–49 | newcomer | Newcomer |
| 50–149 | contributor | Contributor |
| 150–299 | helper | Helper |
| 300–599 | expert | Expert |
| 600–999 | champion | Champion |
| 1000+ | knowledge_master | Knowledge Master |

Replace `TIER_THRESHOLDS` in `User.ts`:
```typescript
export const TIER_THRESHOLDS: Record<Tier, number> = {
  newcomer: 0,
  contributor: 50,
  helper: 150,
  expert: 300,
  champion: 600,
  knowledge_master: 1000,
};
```

Add new `ReputationAction` values:
```typescript
export type ReputationAction =
  | 'faq_post'
  | 'faq_approved'
  | 'faq_helpful'
  | 'answer_accepted'
  | 'upvote_received'
  | 'report_valid'
  | 'badge_awarded'
  | 'admin_point_award'
  | 'faq_rejected'
  | 'answer_downvoted'
  | 'report_rejected'
  | 'badge_revoked'
  | 'admin_point_deduct'
  | 'faq_converted'        // new: question → FAQ
  | 'faq_answer_used'      // new: answer used in FAQ
  | 'admin_approval_bonus' // new: admin bonus
  | 'spam_confirmed';      // new: negative
```

---

## 10. Leaderboard Redesign

### Score Formula

```
score = points + acceptedAnswerBonus + faqContributionBonus
```

Where:
- `points` = raw reputation points
- `acceptedAnswerBonus` = `acceptedAnswersGiven * 5` (weight accepted answers)
- `faqContributionBonus` = `faqsContributedTo * 10` (weight FAQ creation)

### Top 3 Podium Section

```
🥇 [Avatar] [Badge] [Name]
   1,240 pts · 18 FAQs · 42 accepted answers

🥈 [Avatar] [Badge] [Name]
   980 pts · 12 FAQs · 31 accepted answers

🥉 [Avatar] [Badge] [Name]
   760 pts · 9 FAQs · 28 accepted answers
```

### Full Table Columns

| Rank | User | Badge | Points | Accepted Answers | FAQ Contributions | Trust Score |
|---|---|---|---|---|---|---|
| 1 | Alice | Expert | 1,240 | 42 | 18 | 94 |

### Trust Score

Calculated per-user on leaderboard request:
```
trustScore = Math.min(100,
  (accountAgeDays / 365) * 20 +     // up to 20 pts for age
  acceptedAnswersGiven * 2 +         // 2 pts each
  faqsContributedTo * 3 +            // 3 pts each
  (100 - reportsAgainstUser * 5)     // -5 per report
)
```

### Rankings

Tabs: **Weekly** | **Monthly** | **All-Time**

- Weekly: filter `ReputationLog` by `createdAt >= 7 days ago`, aggregate per user
- Monthly: filter by `30 days ago`
- All-Time: sum all

### Backend Changes

- `GET /api/reputation/leaderboard?period=weekly|monthly|all&limit=50`
- Uses aggregation pipeline on `ReputationLog` for time-filtered ranks
- Real-time: leaderboard is recomputed per request (acceptable for this scale)

---

## 11. Duplicate Detection — While Typing

**Route:** `POST /api/community/check-duplicate`

**Called:** On title input change (debounced 500ms in frontend)

**Request:** `{ title: string }`

**Response:**
```json
{
  "isDuplicate": true,
  "matches": [
    { "type": "faq", "id": "...", "title": "...", "similarity": 0.91 },
    { "type": "community", "id": "...", "title": "...", "similarity": 0.84 }
  ]
}
```

**Implementation:** Uses `detectDuplicatesWithAI()` — same function used server-side in `createPost`. Calls AI with title, returns similar FAQs (from vector search + rerank) and community posts (from semantic search).

---

## 12. Community Health Dashboard

Displayed on Community Board header or a `/community/stats` endpoint:

| Metric | Query |
|---|---|
| Response Rate | `count({ status: 'answered' }) / count({ lifecycle.status: 'open' })` |
| Solved Rate | `count({ lifecycle.status: { $in: ['community_accepted', 'converted_to_faq'] } }) / total` |
| Active Contributors | Distinct users who posted/commented in last 7 days |
| New Questions This Week | `count({ createdAt: { $gte: 7d ago } })` |

**Route:** `GET /api/community/stats`

---

## 13. Moderation Actions

### User Reports

- `POST /api/community/:id/report` `{ reason: 'spam'|'duplicate'|'abuse' }`
- Stored in `post.reports[]`
- 3+ reports from distinct users → auto-hide pending admin review

### Admin Actions

| Action | Route | Effect |
|---|---|---|
| Hide | `PATCH /api/admin/posts/:id/hide` | `escalationStatus = 'escalated'`, post hidden from public feed |
| Lock | `PATCH /api/admin/posts/:id/lock` | Comments closed, banner shown |
| Merge | `POST /api/admin/posts/:id/merge` | Links to target post, marks as merged |
| Delete | `DELETE /api/admin/posts/:id` | Hard delete, logs to AdminLog |

---

## 14. Zoom FAQ Extraction Integration

When a Zoom meeting is processed and Q&A extracted:
- Each extracted Q&A pair can become a `TranscriptKnowledge` entry
- Admin can promote `TranscriptKnowledge` → FAQ directly (sourceType: `'zoom_transcript'`)
- This path bypasses community stages 1-4, goes straight to admin review

**New field on FAQ model (already exists):**
```typescript
sourceType: 'manual' | 'community_promotion' | 'expert_verified' | 'zoom_transcript';
sourceMeetingId: ObjectId | null;
sourceMeetingTopic: string | null;
```

---

## 15. Implementation Phases

### Phase 1 — Schema + Status Pipeline (backend)
- [ ] Add `lifecycle` subdocument to `CommunityPost` model
- [ ] Update `CommunityPostStatus` type to include all lifecycle statuses
- [ ] Update `checkPromotionEligibility()` to check `lifecycle.status`
- [ ] Update `startPromotionReview()` to set `lifecycle.status = 'community_accepted'`
- [ ] Add `runPromotionCycle()` update for lifecycle status
- [ ] Add audit log entries to all transition points

### Phase 2 — AI Validation (backend)
- [ ] Add `lifecycle.aiGeneratedFaq` field population
- [ ] Create `aiController.runCommunityPromotionReview(faqId)` 
- [ ] Add duplicate detection, hallucination checks, grammar, tagging, category assignment

### Phase 3 — Admin Review Queue (backend + frontend)
- [ ] `GET /api/admin/community-promotions` — paginated queue
- [ ] `POST /api/admin/community-promotions/:id/approve` — creates FAQ, updates lifecycle
- [ ] `POST /api/admin/community-promotions/:id/reject` — records objection
- [ ] `POST /api/admin/community-promotions/:id/edit` — admin edits AI output
- [ ] `POST /api/admin/community-promotions/:id/merge` — merge into existing FAQ
- [ ] Admin Dashboard UI: promotion queue page with AI diff view

### Phase 4 — Reputation System (backend)
- [ ] Replace `TIER_THRESHOLDS` in `User.ts`
- [ ] Add new `ReputationAction` values
- [ ] Update `toggleUpvote` to award +2 (question) / +5 (answer) with correct distinction
- [ ] Add `faq_converted`, `faq_answer_used`, `admin_approval_bonus` point awards
- [ ] Update `promotionService` for new point structure
- [ ] Add `spam_confirmed` penalty

### Phase 5 — Leaderboard (backend + frontend)
- [ ] `GET /api/reputation/leaderboard?period=weekly|monthly|all` — aggregation pipeline
- [ ] Update `LeaderboardPage.tsx` with top-3 podium + full table
- [ ] Add Trust Score computation
- [ ] Add period tabs (Weekly/Monthly/All-Time)

### Phase 6 — Community Board UI (frontend)
- [ ] Update Question Card to show `lifecycle.status` chip
- [ ] Add bookmark count to cards
- [ ] Update Question Details page with audit timeline
- [ ] Add "Similar FAQs" section using duplicate check
- [ ] "My Saved Knowledge" bookmark page

### Phase 7 — Duplicate Detection UX (frontend)
- [ ] Debounced `check-duplicate` call on title input
- [ ] Show duplicate suggestions inline as user types
- [ ] Block submission if similarity > 0.9

### Phase 8 — Zoom Integration (backend)
- [ ] `TranscriptKnowledge` → FAQ promotion path
- [ ] `sourceType: 'zoom_transcript'` FAQ creation route

---

## 16. Key Files to Modify

| File | Changes |
|---|---|
| `backend/models/CommunityPost.ts` | Add `lifecycle` subdocument, new indexes |
| `backend/models/FAQ.ts` | Already has `sourceType`, `sourceMeetingId` — confirm completeness |
| `backend/models/User.ts` | Replace `TIER_THRESHOLDS`, add `ReputationAction` values |
| `backend/models/ReputationLog.ts` | No changes needed (flexible `action` field) |
| `backend/services/promotionService.ts` | Update for new lifecycle statuses, new point structure |
| `backend/controllers/postController.ts` | Lifecycle status transitions, audit log entries |
| `backend/controllers/commentController.ts` | Lifecycle status on accept-answer |
| `backend/controllers/reputationController.ts` | Leaderboard aggregation with period filter |
| `backend/controllers/adminController.ts` | Promotion queue endpoints |
| `backend/routes/community.ts` | Add `object-to-promotion` route |
| `backend/routes/admin.ts` | Add promotion queue routes |
| `backend/routes/reputation.ts` | Add period-filtered leaderboard route |
| `frontend/src/pages/CommunityPage.tsx` | Updated card with lifecycle chip |
| `frontend/src/pages/LeaderboardPage.tsx` | Top-3 podium, period tabs, Trust Score |
| `frontend/src/pages/AccountPage.tsx` | "My Saved Knowledge" bookmarks |

---

## 17. Backward Compatibility Notes

- Existing community posts with `status: 'answered'` and no `lifecycle` field are treated as `lifecycle.status = 'answered'` (defaults to `'answered'`)
- Existing FAQ entries with `sourceType: 'manual'` or `'expert_verified'` remain unchanged
- `trustLevel: 'high'` remains the "official" tier; `'expert'` = admin approved, `'medium'` = community approved — existing values preserved
- Reputation points for existing users are not retroactively changed