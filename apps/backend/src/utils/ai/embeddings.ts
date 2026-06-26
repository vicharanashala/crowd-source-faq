/**
 * embeddings.ts — semantic embedding pipeline.
 *
 * Replaced static configurations with dynamic lookups from the database.
 * Supports OpenAI, Custom, HuggingFace Inference API, and Local in-process pipeline.
 * 
 * Supports per-program overrides when batchId is supplied.
 */

import mongoose, { Types } from 'mongoose';
import AiConfig from '../../modules/ai/ai-config.model.js';
import { getConfig } from '../../config/runtimeConfig.js';
import { logger } from '../http/logger.js';

export const MODEL_SLUG = 'mixedbread-ai/mxbai-embed-large-v1';
export const EMBEDDING_DIM = 1024;
/** Retrieval prompt prepended to search queries. Don't add to documents. */
export const QUERY_PROMPT = 'Represent this sentence for searching relevant passages: ';

const HF_API_BASE = 'https://router.huggingface.co/hf-inference/models';
const HF_MAX_RETRIES = 2;
const HF_TIMEOUT_MS = 30_000;
const HF_RETRY_DELAY_MS = 500;

/**
 * Dynamically resolve embedding settings from the active database configuration.
 * Automatically handles fallbacks and default global credentials.
 */
export async function getActiveEmbeddingConfig(batchId: string | null = null) {
  let config: any = null;
  try {
    if (mongoose.connection.readyState === 1) {
      if (batchId && Types.ObjectId.isValid(batchId)) {
        config = await AiConfig.findOne({ batchId, isActive: true });
      }
      if (!config) {
        config = await AiConfig.findOne({ batchId: null, isActive: true });
      }
    }
  } catch (err) {
    logger.warn(`[embeddings] Failed to resolve active AiConfig for embeddings: ${(err as Error).message}`);
  }

  let provider: 'local' | 'huggingface' | 'openai' | 'custom' = 'local';
  let model = MODEL_SLUG;
  let dimensions = EMBEDDING_DIM;
  let baseURL = '';
  let apiKey = '';

  if (config && config.embedding) {
    provider = config.embedding.provider || 'local';
    model = config.embedding.model || MODEL_SLUG;
    dimensions = config.embedding.dimensions || EMBEDDING_DIM;
    baseURL = config.embedding.baseURL || '';
    apiKey = config.getEmbeddingApiKey() || '';
  } else {
    // Read from the unified 3-layer runtime config resolver (AdminConfig overrides / env vars)
    try {
      const providerResult = await getConfig('embedding.provider', { programId: batchId });
      if (providerResult.value) {
        provider = String(providerResult.value) as any;
      } else {
        const hfKeyResult = await getConfig('huggingface.apiKey', { programId: batchId });
        if (hfKeyResult.value) {
          provider = 'huggingface';
        }
      }

      const modelResult = await getConfig('embedding.model', { programId: batchId });
      if (modelResult.value) {
        model = String(modelResult.value);
      }

      const dimsResult = await getConfig('embedding.dimensions', { programId: batchId });
      if (dimsResult.value) {
        const parsedDims = parseInt(String(dimsResult.value), 10);
        if (!isNaN(parsedDims)) {
          dimensions = parsedDims;
        }
      }
    } catch (err) {
      logger.warn(`[embeddings] Dynamic configuration resolution failed: ${(err as Error).message}. Using environment variables fallback.`);
      // Environment variable configuration fallback
      const envProvider = (process.env.EMBEDDING_PROVIDER ?? '').trim();
      if (envProvider) {
        provider = envProvider as any;
      } else {
        const hfKey = (process.env.HUGGINGFACE_API_KEY ?? '').trim();
        if (hfKey) {
          provider = 'huggingface';
        }
      }

      const envModel = (process.env.EMBEDDING_MODEL ?? '').trim();
      if (envModel) {
        model = envModel;
      }

      const envDims = (process.env.EMBEDDING_DIMENSIONS ?? '').trim();
      if (envDims) {
        const parsedDims = parseInt(envDims, 10);
        if (!isNaN(parsedDims)) {
          dimensions = parsedDims;
        }
      }
    }
  }

  // Resolve API key and Base URL using the 3-layer runtime config resolver
  try {
    const apiKeyResult = await getConfig('embedding.apiKey', { programId: batchId });
    if (apiKeyResult.value) {
      apiKey = String(apiKeyResult.value);
    } else {
      const hfKeyResult = await getConfig('huggingface.apiKey', { programId: batchId });
      if (hfKeyResult.value) {
        apiKey = String(hfKeyResult.value);
      }
    }

    const baseUrlResult = await getConfig('embedding.baseUrl', { programId: batchId });
    if (baseUrlResult.value) {
      baseURL = String(baseUrlResult.value);
    }
  } catch (err) {
    logger.warn(`[embeddings] Dynamic keys/URLs configuration resolution failed: ${(err as Error).message}`);
  }

  // Legacy fallback if not found in 3-layer config
  if (!apiKey) {
    if (provider === 'openai' || provider === 'custom') {
      apiKey = (process.env.EMBEDDING_API_KEY ?? '').trim();
    } else if (provider === 'huggingface') {
      apiKey = (process.env.EMBEDDING_API_KEY ?? process.env.HUGGINGFACE_API_KEY ?? '').trim();
    }
  }

  if (!baseURL) {
    if (provider === 'openai') {
      baseURL = (process.env.EMBEDDING_BASE_URL ?? 'https://api.openai.com/v1').trim();
    } else if (provider === 'custom') {
      baseURL = (process.env.EMBEDDING_BASE_URL ?? 'http://localhost:11434/v1').trim();
    }
  }

  return { provider, model, dimensions, baseURL, apiKey };
}

