# Codebase Audit - Yaksha FAQ Portal (Shamagama)
Generated: 2026-06-01
Source: CodeGraphContext MCP (117 files, 354 functions, 83 modules)

## Project Overview

Full-stack FAQ & Community Platform. TypeScript backend (Express + MongoDB) + React/Vite frontend.

- **Backend**: Express.js on port 6767, MongoDB (cluster0.z3cgb58), Mongoose ODM
- **Frontend**: React 18 + Vite + TailwindCSS on port 5173
- **Auth**: JWT-based with admin/moderator/expert/user roles
- **AI**: Multi-provider (Anthropic, OpenAI, Grok, MiniMax) for duplicate detection, chat, embeddings

---

## Directory Structure

```
shamagama/
├── backend/
│   ├── config/          db.ts (connectDB)
│   ├── controllers/     21 controllers (auth, faq, post, comment, search, escalation...)
│   ├── middleware/       auth.ts, admin.ts
│   ├── models/          17 Mongoose models
│   ├── routes/          12 route files (admin, analytics, auth, faq, community...)
│   ├── services/         aiClient.ts, knowledgeBase.ts, promotionService.ts
│   ├── utils/           26 utilities (search, cache, logger, vttParser, zoom...)
│   └── scripts/         addIndexes.ts (migration)
├── frontend/
│   └── src/
│       ├── admin/pages/     13 admin pages (Dashboard, FAQs, Users, Moderation, Zoom...)
│       ├── components/       community, faq, layout, ui (20+ components)
│       ├── pages/            HomePage, FAQPage, CommunityPage, AccountPage, Login...
│       ├── hooks/            useAuth, useNotifications
│       └── utils/            api.ts
└── context/             This folder
```

---

## Controllers (21 files)

| Controller | Key Functions | Complexity |
|---|---|---|
| postController.ts | getAllPosts(49), checkDuplicate(22), resolvePost(16), createPost(10) | Highest |
| admin2faController.ts | computeTOTP(28), enable/disable/verify2FA | TOTP-based 2FA |
| zoomAuthController.ts | callbackZoom(24) | OAuth flow |
| commentController.ts | addComment(24), toggleUpvote(13), toggleDownvote(11) | |
| faqController.ts | getAllFAQs(22), getPaginatedFAQs(14), updateFAQ(14) | |
| freshnessController.ts | voteReview(20), runFreshnessCheck(14), verifyEscalatedFAQ(13) | |
| escalationController.ts | runUnansweredEscalationCheck(11), getEscalatedPosts, resolvePost | |
| adminController.ts | getStats(18), getFaqGrowth(17), getUserActivityChart(17) | |
| reputationController.ts | issueBadge(14), awardPoints(13), revokeBadge(10) | |
| zoomController.ts | processRecordingEvent(18) | |
| aiController.ts | getAiConfig, updateAiConfig, testProvider, detectActiveProvider | |
| searchController.ts | semanticSearch(9) | |
| authController.ts | register, login, logout, refresh | |
| notificationController.ts | getNotifications, markRead | |
| communitySearchController.ts | searchPosts | |
| moderationController.ts | suspendUser(10), getModerationLogs(10) | |
| dataExportController.ts | exportUserData | |
| knowledgeController.ts | ingest transcript knowledge | |
| teaNotificationController.ts | SpillTheTea notifications | |
| unresolvedSearchController.ts | track unanswered queries | |

---

## Routes (12 files)

- admin.ts - Dashboard stats, user management, escalation admin
- analytics.ts - FAQ growth, user activity charts
- auth.ts - Login, register, refresh
- community.ts - Posts CRUD
- faq.ts - FAQ CRUD + feedback
- knowledge.ts - Transcript ingestion
- moderation.ts - Suspend/unsuspend users
- notification.ts - User notifications
- reputation.ts - Badges, points
- search.ts - Semantic search
- tea.ts - SpillTheTea events
- zoom.ts - Zoom OAuth, meeting data

---

## Models (17 files)

| Model | Purpose |
|---|---|
| User.ts | Authentication, roles, reputation |
| FAQ.ts | Questions/answers with embeddings |
| CommunityPost.ts | User posts with comments, upvotes, escalation |
| Comment.ts | Thread comments |
| TeaNotification.ts | SpillTheTea event notifications |
| Notification.ts | User notifications |
| NotificationSettings.ts | Per-user preferences |
| FreshReviewLog.ts | FAQ freshness voting logs |
| FreshReviewVote.ts | Per-cycle vote tracking |
| UnresolvedSearch.ts | Unanswered query tracking |
| TranscriptKnowledge.ts | Extracted Zoom meeting knowledge |
| ZoomMeeting.ts | Zoom meeting metadata |
| AiConfig.ts | AI provider configuration |
| SearchLog.ts | Search query logging (TTL 90 days) |
| AdminLog.ts | Admin action audit log |
| ModerationLog.ts | Moderation action log |
| ReputationLog.ts | Reputation points history |
| Badge.ts | User badges |

