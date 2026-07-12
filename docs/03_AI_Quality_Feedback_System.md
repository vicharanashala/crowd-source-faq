# AI Quality Feedback System

> **Status:** Implemented (v1.0)
> **Source:** `apps/backend/src/modules/feedback/`

## 1. Purpose

Allow users to rate AI-generated answers (thumbs up / thumbs down) with optional free-text comments, store feedback alongside a snapshot of the answer's Explainability metadata, and provide admin analytics.

## 2. Constraints

- Rate-limited: 300 req/15min general
- Upsert-based dedup: one feedback record per `(answerId, userId)` pair
- Optional fields only — backward compatible with existing consumers
- No additional AI calls or DB queries beyond the single upsert

## 3. Feedback Model

```typescript
interface Feedback {
  answerId: string;           // identifies which AI answer
  userId?: ObjectId;          // authenticated user (null for anonymous)
  sessionId?: string;         // anonymous session fallback
  rating: 'up' | 'down';
  comment?: string;           // optional free text
  explainability?: Explainability; // snapshot at time of generation
  createdAt: Date;
  updatedAt: Date;            // updated on re-vote (upsert)
}
```

Compound index: `{ answerId: 1, userId: 1 }` (unique, sparse) + `{ answerId: 1, sessionId: 1 }` (unique, sparse)

## 4. API

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/feedback` | Submit/update rating (upsert) |
| `GET` | `/api/feedback/analytics` | Aggregate stats (admin) |
| `GET` | `/api/feedback/export/csv` | CSV export (admin) |
| `DELETE` | `/api/feedback/:id` | Delete feedback record (admin) |

### POST `/api/feedback` body

```json
{
  "answerId": "string (required)",
  "rating": "up" | "down" (required),
  "comment": "string (optional, max 2000 chars)",
  "explainability": { ... } (optional)
}
```

### Response

```json
{
  "success": true,
  "data": {
    "feedback": { ... }
  }
}
```
Returns `429` on rate limit, `400` on validation error.

## 5. Analytics Endpoint

`GET /api/feedback/analytics` (admin only)

Returns:
- `totalFeedback`: total count
- `upvoted`: count of 'up' ratings
- `downvoted`: count of 'down' ratings
- `upvotePercentage`: percentage of 'up' ratings
- `totalComments`: count of feedback with comments
- `recentTrend`: last 7 days of daily counts

## 6. CSV Export

`GET /api/feedback/export/csv` (admin only)

Streams CSV with columns: `id, answerId, userId, sessionId, rating, comment, confidence, provider, model, latencyMs, documentsRetrieved, documentsUsed, vectorScore, keywordScore, createdAt, updatedAt`

## 7. Duplicate Prevention

Upsert via `findOneAndUpdate` with `upsert: true` on the compound key `{ answerId, userId }` (or `{ answerId, sessionId }` for anonymous). The `updatedAt` timestamp is refreshed on each re-vote.

## 8. Tests

Unit tests at `apps/backend/src/modules/feedback/__tests__/feedback.test.ts`:
- Upsert creates new record on first vote
- Upsert updates existing record on re-vote
- Model validation rejects invalid ratings
- Analytics aggregation correctness
