# Crowd Source FAQ Wire Audit — Full Re-Audit

> File-by-file audit: every route, controller, service, utility
> Audited via: codebase_memory graph (2,056 nodes), grep, read_file
> Date: 2026-06-22

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Exists AND wired (route registered or scheduler running or called internally) |
| ⚙️  | Exists, functional — but NOT wired to any caller/scheduler/route |
| ❌ | Missing entirely |
| 🟡 | Partially wired / edge case / fragile |
| 🔴 | Broken / will throw at runtime |

---

## Backend Routes — 12 route files, all read

### `/api/auth` ✅
`auth.ts` — all routes wired. `loginLimiter` + `registerLimiter` applied.

### `/api/faq` ✅
`faq.ts` — all routes wired. Freshness endpoints (`flagFAQ`, `voteReview`) are manual triggers.

### `/api/community` ✅
`community.ts` — all routes wired. `acceptCommentAnswer` route registered line 47.

### `/api/search` ✅
`search.ts` — all routes wired. `suggestLimiter` (30 req/min) applied to `/suggest`.
Also has `/unresolved-list`, `/unresolved-stats`, `/unresolved/:id/resolve` at `/api/search/...`
which are also admin-only.

### `/api/admin` ✅
`admin.ts` — all routes wired under `adminOnly`. Includes 2FA, escalation, AI config, promotion management.

### `/api/notifications` ✅
`notification.ts` — all routes wired under `protect`.

### `/api/notifications/tea` ✅
`tea.ts` — all routes wired under `protect`. Mounted at `/api/notifications/tea`.

### `/api/reputation` ✅
`reputation.ts` — `/leaderboard` public, rest under `adminOnly`.

### `/api/moderation` ✅
`moderation.ts` — all routes wired under `adminOnly`.

### `/api/zoom` ✅
`zoom.ts` — all routes wired. `/public-stats` public, OAuth under `protect+authorize(admin)`, rest under `protect+authorize(admin)`.

### `/api/knowledge` ✅
`knowledge.ts` — all routes wired under `protect+authorize(admin)`. Routes:
- `GET /` — listKnowledge
- `POST /process-upvotes` — processHighUpvotePosts
- `POST /process-meeting/:id` — triggerMeetingProcess
- `POST /answer-from-knowledge/:postId` — answerFromKnowledgeController (answers a community post from the knowledge base)
- `PUT /:id/approve` — approveKnowledge
- `PUT /:id/reject` — rejectKnowledge
- `PUT /:id/promote` — promoteToFAQ

### `/api/analytics` ✅
`analytics.ts` — all routes wired under `protect+authorize(admin,moderator)`.

---

## Schedulers — In server.ts and escalationController.ts

### Escalation Scheduler (escalationController.ts)
`startEscalationScheduler()` runs on a **single interval** (default 60 min, `UNANSWERED_ESCALATION_CHECK_MINUTES` env var):

| Check | Function | Interval | Wired? |
|-------|----------|----------|--------|
| Auto-escalation (3+ unanswered comments → escalated) | `runUnansweredEscalationCheck()` | 60 min | ✅ |
| Time-Trial (16h unanswered → `pending`) | `runTimeTrialCheck()` | 60 min | ✅ |
| FAQ freshness (auto-flag stale FAQs) | `runFreshnessCheck()` | 24h | ✅ |

Both `runUnansweredEscalationCheck` and `runTimeTrialCheck` fire on the **same interval tick** inside one `setInterval`. Correct — no issue.

### Promotion Scheduler (promotionService.ts via server.ts)
| Check | Function | Interval | Wired? |
|-------|----------|----------|--------|
| FAQ promotion cycle | `runPromotionCycle()` | 15 min | ✅ Called by `setInterval` in server.ts line 262 |

### Retention Policy Scheduler — ✅
`scripts/retentionPolicy.ts` — now scheduled via `setInterval` in server.ts (24h interval). Runs:
- `cleanSearchLogs` (RETENTION_DAYS, default 90d)
- `cleanNotifications` (read notifications, 30d)
- `cleanFreshReviewLogs` (180d)
- `cleanModerationLogs` (365d)
- `cleanAdminLogs` (365d)

---

## server.ts — Initialization

