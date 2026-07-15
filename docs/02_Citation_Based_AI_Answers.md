# Citation-Based AI Answers

> **Status:** Implemented (v1.0)
> **Source:** `apps/backend/src/utils/ai/citations.ts`

## 1. Purpose

Build lightweight `Citation` objects from retrieval hits already available to the pipeline (FAQ, Community, TranscriptKnowledge) — without any additional I/O.

## 2. Constraints

- Default cap: 5 citations (configurable via `MAX_CITATIONS` env, max 20)
- Never expose raw document text — only title, section, similarity, source type, URL/page pointers
- Provider-independent
- Pure functions; <0.5ms added per request

## 3. Shape

```typescript
interface Citation {
  id: string;               // Mongo ObjectId string
  title: string;            // Human-readable (truncated 200 chars)
  section?: string;         // Category or sub-section
  similarity: number;       // [0, 1]
  sourceType: 'FAQ' | 'Document' | 'Zoom' | 'KnowledgeBase';
  url?: string;             // Deep-link path
  page?: number;            // PDF page or transcript timestamp
  snippet?: string;         // Truncated source text (240 chars max)
  provenance?: string;      // Tooltip label
}
```

## 4. Converters

| Function | Source | `sourceType` | `url` pattern |
|----------|--------|--------------|---------------|
| `faqToCitation` | FAQ hit | `FAQ` | `/faq/${id}` |
| `communityToCitation` | Community post hit | `KnowledgeBase` | `/community?post=${id}` |
| `knowledgeToCitation` | TranscriptKnowledge hit | `Zoom` or `Document` | `hit.url` (passthrough) |

## 5. Dedup & Sort (`finalizeCitations`)

1. Descending by `similarity`
2. Same `(sourceType, title_lowercase)` → drop lower-scored duplicate
3. Slice to `maxCitations` (default 5, min 1)

## 6. Consumers

| Consumer | Usage |
|----------|-------|
| `knowledge.controller` (`askAIController`) | On success |
| `rag.service` (`runRag`) | Attached to `PipelineResult` |
| `auto-answer.controller` (`findBestAnswer`) | On success |

## 7. Tests

Unit tests at `apps/backend/src/utils/ai/__tests__/citations.test.ts`:
- Each converter returns correct `sourceType` and `url`
- Null handling / missing fields
- `finalizeCitations` dedup and ordering
- `buildCitations` integration
