# AI Providers

The platform uses a unified, multi-provider AI client (`AiClient`) to power its smart features. Instead of hardcoding a single API provider, the system is designed to allow administrators to route different features (like summarization, duplicate checking, or transcript extraction) to different backend models (OpenAI, Anthropic, Gemini, Grok, MiniMax, or Custom self-hosted endpoints).

---

## Supported Features

The AI engine supports four major pipeline features:

1. **Duplicate Detection (`duplicateDetection`)**
   - **Role**: Automatically detects if a new community post or support ticket is a duplicate of an existing FAQ or unresolved post.
   - **Trigger**: Runs on-the-fly during submission.
2. **Knowledge Extraction (`knowledgeExtraction`)**
   - **Role**: Parses raw texts (such as Zoom lecture VTT transcripts or long community threads) and extracts clear, structured Q&A candidate items.
   - **Trigger**: Runs after meeting recordings finish ingesting or manually in the admin dashboard.
3. **Search Summarization (`searchSummarization`)**
   - **Role**: Generates a quick, direct response summarizing the top vector search results, giving users immediate answers before they read individual FAQs.
   - **Trigger**: Runs when a user performs a search.
4. **FAQ Generation (`faqGeneration`)**
   - **Role**: Assists admins by drafting clean, formal FAQ questions, categories, and answers from raw community threads.
   - **Trigger**: Triggered manually by staff in the Admin Dashboard.

---

## Supported Providers & Key Env Variables

API credentials and models are set using system environment variables on the backend:

| Provider | Label | Default API Base URL | Key Environment Variable | Model Environment Variable |
|----------|-------|----------------------|--------------------------|----------------------------|
| `anthropic` | Anthropic Claude | `https://api.anthropic.com/v1` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| `openai` | OpenAI | `https://api.openai.com/v1` | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| `xai` | xAI Grok | `https://api.x.ai/v1` | `XAI_API_KEY` | `XAI_MODEL` |
| `minimax` | MiniMax | `https://api.minimax.io/v1` | `MINIMAX_API_KEY` | `MINIMAX_MODEL` |
| `gemini` | Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` | `GEMINI_MODEL` |
| `custom` | Custom Provider | `http://localhost:11434/v1` (Ollama default) | `CUSTOM_API_KEY` | `CUSTOM_MODEL` |

### Custom Endpoints
If you run regional, private, or proxy endpoints, you can customize the base URLs:
- `MINIMAX_BASE_URL`
- `GEMINI_BASE_URL`
- `CUSTOM_BASE_URL`

---

## Admin Configuration

Administrators configure the active provider and model settings at runtime via the **Admin -> AI Settings** dashboard.
- Configuration is saved in the database under the `AiConfig` collection.
- You can select different provider-model pairs for each of the four features individually. For example:
  - Route **Search Summarization** to `openai` (`gpt-4o-mini`) for fast, low-cost answers.
  - Route **Knowledge Extraction** to `anthropic` (`claude-3-5-sonnet`) for deep, context-rich extraction.

---

## Vector Embeddings

While chat/completion queries are routed to APIs, generating **embeddings** for semantic search can be handled locally or via APIs:
1. **API Embeddings**: If configured, the system uses the provider's API (e.g. OpenAI `text-embedding-3-small`) to generate 1536-dimensional vectors.
2. **Local Embeddings**: If API keys are not supplied or local generation is preferred, the backend uses `@xenova/transformers` (running local ONNX-runtime versions of embedding models like `all-MiniLM-L6-v2` or `bge-small-en-v1.5`) to generate vectors directly on the CPU/GPU, eliminating third-party API costs.

---

## Cost Tracking

The `AiClient` tracks token usage and estimates costs for every API call based on hardcoded per-million-token cost definitions:
- **Anthropic Claude**: $3.00 / M tokens (default base)
- **OpenAI**: $0.15 / M tokens (GPT-4o Mini base)
- **Google Gemini**: $0.075 / M tokens (Gemini 1.5 Flash base)
- **Custom / Self-hosted**: $0.00 / M tokens

Usage statistics (provider, model, tokens used, estimated cost in USD) are logged to the `AdminAuditLog` to help monitor billing.
