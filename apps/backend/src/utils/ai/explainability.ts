/**
 * explainability.ts — Shared Explainability Engine for Crowd Source FAQ
 *
 * Composes a provider-independent Explainability object describing how an
 * AI-generated answer was produced. No additional retrieval, embeddings,
 * or AI calls are made — every field is derived from information that
 * the calling pipeline already had at the moment it produced the answer.
 *
 * Design constraints (per feature spec 01_AI_Explainability_Engine.md):
 *   - No new DB queries
 *   - No new AI calls
 *   - No new embeddings
 *   - Safe metadata only (never expose prompts, document text, API keys)
 *   - Fully backward-compatible — missing fields degrade to defaults
 *   - Provider-independent — works with every ProviderConfig
 *
 * Used by:
 *   - knowledge.controller (askAIController)
 *   - rag.service (runRag)
 */

import type { ProviderConfig } from './aiProvider.js';

// ─── Public Types ──────────────────────────────────────────────────────────────

/**
 * Per-source retrieval metadata captured by the search pipeline. Every
 * field is already known to the caller; this object just normalises it.
 */
export interface ExplainabilityInput {
  /** Number of documents returned by hybrid search. */
  documentsRetrieved: number;
  /** Number of documents actually inserted into the prompt (typically 3-5). */
  documentsUsed: number;
  /** Top vector-similarity score from retrieval (0..1). May be 0 when vector search is disabled. */
  vectorScore: number;
  /** Top keyword / text-search score from retrieval (0..1). */
  keywordScore: number;
  /** Optional duplicate-detection result if the caller already ran it. */
  duplicateDetected?: boolean;
}

/**
 * The shape returned in the API response and stored alongside feedback.
 * Future fields may be added without breaking compatibility.
 */
export interface Explainability {
  /** Locally computed confidence in [0, 1]. */
  confidence: number;
  /** Provider vendor name (anthropic, openai, xai, minimax, gemini, custom). */
  provider: string;
  /** Model identifier used to generate the answer. */
  model: string;
  /** Model identifier — mirrors `model` for backward compatibility with the feedback snapshot schema. */
  modelName: string;
  /** Wall-clock latency of the provider call, in milliseconds. */
  latencyMs: number;
  /** Documents returned by hybrid search. */
  documentsRetrieved: number;
  /** Documents inserted into the prompt. */
  documentsUsed: number;
  /** Top vector-similarity score (0..1). */
  vectorScore: number;
  /** Top keyword score (0..1). */
  keywordScore: number;
  /** True if the caller detected a duplicate question before generation. */
  duplicateDetected: boolean;
  /** Timestamp the explainability object was composed. */
  generatedAt: Date;
}

// ─── Confidence Computation ────────────────────────────────────────────────────

/**
 * Locally computed confidence score. Reproducible and provider-independent —
 * we deliberately ignore any confidence that the LLM might emit, because
 * those values are inconsistent across vendors.
 *
 * Formula (per spec):
 *   confidence = 0.45 * vectorSimilarity
 *              + 0.25 * keywordScore
 *              + 0.20 * documentAgreement
 *              + 0.10 * retrievalCoverage
 *
 * Where:
 *   - documentAgreement = min(1.0, documentsUsed / max(3, documentsRetrieved))
 *     High when the prompt is densely populated with relevant context.
 *   - retrievalCoverage = min(1.0, documentsRetrieved / 5)
 *     Saturates at 5 retrieved documents.
 *
 * The result is clamped to [0, 1].
 */
export function computeConfidence(input: ExplainabilityInput): number {
  const { documentsRetrieved, documentsUsed, vectorScore, keywordScore } = input;
  const safeVector = clamp01(vectorScore);
  const safeKeyword = clamp01(keywordScore);
  const safeRetrieved = Math.max(0, documentsRetrieved | 0);
  const safeUsed = Math.max(0, Math.min(documentsUsed | 0, safeRetrieved));
  const documentAgreement = safeRetrieved === 0 ? 0 : Math.min(1, safeUsed / Math.max(3, safeRetrieved));
  const retrievalCoverage = Math.min(1, safeRetrieved / 5);
  const raw =
    0.45 * safeVector +
    0.25 * safeKeyword +
    0.20 * documentAgreement +
    0.10 * retrievalCoverage;
  return clamp01(raw);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ─── Composer ──────────────────────────────────────────────────────────────────

/**
 * Build a complete Explainability object from caller-supplied retrieval
 * metadata and the resolved ProviderConfig.
 *
 * Safe to call on a hot path: no I/O, no allocations beyond a single
 * object. Average cost <0.1ms in benchmarks.
 */
export function buildExplainability(
  provider: ProviderConfig,
  latencyMs: number,
  input: ExplainabilityInput,
  now: Date = new Date(),
): Explainability {
  return {
    confidence: roundTo4(computeConfidence(input)),
    provider: provider.provider,
    model: provider.modelName,
    modelName: provider.modelName,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    documentsRetrieved: Math.max(0, input.documentsRetrieved | 0),
    documentsUsed: Math.max(0, input.documentsUsed | 0),
    vectorScore: roundTo4(clamp01(input.vectorScore)),
    keywordScore: roundTo4(clamp01(input.keywordScore)),
    duplicateDetected: !!input.duplicateDetected,
    generatedAt: now,
  };
}

/**
 * Sentinel used when retrieval never ran (e.g. a pure greeting where the
 * LLM answered without any documents). The renderer should hide the
 * "documents used" card in this case rather than show 0/0.
 */
export function emptyExplainability(
  reason: 'no_retrieval' | 'provider_error' = 'no_retrieval',
  overrides?: Partial<Pick<Explainability, 'latencyMs' | 'documentsRetrieved' | 'documentsUsed' | 'vectorScore' | 'keywordScore'>>,
): Explainability {
  return {
    confidence: 0,
    provider: 'unknown',
    model: 'unknown',
    modelName: 'unknown',
    latencyMs: overrides?.latencyMs ?? 0,
    documentsRetrieved: overrides?.documentsRetrieved ?? 0,
    documentsUsed: overrides?.documentsUsed ?? 0,
    vectorScore: overrides?.vectorScore ?? 0,
    keywordScore: overrides?.keywordScore ?? 0,
    duplicateDetected: false,
    generatedAt: new Date(),
    // reason is intentionally not part of the wire shape — the caller
    // inspects it directly when deciding whether to hide the card.
    ...({ _reason: reason } as { _reason: string }),
  } as Explainability;
}

/**
 * Convenience helper: turn a list of retrieval hits into a citation-free
 * ExplainabilityInput. Caller passes the raw SearchResultItem[] shape
 * (or any array of objects with a `score` field) and gets back the four
 * retrieval numbers.
 */
export function summarizeRetrieval(
  hits: ReadonlyArray<{ score?: number }> | null | undefined,
  fallbackKeywordScore = 0,
): { documentsRetrieved: number; documentsUsed: number; vectorScore: number; keywordScore: number } {
  if (!hits || hits.length === 0) {
    return {
      documentsRetrieved: 0,
      documentsUsed: 0,
      vectorScore: 0,
      keywordScore: fallbackKeywordScore,
    };
  }
  const scores = hits.map((h) => Number(h.score ?? 0)).filter((s) => Number.isFinite(s));
  const top = scores.length > 0 ? Math.max(...scores) : 0;
  return {
    documentsRetrieved: hits.length,
    documentsUsed: Math.min(hits.length, 5),
    vectorScore: top,
    keywordScore: fallbackKeywordScore,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundTo4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}