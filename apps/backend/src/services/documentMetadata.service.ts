/**
 * documentMetadata.service — LLM-backed metadata extraction for
 * admin-uploaded documents. Produces { category, audience, tags,
 * summary } using the SAME closed-vocabulary taxonomy as the
 * community OCR pipeline (see utils/ai/documentAiPipeline.ts).
 *
 * Why this exists: when the embedding model isn't configured, we
 * still want admin docs to be discoverable. The LLM does the
 * semantic heavy lifting at write time — tag, categorize, summarize
 * — and documentTextSource boosts the keyword-search score by tag
 * overlap at read time. The doc is usable either way; the embedding
 * is just a bonus.
 *
 * Failure handling
 * ----------------
 * The model occasionally returns prose, malformed JSON, or fields
 * outside the enum. We:
 *  1. Strip markdown fences
 *  2. Try JSON.parse → Zod parse (catches enum violations, type errors)
 *  3. On failure, fall back to a regex-derived tag list + the
 *     document title as the summary, so the doc is never *empty*.
 */
import { z } from 'zod';
import {
  INSIGHT_CATEGORIES,
  INSIGHT_AUDIENCES,
  normalizeTags,
} from '../utils/ai/documentAiPipeline.js';
import { adminLog } from '../utils/http/logger.js';

export interface DocumentMetadata {
  category: string;
  audience: string;
  tags: string[];
  summary: string;
}

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 40;
const MAX_SUMMARY_CHARS = 600;
const MAX_BODY_CHARS_FOR_PROMPT = 6000;

const MetadataSchema = z.object({
  category: z.enum(INSIGHT_CATEGORIES).catch('General'),
  audience: z.enum(INSIGHT_AUDIENCES).catch('All'),
  tags: z.preprocess(normalizeTags, z.array(z.string()).max(MAX_TAGS)).default([]),
  summary: z.string().max(MAX_SUMMARY_CHARS).default(''),
});

const PROMPT = `You are tagging an internal document for a community FAQ platform.

Given the document title and body, produce JSON with EXACTLY these four fields:
- "category": pick the SINGLE closest value from this list (copy verbatim): ${INSIGHT_CATEGORIES.join(', ')}. Use "General" if nothing fits.
- "audience": one of ${INSIGHT_AUDIENCES.join(', ')}. Use "All" if unsure.
- "tags": array of 2 to 6 short lowercase keyword tags. Things a user would actually type when searching for this content. Normalize to [a-z0-9-] (lowercase, hyphens, no spaces). Examples: "offer-letter", "stipend", "deadline", "leave-policy".
- "summary": 1 to 3 sentence plain-language summary. Pack in the key searchable terms a user might query.

Return ONLY valid JSON, no prose, no markdown fences, no commentary.

DOCUMENT TITLE: {{title}}

DOCUMENT BODY:
{{body}}`;

/**
 * Extract metadata for a single document. Never throws — returns a
 * conservative fallback on LLM/parse failure so ingestion always
 * produces a usable row.
 */
export async function extractMetadataFromText(
  text: string,
  title: string,
): Promise<DocumentMetadata> {
  const truncatedBody = text.slice(0, MAX_BODY_CHARS_FOR_PROMPT);
  const prompt = PROMPT.replace('{{title}}', title).replace('{{body}}', truncatedBody);

  let reply = '';
  try {
    // v1.85 — automatic provider failover. If the primary provider
    // returns a retriable failure (401/429/5xx/network), walk the
    // configured fallback chain. Errors are still caught here so
    // we always degrade gracefully to `fallbackMetadata` rather
    // than letting the upload fail.
    const { runWithFallback } = await import('./ai/fallbackChain.js');
    const result = await runWithFallback(
      'document_metadata',
      [{ role: 'user', content: prompt }],
    );
    reply = result.reply;
  } catch (err) {
    adminLog.warn(`[documentMetadata] all LLM providers failed, using fallback: ${(err as Error).message}`);
    return fallbackMetadata(text, title);
  }

  // Strip any markdown fences the model might wrap around the JSON
  const cleaned = reply
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = MetadataSchema.parse(JSON.parse(cleaned));
    return parsed;
  } catch (err) {
    adminLog.warn(
      `[documentMetadata] parse failed, using fallback. reply=${reply.slice(0, 200)} err=${(err as Error).message}`,
    );
    return fallbackMetadata(text, title);
  }
}

/**
 * Regex-derived fallback used when the LLM is unavailable or
 * returns junk. Picks capitalized noun-phrases as crude tags and
 * uses the document title as a one-line summary. Not great, but
 * strictly better than empty metadata.
 */
function fallbackMetadata(text: string, title: string): DocumentMetadata {
  const candidates = (text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2}\b/g) ?? [])
    .slice(0, MAX_TAGS)
    .map((t) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9-\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, MAX_TAG_LENGTH),
    )
    .filter((t) => t.length > 1);
  const tags = [...new Set(candidates)].slice(0, MAX_TAGS);
  return {
    category: 'General',
    audience: 'All',
    tags,
    summary: title || text.slice(0, 200).trim(),
  };
}
