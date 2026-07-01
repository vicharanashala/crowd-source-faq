# Public Guest FAQ Page — Architecture Plan

> Standalone, no-auth public discovery page at `/explore` that reads from the
> existing FAQ DB and ships its own anonymous analytics.

---

## 1. Goals & non-goals

**Goals**
- Anyone can browse FAQs without login or sign-up prompt.
- Three sections: Popular (multi-signal score), Recent, Category-wise.
- Global search with debounce + keyword highlight.
- Anonymous analytics: views, time-on-page, scroll depth, reading completion.
- Production-grade: cached, indexed, rate-limited, PII-free.
- Zero touch on existing authenticated FAQ functionality.

**Non-goals**
- No login, no comments, no voting, no bookmarks from the public page.
- No AI answers on the public page (those are member-only).
- No realtime updates — popularity recalculates on a 5-minute job.

---

## 2. Database schema changes

### 2.1 New fields on `FAQ` (additive, non-breaking)

```
popularityScore     : Number  // recomputed every 5 min by background job
guestViewCount     : Number  // anonymous view count (separate from auth views)
avgReadCompletion  : Number  // 0..1 — mean scroll depth of guests
avgTimeSpentRatio  : Number  // 0..1 — actual time / expected reading time
guestViewLast24h   : Number  // rolling counter, drives "trending"
wordCount          : Number  // cached word count of (question + answer)
expectedReadMs     : Number  // 200 wpm × wordCount (cached for fast scoring)
popularityUpdatedAt: Date    // last score recompute
```

Indexes added:
- `{ status: 1, popularityScore: -1 }` — popular list
- `{ status: 1, createdAt: -1 }` — recent list (already exists)
- `{ status: 1, category: 1, popularityScore: -1 }` — category browse ranked

### 2.2 New collection `GuestEvent` (raw event buffer)

```
{
  faqId      : ObjectId,
  guestId    : String,    // random UUID stored in httpOnly cookie
  sessionId  : String,    // per-tab session for view-dedup
  type       : 'view' | 'read' | 'completion' | 'scroll',
  dwellMs    : Number,    // for read events
  scrollPct  : Number,    // 0..1
  faqLength  : Number,    // word count, snapshotted at event time
  createdAt  : Date
}
```

Indexes:
- `{ faqId: 1, type: 1, createdAt: -1 }` — aggregation
- TTL: `{ createdAt: 1 } expireAfterSeconds: 7d` — auto-prune raw events
- `{ guestId: 1, faqId: 1, type: 1, createdAt: -1 }` — dedup lookups

### 2.3 No changes to existing collections
The `FAQ.views` field stays as the authenticated-user view counter. The new
`guestViewCount` is the anonymous equivalent — we do **not** merge them, so
admin analytics remain meaningful.

---

## 3. Popularity scoring algorithm

Implemented in `backend/utils/popularityScore.ts`. Pure function over
aggregated metrics, runs every 5 min in a background job, not on read path.

```ts
popularity_score = (view_weight    * log1p(guestViewCount))
                 + (recency_weight * recencyBoost)
                 + (engagement_weight * (avgReadCompletion * avgTimeSpentRatio))
                 + (trust_weight   * trustBoost)
```

**Component details (all normalised to 0..1):**

| Component             | Formula                                            | Default weight |
|-----------------------|----------------------------------------------------|----------------|
| `view_weight`         | `min(1, log10(1 + guestViewCount) / log10(500))`  | 0.40           |
| `recency_weight`      | `exp(-ageDays / 30)` (half-life ~21 days)          | 0.20           |
| `engagement_weight`   | `0.5 * avgReadCompletion + 0.5 * avgTimeSpentRatio`| 0.30           |
| `trust_weight`        | `expert=1.0, high=0.8, medium=0.5, low=0.2`        | 0.10           |

**Why this is robust to gaming:**
- View count is log-scaled, so 10k views doesn't dominate 50 reads.
- Raw view count is **not** the only signal — 100 quick bounces rank below
  30 deep reads.
- `guestId` + 30-min dedup window prevents the same person from inflating
  scores by refreshing.
- Engagement component (read completion × time ratio) means a FAQ that
  people actually read ranks above one they bounce off.
