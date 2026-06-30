/**
 * embeddings.ts — semantic embedding pipeline.
 *
 * v1.68 — Model swap: Xenova/multi-qa-mpnet-base-dot-v1
 * (768-dim, 110M params) → mixedbread-ai/mxbai-embed-large-v1
 * (1024-dim, 335M params). MTEB score 64.68 vs the old model's
 * lower MTEB; should fix the "FAQ search returns nothing useful"
 * complaint.
 *
 * v1.68 (HF API mode) — When HUGGINGFACE_API_KEY is set, route
 * all embedding calls through the HF Inference API at
 * https://router.huggingface.co/hf-inference/models/<model>.
 * No 1.2GB ONNX download, no in-process model load, just a
 * network call. When unset, fall back to running the model
 * in-process via @huggingface/transformers (the maintained
 * successor to @xenova/transformers).
 *
 * Important: mxbai wants a retrieval-specific prompt for QUERIES
 * ("Represent this sentence for searching relevant passages: ").
 * Documents (FAQs, posts) embed as-is, no prompt. Use
 * generateQueryEmbedding() for queries and generateEmbedding()
 * for documents.
 *
 * IMPORTANT: if you swap models again, you MUST:
 *   1. Update MODEL_SLUG below
 *   2. Update EMBEDDING_DIM below
 *   3. Run `npm run backfill:embeddings` to regenerate all stored
 *      vectors (old + new dims don't compose in the same Atlas
 *      index)
 *   4. Update the `numDimensions` value in the Atlas vector
 *      search index (recreate the index — Atlas doesn't allow
 *      in-place dim change)
 */
import {
  pipeline,
  FeatureExtractionPipeline,
  env as transformersEnv,
} from '@huggingface/transformers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isCompiled = import.meta.url.includes('/dist/');
const relativeCachePath = isCompiled ? '../../../.cache/transformers' : '../../.cache/transformers';

export const MODEL_SLUG = 'mixedbread-ai/mxbai-embed-large-v1';
export const EMBEDDING_DIM = 1024;
/** Retrieval prompt prepended to search queries. Don't add to documents. */
export const QUERY_PROMPT = 'Represent this sentence for searching relevant passages: ';

// ── HF Inference API path ────────────────────────────────────────────
// v1.68.1 — Switched from the legacy `api-inference.huggingface.co`
// subdomain to the new `router.huggingface.co/hf-inference/`
// path. The legacy subdomain has been unresolvable on some
// corporate / VPN DNS setups (ENOTFOUND), which silently
// broke every embedding call. The new path resolves
// everywhere we tested.
//
// Both endpoints return the same model, same 1024-dim
// vector, and the new endpoint's un-normalized output is
// passed through our existing `normalizeL2()` step
// downstream (see callHfApiEmbedding) so the Atlas
// dotProduct index still sees L2-normalized vectors.
const HF_API_BASE = 'https://router.huggingface.co/hf-inference/models';

function getHfApiKey(): string | null {
  return (process.env.HUGGINGFACE_API_KEY ?? '').trim() || null;
}

function shouldUseHfApi(): boolean {
  return getHfApiKey() !== null;
}

/**
 * Call the HF Inference API for a single text. Returns the
 * embedding vector. The API may return either:
 *   - pooled 2D:  [[float, float, ...]]   (most common for
 *                                          sentence-transformers)
 *   - hidden 3D: [[[float, ...], [float, ...], ...]]   (raw
 *                                          last_hidden_state;
 *                                          needs CLS pooling)
 *
 * We detect the shape and either normalize the pooled result
 * or do CLS pooling + normalize the hidden states.
 */
