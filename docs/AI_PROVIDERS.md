# AI Provider System

## Overview

The platform supports four AI providers in priority order:
1. **Anthropic** (Claude models)
2. **OpenAI** (GPT models)
3. **XAI** (Grok models)
4. **MiniMax** (MiniMax models)

AI calls go through a unified `aiProvider.ts` resolution system. **Never hardcode provider names** in pipeline controllers.

---

## Architecture

```
aiProvider.ts
     │
     ├── resolvePipelineProvider(pipeline)
     │     Checks: PIPELINE_PROVIDER_KEY[pipeline] → ANTHROPIC_API_KEY → OPENAI_API_KEY → XAI_API_KEY → MINIMAX_API_KEY
     │
     ├── resolvePipelineModel(pipeline, provider)
     │     Checks: PIPELINE_MODEL_KEY[pipeline] → DEFAULT_MODELS[provider]
     │
     ├── getPipelineProviderConfig(pipeline)
     │     Returns full ProviderConfig: { provider, model, apiKey, baseURL, authHeader, needsAnthropicVersion }
     │
     └── chatWithConfig(config, messages)
           Direct HTTP fetch using the pre-built config
           Does NOT re-resolve through chatWithProvider
```

### Why `chatWithConfig` not `chatWithProvider`

`chatWithProvider(provider, messages, model?)` re-resolves the provider from global config, discarding any per-pipeline overrides. `chatWithConfig` uses exactly what `getPipelineProviderConfig` returned.

---

## Provider Configuration Resolution

```ts
// Priority chain for provider detection
ANTHROPIC_API_KEY → OPENAI_API_KEY → XAI_API_KEY → MINIMAX_API_KEY → 'minimax'
```

The first key found becomes the **global default**. Per-pipeline overrides take precedence.

### Per-pipeline override

```bash
# backend/.env

# Global fallback (used if no per-pipeline override is set)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
MINIMAX_API_KEY=...

# FAQ audit pipeline override
FAQ_AUDIT_PROVIDER=anthropic
FAQ_AUDIT_MODEL=claude-sonnet-4-20250514

# Auto-answer pipeline override
AUTO_ANSWER_PROVIDER=minimax
AUTO_ANSWER_MODEL=MiniMaxAI/MiniMax-M2.7
```

Without any per-pipeline override, both pipelines auto-detect MiniMax and use it — no changes needed if MiniMax is your only key.

---

## Correct Usage in Pipeline Controllers

### Correct (always)

```ts
import { chatWithConfig, getPipelineProviderConfig } from '../utils/aiProvider.js';

// Inside the AI call site:
const cfg = await getPipelineProviderConfig('auto_answer'); // or 'faq_audit'
const reply = await chatWithConfig(cfg, [
  { role: 'system', content: systemPrompt },
  { role: 'user',   content: userPrompt },
]);
```

### Incorrect (causes silent pipeline failure)

```ts
import { chat } from '../utils/aiProvider.js';

// Hardcodes OpenAI — fails if OPENAI_API_KEY is not set
const reply = await chat('openai', messages, 'gpt-4o-mini');
```

If `OPENAI_API_KEY` is not set, this produces:
```
openai error: { "message": "You didn't provide an API key..." }
```

Even though `MINIMAX_API_KEY` IS configured and should be used.

---

## `chatWithConfig` Implementation

For `provider === 'anthropic'`:
```ts
fetch(`${baseURL}/messages`, {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({ model, messages, max_tokens: 512 }),
})
```

For `provider === 'openai' | 'xai' | 'minimax'` (all use chat/completions):
```ts
fetch(`${baseURL}/chat/completions`, {
  method: 'POST',
  headers: {
    [authHeader]: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ model, messages }),
})
```

Error shape when no key is configured:
```
No API key for provider 'minimax' — set MINIMAX_API_KEY
```
(Clear and actionable — not a silent failure.)

---

## Model Defaults by Provider

| Provider | Default model |
|---|---|
| `anthropic` | `claude-sonnet-4-20250514` |
| `openai` | `gpt-4o-mini` |
| `xai` | `grok-2` |
| `minimax` | `MiniMaxAI/MiniMax-M2.7` |

---

## Verification

After starting the backend, verify pipelines are using the correct provider:

```bash
# FAQ audit dry run
curl -X POST http://localhost:6767/api/admin/audit/faqs?dry_run=true \
  -H "Authorization: Bearer <admin...n

# Should log: [faqAudit] Starting scheduled run — N FAQs to audit.
# Should NOT log: openai error: { "message": "You didn't provide an API key..." }

# Auto-answer dry run
curl -X POST http://localhost:6767/api/admin/community/auto-answer?dry_run=true \
  -H "Authorization: Bearer <admin...n
```

Check backend logs for `[faqAudit]` or `[autoAnswer]` prefix and verify no provider key errors.

---

## AI Client (`aiClient.ts`)

A higher-level wrapper around `chatWithConfig` for general-purpose AI calls outside of pipeline controllers. Used by RAG, duplicate detection, and Zoom transcript extraction.

```ts
import { chat } from '../services/aiClient.js';

// chat(provider, messages, model?)
const reply = await chat('anthropic', [
  { role: 'user', content: 'Summarize this: ' + transcript },
], 'claude-sonnet-4-20250514');
```

This is separate from the pipeline system — it's for one-off AI calls where you explicitly know the provider you want.

---

## Adding a New Provider

1. Add the provider to `PROVIDER_DEFAULTS` in `aiProvider.ts`:
   ```ts
   PROVIDER_DEFAULTS: {
     myprovider: {
       apiKeyEnv: 'MYPROVIDER_API_KEY',
       baseURL: 'https://api.myprovider.com/v1',
      authHeader: 'Authorization',
       needsAnthropicVersion: false,
     },
   }
   ```

2. Add the default model:
   ```ts
   DEFAULT_MODELS: {
     myprovider: 'my-model-name',
   }
   ```

3. Add to the priority chain in `resolvePipelineProvider`:
   ```ts
   return findFirstKey(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'MINIMAX_API_KEY', 'MYPROVIDER_API_KEY']);
   ```