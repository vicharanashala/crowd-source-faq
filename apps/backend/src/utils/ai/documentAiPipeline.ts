/**
 * documentAiPipeline — extract Q&A / Policy / HowTo insights from
 * already-extracted document text.
 *
 * Separate from `zoomExtractor.ts` (which handles conversational
 * meeting transcripts) because documents are different:
 *   - No speaker turns, no timestamps
 *   - Often a wall of factual text, policies, or how-to steps
 *   - We want `Policy` and `HowTo` insight types in addition to FAQ
 *   - No "we don't know yet" questions — the text is authoritative
 *
 * The pipeline is intentionally small. The AI prompt is the heart
 * of it; the surrounding code is just plumbing + Zod validation.
 *
 * Called from the BullMQ worker (`utils/jobs/documentJob.ts`)
 * AFTER `documentExtractor.extractTextFromFile()` returns.
 */

import { z } from 'zod';
import { resolveProviderAsync, chatWithConfig } from './aiProvider.js';
import { logger } from '../http/logger.js';
import type { DocumentInsightType } from '../../modules/knowledge/document-insight.model.js';

// ─── Controlled taxonomy ───────────────────────────────────────────────────
//
// Closed vocabulary for the LLM-generated metadata. WHY a fixed list:
// free-form tags drift ("offer-letter" vs "offer letter" vs "joining-doc"),
// which fragments the index and makes tag-based boosting/faceting miss. A
// closed enum keeps `category` + `audience` stable across documents and
// model swaps. `tags` stay open (the long tail) but are normalized before
// storage. Tune these two lists to your program's real domain — adding a
// value here is the only change needed; the prompt + model read from them.
export const INSIGHT_CATEGORIES = [
  'Onboarding',
  'Schedule & Deadlines',
  'Assignments & Projects',
  'Policies & Rules',
  'Technical Setup',
  'Certification & Evaluation',
  'Payment & Stipend',
  'Logistics & Access',
  'Career & Placement',
  'General',
] as const;

export const INSIGHT_AUDIENCES = ['Intern', 'Mentor', 'Admin', 'All'] as const;

const MAX_TAGS_PER_INSIGHT = 8;
const MAX_TAG_LENGTH = 40;

/**
 * Normalize a raw LLM tag list into stable storage form: lowercase, hyphen-
 * separated, [a-z0-9-] only, deduped, length + count capped. Defensive
 * against the model returning a string, nulls, or junk instead of an array.
 */
export function normalizeTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const tag = item
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_INSIGHT) break;
  }
  return out;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const InsightSchema = z.object({
  type: z.enum(['FAQ', 'Announcement', 'Policy', 'HowTo', 'Fact']),
  question: z.string().max(500).default(''),
  answer_or_content: z.string().min(1).max(5000),
  confidence_score: z.number().min(0).max(1),
  // ── Structural metadata (tagged at ingestion) ──────────────────────────
  /** Single closest category from the closed taxonomy. */
  category: z.enum(INSIGHT_CATEGORIES).catch('General'),
  /** Primary audience from the closed taxonomy. */
  audience: z.enum(INSIGHT_AUDIENCES).catch('All'),
  /** Open long-tail tags, normalized to [a-z0-9-]. */
  tags: z.preprocess(normalizeTags, z.array(z.string()).max(MAX_TAGS_PER_INSIGHT)).default([]),
  /** 1-3 sentence summary — also fed into the keyword index for recall. */
  summary: z.string().max(600).default(''),
  /** Optional 0-based character offset in the source text. */
  source_offset: z.number().int().nonnegative().optional(),
});

// The model often renames `answer_or_content` to `answer`, `content`,
// `body`, or `value`. Accept any of them via a Zod preprocess that
// normalizes to the canonical name before validation. Lets a future
// model swap or a prompt edit "just work" without a code change.
const InsightAliasSchema = z.preprocess(
  (raw) => {
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (r.answer_or_content == null) {
        for (const alias of ['answer', 'content', 'body', 'value', 'text']) {
          if (r[alias] != null) {
            return { ...r, answer_or_content: r[alias] };
          }
        }
      }
    }
    return raw;
  },
  InsightSchema,
);

const InsightsResponseSchema = z.object({
  insights: z.array(InsightAliasSchema).min(0).max(50),
});

export type ExtractedDocumentInsight = z.infer<typeof InsightSchema>;

// ─── Prompts ─────────────────────────────────────────────────────────────────

export const PROMPT_VERSION = 'v2';

