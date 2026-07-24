# Auto-Answer Feedback Loop

## What it does

Auto-answer community posts by retrieving program-scoped context (FAQ +
Knowledge Base + community + comments + recent activity), deciding
`answer` / `suggest` / `ask_human` based on rank thresholds, and
persisting the full context snapshot for admin review. When an admin
corrects an answer, the correction becomes program knowledge that
ranks higher on the next similar post.

## Pipeline — `apps/backend/src/services/autoAnswer.ts`

1. `fetchContext(post.title + body, batchId, topK=3, maxHits=10)` →
   5 default text sources ranked by `score × (confidence × sourceWeight) × freshness`
2. Decision tree on the top hit's rank:
   - `rank >= 0.85` AND `confidence >= 0.7` → `'answer'` (or `'ask_human'` if content flagged sensitive)
   - `rank >= 0.60` → `'suggest'` (admin review)
   - `rank >= 0.30` → `'ask_human'` (admin writes)
   - else → `'ask_human'` (below floor)
3. Persist on the post: `aiAnswer`, `aiAnswerStatus`, `aiAnswerConfidence`,
   `aiAnswerSource`, `aiContext` snapshot, `lastAutoAnswerAt`, `aiAnswerAttempts++`

Thresholds read from `AppSetting`: `autoAnswerApproveThreshold`,
`autoAnswerSuggestThreshold`, `autoAnswerAskHumanThreshold`.

## Idempotency

60-minute cooldown gate (`autoAnswerCooldownMinutes`, default 60). If
the post is in `suggested` / `ask_human` / `escalated` AND
`lastAutoAnswerAt` is within the cooldown window, `processPost`
returns the prior decision without re-running.

`rerunWithContext` (admin "Ask AI Again") bypasses the cooldown by
clearing `lastAutoAnswerAt` before re-running.

## Sources — 5 default text sources (weight × confidence × freshness)

| source           | weight | query target                                                   |
|------------------|--------|---------------------------------------------------------------|
| `faq`            | 1.0    | `FAQ` model — `$text` on question+answer+tags                  |
| `kb`             | 1.1    | `TranscriptKnowledge` + `DocumentInsight` + `ProgramKnowledge` |
| `community`      | 0.85   | Answered + AI-approved `CommunityPost` rows                   |
| `comments`       | 0.6    | Embedded comments on recent posts (token overlap + upvotes)   |
| `recent_activity`| 0.4    | Last 30d FAQs (breadth floor)                                 |

Each source returns raw hits; `fetchContext` normalises the per-source
score to 0..1 and merges by `score × (confidence × sourceWeight) × freshness`.

## Feedback loop

When admin approves an edit (`POST /admin/auto-answer/:postId/approve-edit`):

1. `CommunityPost.answer` set to the admin's text, `status='answered'`
2. `ProgramKnowledge` row written: `seedSource='admin_corrected'`, `confidenceBoost=1.5`,
   `originalContextId=post._id.toString()`, `batchId=post.batchId`
3. Next similar post's `kb` source returns this row with high
   confidence → ranks higher in the merge → triggers `'answer'` or
   `'suggest'` instead of `'ask_human'`

The E2E test `autoAnswer.e2e.test.ts` proves this loop end-to-end.

## Admin UI — `apps/frontend/src/admin/pages/AdminAutoAnswerQueue.tsx`

- Tabs: `asked` (count) / `suggested` (count) / `all` (count)
- Per-item card: title + author + body + AI draft (monospace)
- 3 source citations from `post.aiContext.hits[0..3]` (click to expand)
- Admin reply textarea + 4 actions: `Approve` / `Approve + Edit` / `Reject` / `Ask AI Again`
- Side-by-side diff view (`grid 1fr 1fr`) when editing
- Prev / Next pagination driven by `pages` / `total`
- "Why did AI decide this?" → opens the drill-down view (Phase 4)

## API

| Method | Path                                                          | Purpose                                          |
|--------|---------------------------------------------------------------|--------------------------------------------------|
| GET    | `/admin/auto-answer/queue/paginated?status=&page=&limit=`     | Paginated, status-filterable queue               |
| POST   | `/admin/auto-answer/:postId/approve`                         | Set `status=answered`, `answer=aiAnswer`         |
| POST   | `/admin/auto-answer/:postId/approve-edit` `{answer}`           | Set answer, write `ProgramKnowledge admin_corrected` |
| POST   | `/admin/auto-answer/:postId/reject` `{reason?}`                | Clear `aiAnswer`, `status=rejected`              |
| POST   | `/admin/auto-answer/:postId/ask-ai-again` `{extraContext?}`    | Re-run pipeline with augmented context           |
| GET    | `/admin/auto-answer/:postId/context`                          | **Phase 4** — drill-down into persisted `aiContext` |
| GET    | `/admin/auto-answer/queue` (legacy)                            | Existing UI still works                          |
| POST   | `/admin/community/auto-answer` (manual trigger)                | Admin "Run Now" / "Dry Run"                      |
| PATCH  | `/admin/auto-answer/:postId` (legacy)                          | Legacy approve / reject / escalate               |

