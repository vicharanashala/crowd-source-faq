# AI Explainability Engine

> **Status:** Implemented (v1.0)
> **Source:** `apps/backend/src/utils/ai/explainability.ts`

## 1. Purpose

Compose a provider-independent, backward-compatible explainability object describing how an AI-generated answer was produced — **without** any additional AI calls, embeddings, vector searches, or DB queries.

## 2. Constraints

- No new DB queries
- No new AI calls
- No new embeddings or vector searches
- Safe metadata only (never expose prompts, doc text, API keys, chain-of-thought)
- Fully backward-compatible — missing fields degrade to defaults
- Provider-independent — works with any `ProviderConfig`
- Pure functions; <0.5ms added per request

## 3. Shape

```typescript
interface Explainability {
  confidence: number;       // [0, 1] locally computed
  provider: string;         // e.g. "anthropic", "openai"
  model: string;            // model identifier
  modelName: string;        // mirrors `model` (for feedback schema compatibility)
  latencyMs: number;        // provider round-trip ms
  documentsRetrieved: number;
  documentsUsed: number;
  vectorScore: number;      // top vector similarity [0, 1]
  keywordScore: number;     // top keyword score [0, 1]
  duplicateDetected: boolean;
  generatedAt: Date;
}
```

## 4. Confidence Formula

```
confidence = 0.45 × vectorScore
           + 0.25 × keywordScore
           + 0.20 × documentAgreement
           + 0.10 × retrievalCoverage
```

Where:
- `documentAgreement = min(1.0, documentsUsed / max(3, documentsRetrieved))`
- `retrievalCoverage = min(1.0, documentsRetrieved / 5)`

All inputs clamped to [0, 1]. Result clamped to [0, 1].

## 5. Consumers

| Consumer | Usage |
|----------|-------|
| `knowledge.controller` (`askAIController`) | On success and fallback |
| `rag.service` (`runRag`) | Attached to `PipelineResult` |

## 6. Sentinel Values (`emptyExplainability`)

| `_reason` | When used |
|-----------|-----------|
| `no_retrieval` | Pure greeting / no-doc answer |
| `provider_error` | LLM call failed, fallback path |

## 7. Tests

Unit tests at `apps/backend/src/utils/ai/__tests__/explainability.test.ts`:
- `computeConfidence` with various inputs
- `buildExplainability` expected shape
- `emptyExplainability` sentinel behavior
- `summarizeRetrieval` edge cases