---

## Services (3 files)

| Service | Key Functions | Notes |
|---|---|---|
| aiClient.ts | chat(18), summarize(13), parseDuplicateResponse(12), vectorFilter(11) | Multi-provider AI |
| knowledgeBase.ts | scoreAndSort(16), searchKnowledge(8), extractKnowledgeFromTranscript(7) | Zoom transcript processing |
| promotionService.ts | checkPromotionEligibility(13), promoteToAdminApproved(8), promoteToCommunityApproved(8) | Community post -> FAQ |

---

## Utils (26 files)

| Utility | Purpose |
|---|---|
| search.ts | computeRRF, vector search |
| duplicateDetector.ts | AI-powered duplicate detection (needs API key) |
| aiProvider.ts | Multi-provider resolution (Anthropic > OpenAI > Grok > MiniMax) |
| embeddings.ts | Vector embedding generation |
| vttParser.ts | parseVTTWithSpeakers(23) - VTT caption parsing |
| zoomOAuth.ts | getUserZoomToken(12) - OAuth token management |
| zoomExtractor.ts | parseExtractedItems(18) - meeting data extraction |
| zoomFallback.ts | withFallback(23), _isRetryable(17) - resilient Zoom calls |
| zoomHealth.ts | getZoomHealth(20) - health check |
| zoomCache.ts | Caching for Zoom data |
| cache.ts | Invalidate-based caching |
| circuitBreaker.ts | Execute with failure tracking |
| logger.ts | Request/scoped logging |
| fileLogger.ts | File-based logging |
| requestLogger.ts | HTTP request logging with sanitizeBody(14), statusColor(9) |
| metrics.ts | Prometheus metrics |
| notificationDispatcher.ts | dispatchNotification |
| rateLimit.ts | Rate limiting (stripped by user preference) |
| sanitize.ts | Input sanitization |
| validation.ts | Input validation |
| crypto.ts | Encryption utilities |
| requestContext.ts | Request-scoped context |
| jobQueue.ts | Background job processing |

---

## Frontend Pages & Complexity

| Page | Complexity | Notes |
|---|---|---|
| PostDetailDialog.tsx | 164 | HIGHEST - massive dialog component |
| CommunityPage.tsx | 121 | Community feed |
| FAQPage.tsx | 89 | FAQ browsing |
| CreatePostDialog.tsx | 77 | Post creation |
| AdminModeration.tsx | 53 | Moderation panel |
| UserDetailModal.tsx | 46 | User management modal |
| HomePage.tsx | 44 | Landing + search |
| AdminAISettings.tsx | 42 | AI config UI |
| FaqReview.tsx | 33 | Freshness voting UI |
| AdminUnresolvedSearch.tsx | 33 | Unanswered query tracker |
| CommunityPostCard.tsx | 29 | Post card with escalation badges |
| ResultCard.tsx | 24 | Search result card |
| AdminDashboard.tsx | 24 | Stats overview |
| ThreadDetail.tsx | 91 (CommentNode), 91 (ThreadDetail) | Comment tree |
| WordCloud.tsx | 20 | Tag cloud |

---

## Key System Features

### 1. Escalation System
- Posts unanswered > 16 hours auto-escalated to moderators
- `escalationController.ts` manages scheduler (default 60min interval)
- Admin routes: `GET /community/escalated-posts`, `POST /:id/resolve`, `POST /:id/dismiss`
- Statuses: `none | escalated | resolved | dismissed`
- `runUnansweredEscalationCheck()` - batch marks posts + notifies admins

### 2. Time-Trial System
- Posts unanswered 16h enter "time-trial" - first responder wins
- `runTimeTrialCheck()` awards "first_responder" badge atomically
- Frontend shows pending-trial (red) / awarded-trial (gold) badges

### 3. Freshness System
- FAQ freshness tiers: `evergreen | seasonal | volatile`
- Community voting: `still_accurate | needs_update`
- Auto-verify at threshold (VERIFY_THRESHOLD votes, zero needs_update)
- Auto-escalate to `update_requested` if no votes after ESCALATION_DAYS
- `freshnessController.ts` runs on interval

### 4. AI Duplicate Detection
- Requires env: `ANTHROPIC_API_KEY` | `OPENAI_API_KEY` | `XAI_API_KEY` | `MINIMAX_API_KEY`
- `duplicateDetector.ts` - semantic similarity check
- `aiClient.ts` - multi-provider with circuit breaker
- Priority: Anthropic > OpenAI > Grok > MiniMax

