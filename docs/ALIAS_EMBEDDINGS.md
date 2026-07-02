# Search Alias & Embedding Pipeline Guide

This guide explains how the search alias mapping and vector embedding system function conceptually and details their step-by-step execution pipelines.

---

## 1. How it Works (Conceptual Overview)

### Search Alias Mapping
The search query expansion engine translates user abbreviations and colloquial search terms into their official counterparts at query time. Mappings are compiled from three sources:
1. **Manual Aliases:** Defined statically in `aliases.json` (e.g. `"noc"` ↔ `"no objection certificate"`).
2. **Generated Acronyms:** Bidirectional matches dynamically derived from multi-word terms.
3. **Extracted Acronyms:** Scraped from parenthetical structures inside FAQ text during startup (e.g., `"Vicharanashala Internship (VINS)"` generates a mapping between `VINS` and the full text).

### Semantic Embeddings
When searching or index-seeding, text is transformed into numerical coordinate lists called vector embeddings. These vectors capture semantic meaning rather than just character sequences.
* **Mode A (Cloud API):** Sends text to the Hugging Face Serverless Inference API to compute the embedding using the primary model `mixedbread-ai/mxbai-embed-large-v1` (1024 dimensions).
* **Mode B (Local Fallback):** Executes the model in-process using `@huggingface/transformers` locally. (If memory allocation crashes occur in sandboxes, developers can toggle the model slug to a lightweight `all-MiniLM-L6-v2` 384-dimensional fallback).

---

## 2. Files
* **Controller:** [backend/controllers/searchController.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/controllers/searchController.ts) → `POST /api/search`
* **Routes:** [backend/routes/search.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/routes/search.ts)
* **Utilities:**
  * Embeddings: [backend/utils/ai/embeddings.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/utils/ai/embeddings.ts)
  * Alias Mapper: [backend/src/search/aliasMapper.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/src/search/aliasMapper.ts)
  * Typo Normalizer: [backend/src/search/typoNormalizer.ts](file:///c:/CSFAQ2/crowd-source-faq/backend/src/search/typoNormalizer.ts)
* **Configuration / JSON:**
  * Direct Mappings: [backend/src/search/aliases.json](file:///c:/CSFAQ2/crowd-source-faq/backend/src/search/aliases.json)
* **Diagnostic scripts:**
  * Backfill FAQ: `backend/scripts/backfillEmbeddings.ts`
  * Backfill Community: `backend/scripts/backfillCommunityEmbeddings.ts`

---

## 3. Internal Pipeline Flow (Step-by-Step)

```
POST /api/search { query: "..." }
         │
         ▼
Check Redis Caching (LRU + Redis)
  - Key: query.trim().toLowerCase()
  - Hit? → Return cached results immediately & log trend metrics
         │
         ▼ (Cache Miss)
Search Expansion (aliasMapper.expandQuery)
  - Tokenizes query
  - Matches tokens against aliases.json, acronymGenerator, and parenthetical scrapes
  → Result: "noc details" → "no objection certificate details"
         │
         ▼
generateEmbedding(expandedQuery)
         │
         ├── Check: is HUGGINGFACE_API_KEY set?
         │
         ├── [YES] → Mode A: Cloud API Inference
         │           Call router.huggingface.co/hf-inference/models/mixedbread-ai/mxbai-embed-large-v1
         │           Returns 1024-dimensional vector
         │
         └── [NO]  → Mode B: Local In-Process Fallback
                     Boot local @huggingface/transformers session
                     Load Xenova/all-MiniLM-L6-v2 in-process (or fallback original)
                     Returns 384-dimensional vector (or 1024-dim original)
         │
         ▼
Normalizes vector to L2-norm form
         │
         ▼
4 Parallel Mongoose Queries
  - runVectorSearch on yaksha_faq_faqs
  - runVectorSearch on yaksha_faq_communityposts
  - runTextSearch on yaksha_faq_faqs (standard text index)
  - runTextSearch on yaksha_faq_communityposts (standard text index)
         │
         ▼
Reciprocal Rank Fusion (RRF)
  - k = 60
  - score = 1 / (60 + rank)
  - Boost matching results by trustLevel (official > approved > community)
         │
         ▼
applySearchThreshold()
  - Retain if textScore > 0 OR vectorScore >= 0.80
         │
         ▼
setCachedResults() → bufferSearchLog() → Return ranked JSON results
```

---

## 4. How to Use & Verify

Follow these steps to check that the search alias and embedding mappings are active in the application:

### Step 1: Start the Local Stack
Ensure your local backend and frontend are running:
```bash
npm run dev:local
```

### Step 2: Test Query Expansion in the UI
1. Open your browser and navigate to `http://localhost:5173`.
2. Go to the FAQ Search page.
3. Type in one of the abbreviations mapped in `aliases.json` (such as `NOC`, `VINS`, `LLM`, or `FAQ`).
4. **Expected Behavior:** You should instantly see a suggestion box display underneath the search input showing the expanded query string (e.g. `no objection certificate` or `large language model`).

### Step 3: Test Semantic Vector Match
1. Perform a search using the abbreviation (e.g. search for `NOC guidelines`).
2. Verify that FAQs containing only the full wording (e.g., "how do I request a **no objection certificate**?") are returned as search results.
3. Check the backend logs. You should see:
   ```
   [aliasMapper] Extracted acronyms from FAQ entries
   ```

---

## 5. Environment Variables

| Variable | Default | Purpose / Description |
| :--- | :--- | :--- |
| `HUGGINGFACE_API_KEY` | *unset* | (Recommended) Token to execute embeddings via serverless cloud API. Prevents local model loading and C++ memory allocations. |

---

## 6. Diagnostic & Setup Endpoints

### 1. Seeding Data (including mock or live embeddings generation)
To seed database collections and compute their vectors:
```bash
npm run seed
```

### 2. Backfilling Embeddings
To recalculate and update vector embeddings in database documents:
```bash
# FAQ collection
npm run backfill:embeddings

# Community collection
npm run backfill:community
```

### 3. Check Embeddings Generation Diagnostic
To execute a one-time inference check locally on Node:
```bash
node -e "import('./backend/dist/utils/ai/embeddings.js').then(m => m.generateEmbedding('hello').then(v => console.log('Vector length:', v.length)))"
```

---

## 7. Schema Fields

### FAQ Model
* `embedding`: `[Number]` — Holds the vector coordinates. Dimension is `1024` for primary model or `384` for local MiniLM fallback.
* `question`: `String` — Original search matching index query.
* `answer`: `String` — Search result summary answer content.

### CommunityPost Model
* `embedding`: `[Number]` — Vector array representation of post `title` + `body`.
* `title`: `String` — Scoped text index field.
* `body`: `String` — Scoped text index field.