```
Imports wired at startup:
  ✅ startEscalationScheduler()       — line 259 (app.listen callback)
  ✅ runFreshnessCheck() + setInterval — line 266 (every 24h)
  ✅ runPromotionCycle() + setInterval — line 262 (every 15 min)
  ✅ flushSearchLogs()                — line 284 (SIGTERM/SIGINT shutdown hook)
  ✅ runRetention() + setInterval      — line 280 (every 24h)

Imports present but NOT called:
  ✅ (none — all previously unwired schedulers are now scheduled)
  ✅ getMetrics()                     — called by /api/metrics endpoint (line 163)
  ✅ jobQueue                          — imported, used in gracefulShutdown (line 281)
  ✅ warmEmbedder()                   — called by /api/warm endpoint (line 155)
```

---

## Controllers — All export paths verified

### authController.ts — 9 exports
| Function | Wired? |
|----------|--------|
| `register` | ✅ POST /auth/register |
| `login` | ✅ POST /auth/login |
| `getMe` | ✅ GET /auth/me |
| `getAllUsers` | ✅ GET /auth/users |
| `updateProfile` | ✅ PATCH /auth/profile |
| `changePassword` | ✅ PUT /auth/password |
| `updateUserRole` | ✅ PATCH /auth/users/:id/role |
| `deleteUser` | ✅ DELETE /auth/users/:id |
| `exportUserData` | ✅ GET /auth/export |

### freshnessController.ts — 7 exports
| Function | Wired? |
|----------|--------|
| `flagFAQ` | ✅ PATCH /faq/:id/flag |
| `voteReview` | ✅ POST /faq/:id/vote-review |
| `getReviewQueue` | ✅ GET /community/review-queue |
| `getEscalated` | ✅ GET /admin/escalated |
| `verifyEscalatedFAQ` | ✅ POST /admin/escalated/:id/verify |
| `dismissEscalatedFAQ` | ✅ POST /admin/escalated/:id/dismiss |
| `runFreshnessCheck` | ✅ Wired to 24h setInterval in server.ts |

### escalationController.ts — 9 exports
| Function | Wired? |
|----------|--------|
| `startEscalationScheduler` | ✅ Called by server.ts line 259 |
| `stopEscalationScheduler` | ✅ Called on SIGTERM/SIGINT |
| `runUnansweredEscalationCheck` | ✅ Called by scheduler |
| `runTimeTrialCheck` | ✅ Called by scheduler |
| `getEscalatedPosts` | ✅ GET /admin/community/escalated-posts |
| `resolveEscalatedPost` | ✅ POST /admin/community/escalated-posts/:id/resolve |
| `dismissEscalatedPost` | ✅ POST /admin/community/escalated-posts/:id/dismiss |
| `getEscalationHistory` | ✅ GET /admin/community/escalation-history |

### commentController.ts — 8 exports
All wired via `community.ts` routes.

### postController.ts — 15 exports
All wired via `community.ts` routes. Internal calls:
- `dispatchNotification` (notificationDispatcher) — called on post upvote and resolve
- `searchKnowledge` (knowledgeBase) — called in `checkDuplicateController` during post creation
- `detectDuplicatesWithAI` (duplicateDetector) — called during post creation

### searchController.ts — 4 exports
| Function | Wired? |
|----------|--------|
| `semanticSearch` | ✅ POST /search |
| `getTrending` | ✅ GET /search/trending |
| `getSuggest` | ✅ GET /search/suggest |
| `flushSearchLogs` | ✅ Called on SIGTERM/SIGINT |

### aiController.ts — 7 exports + 1 internal helper
| Function | Wired? |
|----------|--------|
| `getAiConfig` | ✅ GET /admin/ai/config |
| `updateAiConfig` | ✅ PATCH /admin/ai/config |
| `resetAiUsage` | ✅ POST /admin/ai/config/reset-usage |
| `getAiProviders` | ✅ GET /admin/ai/providers |
| `testProvider` | ✅ GET /admin/ai/providers/test |
| `revealApiKey` | ✅ GET /admin/ai/config/api-key/:provider |
| `detectActiveProvider` | ✅ Called internally by aiController itself |