async function callHfApiEmbedding(text: string): Promise<number[]> {
  const apiKey = getHfApiKey();
  if (!apiKey) {
    throw new Error('HUGGINGFACE_API_KEY is not set');
  }
  const url = `${HF_API_BASE}/${MODEL_SLUG}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);  // 30s timeout
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text,
        options: { wait_for_model: true, use_cache: true },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HF Inference API ${res.status}: ${errText}`);
    }
    const data = await res.json();
    // v1.68.1 — the new router endpoint returns a FLAT
    // 1D array of 1024 numbers (not a 2D nested array).
    // Three valid response shapes from various HF
    // endpoints/versions:
    //
    //   (1) 2D: [batch, dim]                  → [[0.06, 0.29, ...]]
    //       E.g. some legacy endpoints, mxbai hidden states
    //   (2) 1D: [dim]                         → [0.06, 0.29, ...]
    //       E.g. the new router endpoint, fully pooled
    //   (3) 3D: [batch, seq, dim]             → [[[0.06, ...]]]
    //       E.g. mxbai hidden states without CLS pooling
    //
    // The previous code assumed shape (3) and tried to
    // take data[0][0] as the vector — that returned a
    // single number for the new endpoint, and normalizeL2
    // threw "vec is not iterable" trying to for-loop over
    // it. Now we probe the shape first.
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`HF Inference API returned unexpected shape: ${JSON.stringify(data).slice(0, 200)}`);
    }
    const first = data[0];
    if (Array.isArray(first)) {
      if (Array.isArray(first[0])) {
        // shape (3): 3D — take CLS token (first token of first sequence)
        return normalizeL2(first[0] as number[]);
      }
      // shape (1): 2D already-pooled, single vector in the batch
      return normalizeL2(first as number[]);
    }
    // shape (2): 1D — data itself is the vector
    return normalizeL2(data as number[]);
  } finally {
    clearTimeout(t);
  }
}

function normalizeL2(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
}

// ── In-process local pipeline (fallback) ───────────────────────────────
let cachedEmbedder: FeatureExtractionPipeline | null = null;
let isWarmed = false;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!cachedEmbedder) {
    transformersEnv.cacheDir = path.resolve(__dirname, relativeCachePath);
    transformersEnv.allowLocalModels = true;
    cachedEmbedder = await (pipeline as any)(
      'feature-extraction',
      MODEL_SLUG,
      { dtype: 'fp32' },
    ) as FeatureExtractionPipeline;
    isWarmed = true;
  }
  return cachedEmbedder;
}

/** Warm up the in-process embedding pipeline (no-op if using API). */
export const warmEmbedder = async (): Promise<void> => {
  if (shouldUseHfApi()) return;  // nothing to warm
  await getEmbedder();
};

/**
 * Generate an embedding for a DOCUMENT (FAQ, post, etc.).
 * No prompt prefix — the mxbai paper says don't use the
 * retrieval prompt for documents, only for queries.
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  if (shouldUseHfApi()) {
    try {
      return await callHfApiEmbedding(text);
    } catch (err: any) {
      console.warn(`[embeddings] HF API embedding failed: ${err.message}. Falling back to local pipeline.`);
    }
  }
  try {
    const embedder = await getEmbedder();
    const output = await embedder(text, {
      pooling: 'cls',
      normalize: true,
    });
    return Array.from(output.data as Float32Array | number[]);
  } catch (err: any) {
    console.warn(`[embeddings] Embedding generation failed: ${err.message}. Using mock L2-normalized vector fallback.`);
    const mockVec = new Array(EMBEDDING_DIM).fill(0);
    mockVec[0] = 1.0;
    return mockVec;
  }
};

/**
 * Generate an embedding for a SEARCH QUERY.
 * Prepends the retrieval prompt per the mxbai paper. Use
 * this (NOT generateEmbedding) for any text that should be
 * matched against stored document vectors.
 */
export const generateQueryEmbedding = async (query: string): Promise<number[]> => {
  return generateEmbedding(QUERY_PROMPT + query);
};

/** Re-export for diagnostic scripts. True if a warm in-process pipeline exists. */
export const __isWarmed = (): boolean => isWarmed;
