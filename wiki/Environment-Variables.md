# Environment Variables

Complete reference for all environment variables used by the backend and frontend.

---

## Backend (`apps/backend/.env`)

### Core Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `6767` | HTTP server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend URL (used for Zoom OAuth redirects) |

### MongoDB

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes | -- | MongoDB connection string (`mongodb://` or `mongodb+srv://`) |

### JWT and Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | -- | Min 32 characters. Generate: `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | No | Same as JWT_SECRET | Dedicated refresh token secret |
| `JWT_EXPIRES_IN` | No | `7d` | Access token TTL (e.g., `15m`, `1h`, `7d`) |

### Encryption and OAuth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_MASTER_KEY` | No | Falls back to JWT_SECRET | AES-GCM key for encrypting Zoom tokens, TOTP. Generate: `openssl rand -hex 32` |
| `OAUTH_STATE_SECRET` | No | Falls back to JWT_SECRET | HMAC key for OAuth state signing. Generate: `openssl rand -hex 32` |

### Redis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | -- | Upstash REST endpoint. Enables cross-instance cache |
| `REDIS_TOKEN` | Conditional | -- | Required when REDIS_URL is set |
| `REDIS_TCP_URL` | No | -- | BullMQ TCP URL. Required for document processing queue |

### Sentry

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENTRY_DSN` | No | -- | Sentry project DSN for error tracking |

### Embedding Providers

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HUGGINGFACE_API_KEY` | No | -- | HuggingFace Inference API key |
| `EMBEDDING_API_KEY` | No | -- | OpenAI-compatible embedding API key |
| `EMBEDDING_BASE_URL` | No | -- | OpenAI-compatible embedding base URL |
| `EMBEDDING_PROVIDER` | No | `local` | Provider: `local`, `huggingface`, `openai`, `custom` |
| `EMBEDDING_MODEL` | No | `mixedbread-ai/mxbai-embed-large-v1` | Embedding model name |
| `EMBEDDING_DIMENSIONS` | No | `1024` | Embedding vector dimensions |

### AI Chat Providers

At least one provider must be configured. Priority order: Anthropic, OpenAI, XAI, Gemini, MiniMax, Custom.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | No | -- | Anthropic Claude API key (recommended) |
| `ANTHROPIC_MODEL` | No | `claude-3-5-sonnet-latest` | Anthropic model |
| `OPENAI_API_KEY` | No | -- | OpenAI GPT API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model |
| `XAI_API_KEY` | No | -- | XAI Grok API key |
| `XAI_MODEL` | No | `grok-3` | XAI model |
| `GEMINI_API_KEY` | No | -- | Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-1.5-flash` | Gemini model |
| `MINIMAX_API_KEY` | No | -- | MiniMax API key |
| `CUSTOM_API_KEY` | No | -- | Custom provider API key |
| `CUSTOM_BASE_URL` | No | `http://localhost:11434/v1` | Custom provider base URL |

### Per-Pipeline AI Overrides

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FAQ_AUDIT_PROVIDER` | No | Uses global priority | Provider for FAQ audit pipeline |
| `FAQ_AUDIT_MODEL` | No | Uses provider default | Model for FAQ audit pipeline |
| `AUTO_ANSWER_PROVIDER` | No | Uses global priority | Provider for auto-answer pipeline |
| `AUTO_ANSWER_MODEL` | No | Uses provider default | Model for auto-answer pipeline |

### Zoom OAuth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZOOM_CLIENT_ID` | No | -- | Zoom OAuth app client ID |
| `ZOOM_CLIENT_SECRET` | Conditional | -- | Required when ZOOM_CLIENT_ID is set |
| `ZOOM_REDIRECT_URI` | No | -- | Must match Zoom app redirect URL setting exactly |
| `ZOOM_TOPIC_BLACKLIST` | No | -- | Comma-separated regexes for skipping meetings |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Conditional | -- | Required in non-development environments |

### Image Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOUDINARY_CLOUD_NAME` | No | -- | Legacy Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | No | -- | Legacy Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | -- | Legacy Cloudinary API secret |
| `GCS_BUCKET` | Conditional | -- | Google Cloud Storage bucket name |
| `GCS_PUBLIC_HOST` | No | -- | Public hostname for GCS assets |
| `GCS_ALLOWED_SUBFOLDERS` | No | `avatar,posts` | Allowed upload subfolders |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | -- | GCP service account key path (local dev only) |

### Discord Bot

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_BOT_TOKEN` | No | -- | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | No | -- | Application ID from Discord Developer Portal |
| `DISCORD_GUILD_ID` | No | -- | Discord server (guild) ID |
| `DISCORD_ADMIN_USER_IDS` | No | -- | Comma-separated Discord user IDs for admin commands |
| `DISCORD_NOTIFICATION_CHANNEL_ID` | No | -- | Channel ID for bot notifications |
| `DISCORD_PUBLIC_CHANNEL_ID` | No | -- | Channel ID for public announcements |
| `INTERNAL_API_KEY` | No | -- | Shared secret for bot-to-API admin calls |
| `PUBLIC_URL` | No | `http://localhost:6767` | Backend URL the bot uses for API calls |
| `PUBLIC_BASE_URL` | No | -- | Public URL for invite links |
| `ADMIN_DISCORD_LOG_CHANNEL` | No | -- | Channel ID for admin audit events |
| `DISCORD_WEBHOOK_URL` | No | -- | Webhook URL for ALERT/ERROR log forwarding |
| `DISCORD_ADMIN_PASSPHRASE` | Conditional | `adminpassphrase` | Required in production |
| `ADMIN_BCRYPT_COST` | No | `12` | bcrypt cost factor for passphrase hashing |

### Document Pipeline

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOCUMENT_INSIGHT_AUTO_PROMOTE_THRESHOLD` | No | `3` | Search count before auto-promoting an insight to FAQ |

### Infisical (Production)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `INFISICAL_TOKEN` | No | -- | Infisical service token (Docker/production only) |
| `INFISICAL_ENVIRONMENT` | No | -- | Infisical environment name |
| `INFISICAL_PROJECT_ID` | No | -- | Infisical project ID |
| `INFISICAL_SECRET_PATH` | No | -- | Infisical secret path |

---

## Frontend (`apps/frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | (empty) | Backend API URL. Leave empty for same-origin deployment |
| `VITE_PUBLIC_URL` | No | `window.location.origin` | Frontend public URL for admin links |

In a single-container deployment (backend serves frontend), both can be left empty. The frontend uses relative paths (`/csfaq/api`) which resolve to the same server.

---

## Important Notes

- Values set to `#` in `.env` mean "unconfigured". The backend treats `#` values as undefined.
- The server will NOT start without `MONGODB_URI` and `JWT_SECRET`.
- In production, `DISCORD_ADMIN_PASSPHRASE` is required.
- In non-development environments, `ZOOM_WEBHOOK_SECRET_TOKEN` is required.
- See [Production URL Checklist](./Production-URL-Checklist.md) for what to update when deploying to a new domain.
