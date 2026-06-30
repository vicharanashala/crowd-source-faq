# Redis Caching & Queueing Pipeline Guide

This guide details how Redis is integrated into the Yaksha FAQ application, how to set it up locally using Docker or WSL, and how to configure environment variables.

---

## Files
* **Utilities:**
  * Cache Adapter: [backend/utils/http/cache.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/utils/http/cache.ts)
  * Document Queue Manager: [backend/utils/jobs/documentQueue.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/utils/jobs/documentQueue.ts)
  * Document Worker Process: [backend/utils/jobs/documentJob.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/utils/jobs/documentJob.ts)
* **Routes:**
  * Documents: [backend/routes/documents.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/routes/documents.ts)
* **Configuration env:** `REDIS_TCP_URL`, `REDIS_URL`, `REDIS_TOKEN`
* **Diagnostic scripts:**
  * Check Redis Memory: `backend/scripts/check-redis-memory.ts`

---

## Pipeline Flows

### 1. Search Query Caching Pipeline
```
User Search Request
         │
         ▼
Generate Hash Key: hashQuery(text)
  - Normalized string token hashing
  - Key format: result:sc:<hash>
         │
         ▼
Query Redis: getCachedResults(key)
         │
         ├── [Cache Hit] ──► Return cached JSON directly (Duration: ~5ms)
         │
         └── [Cache Miss] ─► Execute Hybrid Search Pipeline (Duration: ~500ms)
                               │
                               ▼
                             setCachedResults(key, results, TTL)
                               - Save JSON to Redis
                               - TTL: 15 minutes (900 seconds)
                               │
                               ▼
                             Return results array to user
```

---

### 2. Document Processing Queue Pipeline (BullMQ)
```
User Uploads File (.pdf, .xlsx, .docx, .png)
         │
         ▼
Controller: Encode file buffer to Base64
         │
         ▼
addDocumentJob(jobData)
  - Push job to BullMQ Redis Queue (queue: document-processing)
  - Persists job payload in Redis memory
  - Retries: 3 attempts, 30s delay backoff
         │
         ▼
Redis Queue holds job in state 'wait'
         │
         ▼
Background Worker (startDocumentWorker) pulls job
         │
         ▼
Executes processDocument()
  - Extracts text via Tesseract OCR or spreadsheet engines
  - Formulates structured FAQ Insights using AI
         │
         ▼
Save FAQ records to MongoDB
         │
         ▼
Mark Redis Job status as 'completed'
```

---

## How to Use & Verify

Follow these steps to confirm that caching and job queues are operating successfully in your environment:

### Step 1: Start the Local Stack
Verify your Redis container is running, then boot the app:
```bash
docker start local-redis
npm run dev:local
```

### Step 2: Verify Search Caching (Terminal Logs)
1. Open the UI and run a search query (e.g. `offer letter guidelines`).
2. This first query is a cache miss. Check your backend console logs. You should see a log entry confirming the cache writes:
   ```
   [cache SET] "offer letter guidelines"
   ```
3. Run the exact same query a second time.
4. Check your backend console logs. You should see the cache hit confirmation:
   ```
   [cache HIT] "offer letter guidelines"
   ```
   The results should load instantaneously.

### Step 3: Verify the BullMQ Document Processing Queue
1. Log into the Frontend as an Administrator.
2. Go to the document upload page and upload a text-heavy PDF or image file.
3. Check the backend console logs. You should see the background job starting and executing:
   ```
   [documentQueue] job 12 starting for documentId=...
   [documentQueue] job 12 done in 8350ms — 3 insights
   ```
4. Verify the newly extracted FAQ insights have appeared in the review list.

---

## Environment Variables

| Variable | Default | Purpose / Description |
| :--- | :--- | :--- |
| `REDIS_TCP_URL` | `redis://localhost:6379` | **Required.** TCP Connection string used by BullMQ and backend caching. Enables queues. |
| `REDIS_URL` | *unset* | REST API url for Upstash Serverless Redis caching fallback. Keep commented out if unused. |
| `REDIS_TOKEN` | *unset* | REST API token for Upstash. Keep commented out if unused. |

---

## Local Setup & Diagnostic Endpoints

### 1. Start Local Redis Container
To run a local Redis container in Docker:
```bash
docker run -d --name local-redis -p 6379:6379 redis
```
To start an existing container:
```bash
docker start local-redis
```

### 2. Configure WSL Interfaces (Windows users running Redis in WSL)
To allow Windows host Node process connections to WSL Redis instance:
```bash
redis-cli config set bind '0.0.0.0 ::'
redis-cli config set protected-mode no
```

### 3. Check Redis Cache memory & DB size
To query Redis memory statistics and total key counts:
```bash
node backend/dist/scripts/check-redis-memory.js

# Check Redis connection
PING

# View all keys
KEYS *

# Count total keys
DBSIZE

# Delete all keys from all databases
FLUSHALL
```

---

## Schema Fields

### PipelineResult Model (Unified Logs)
* `pipeline`: `'auto_answer' | 'faq_audit'`
* `targetModel`: `'CommunityPost' | 'FAQ'`
* `targetId`: `ObjectId`
* `score`: `Number`
* `verdict`: `String`
* `flagged`: `Boolean`
* `checkedAt`: `Date` (TTL index)