All admin endpoints: `protect` + `authorize('admin', 'ai_moderator', 'moderator')`.

## Feature flags

| key                                  | default | purpose                                          |
|--------------------------------------|---------|--------------------------------------------------|
| `communityAutoAnswer`                | true    | Kill switch for the cron + manual triggers       |
| `communityAutoAnswerAskHumanFallback`| true    | Affects the below-floor branch behaviour         |

## Scheduler

`cronManager.register('auto-answer-batch', handler: runAutoAnswerBatch,
intervalMs: config.cron.autoAnswerIntervalMs, default 24h)`. Registered
in `bootstrap/startup.ts` under the `communityAutoAnswer` feature flag
guard. Concurrency-locked — overlap is skipped, not queued (added in
Phase 3 commit 1).

## Observability — `autoAnswer.ts` decision logs

`logDecision(event, postId, fields)` emits structured one-liners:

```
[autoAnswer] decision <postId> {"decision":"suggest","topHitSource":"faq:abc","topHitRank":0.742,"topHitConfidence":0.95,"hitCount":3,"contextSources":[...],"snapshotTakenAt":"2026-07-02T..."}
[autoAnswer] ask_human <postId> {"reason":"below ask_human floor","topHitRank":0.18,"askHumanThreshold":0.30}
[autoAnswer] cooldown_skip <postId> {"status":"suggested","ageMs":12453,"cooldownMinutes":60}
[autoAnswer] error <postId> {"phase":"fetchContext","message":"..."}
```

Grep friendly: `[autoAnswer] decision <postId>` answers "why did this
post get a suggest?" without reading code. `phase` distinguishes
which pipeline step failed (llm, findById, attempts++, fetchContext, persist).

The full `aiContext` snapshot is persisted on every `processPost` run
and returned by `GET /admin/auto-answer/:postId/context` for the admin
drill-down UI.

## Runbook — common admin ops

### "I approved an edit but the AI isn't learning"

Check the `ProgramKnowledge` row was actually written:

```js
db.programknowledges.findOne({
  originalContextId: ObjectId("..."),
  seedSource: "admin_corrected",
})
// expect: { confidenceBoost: 1.5, batchId: ObjectId("..."), question, answer }
```

If missing: the `approve-edit` endpoint may have failed at
`promoteCorrectedAnswer` — check server logs for
`[autoAnswer] promoteCorrectedAnswer failed`.

If present: confirm `kb` source sees it. Run the smoke-test endpoint:

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:6767/admin/ask-ai/preview-context/$POST_ID?batchId=..."
```

`hits[*].source === "kb"` with `meta.originCollection === "ProgramKnowledge"`
means the kb source found the row.

### "The queue is stuck on 'asked' for hours"

1. Check feature flag `communityAutoAnswer` is still on:
   ```js
   db.featureflags.findOne({ key: "communityAutoAnswer" })
   ```
2. Check `lastAutoAnswerAt` is recent:
   ```js
   db.communityposts.findOne({ _id: ObjectId("...") }, { aiAnswerStatus: 1, lastAutoAnswerAt: 1 })
   ```
3. If recent and status is still `'asked'`, run `processPost` manually
   via the admin UI's "Ask AI Again" button (clears cooldown).
4. Check the cron is actually firing:
   ```sh
   grep "auto-answer-batch" /var/log/shamagama.log
   ```

### "Auto-answer is too aggressive" (approving things it shouldn't)

Raise the approve threshold:

```js
db.appsettings.updateOne(
  { _id: "singleton" },
  { $set: { "settings.autoAnswerApproveThreshold": 0.92 } }
)
```

Change is picked up on the next `processPost` read. Drop back to 0.85
once the feedback loop has enough `admin_corrected` rows to offset.

### "I see a 404 on `/admin/auto-answer/:postId/context`"

Means the post exists but has never been processed by `processPost`.
Either it's a brand-new post (wait for the next cron tick) or it's
a post that pre-dates Phase 3 (the `aiContext` field is new).
Re-trigger via the admin UI's "Run Now" or wait for the next batch.

## Files

- `apps/backend/src/services/autoAnswer.ts` — orchestrator
- `apps/backend/src/services/contextRetriever.ts` — 5-source retriever
- `apps/backend/src/models/ProgramKnowledge.ts` — curated knowledge store
- `apps/backend/src/modules/admin/adminAutoAnswerReview.controller.ts` — review endpoints
- `apps/backend/src/modules/admin/admin-auto-answer.routes.ts` — router
- `apps/backend/src/services/__tests__/autoAnswer.test.ts` — unit tests
- `apps/backend/src/services/__tests__/autoAnswer.e2e.test.ts` — E2E feedback loop
- `apps/frontend/src/admin/pages/AdminAutoAnswerQueue.tsx` — admin UI
- `docs/redesign-plan.md` §3.2 — original spec