### teaNotificationController.ts — 5 exports + 2 helpers
| Function | Wired? |
|----------|--------|
| `getTeaNotifications` | ✅ GET /notifications/tea |
| `getTeaUnreadCount` | ✅ GET /notifications/tea/unread-count |
| `markAllTeaAsRead` | ✅ PATCH /notifications/tea/read-all |
| `markTeaAsRead` | ✅ PATCH /notifications/tea/:id/read |
| `createTeaDropsForFAQ` | ✅ Called by faqController.approveFAQ |
| `createTeaDrop` | ✅ Called internally by commentController (post_answered events) |

### zoomController.ts — 7 exports
| Function | Wired? |
|----------|--------|
| `listMeetings` | ✅ GET /zoom/meetings |
| `getMeeting` | ✅ GET /zoom/meetings/:id |
| `listInsights` | ✅ GET /zoom/insights |
| `updateInsight` | ✅ PUT /zoom/insights/:id |
| `getZoomHealthStatus` | ✅ GET /zoom/health |
| `getZoomPublicStats` | ✅ GET /zoom/public-stats |
| `handleZoomWebhook` | ✅ POST /zoom/webhook (Zoom calls this; also calls `processZoomMeetingForKnowledge` non-blocking after insight extraction) |

### zoomAuthController.ts — 4 exports
All wired via `/api/zoom/auth/*` routes.

### notificationController.ts — 6 exports
All wired via `/api/notifications` routes.

### moderationController.ts — 6 exports
All wired via `/api/moderation` routes.

### reputationController.ts — 6 exports
| Function | Wired? |
|----------|--------|
| `getLeaderboard` | ✅ GET /reputation/leaderboard |
| `getUserReputation` | ✅ GET /reputation/user/:userId |
| `awardPoints` | ✅ POST /reputation/points |
| `issueBadge` | ✅ POST /reputation/badge/issue |
| `revokeBadge` | ✅ POST /reputation/badge/revoke |
| `autoCheckBadges` | ✅ Called by promotionService.ts during FAQ promotion |

### knowledgeController.ts — 7 exports
| Function | Wired? |
|----------|--------|
| `listKnowledge` | ✅ GET /knowledge/ |
| `approveKnowledge` | ✅ PUT /knowledge/:id/approve |
| `rejectKnowledge` | ✅ PUT /knowledge/:id/reject |
| `promoteToFAQ` | ✅ PUT /knowledge/:id/promote |
| `processHighUpvotePosts` | ✅ POST /knowledge/process-upvotes |
| `triggerMeetingProcess` | ✅ POST /knowledge/process-meeting/:id |
| `answerFromKnowledgeController` | ✅ POST /knowledge/answer-from-knowledge/:postId |

---

## Services

### promotionService.ts — 11 exports
| Function | Wired? |
|----------|--------|
| `checkPromotionEligibility` | ✅ Called by `runPromotionCycle` |
| `startPromotionReview` | ✅ Called by `runPromotionCycle` AND `postController.ts` line 313, 317, 410 |
| `promoteToCommunityApproved` | ✅ Called by `runPromotionCycle` |
| `promoteToAdminApproved` | ✅ Called by `promoteFAQ` route |
| `promoteToOfficial` | ✅ Called by `promoteFAQ` route |
| `objectToPromotion` | ✅ Admin route `/faqs/:id/object` |
| `objectToFAQPromotion` | ✅ Admin route |
| `getCommunityPendingFAQs` | ✅ GET /admin/faqs/community-pending |
| `promoteFAQ` | ✅ POST /admin/faqs/:id/promote |
| `objectToFAQ` | ✅ POST /admin/faqs/:id/object |
| `runPromotionCycle` | ✅ Called every 15 min by server.ts |

### knowledgeBase.ts — 9 exports
| Function | Wired? |
|----------|--------|
| `extractKnowledgeFromTranscript` | ✅ Called by `processZoomMeetingForKnowledge` |
| `processZoomMeetingForKnowledge` | ✅ Called by `handleZoomWebhook` (non-blocking) AND `triggerMeetingProcess` route |
| `processHighUpvotePosts` | ✅ GET /knowledge/process-upvotes (admin route) |
| `searchKnowledge` | ✅ Called by `checkDuplicateController` during post creation AND `answerFromKnowledge` |
| `promoteToFAQ` | ✅ Called by `promoteToFAQ` admin route |
| `embedUnprocessedKnowledge` | ✅ Called by `triggerMeetingProcess` |
| `answerFromKnowledge` | ✅ Called by `answerFromKnowledgeController` route |

