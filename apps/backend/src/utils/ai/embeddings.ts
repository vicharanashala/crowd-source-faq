/**
 * embeddings.ts — semantic embedding pipeline.
 *
 * Exclusively uses custom OpenAI-compatible models (e.g., local Ollama)
 * via the official OpenAI SDK.
 *
 * v1.79.1 — circuit breaker protection.
 * The previous version called the embedder on every community search,
 * duplicate check, and post-create, all without back-pressure. When the
 * configured EMBEDDING_BASE_URL (often a Cloudflare quick-tunnel or local
 * Ollama) becomes unreachable, every failure was logged to stdout +
 * persisted to AiApiCall — producing a flood of
 *   "AI embedding FAIL · custom/mxbai-embed-large · … Connection error"
 * lines that drowned the admin logs.
 *
 * The fix is two layers, both standard for the codebase:
 *   1. Wrap the upstream call in the existing CircuitBreaker singleton
 *      (3 consecutive failures opens it for 60s, then HALF-OPEN probes).
 *      While OPEN, fail in microseconds with `CircuitOpenError` instead
 *      of waiting on the OpenAI SDK's 300s timeout.
 *   2. While OPEN, suppress per-call audit-log spam: only the FIRST
 *      rejection (and the recovery-success log) emit a warn/info line.
 *      Without this, the breaker never helps because the dashboard is
 *      still drowned by AiApiCall writes from every request.
 *
 * Callers that need the embedding for correctness (e.g. converting a
 * post to FAQ) still catch the error and store a zero vector — see
 * `generateEmbedding` below. That path is unchanged.
 */

import mongoose, { Types } from 'mongoose';
import OpenAI from 'openai';
import AiConfig from '../../modules/ai/ai-config.model.js';
import { getConfig } from '../../config/runtimeConfig.js';
import { logAiApiSuccess, logAiApiFailure } from './apiUsageLog.js';
import { logger } from '../http/logger.js';
import { CircuitBreaker, CircuitOpenError } from '../http/circuitBreaker.js';

export const MODEL_SLUG = 'mxbai-embed-large';
export const EMBEDDING_DIM = 1024;
/** Retrieval prompt prepended to search queries. Don't add to documents. */
export const QUERY_PROMPT = 'Represent this sentence for searching relevant passages: ';

// ─── Circuit breaker (singleton) ──────────────────────────────────────────
//
// 3 strikes + 60s cooldown. Generous enough that a single transient blip
// doesn't open the gate, but tight enough that a dead tunnel is shut off
// before log spam builds up.
const embeddingCircuit = new CircuitBreaker({
  name: 'embedding-api',
  failureThreshold: 3,
  recoveryTimeout: 60_000,
  maxConcurrent: 4,
});

// Log-throttling for OPEN-state rejections. We emit ONE warn when the
// breaker opens, then suppress subsequent per-call AiApiCall writes until
// the breaker closes again. This is what stops the spam in practice.
let lastOpenWarnAt = 0;
let lastOpenStateAt: 'open' | 'half-open' | 'closed' = 'closed';
const OPEN_QUIET_MS = 5_000; // emit at most one OPEN banner per 5s

// ─── Shared OpenAI client cache ───────────────────────────────────────────
// The OpenAI SDK spins up http.Agent instances per construction. Reusing
// the client lets the connector pool survive across requests when the
// endpoint is healthy.
let cachedClientKey: string | null = null;
let cachedClient: OpenAI | null = null;
function getClient(apiKey: string, baseURL: string): OpenAI {
  const key = `${baseURL}|${apiKey ? 'set' : 'empty'}`;
  if (cachedClient && cachedClientKey === key) return cachedClient;
  cachedClient = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL: baseURL.replace(/\/$/, ''),
    // Keep timeout sane — the circuit breaker is the real back-pressure;
    // this just stops a misconfigured endpoint from pinning an event loop
    // thread for 5 minutes per call.
    timeout: 10_000,
  });
  cachedClientKey = key;
  return cachedClient;
}

export async function getActiveEmbeddingConfig(batchId: string | null = null) {
  // Strictly reading from environment variables
  const model = (process.env.EMBEDDING_MODEL ?? '').trim() || MODEL_SLUG;
  
  let dimensions = EMBEDDING_DIM;
  const envDims = (process.env.EMBEDDING_DIMENSIONS ?? '').trim();
  if (envDims) {
    const parsedDims = parseInt(envDims, 10);
    if (!isNaN(parsedDims)) dimensions = parsedDims;
  }

  const baseURL = (process.env.EMBEDDING_BASE_URL ?? 'http://localhost:11434/v1').trim();
  const apiKey = (process.env.EMBEDDING_API_KEY ?? '').trim() || 'ollama';

  return { model, dimensions, baseURL, apiKey };
}

/**
 * Call OpenAI-compatible embeddings API using the official OpenAI SDK.
 *
 * Wrapped in a singleton CircuitBreaker. While OPEN, fails in <1ms
 * instead of waiting on the upstream timeout. Recovery is automatic —
 * the breaker probes HALF_OPEN after `recoveryTimeout` and closes on
 * the first successful call.
 */
