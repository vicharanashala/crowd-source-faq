# Routes Reference - Crowd Source FAQ

## admin.ts
```
GET  /admin/stats              → getStats
GET  /admin/users              → getAllUsers
GET  /admin/users/:id          → getUserById
PUT  /admin/users/:id/role      → updateUserRole
DELETE /admin/users/:id         → deleteUser
GET  /admin/faqs                → getAdminFAQs
GET  /admin/faqs/growth         → getFaqGrowth
GET  /admin/community          → getCommunityPosts
GET  /admin/community/chart    → getCommunityChart
GET  /admin/search/insights    → getSearchInsights
GET  /admin/user-activity      → getUserActivityChart
GET  /admin/community-growth   → getCommunityGrowth
GET  /admin/escalated-posts    → getEscalatedPosts (via escalationController)
POST /admin/escalated/:id/resolve → resolveEscalatedPost
POST /admin/escalated/:id/dismiss → dismissEscalatedPost
GET  /admin/escalation-history → getEscalationHistory
```

## analytics.ts
```
GET  /analytics/overview       → getOverviewStats
GET  /analytics/search         → getSearchAnalytics
GET  /analytics/community      → getCommunityAnalytics
```

## auth.ts
```
POST /auth/register            → register
POST /auth/login               → login
POST /auth/logout              → logout
POST /auth/refresh             → refreshToken
GET  /auth/me                  → getMe
```

## faq.ts
```
GET  /faq                      → getAllFAQs
GET  /faq/paginated            → getPaginatedFAQs
GET  /faq/:id                  → getFAQById
POST /faq                      → createFAQ
PUT  /faq/:id                  → updateFAQ
DELETE /faq/:id                → deleteFAQ
POST /faq/:id/feedback         → submitFeedback
POST /faq/:id/report           → reportFAQ
GET  /faq/:id/history          → getFAQHistory
POST /faq/suggest              → createFAQSuggestion
POST /faq/check-duplicate      → checkFAQMatch
GET  /faq/categories           → [static list]
GET  /faq/search               → semanticSearch (via searchController)
```

## community.ts
```
GET  /community/posts          → getAllPosts (postController)
GET  /community/posts/:id      → getPostById
POST /community/posts          → createPost
PUT  /community/posts/:id      → updatePost
DELETE /community/posts/:id    → deletePost
POST /community/posts/:id/resolve → resolvePost
POST /community/posts/:id/upvote  → toggleUpvote
POST /community/posts/:id/downvote → toggleDownvote
POST /community/posts/:id/comments → addComment (commentController)
GET  /community/posts/:id/comments → getAnswersList
PUT  /community/posts/:id/comments/:cid/upvote → toggleCommentUpvote
PUT  /community/posts/:id/comments/:cid/downvote → toggleCommentDownvote
PUT  /community/posts/:id/comments/:cid/dna → setCommentDNA
DELETE /community/posts/:id/comments/:cid/dna → clearCommentDNA
PUT  /community/posts/:id/comments/:cid/verify → verifyComment
POST /community/posts/:id/convert → convertCommunityPostToFAQ
GET  /community/search          → searchPosts
```

## search.ts
```
GET  /search                   → semanticSearch
GET  /search/unresolved        → getUnresolvedSearches
POST /search/unresolved        → logUnresolvedSearch
```

## zoom.ts
```
GET  /zoom/auth                → startZoomAuth
GET  /zoom/callback            → callbackZoom
GET  /zoom/token               → getZoomToken
GET  /zoom/meetings            → getZoomMeetings
GET  /zoom/meetings/:id        → getMeetingById
POST /zoom/meetings/:id/transcript → processTranscript
GET  /zoom/insights            → getZoomInsights
GET  /zoom/health              → getZoomHealth
POST /zoom/webhook             → handleZoomWebhook
POST /zoom/recording-event     → processRecordingEvent
```

## knowledge.ts
```
GET  /knowledge/search         → searchKnowledge
POST /knowledge/ingest         → ingestTranscript
GET  /knowledge/chat           → aiChat
```

## moderation.ts
```
POST /moderation/suspend       → suspendUser
POST /moderation/unsuspend     → unsuspendUser
GET  /moderation/logs          → getModerationLogs
```

## notification.ts
```
GET  /notifications            → getNotifications
PUT  /notifications/:id/read   → markAsRead
PUT  /notifications/read-all   → markAllAsRead
GET  /notifications/settings   → getSettings
PUT  /notifications/settings   → updateSettings
```

## reputation.ts
```
GET  /reputation/me            → getMyReputation
GET  /reputation/leaderboard   → getLeaderboard
POST /reputation/award          → awardPoints
POST /reputation/badge         → issueBadge
POST /reputation/revoke-badge  → revokeBadge
GET  /reputation/history       → getReputationHistory
```

## tea.ts (SpillTheTea)
```
GET  /tea/drops                → getTeaDrops
PUT  /tea/drops/:id/read       → markTeaDropRead
POST /tea/drops/read-all       → markAllTeaDropsRead
```

---

## Middleware

### auth.ts
- JWT verification on protected routes
- Attaches `req.user` with `_id`, `name`, `email`, `role`
- Public routes: `/auth/login`, `/auth/register`, `/faq` (read), `/search`, `/zoom/auth`, `/zoom/callback`

### admin.ts
- Checks `req.user.role === 'admin' || req.user.role === 'moderator'`
- Used on admin routes, escalation routes, moderation routes