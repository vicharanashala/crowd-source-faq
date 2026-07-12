/**
 * citations.ts — Citation builder for AI-generated answers.
 *
 * Per spec 02_Citation_Based_AI_Answers:
 *   - Build lightweight Citation objects from retrieval hits already
 *     available to the pipeline (FAQ, Community, TranscriptKnowledge).
 *   - Default cap 5 citations (configurable).
 *   - Never expose raw document text — title, section, similarity, source
 *     type, optional URL/page pointers only.
 *   - Provider-independent.
 *
 * Inputs:
 *   - FAQ hits (question/answer)        → sourceType: 'FAQ'
 *   - Community-post hits              → sourceType: 'KnowledgeBase'
 *   - TranscriptKnowledge hits         → sourceType: 'Zoom' / 'Document'
 *
 * The frontend renders an "Source" chip per citation; clicking it can
 * deep-link into the source record (FAQ id, post id, or external URL).
 */

import type { Types } from 'mongoose';

export type CitationSourceType =
  | 'FAQ'
  | 'Document'
  | 'Zoom'
  | 'KnowledgeBase';

export interface Citation {
  /** Stable id (Mongo ObjectId string) used for deep-linking. */
  id: string;
  /** Human-readable title shown in the UI. */
  title: string;
  /** Sub-section inside the document, if known (e.g. "Leave Policy"). */
  section?: string;
  /** Retrieval similarity in [0, 1]. */
  similarity: number;
  /** Source type — drives the icon (📄 ❓ 🎥 📚). */
  sourceType: CitationSourceType;
  /** Optional URL for click-through. */
  url?: string;
  /** Optional PDF page / transcript timestamp pointer for future use. */
  page?: number;
  /** Snippet of the source text (truncated, no full document). */
  snippet?: string;
  /** Provenance label surfaced in tooltips ("from FAQ", "from Zoom", etc.). */
  provenance?: string;
}

// Default cap — spec calls for 3..5. Override via MAX_CITATIONS env.
const DEFAULT_MAX_CITATIONS = (() => {
  const env = Number(process.env.MAX_CITATIONS ?? '');
  if (Number.isFinite(env) && env > 0) return Math.min(20, Math.floor(env));
  return 5;
})();

/**
 * Normalize a FAQ-style retrieval hit into a Citation.
 *
 * The FAQ router already returns objects shaped like:
 *   { _id: ObjectId|string, question, answer, score }
 */
export function faqToCitation(hit: {
  _id?: unknown;
  question?: string;
  answer?: string;
  category?: string;
  score?: number;
}): Citation | null {
  const idStr = toIdString(hit._id);
  if (!idStr) return null;
  return {
    id: idStr,
    title: hit.question?.slice(0, 200) || 'FAQ',
    section: hit.category?.slice(0, 80),
    similarity: clamp01(Number(hit.score ?? 0)),
    sourceType: 'FAQ',
    url: `/faq/${idStr}`,
    snippet: hit.answer ? String(hit.answer).slice(0, 240) : undefined,
    provenance: 'from FAQ',
  };
}

/**
 * Normalize a community-post / q&a retrieval hit into a Citation.
 */
export function communityToCitation(hit: {
  _id?: unknown;
  title?: string;
  body?: string;
  answer?: string;
  category?: string;
  score?: number;
}): Citation | null {
  const idStr = toIdString(hit._id);
  if (!idStr) return null;
  return {
    id: idStr,
    title: hit.title?.slice(0, 200) || 'Community Q&A',
    section: hit.category?.slice(0, 80),
    similarity: clamp01(Number(hit.score ?? 0)),
    sourceType: 'KnowledgeBase',
    url: `/community?post=${idStr}`,
    snippet: (hit.answer ?? hit.body) ? String(hit.answer ?? hit.body).slice(0, 240) : undefined,
    provenance: 'from community Q&A',
  };
}

