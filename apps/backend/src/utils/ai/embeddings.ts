/**
 * embeddings.ts — semantic embedding pipeline.
 *
 * Exclusively uses custom OpenAI-compatible models (e.g., local Ollama)
 * via the official OpenAI SDK.
 */

import mongoose, { Types } from 'mongoose';
import OpenAI from 'openai';
import AiConfig from '../../modules/ai/ai-config.model.js';
import { getConfig } from '../../config/runtimeConfig.js';
import { logger } from '../http/logger.js';

export const MODEL_SLUG = 'mxbai-embed-large';
export const EMBEDDING_DIM = 1024;
/** Retrieval prompt prepended to search queries. Don't add to documents. */
export const QUERY_PROMPT = 'Represent this sentence for searching relevant passages: ';

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
 */
async function callCustomEmbedding(text: string, apiKey: string, model: string, baseURL: string): Promise<number[]> {
  const client = new OpenAI({
    apiKey: apiKey || 'ollama',
    baseURL: baseURL.replace(/\/$/, ''),
    timeout: 300000,
  });

  // Truncate the input to a safe character limit (~2000 characters)
  // to avoid 'input length exceeds context length' errors on BERT models (max 512 tokens).
  const safeInput = text.length > 2000 ? text.slice(0, 2000) : text;

  const response = await client.embeddings.create({
    model,
    input: safeInput,
  });
  
  const vec = response.data[0]?.embedding;
  if (!Array.isArray(vec)) {
    throw new Error(`Embedding API returned unexpected shape: ${JSON.stringify(response).slice(0, 200)}`);
  }

  return normalizeL2(vec);
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
  const { model, baseURL, apiKey } = await getActiveEmbeddingConfig(options?.batchId);
  return callCustomEmbedding(text, apiKey, model, baseURL);
};

/**
 * Generate an embedding for a SEARCH QUERY.
 */
export const generateQueryEmbedding = async (query: string, options?: { batchId?: string | null }): Promise<number[]> => {
  return generateEmbedding(QUERY_PROMPT + query, options);
};

/** Re-export for diagnostic scripts. True if a warm in-process pipeline exists. */
export const __isWarmed = (): boolean => isWarmed;