/**
 * Call the HF Inference API for a single text.
 */
async function callHfApiEmbedding(text: string, apiKey: string, model: string): Promise<number[]> {
  if (!apiKey) {
    throw new Error('HUGGINGFACE_API_KEY (or embedding specific key) is not set');
  }
  const url = `${HF_API_BASE}/${model}`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= HF_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);
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
      clearTimeout(t);

      if (!res.ok) {
        const errText = await res.text().catch(() => '<body unreadable>');
        const err = new Error(`HF Inference API ${res.status}: ${errText}`);
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < HF_MAX_RETRIES) {
          lastError = err;
          logger.warn(`[embeddings] HF API ${res.status} (attempt ${attempt}/${HF_MAX_RETRIES}) — retrying in ${HF_RETRY_DELAY_MS}ms`);
          await new Promise((r) => setTimeout(r, HF_RETRY_DELAY_MS));
          continue;
        }
        throw err;
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`HF Inference API returned unexpected shape: ${JSON.stringify(data).slice(0, 200)}`);
      }
      const first = data[0];
      if (Array.isArray(first)) {
        if (Array.isArray(first[0])) {
          return normalizeL2(first[0] as number[]);
        }
        return normalizeL2(first as number[]);
      }
      return normalizeL2(data as number[]);
    } catch (err) {
      clearTimeout(t);
      const e = err as Error & { code?: number; name?: string };
      const isAbort = e?.name === 'AbortError' || e?.code === 20;
      if (isAbort && attempt < HF_MAX_RETRIES) {
        lastError = e;
        logger.warn(`[embeddings] HF API call aborted (attempt ${attempt}/${HF_MAX_RETRIES}) — retrying in ${HF_RETRY_DELAY_MS}ms`);
        await new Promise((r) => setTimeout(r, HF_RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error('HF embedding failed after retries');
}

/**
 * Call OpenAI or OpenAI-compatible embeddings API.
 */
async function callOpenAiEmbedding(text: string, apiKey: string, model: string, baseURL: string, provider: string, dimensions?: number): Promise<number[]> {
  if (!apiKey) {
    throw new Error('API Key is required for OpenAI/Custom embedding provider');
  }
  const base = baseURL.replace(/\/$/, '');
  const url = `${base}/embeddings`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      input: text,
      model,
    };
    
    // Pass dimensions parameter only for openai provider's text-embedding-3 models
    if (provider === 'openai' && dimensions && model.includes('text-embedding-3')) {
      body.dimensions = dimensions;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const errText = await res.text().catch(() => '<body unreadable>');
      throw new Error(`OpenAI-compatible Embedding API ${res.status}: ${errText}`);
    }

    const data = await res.json() as { data?: { embedding?: number[] }[] };
    const vec = data.data?.[0]?.embedding;
    if (!Array.isArray(vec)) {
      throw new Error(`Embedding API returned unexpected shape: ${JSON.stringify(data).slice(0, 200)}`);
    }

    return normalizeL2(vec);
  } catch (err) {
    clearTimeout(t);
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
let isWarmed = false;

/** Warm up the embedding pipeline. */
export const warmEmbedder = async (): Promise<void> => {
  const { provider } = await getActiveEmbeddingConfig();
  if (provider === 'local') {
    logger.warn('[embeddings] Local ONNX embedding warming skipped (Local ONNX fallback is disabled).');
  }
};

/**
 * Generate an embedding for a DOCUMENT (FAQ, post, etc.).
 */
export const generateEmbedding = async (text: string, options?: { batchId?: string | null }): Promise<number[]> => {
  const { provider, model, dimensions, baseURL, apiKey } = await getActiveEmbeddingConfig(options?.batchId);

  if (provider === 'huggingface') {
    return callHfApiEmbedding(text, apiKey, model);
  }
  
  if (provider === 'openai' || provider === 'custom') {
    return callOpenAiEmbedding(text, apiKey, model, baseURL, provider, dimensions);
  }

  throw new Error(
    `Local ONNX embedding fallback is disabled. ` +
    `Please configure HUGGINGFACE_API_KEY, EMBEDDING_API_KEY, or set EMBEDDING_PROVIDER to an active cloud provider in your environment.`
  );
};

/**
 * Generate an embedding for a SEARCH QUERY.
 */
export const generateQueryEmbedding = async (query: string, options?: { batchId?: string | null }): Promise<number[]> => {
  return generateEmbedding(QUERY_PROMPT + query, options);
};

/** Re-export for diagnostic scripts. True if a warm in-process pipeline exists. */
export const __isWarmed = (): boolean => isWarmed;