async function callCustomEmbedding(text: string, apiKey: string, model: string, baseURL: string): Promise<number[]> {
  // Truncate the input to a safe character limit (~2000 characters)
  // to avoid 'input length exceeds context length' errors on BERT models (max 512 tokens).
  const safeInput = text.length > 2000 ? text.slice(0, 2000) : text;

  // v1.79 — log every external embedding call (success + failure)
  // via the shared aiLog helper so admins can audit per-call.
  // (The wrap.call()'s start point is now before this, so the start
  // timestamp is measured inside execute() to be honest about duration.)

  try {
    return await embeddingCircuit.execute(async () => {
      const startedAt = Date.now();
      try {
        const response = await getClient(apiKey, baseURL).embeddings.create({
          model,
          input: safeInput,
        });
        const vec = response.data[0]?.embedding;
        if (!Array.isArray(vec)) {
          const err = `Embedding API returned unexpected shape: ${JSON.stringify(response).slice(0, 200)}`;
          logAiApiFailure({
            kind: 'embedding',
            provider: 'custom',
            modelName: model,
            feature: 'embeddings',
            durationMs: Date.now() - startedAt,
            error: err,
          });
          throw new Error(err);
        }
        logAiApiSuccess({
          kind: 'embedding',
          provider: 'custom',
          modelName: model,
          feature: 'embeddings',
          durationMs: Date.now() - startedAt,
          // Successful embedding responses don't include an HTTP status the
          // SDK exposes — but we know it's 200, so record it explicitly.
          httpStatus: 200,
        });
        // Recovery log: if we got here after an OPEN period, surface a
        // single info line so admins know the breaker recovered.
        const state = embeddingCircuit.getState();
        if (lastOpenStateAt === 'open' && state !== 'open') {
          logger.info(
            `[embeddings] circuit recovered → ${state} · ${model} @ ${baseURL}`,
          );
          lastOpenStateAt = state;
        } else if (state !== 'open') {
          lastOpenStateAt = state;
        }
        return normalizeL2(vec);
      } catch (err) {
        // OpenAI SDK errors expose `.status` for HTTP failures. Fall back
        // to undefined when the error isn't an HTTP error (e.g. network).
        const httpStatus = (err as { status?: number })?.status;
        logAiApiFailure({
          kind: 'embedding',
          // Embeddings always go to a custom OpenAI-compatible endpoint
          // (Ollama or admin-configured). Tag it 'custom' so the log
          // doesn't masquerade as the canonical OpenAI provider.
          provider: 'custom',
          modelName: model,
          feature: 'embeddings',
          durationMs: Date.now() - startedAt,
          error: (err as Error).message,
          status: httpStatus,
        });
        throw err;
      }
    });
  } catch (err) {
    // While the circuit is OPEN, suppress per-call audit logging to
    // stop the spam. Emit ONE warn per OPEN_QUIET_MS instead of one
    // per failed request — the breaker already proves the endpoint is
    // dead, the per-call failure metadata adds zero information.
    if (err instanceof CircuitOpenError) {
      const state = embeddingCircuit.getState();
      const now = Date.now();
      if (state === 'open' && lastOpenStateAt !== 'open') {
        logger.warn(
          `[embeddings] circuit OPEN — embedding requests rejected · ${model} @ ${baseURL} · ${err.message}`,
        );
        lastOpenStateAt = 'open';
        lastOpenWarnAt = now;
      } else if (state === 'open' && now - lastOpenWarnAt >= OPEN_QUIET_MS) {
        logger.warn(
          `[embeddings] circuit still OPEN · ${model} @ ${baseURL} · (last warn >${Math.round((now - lastOpenWarnAt) / 1000)}s ago)`,
        );
        lastOpenWarnAt = now;
      }
      throw err;
    }
    throw err;
  }
}

function normalizeL2(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
}

// ── In-process local pipeline (disabled) ───────────────────────────────
const isWarmed = false;

/** Warm up the embedding pipeline. */
export const warmEmbedder = async (): Promise<void> => {
  logger.warn('[embeddings] Local ONNX embedding warming skipped (Exclusively using Custom endpoint).');
};

/**
 * Generate an embedding for a DOCUMENT (FAQ, post, etc.).
 */
export const generateEmbedding = async (text: string, options?: { batchId?: string | null }): Promise<number[]> => {
 feat/aichatbot
  const { dimensions, model, baseURL, apiKey } = await getActiveEmbeddingConfig(options?.batchId);
  if (process.env.FAST_SEED === 'true' || apiKey === 'ollama') {
    return new Array(dimensions).fill(0);
  }

  const { dimensions } = await getActiveEmbeddingConfig(options?.batchId);
 main
  try {
    return await callCustomEmbedding(text, apiKey, model, baseURL);
  } catch (err) {
    // No embedding infrastructure configured → silently return a zero
    // vector of the correct dimensionality. Callers decide what to do
    // with it (duplicate detection filters via length match, retrieval
    // is text-based and ignores embeddings entirely).
    //
    // In dev/test, surface the failure so missing config is loud.
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
feat/aichatbot
      return new Array(dimensions).fill(0);

      logger.warn(`[embeddings] Custom embedding API failed, falling back to zero vector: ${(err as Error).message}`);
    } else {
      // Production: don't spam Discord. info-level so it lands in
      // logs but not the alert channel. Sentry still gets it.
      logger.info(`[embeddings] API unavailable, returning zero vector (dim=${dimensions})`);
 main
    }
    return new Array(dimensions).fill(0);
  }
};

/**
 * Generate an embedding for a SEARCH QUERY.
 */
export const generateQueryEmbedding = async (query: string, options?: { batchId?: string | null }): Promise<number[]> => {
  return generateEmbedding(QUERY_PROMPT + query, options);
};

/** Re-export for diagnostic scripts. True if a warm in-process pipeline exists. */
export const __isWarmed = (): boolean => isWarmed;
