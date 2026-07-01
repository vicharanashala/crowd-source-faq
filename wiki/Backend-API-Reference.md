# Backend API Reference

All routes are mounted under the base path `/csfaq/api/`.

---

## Authentication (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Register a new user |
| POST | `/auth/login` | No | Login and receive JWT tokens |
| POST | `/auth/refresh` | Token | Refresh access token |
| POST | `/auth/logout` | Token | Invalidate refresh token |
| GET | `/auth/me` | Token | Get current user profile |
| PATCH | `/auth/me` | Token | Update current user profile |
| POST | `/auth/change-password` | Token | Change password |
| DELETE | `/auth/me` | Token | Delete (anonymize) account |

## FAQ (`/faq`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/faq` | Token | List FAQs (paginated, filterable) |
| GET | `/faq/:id` | Token | Get a single FAQ |
| POST | `/faq` | Admin | Create a new FAQ |
| PATCH | `/faq/:id` | Admin | Update a FAQ |
| DELETE | `/faq/:id` | Admin | Delete a FAQ |
| POST | `/faq/:id/freshness-review` | Admin | Submit a freshness review |

## Public FAQ (`/public`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/faqs` | No | List published FAQs (public page) |
| GET | `/public/faqs/:id` | No | Get a single published FAQ |
| GET | `/public/faqs/popular` | No | Get popular FAQs |

## Search (`/search`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/search` | No | Hybrid search (vector + keyword) |
| GET | `/search/suggest` | No | Autocomplete suggestions |
| GET | `/search/trending` | No | Trending search queries |

## Ask AI (`/ask-ai`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/ask-ai` | Optional | Ask a question and get an AI-generated answer |

## Community (`/community`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/community/posts` | Token | List community posts (paginated) |
| GET | `/community/posts/:id` | Token | Get a single post with comments |
| POST | `/community/posts` | Token | Create a new post |
| PATCH | `/community/posts/:id` | Token | Update a post |
| DELETE | `/community/posts/:id` | Token/Admin | Delete a post |
| POST | `/community/posts/:id/vote` | Token | Upvote or downvote a post |
| POST | `/community/posts/:id/bookmark` | Token | Bookmark a post |
| POST | `/community/posts/:id/comments` | Token | Add a comment |
| PATCH | `/community/comments/:id` | Token | Edit a comment |
| DELETE | `/community/comments/:id` | Token/Admin | Delete a comment |
| POST | `/community/comments/:id/vote` | Token | Vote on a comment |
| POST | `/community/posts/:id/accept-answer` | Token | Accept an answer |

## Support (`/support`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/support/requests` | Token | List support tickets |
| GET | `/support/requests/:id` | Token | Get a single ticket |
| POST | `/support/requests` | Token | Create a support ticket |
| POST | `/support/requests/:id/follow-up` | Token | Add a follow-up message |
| PATCH | `/support/requests/:id/status` | Admin | Update ticket status |
| POST | `/support/golden-ticket` | Token | Submit a golden ticket |

## Notifications (`/notifications`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notifications` | Token | List notifications |
| PATCH | `/notifications/:id/read` | Token | Mark notification as read |
| POST | `/notifications/read-all` | Token | Mark all as read |
| GET | `/notifications/tea/stream` | Token | Server-Sent Events (SSE) stream |

## Upload (`/upload`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/upload/signed-url` | Token | Get a signed upload URL (GCS) |
| POST | `/upload/avatar` | Token | Upload avatar image |

## Zoom (`/zoom`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/zoom/authorize` | Admin | Start Zoom OAuth flow |
| GET | `/zoom/callback` | -- | OAuth callback (redirects to frontend) |
| POST | `/zoom/webhook` | -- | Zoom webhook receiver |
| GET | `/zoom/meetings` | Admin | List processed meetings |
| GET | `/zoom/sessions` | Admin | List Zoom sessions |
| POST | `/zoom/process/:meetingId` | Admin | Manually process a meeting |

## Knowledge (`/knowledge`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/knowledge/insights` | Token | List knowledge insights |
| POST | `/knowledge/insights/:id/promote` | Admin | Promote insight to FAQ |

## Documents (`/documents`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/documents/upload` | Admin | Upload a document for processing |
| GET | `/documents` | Token | List documents |
| GET | `/admin/documents` | Admin | Admin document management |

## Moderation (`/moderation`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/moderation/report` | Token | Report content |
| GET | `/moderation/reports` | Admin | List reports |
| POST | `/moderation/ban` | Admin | Ban a user |

## Reputation (`/reputation`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/reputation/leaderboard` | Token | Get reputation leaderboard |
| GET | `/reputation/me` | Token | Get own reputation stats |

## Programs (`/programs`, `/batches`, `/courses`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/programs` | Token | List programs |
| GET | `/batches` | Token | List batches |
| GET | `/courses` | Token | List courses |
| POST | `/admin/programs` | Admin | Create a program |
| PATCH | `/admin/programs/:id` | Admin | Update a program |
| GET | `/feature-flags` | Token | Get feature flags for current batch |

## Admin (`/admin`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/users` | Admin | List all users |
| PATCH | `/admin/users/:id` | Admin | Update user role |
| GET | `/admin/stats` | Admin | Dashboard statistics |
| GET | `/admin/audit-log` | Admin | Audit log |
| GET | `/admin/config` | Admin | Get admin config |
| PATCH | `/admin/config` | Admin | Update admin config |

## Health and Utility

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `(root) /csfaq/api/health` | No | Health check (alternate) |
| POST | `(root) /csfaq/api/warm` | No | Warm the embedding model |
| GET | `(root) /csfaq/api/metrics` | No | Prometheus-style metrics |

---

## Authentication

All authenticated endpoints expect a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Admin endpoints additionally require the user to have `role: "admin"` in the database.

## Response Format

Success responses:

```json
{
  "data": { ... },
  "pagination": { "page": 1, "limit": 20, "total": 100 }
}
```

Error responses:

```json
{
  "message": "Error description"
}
```

## Rate Limiting

| Endpoint Group | Window | Max Requests |
|---------------|--------|-------------|
| Global | 15 min | 100 |
| Auth (login) | 15 min | 5 |
| Auth (register) | 1 hour | 3 |
| Search | 1 min | 30 |
| Ask AI (anonymous) | 24 hours | 5 |
| Ask AI (authenticated) | 24 hours | 50 |
| Upload | 1 hour | 20 |