- Recency decay stops zombie FAQs from monopolising "popular" forever.

**Re-compute trigger:** every 5 min via `setInterval` (reuses the existing
`runRetention`-style pattern in `server.ts`).

**Re-compute query:** single Mongo aggregation pipeline over FAQ collection
using `$set` with arithmetic expressions on the cached metric fields — O(N)
once per 5 min, no per-request work on the hot path.

---

## 4. API design — `/api/public/*`

All routes public, no auth, no PII. Soft rate limit per IP (200 req/min) on
read endpoints, tighter (60 req/min) on tracking endpoints to absorb
analytics write amplification.

| Method | Path                                | Purpose                                            |
|--------|-------------------------------------|----------------------------------------------------|
| GET    | `/api/public/popular-faqs`          | Top N by popularityScore                           |
| GET    | `/api/public/recent-faqs`           | Newest N by createdAt                              |
| GET    | `/api/public/categories`            | All categories with counts (and per-category top 3)|
| GET    | `/api/public/search?q=&category=`   | Text search, optional category filter             |
| GET    | `/api/public/faqs/:id`              | Single FAQ (anonymous-safe view)                   |
| POST   | `/api/public/track-view`            | Page open event (idempotent within 30 min/guest)  |
| POST   | `/api/public/track-reading`         | Dwell time + scroll depth + completion event      |

**Tracking payloads — PII-free by construction:**

```jsonc
// POST /api/public/track-view
{ "faqId": "6655...", "sessionId": "tab-uuid" }

// POST /api/public/track-reading
{ "faqId": "6655...", "sessionId": "tab-uuid", "dwellMs": 18200,
  "scrollPct": 0.83, "faqLength": 240 }
```

`guestId` comes from an `httpOnly`, `SameSite=Lax` cookie set on first
public-page hit. The server never reads IP for analytics, never stores
User-Agent beyond what's already in standard request logs.

**Response shape (popular):**

```jsonc
{
  "faqs": [
    { "_id": "...", "question": "...", "answer": "...",
      "category": "...", "tags": [...], "createdAt": "...",
      "popularityScore": 12.4, "guestViewCount": 217,
      "avgReadCompletion": 0.72, "wordCount": 240 }
  ],
  "generatedAt": "2026-06-10T..."
}
```

**Caching:** popular and recent endpoints are wrapped in an in-process LRU
(5-min TTL) and an optional Redis cache (already wired via
`utils/cache.ts`). Categories and search are not cached (filter dimensions
are too varied for hit-rate).

---

## 5. Tracking strategy

Two client-side hooks, both fire-and-forget with `navigator.sendBeacon`
on `pagehide` to survive tab close:

1. **`useViewTracker(faqId)`** — fires on mount, idempotent per
   `(guestId, faqId, 30-min-bucket)`. Server checks `GuestEvent` for a
   recent `view` event with the same key and skips the increment.

2. **`useReadingTracker(faqId)`** — observes scroll depth every 250 ms
   (rAF-throttled), tracks total dwell from mount, computes
   `completionPct = maxScrollY / articleHeight`. On `pagehide` or
   `visibilitychange→hidden` it POSTs one `read` event with
   `{ dwellMs, scrollPct, faqLength }`.

Both endpoints accept the event but **never** echo back per-user data and
**never** require identification. Events buffer to `GuestEvent` and are
folded into FAQ metrics by the next aggregation tick.

---

## 6. Frontend architecture

```
frontend/src/
├── pages/
│   └── ExplorePage.tsx              // route: /explore
└── components/
    └── explore/
        ├── ExploreHero.tsx          // title + search + tags
        ├── ExploreSearchBar.tsx     // debounced, highlights
        ├── PopularFaqsCard.tsx      // "Most Popular" column
        ├── RecentFaqsCard.tsx       // "Recent FAQs" column
        ├── CategoriesCard.tsx       // "Browse Categories" column
        ├── FaqListItem.tsx          // shared numbered row
        ├── CategoryAccordion.tsx    // collapsible section
        ├── CategoryFaqList.tsx      // list inside accordion
        ├── ReadingTracker.tsx       // mount-time scroll/dwell observer
        ├── ExploreSkeleton.tsx      // loading placeholders
        ├── ExploreEmpty.tsx         // empty states
        ├── highlightMatch.ts        // <mark> for search results
        └── usePublicFaqApi.ts       // cached fetcher with abort
```