const SYSTEM_PROMPT = `You are a precise knowledge-base analyst. Read the provided document text and extract anything that a user might later search for or ask about. Be generous: when in doubt, include it. The admin review queue will sort quality from there.

**Critical formatting rule:** Output ONLY the raw JSON object. Do NOT include any chain-of-thought reasoning, <think>...</think> blocks, prose preamble, or markdown fences. Start your response with the opening { character and end with the closing } character. This is non-negotiable — anything else is treated as an error.

**Insight types (pick the closest one; "Fact" is the catch-all):**
1. **FAQ** — A question a user might naturally ask, paired with the answer the document provides. (e.g. "When is the deadline?" → "December 15")
2. **Policy** — A definitive rule, regulation, or constraint. (e.g. "All homework must be PDF format.")
3. **HowTo** — A step-by-step procedure. Number the steps in the answer.
4. **Announcement** — A dated event, deadline, or change.
5. **Fact** — A standalone fact, definition, or reference point that users will likely want to look up. Use this liberally: dates, names, numbers, glossaries, specifications, summaries, named entities. Empty \`question\` is fine for Facts.

**Structural metadata (REQUIRED on every insight):**
- "category" — pick the SINGLE closest value from this exact list (copy verbatim):
  ${INSIGHT_CATEGORIES.map((c) => `"${c}"`).join(', ')}.
  If nothing fits, use "General".
- "audience" — who this is primarily for. One of: ${INSIGHT_AUDIENCES.map((a) => `"${a}"`).join(', ')}. Use "All" if unsure.
- "tags" — 2 to 6 short lowercase keyword tags (e.g. "offer-letter", "stipend", "deadline"). Specific terms a user would actually type. No sentences.
- "summary" — a 1 to 3 sentence plain-language summary of the insight. This powers search, so pack in the key terms a user might search for.

**Output rules:**
- Start with { and end with }. Nothing else.
- Prefer MANY short, atomic insights over a few long ones. A 5-page PDF should produce 15-30 insights, not 3.
- Cap at 30 insights per document — pick the most useful / searchable ones.
- For each insight, set confidence_score to your honest 0.0-1.0 estimate. Keep ≥ 0.4.
- question can be empty for Policy / HowTo / Announcement / Fact.
- Use ONLY facts present in the text. Never invent steps, dates, or rules.
- If the document is genuinely empty / noise, return { "insights": [] }. Don't fabricate.

Each insight object looks like:
{"type":"FAQ","question":"...","answer_or_content":"...","confidence_score":0.8,"category":"Onboarding","audience":"Intern","tags":["offer-letter","joining"],"summary":"..."}`;

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Run the document AI extraction. Returns 0+ validated insights.
 * Throws if the provider call fails (the BullMQ worker catches and
 * marks the DocumentRecord as `failed`).
 */
export async function extractInsightsFromText(
  rawText: string,
  opts: { documentTitle: string; fileType: string },
): Promise<ExtractedDocumentInsight[]> {
  const trimmed = rawText.trim();
  if (trimmed.length < 50) {
    // Too short to be worth an AI call. Return an empty array so the
    // DocumentRecord moves to `completed` with 0 insights rather
    // than burning a chat completion.
    logger.info(`[documentAiPipeline] '${opts.documentTitle}' text too short (${trimmed.length} chars) — skipping`);
    return [];
  }

  // Cap the input. 12k chars is enough for ~3k tokens, well under
  // any provider's input limit. We split on paragraphs to keep
  // section boundaries intact.
  const truncated = trimmed.length > 12_000 ? smartTruncate(trimmed, 12_000) : trimmed;

  const config = await resolveProviderAsync();
  const userMsg = `Document title: ${opts.documentTitle}
File type: ${opts.fileType}

Document text:
---
${truncated}
---

Extract the most useful FAQ / Policy / HowTo / Announcement insights as JSON.`;

  const t0 = Date.now();
  const text = await chatWithConfig(config, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg },
  ]);
  const chatMs = Date.now() - t0;
  logger.info(
    `[documentAiPipeline] ${opts.documentTitle} — ` +
      `text: ${trimmed.length} chars (orig ${rawText.length}), ` +
      `paragraphs: ${trimmed.split(/\n\s*\n/).length}, ` +
      `chat: ${chatMs}ms, ` +
      `response: ${text.length} chars`,
  );
  // Surface the first chunk of the response in the log so we can see
  // what the model actually said (empty? wrapped in prose? valid JSON?).
  const preview = text.slice(0, 300).replace(/\s+/g, ' ').trim();
  logger.info(`[documentAiPipeline] response preview: ${preview}${text.length > 300 ? '…' : ''}`);

  // Parse + validate. The model can wrap its answer in several
  // ways despite the prompt:
  //   - ```json\n{...}\n``` fences
  //   - <think>reasoning here</think>{...} (chain-of-thought models)
  //   - Here's what I found: {...}
  //   - sometimes just the bare JSON
  // We try the cleanest path first, then fall through to "first
  // { to last }" substring extraction as the catch-all.
  const cleaned = stripAllWrappers(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const recovered = extractJsonSubstring(cleaned);
    if (recovered !== null) {
      try {
        parsed = JSON.parse(recovered);
        logger.info(`[documentAiPipeline] recovered JSON from substring extraction (${recovered.length} chars)`);
      } catch (err2) {
        logger.warn(`[documentAiPipeline] JSON parse failed for '${opts.documentTitle}': ${(err as Error).message}`);
        return [];
      }
    } else {
      logger.warn(`[documentAiPipeline] JSON parse failed for '${opts.documentTitle}': ${(err as Error).message}`);
      return [];
    }
  }
  const result = InsightsResponseSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn(`[documentAiPipeline] zod validation failed for '${opts.documentTitle}': ${result.error.message}`);
    return [];
  }
  return result.data.insights;
}

