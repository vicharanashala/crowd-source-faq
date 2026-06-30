# Admin Analysis & Analytics Dashboard Guide

What it does: Tracks user searches, aggregates trending and failed queries, and exposes key performance indicators (KPIs) to help administrators and moderators track search quality, category distribution, and system performance.

---

## Files
* **Frontend View:** [frontend/src/admin/pages/AdminAnalytics.tsx](file:///c:/CSFAQ2/crowd-source-faq/frontend/src/admin/pages/AdminAnalytics.tsx)
* **Controller:** [backend/controllers/analyticsController.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/controllers/analyticsController.ts)
* **Routes:** [backend/routes/analytics.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/routes/analytics.ts) mounted at `/api/analytics`
* **Model:** [backend/models/SearchLog.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/models/SearchLog.ts)
* **Test Suite:** [backend/__tests__/analyticsController.test.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/__tests__/analyticsController.test.ts)

---

## Pipeline Flow

```
Admin Opens /admin/analytics Page
         │
         ▼
fetchData() call triggers in React
  - Parameterizes date range (days: 7, 30, 90)
  - Scopes to active cohort/batch (batchId)
         │
         ▼
Concurrent API requests to Backend
         ├── GET /api/analytics/summary
         │     - Total & approved FAQs
         │     - Total searches & unique users count
         │     - Match success rate
         │
         ├── GET /api/analytics/trends
         │     - Timeseries list: [ { date, searches, users } ]
         │
         ├── GET /api/analytics/category-distribution
         │     - Aggregation of FAQ counts & pageviews by category
         │
         └── GET /api/analytics
               - List of top 30 most popular search terms
               - List of failed queries (search terms that returned 0 matches)
         │
         ▼
Stale-Request Check
  - Ensures parallel async requests resolve into current state
  - Discards response if version tag is outdated
         │
         ▼
Render Visual Dashboards
  - UserActivityChart: Search frequency vs user traffic trends
  - CategoryDistributionChart: FAQ distribution counts
  - Popular & Failed Query Lists
```

---

## How to Use & Verify

Follow these steps to access and test the analytics dashboards:

### Step 1: Log in as Administrator or Moderator
Only users with the role `admin` or `moderator` are authorized to fetch analytics data. 
You can use the seeded admin credentials generated during:
```bash
npm run seed
```

### Step 2: Navigate to Analytics
1. Open the application stack:
   ```bash
   npm run dev:local
   ```
2. Navigate to `http://localhost:5173/admin/analytics`.

### Step 3: Trigger Metrics Logging
1. Open a separate browser window and run search queries in the FAQ Search bar.
   * Run a successful search: `"noc letter"`
   * Run a search query that returns no results: `"how to make a cake"`
2. Go back to the Admin Analytics panel and refresh.
3. **Expected Behavior:**
   * The *Total Searches* stat card should increment.
   * Under the *Search Logs* tab, `"noc letter"` should appear/increment under the **Popular Queries** table.
   * `"how to make a cake"` should be listed under the **Failed Queries** table, signaling a knowledge gap to administrators.

---

## CLI & Verification Endpoints

You can check analytics responses directly via curl using an admin authorization token:

```bash
# Fetch aggregate metrics summary
curl -H "Authorization: Bearer <admin_token>" http://localhost:6767/api/analytics/summary?days=30

# Fetch search trends data points
curl -H "Authorization: Bearer <admin_token>" http://localhost:6767/api/analytics/trends?days=7

# Fetch popular and failed query logs lists
curl -H "Authorization: Bearer <admin_token>" http://localhost:6767/api/analytics
```

---

## Schema Fields

### SearchLog Model
* `query`: `String` — The search query text entered by the user.
* `matchedCount`: `Number` — Number of documents returned by the search engine (0 implies a failed search).
* `user`: `ObjectId` — Optional reference to the user who ran the search (null if anonymous).
* `ip`: `String` — IP address of the search client (for abuse/bot detection).
* `batchId`: `ObjectId` — Scoped program cohort parameter.
* `timestamp`: `Date` — Log creation timestamp.