**Matching the existing FAQ Hive aesthetic:**
- Cream background (`bg-bg`), `bg-card` rounded-2xl with `border-border`.
- Centered hero with question-mark icon + serif title.
- Sticky search bar with `shadow-subtle` once scrolled past hero.
- Three-column grid on `lg`, stacks to single column on mobile.
- Numbered rows in cards (matches screenshot's `1 / 2 / 3` style).
- Sage accent (`text-accent`) for icons + hover.

**State / data flow:**
- Three independent fetch hooks (`usePopularFaqs`, `useRecentFaqs`,
  `useCategories`) each with skeleton + error + empty states.
- Search is its own debounced hook (`useDebouncedSearch`) that cancels
  the prior request via `AbortController` (same pattern as `SearchBar`).
- Accordion expand/collapse is local UI state, no fetch on toggle.

---

## 7. Security & abuse prevention

| Concern                  | Mitigation                                          |
|--------------------------|-----------------------------------------------------|
| View count inflation     | 30-min dedup per `(guestId, faqId)` in `track-view` |
| Read-event spam          | 60 req/min/IP rate limit on `/track-*`              |
| Search abuse             | 30 req/min/IP rate limit on `/search`               |
| DDoS amplification       | Helmet + global IP limiter (already in `server.ts`) |
| PII collection           | No IP, no UA, no fingerprint stored — only UUID cookie |
| XSS via answer body      | `sanitizeHtml` already applied to FAQ.answer (admin write path) |
| Cookie scope             | `httpOnly`, `SameSite=Lax`, no `Secure` in dev       |
| Cookie expiry            | 90 days, sliding                                     |
| Score manipulation       | Score uses log + engagement, not raw views           |

---

## 8. Performance & scalability

**Read path (popular / recent / categories / search):**
- All served from pre-aggregated `popularityScore` and indexed `createdAt`.
- Single Mongo query each, with `.lean()` to skip Mongoose hydration.
- 5-min in-process LRU + optional Redis (already configured via
  `utils/cache.ts`).
- Frontend cache layer (5 min) already in `utils/api.ts` — add routes to
  `CACHE_CONFIGS`.

**Write path (tracking events):**
- `track-view` and `track-reading` write to `GuestEvent` only.
- `track-view` also bumps `FAQ.guestViewCount` directly via
  `findOneAndUpdate({ _id }, { $inc: ... })` — single indexed update,
  O(1).
- `track-reading` does **not** update the FAQ inline. The aggregation
  job reads from `GuestEvent` and re-derives `avgReadCompletion` /
  `avgTimeSpentRatio` from the buffer.

**Background aggregation (every 5 min):**
- Single aggregation pipeline: `$merge` into FAQ collection.
- Inserts `popularityScore`, `popularityUpdatedAt` only — does not touch
  `guestViewCount` (incremented inline).
- Errors logged, never crash the server.

**Scale targets (designed for):**
- 1M+ FAQ views/day → 1M+ `track-view` writes/day → 1M+ `GuestEvent`
  inserts, retained 7 days, ~7M rolling doc count.
- TTL index keeps the collection bounded.
- Aggregation tick reads ~7M docs, groups by faqId → ~130 group keys
  (current FAQ count) → trivial.

---

## 9. Folder structure (final)

```
backend/
├── models/
│   ├── FAQ.ts                        (extended)
│   └── GuestEvent.ts                 (new)
├── utils/
│   └── popularityScore.ts            (new)
├── controllers/
│   └── publicFaqController.ts        (new)
├── routes/
│   └── publicFaq.ts                  (new)
└── server.ts                         (mount + scheduler)

frontend/src/
├── pages/
│   └── ExplorePage.tsx               (new)
├── components/explore/               (new dir, 11 files)
└── App.tsx                           (add /explore route)
```

---

## 10. Rollout sequence

1. Backend models + utils.
2. Backend controller + routes.
3. Mount + scheduler.
4. Smoke-test all 6 endpoints with curl.
5. Frontend ExplorePage + components.
6. Add route, build, type-check.
7. Verify in browser via Playwright if available.