### 5. SpillTheTea Notifications
- Event types: `post_answered | post_deleted | first_responder_awarded | etc.`
- `teaNotificationController.ts` manages drops
- Triggered on post answer, community post deletion, time-trial award

### 6. Zoom Integration
- OAuth flow: `GET /api/zoom/auth` → Zoom → `GET /api/zoom/callback`
- Meeting transcription processing
- Knowledge extraction from transcripts
- Health monitoring with fallback

### 7. Promotion Service
- Community posts can become FAQs
- Triggers: high upvotes + verified expert answer
- `promoteFAQ()` - creates FAQ from resolved post
- Reputation awarded on promotion

### 8. Search System
- RRF (Reciprocal Rank Fusion) for hybrid search
- Vector search with embedding matching
- Fallback to text search
- Duplicate detection in search results

---

## High-Complexity Functions (>15 CC)

### Backend Controllers
- getAllPosts (postController.ts) - CC 49
- computeTOTP (admin2faController.ts) - CC 28
- callbackZoom (zoomAuthController.ts) - CC 24
- addComment (commentController.ts) - CC 24

### Backend Services
- chat (aiClient.ts) - CC 18
- scoreAndSort (knowledgeBase.ts) - CC 16

### Backend Utils
- parseVTTWithSpeakers (vttParser.ts) - CC 23
- withFallback (zoomFallback.ts) - CC 23
- getZoomHealth (zoomHealth.ts) - CC 20
- requestLogger (requestLogger.ts) - CC 19
- parseExtractedItems (zoomExtractor.ts) - CC 18

### Frontend Components
- PostDetailDialog - CC 164
- CommunityPage - CC 121
- CommentNode/ThreadDetail - CC 91
- FAQPage - CC 89
- CreatePostDialog - CC 77

---

## Potentially Unused Functions (Dead Code)

These may be dead code or entry points called dynamically:

### Controllers
- admin2faController.ts: computeTOTP, enable2FA, disable2FA, verify2FA, setup2FA, get2FAStatus, generateTOTPSecret, encryptSecret, decryptSecret
- aiController.ts: getAiConfig, updateAiConfig, resetAiUsage, getAiProviders, testProvider, detectActiveProvider
- commentController.ts: getAnswersList, addComment, toggleCommentUpvote, toggleCommentDownvote, setCommentDNA, clearCommentDNA, verifyComment
- escalationController.ts: runUnansweredEscalationCheck, getEscalatedPosts, resolveEscalatedPost, dismissEscalatedPost, getEscalationHistory
- faqController.ts: getAllFAQs, getFAQById, getPaginatedFAQs, createFAQ, updateFAQ, deleteFAQ, checkFAQMatch, submitFeedback, reportFAQ, getFAQHistory, createFAQSuggestion, logFreshEvent
- freshnessController.ts: daysSince, logEvent, flagFAQ, voteReview, getReviewQueue, getEscalated
- All other controllers have similar patterns

**Note**: Functions marked as potentially unused may be entry points, cron callbacks, or called via string refs. Manual audit recommended.

---

## Environment Variables Required

```env
# MongoDB
MONGODB_URI=mongodb+srv://... (cluster0.z3cgb58, yaksha_faq)

# AI Providers (at least one required)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
XAI_API_KEY=
MINIMAX_API_KEY=

# Zoom OAuth
ZOOM_CLIENT_ID=odkt50ZxS2lBwN0TOoUjQ
ZOOM_CLIENT_SECRET=
ZOOM_REDIRECT_URI=/api/zoom/auth/callback

# Auth
JWT_SECRET=
ADMIN_EMAIL=admin@yaksha.com
ADMIN_PASSWORD=[redacted]

# Feature flags
UNANSWERED_ESCALATION_DAYS=16
UNANSWERED_ESCALATION_CHECK_MINUTES=60
```

---

## Admin Users

- admin@yaksha.com / [stored in DB]
- Roles: admin, moderator, expert, user

---

## Database: yaksha_faq

**Collections**: faqs, communityposts, comments, users, notifications, tea_notifications, fresh_review_logs, fresh_review_votes, unresolved_searches, transcript_knowledge, zoom_meetings, search_logs (90-day TTL), admin_logs, moderation_logs, reputation_logs, badges

**Key Indexes**:
- `escalationStatus+createdAt` on communityposts
- `escalationStatus+escalatedAt` on communityposts
- `faqId+reviewCycle+voterId` unique on fresh_review_votes
- `reviewStatus+flaggedAt` on faqs
- TTL 90-day on search_logs