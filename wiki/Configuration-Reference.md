# Configuration Reference

All non-sensitive, runtime configurations are managed via a YAML-based config loader. The primary config file is `apps/backend/config.default.yaml`. 

To override these defaults for specific environments, you can create:
- `apps/backend/config.dev.yaml` (automatically loaded in development)
- `apps/backend/config.prod.yaml` (automatically loaded in production)

> [!IMPORTANT]
> **Secrets and Keys**: Sensitive credentials (database URIs, API keys, passwords, webhook tokens) must never be committed to YAML files. Keep them in your `.env` or inject them at runtime using environment variables.

---

## Configuration Parameter Sections

Below is a detailed breakdown of the main config sections:

### 1. Server Configuration (`server`)
- `port`: Port the Express server listens on (defaults to `6767`).
- `trustProxyHops`: Number of reverse proxy hops to trust (critical for tracking correct user IPs via Nginx).
- `bodyLimit`: Maximum size of incoming HTTP bodies (e.g. `10mb`).
- `shutdownTimeoutMs`: Graceful shutdown timeout (defaults to `15000ms`).

### 2. CORS Settings (`cors`)
- `allowedOrigins`: List of origins allowed to perform cross-origin requests.
- `allowVercelPreviews`: Boolean toggle to trust dynamic preview domains.
- `allowLocalhostInDev`: Automatically permits localhost origins when running in development mode.

### 3. JWT and Authentication (`auth`)
- `jwt.expiresIn`: Duration before the authentication token expires (default `7d`).
- `jwt.issuer`: The token issuer string (default `csfaq`).
- `jwt.audience`: The target API audience (default `csfaq-api`).
- `password.bcryptRounds`: BCrypt work factor (default `10` rounds).

### 4. Rate Limiting (`rateLimiting`)
Governs IP-based request throttles using `express-rate-limit`:
- `global`: Global traffic limits.
- `auth`: Stricter thresholds for login (max 5 in 15m) and registration (max 3 in 60m).
- `search`: Limits search requests (max 30 per minute).
- `askAi`: Daily AI quotas (max 5 for anonymous searches, 50 for logged-in students).

### 5. Search Engine (`search`)
- `hybrid.vectorWeight`: Relative weight of vector rankings in RRF merging (default `0.6`).
- `hybrid.keywordWeight`: Relative weight of keyword text rankings in RRF merging (default `0.4`).
- `hybrid.rrfK`: The constant $k$ used to damp Reciprocal Rank Fusion ranks (default `60`).
- `hybrid.minScore`: Minimum score similarity threshold below which results are discarded (default `0.3`).
- `embedding.model`: Hugging Face model key used for local embedding generation (default `mixedbread-ai/mxbai-embed-large-v1`).
- `embedding.dimensions`: The number of vector dimensions (default `1024`).

### 6. FAQ and Freshness Tiers (`faq`)
- `freshness.tiers`: Review intervals before content is flagged for verification:
  - **Evergreen**: 90 days.
  - **Seasonal**: 15 days.
  - **Volatile**: 4 days.
- `freshness.peerVoteThreshold`: Number of helpful votes needed from experts to auto-verify freshness.
- `duplicateDetection.similarityThreshold`: Math threshold above which a submission is auto-flagged as a duplicate (default `0.85`).

### 7. Support Request Settings (`support`)
- `goldenTicket.spCostPerEscalation`: Points deducted to make a support request high-priority (default `10`).
- `goldenTicket.defaultCooldownHours`: Delay before a student can request another Golden Ticket (default `48h`).
- `troubleshoot.maxSteps`: Steps defined for the student troubleshooting guides (default `4`).

### 8. AI Pipelines (`ai`)
- `providers.priority`: Order of provider lookup when resolving fallback services (default: `anthropic`, `openai`, `xai`, `minimax`, `gemini`).
- `pipelines.autoAnswer.approveThreshold`: Confidence score above which the AI will automatically answer a community question without human moderation (default `0.85`).
- `pipelines.autoAnswer.queueThreshold`: Score above which the AI answer is queued for review (default `0.60`).

### 9. Reputation and Tiers (`reputation`)
- `points`: Points awarded to students:
  - Creating a community post: `+5` points.
  - Creating a comment: `+2` points.
  - Having their answer accepted: `+15` points.
  - Receiving an upvote: `+1` point.
  - Contributing a verified FAQ: `+10` points.
- `tiers`: Reputation milestones:
  - **Newcomer**: 0 points.
  - **Contributor**: 50 points.
  - **Expert**: 200 points.
  - **Mentor**: 500 points.
  - **Knowledge Master**: 1000 points.

### 10. Data Retention (`retention`)
Governs clean-up intervals for logs and records:
- `searchLogs.ttlDays`: 90 days.
- `notifications.ttlDays`: 90 days.
- `freshReviewLogs.ttlDays`: 180 days.
- `moderationLogs.ttlDays`: 365 days.