### aiClient.ts
`AiClient` class — used by `knowledgeBase.ts` and `duplicateDetector.ts` via `resolveProviderAsync()`.

---

## Utils

| File | Exports | All Wired? |
|------|---------|-----------|
| `rateLimit.ts` | `loginLimiter`, `registerLimiter`, `passwordChangeLimiter`, `adminWriteLimiter`, `twoFALimiter`, `userBurstLimiter`, `createIdentityLimiter` | ✅ All applied to routes |
| `cache.ts` | `getCachedResults`, `setCachedResults`, `invalidateCache`, `cacheAvailable` | ✅ Used by search and promotion |
| `embeddings.ts` | `warmEmbedder`, `generateEmbedding` | ✅ `warmEmbedder` called by /api/warm; `generateEmbedding` called by search + promotion |
| `sanitize.ts` | `sanitizeHtml`, `sanitizeText`, `sanitizeRegex`, `sanitizeBase64`, `sanitizeEmail`, `sanitizePathSegment` | ✅ `sanitizeHtml` used in post and comment write paths |
| `duplicateDetector.ts` | `detectDuplicatesWithAI` | ✅ Called during post creation |
| `aiProvider.ts` | `resolveProviderAsync`, `resolveProvider`, `invalidateProviderCache` | ✅ Used by aiClient and duplicateDetector |
| `zoomCache.ts` | `ZoomCache` class | ✅ Used by zoomController |
| `circuitBreaker.ts` | `CircuitBreaker`, `zoomOAuthCircuit`, `zoomApiCircuit` | ✅ Used by zoomOAuth and zoomController |
| `crypto.ts` | `encrypt`, `decrypt`, `getMasterKey` | ✅ Used by zoomOAuth for token encryption AND AiConfig for API key encryption |
| `notificationDispatcher.ts` | `dispatchNotification` | ✅ Called by postController |
| `jobQueue.ts` | `jobQueue.enqueue`, `jobQueue.flush`, `jobQueue.drain` | ✅ `flush` called on shutdown; `enqueue` used internally |
| `vttParser.ts` | `parseVTT`, `parseVTTWithSpeakers`, `extractSnippet`, `isEmptyTranscript` | ✅ Used by zoomController for transcript parsing |
| `zoomExtractor.ts` | `extractInsightsFromTranscript` | ✅ Called by zoomController during meeting processing |
| `requestContext.ts` | `runWithContext`, `getContext`, `getRequestId`, `getUserId` | ✅ Used by server.ts request middleware |
| `metrics.ts` | `getMetrics` + instrumented counters/gauges/histograms | ✅ `getMetrics` called by /api/metrics |
| `requestLogger.ts` | `requestLogger` | ✅ Used in server.ts line 76 |
| `fileLogger.ts` | `ingestFrontendLog` | ✅ POST /api/log in server.ts line 116 |

---

## Frontend Components

### SpillTheTea ✅
- Polling behavior: `setInterval` (30s) only when `open === true`. ✅
- BG toast (dropdown closed, new `post_answered`): `lastSeenIdRef` sentinel prevents toasting on pre-existing data. ✅
- No toast when `lastSeenIdRef.current === null` (first load). ✅
- Toast auto-dismisses after 4s. ✅
- Click-outside closes dropdown. ✅
- `storage` event listener for cross-tab sync. ✅

### SearchBar ✅
- Autosearch fires after 600ms debounce. ✅
- `AbortController` for search cancel in `api.ts`. ✅
- Text preserved in search bar after search. ✅

### useAuth ✅
- `storage` event listener for cross-tab logout/login. ✅
- 401 interceptor redirects to `/login`. ✅

---

## Summary — What Needs Attention

### 🔴 Must Fix (not yet done)
*(none)*

### 🟡 Partial / Edge Cases
1. **`mention` notification** — no `@username` parsing infrastructure in the codebase (no frontend mention input/picker, no backend mention extractor). Wiring this up requires building the full mention feature, not just notification dispatch.