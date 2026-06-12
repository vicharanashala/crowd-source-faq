/**
 * embeddings.ts — semantic embedding pipeline.
 *
 * v1.68 — Model swap: Xenova/multi-qa-mpnet-base-dot-v1
 * (768-dim, 110M params) → mixedbread-ai/mxbai-embed-large-v1
 * (1024-dim, 335M params). MTEB score 64.68 vs the old model's
 * lower MTEB; should fix the "FAQ search returns nothing useful"
 * complaint. Backed by @huggingface/transformers (the
 * maintained successor to @xenova/transformers).
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
import { pipeline, FeatureExtractionPipeline, env } from '@huggingface/transformers';

export const MODEL_SLUG = 'mixedbread-ai/mxbai-embed-large-v1';
export const EMBEDDING_DIM = 1024;
/** Retrieval prompt prepended to search queries. Don't add to documents. */
export const QUERY_PROMPT = 'Represent this sentence for searching relevant passages: ';

// Cache pipeline across calls. Lazy-loaded on first use.
let cachedEmbedder: FeatureExtractionPipeline | null = null;
let isWarmed = false;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!cachedEmbedder) {
    // Keep the ONNX cache in the backend directory so it survives
    // restarts and isn't pulled fresh each time.
    env.cacheDir = './.cache/transformers';
    env.allowLocalModels = true;
    cachedEmbedder = await pipeline(
      'feature-extraction',
      MODEL_SLUG,
      { dtype: 'fp32' },
    ) as FeatureExtractionPipeline;
    isWarmed = true;
  }
  return cachedEmbedder;
}

/** Warm up the embedding pipeline so the first real request isn't slow. */
export const warmEmbedder = async (): Promise<void> => {
  await getEmbedder();
};

/**
 * Generate an embedding for a DOCUMENT (FAQ, post, etc.).
 * No prompt prefix — the mxbai paper says don't use the
 * retrieval prompt for documents, only for queries.
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const embedder = await getEmbedder();
  const output = await embedder(text, {
    pooling: 'cls',        // mxbai default; the model card says
                          // "works really well with cls pooling (default)"
    normalize: true,     // cosine similarity friendly
  });
  // output.data is a Tensor — slice to plain number[] for MongoDB.
  return Array.from(output.data as Float32Array | number[]);
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

// re-export for legacy callers (currently unused but kept
// for diagnostic scripts that print whether the model warmed).
export const __isWarmed = (): boolean => isWarmed;