// ─── Per-insight tagging (backfill / re-tag of EXISTING rows) ────────────────

const MetadataSchema = z.object({
  category: z.enum(INSIGHT_CATEGORIES).catch('General'),
  audience: z.enum(INSIGHT_AUDIENCES).catch('All'),
  tags: z.preprocess(normalizeTags, z.array(z.string()).max(MAX_TAGS_PER_INSIGHT)).default([]),
  summary: z.string().max(600).default(''),
});

export type InsightMetadata = z.infer<typeof MetadataSchema>;

const TAG_SYSTEM_PROMPT = `You assign structured metadata to a SINGLE knowledge-base entry (a question + its answer/content).

Output ONLY a raw JSON object — start with { and end with }. No prose, no markdown fences, no <think> blocks.

Fields (all required):
- "category" — the SINGLE closest value from this exact list (copy verbatim): ${INSIGHT_CATEGORIES.map((c) => `"${c}"`).join(', ')}. If nothing fits, use "General".
- "audience" — who this is primarily for. One of: ${INSIGHT_AUDIENCES.map((a) => `"${a}"`).join(', ')}. Use "All" if unsure.
- "tags" — 2 to 6 short lowercase keyword tags a user would actually type (e.g. "offer-letter", "stipend"). No sentences.
- "summary" — a 1 to 3 sentence plain-language summary packing the key searchable terms.

Example: {"category":"Onboarding","audience":"Intern","tags":["offer-letter","joining"],"summary":"..."}`;

/** Safe defaults used when the entry is empty or the AI call/parse fails. */
const DEFAULT_METADATA: InsightMetadata = { category: 'General', audience: 'All', tags: [], summary: '' };

/**
 * Tag one already-stored insight. Used by the backfill script to add
 * structural metadata to rows created before the tagging prompt existed.
 * Never throws — returns safe defaults on any failure so a single bad row
 * can't abort a long backfill run.
 */
export async function tagInsight(question: string, content: string): Promise<InsightMetadata> {
  const q = (question ?? '').trim();
  const c = (content ?? '').trim();
  if (q.length + c.length < 10) return { ...DEFAULT_METADATA };

  try {
    const config = await resolveProviderAsync();
    const userMsg = `Question: ${q || '(none)'}\n\nAnswer / content:\n${c.slice(0, 4000)}\n\nReturn the metadata JSON object.`;
    const text = await chatWithConfig(config, [
      { role: 'system', content: TAG_SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ]);

    const cleaned = stripAllWrappers(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const recovered = extractJsonSubstring(cleaned);
      if (recovered === null) return { ...DEFAULT_METADATA };
      parsed = JSON.parse(recovered);
    }
    const result = MetadataSchema.safeParse(parsed);
    return result.success ? result.data : { ...DEFAULT_METADATA };
  } catch (err) {
    logger.warn(`[documentAiPipeline] tagInsight failed: ${(err as Error).message}`);
    return { ...DEFAULT_METADATA };
  }
}

/** Best-effort: keep whole paragraphs up to `maxChars`, cut on a paragraph boundary. */
function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastBreak = cut.lastIndexOf('\n\n');
  return lastBreak > maxChars * 0.7 ? cut.slice(0, lastBreak) : cut;
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m ? m[1] : s;
}

/**
 * Strip all common wrapper formats the model might use:
 *  - ```json fences
 *  - <think>...</think> chain-of-thought blocks
 *  - leading "Here is the JSON:" prose
 */
function stripAllWrappers(s: string): string {
  let out = s;
  // Strip <think>...</think> (chain-of-thought models)
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Strip ```json fences
  out = stripFences(out);
  // Strip leading prose before the first { (common when the model
  // adds "Here is the result:" or similar before the JSON)
  const firstBrace = out.indexOf('{');
  if (firstBrace > 0) {
    out = out.slice(firstBrace);
  }
  return out.trim();
}

/**
 * Find the outermost JSON object in a string. Returns the
 * `{...}` substring (first `{` to matching `}` via simple
 * brace-counting), or null if no `{` is present.
 */
function extractJsonSubstring(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Re-export the type so callers don't have to dig into models/.
export type { DocumentInsightType };