/**
 * Normalize a TranscriptKnowledge hit into a Citation. Spec lists Zoom
 * meetings plus uploaded documents; both live in the same collection
 * with a `sourceType` discriminator.
 */
export function knowledgeToCitation(hit: {
  _id?: unknown;
  question?: string;
  answer?: string;
  source?: string;
  sourceTitle?: string;
  sourceType?: string;
  meetingId?: string;
  meetingDate?: Date | string;
  url?: string;
  page?: number;
  section?: string;
  score?: number;
}): Citation | null {
  const idStr = toIdString(hit._id);
  if (!idStr) return null;
  const isZoom = (hit.sourceType ?? hit.source ?? '').toLowerCase().includes('zoom')
    || !!hit.meetingId;
  return {
    id: idStr,
    title: hit.question?.slice(0, 200) || hit.sourceTitle?.slice(0, 200) || 'Knowledge',
    section: hit.section?.slice(0, 80),
    similarity: clamp01(Number(hit.score ?? 0)),
    sourceType: isZoom ? 'Zoom' : 'Document',
    snippet: hit.answer ? String(hit.answer).slice(0, 240) : undefined,
    url: hit.url,
    page: typeof hit.page === 'number' && Number.isFinite(hit.page) ? hit.page : undefined,
    provenance: isZoom ? 'from Zoom meeting' : 'from document',
  };
}

/**
 * Stable sort + dedupe + truncate. Used by every controller that builds
 * a citation list — keeps the limit consistent regardless of caller.
 *
 * Rules (spec):
 *   1. Highest similarity first.
 *   2. Same `(title, sourceType)` -> drop the lower-scored duplicate.
 *   3. Cap to `maxCitations` (default 5).
 */
export function finalizeCitations(
  citations: ReadonlyArray<Citation | null | undefined>,
  maxCitations: number = DEFAULT_MAX_CITATIONS,
): Citation[] {
  const seen = new Set<string>();
  const cleaned: Citation[] = [];
  for (const c of citations) {
    if (!c) continue;
    const key = `${c.sourceType}::${c.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(c);
  }
  cleaned.sort((a, b) => b.similarity - a.similarity);
  return cleaned.slice(0, Math.max(1, maxCitations));
}

/**
 * Convenience helper — build a citation list from raw retrieval arrays
 * (FAQ + Community + Knowledge). Each array may be null/undefined.
 */
export function buildCitations(
  faqHits: ReadonlyArray<any> | null | undefined,
  communityHits: ReadonlyArray<any> | null | undefined,
  knowledgeHits: ReadonlyArray<any> | null | undefined,
  maxCitations: number = DEFAULT_MAX_CITATIONS,
): Citation[] {
  const list: Citation[] = [];
  for (const h of faqHits ?? []) {
    const c = faqToCitation(h);
    if (c) list.push(c);
  }
  for (const h of communityHits ?? []) {
    const c = communityToCitation(h);
    if (c) list.push(c);
  }
  for (const h of knowledgeHits ?? []) {
    const c = knowledgeToCitation(h);
    if (c) list.push(c);
  }
  return finalizeCitations(list, maxCitations);
}

/**
 * Suggest the most appropriate icon for a citation source type. The
 * frontend can use this for default rendering when no custom asset is
 * available (📄 ❓ 🎥 📚 per the spec).
 */
export function citationIcon(sourceType: CitationSourceType): string {
  switch (sourceType) {
    case 'FAQ': return '❓';
    case 'Zoom': return '🎥';
    case 'KnowledgeBase': return '📚';
    case 'Document': return '📄';
    default: return '📄';
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function toIdString(id: unknown): string | null {
  if (!id) return null;
  if (typeof id === 'string') return id;
  // Mongoose ObjectId
  if (typeof id === 'object' && id !== null && 'toString' in id) {
    try {
      const s = (id as { toString(): string }).toString();
      return s && s !== '[object Object]' ? s : null;
    } catch {
      return null;
    }
  }
  return null;
}

// Re-export so callers don't have to import mongoose Types
export type { Types };