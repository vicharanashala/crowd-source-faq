/**
 * contextRetriever — Phase 2 R10.
 *
 * Single entry point for assembling ranked context for the auto-answer
 * pipeline (and any other consumer that needs "give me relevant Q&A
 * for this question").
 *
 * Replaces the scattered `searchKnowledge` / `searchRelevantFaqs` /
 * `searchRelevantCommunityPosts` trio in `knowledge-base.service.ts`.
 * Phase 3 will refactor `auto-answer.controller.ts` to call
 * `fetchContext` directly; this commit ships the new pipeline so it
 * can be smoke-tested via `GET /api/ask-ai/preview-context/:postId`.
 *
 * Architecture
 * ------------
 *  - `RetrievalSource` is a pluggable interface — anyone (faq source,
 *    kb source, future vector source, etc.) can register a source by
 *    calling `registerSource(...)`.
 *  - `fetchContext(query, opts)` fans out to every registered source
 *    via `Promise.allSettled` (one slow source doesn't block the
 *    others; one failing source never fails the whole fetch).
 *  - Each hit's raw `$text` score is normalized to 0..1 inside its
 *    source's result set, then re-ranked by:
 *
 *        rank = score * (confidence * sourceWeight) * freshness
 *
 *    where `freshness = 0.5 ^ (ageDays / halfLife)`.
 *
 *  - The final top-N is sorted by `rank` descending and capped at
 *    `maxHits`.
 *
 * No embeddings, no Redis — pure Mongo `$text` indexes per the
 * Phase 2 scope (see docs/redesign-plan.md §6).
 */

import { Types } from 'mongoose';
import { cronLog } from '../utils/http/logger.js';
import { faqTextSource } from './retrievalSources/faqTextSource.js';
import { kbTextSource } from './retrievalSources/kbTextSource.js';
import { communityTextSource } from './retrievalSources/communityTextSource.js';
import { commentsSource } from './retrievalSources/commentsSource.js';
import { recentActivitySource } from './retrievalSources/recentActivitySource.js';
import { webTextSource } from './retrievalSources/webTextSource.js';
import { documentTextSource } from './retrievalSources/documentTextSource.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RetrievalSourceName =
  | 'faq'
  | 'kb'
  | 'community'
  | 'comments'
  | 'recent_activity'
  | 'web'
  | 'document';

/** A single ranked hit. Sources return Omit<RankedHit, 'rank' | 'ageDays'>;
 *  fetchContext fills those in after normalization. */
export interface RankedHit {
  source: RetrievalSourceName;
  sourceId: string;
  question: string;
  answer: string;
  /** 0..1 raw similarity (text score remapped inside the source's result set) */
  score: number;
  /** 0..1 confidence in the source itself
   *  (admin_corrected > curated > raw) */
  confidence: number;
  /** Days since `lastVerifiedDate`; demoted via freshnessWeight */
  ageDays: number;
  /** Final rank score: score * (confidence * sourceWeight) * freshness */
  rank: number;
  /** Which text field(s) matched, if known — for debugging / display */
  matchedOn?: string;
  batchId?: string | null;
  /** Source-defined extras (e.g. upvotes, freshnessTier). Free-form. */
  meta?: Record<string, unknown>;
}

/** Pluggable retrieval source. */
export interface RetrievalSource {
  /** Identifier — used as `RankedHit.source` and in the result summary. */
  name: RetrievalSourceName | string;
  /** Multiplier on confidence (1.0 = neutral). */
  weight: number;
  /** Run the search and return raw hits. Implementations MUST
   *  never throw — they should catch their own errors and return [].
   *  FetchContext wraps with allSettled as a defensive backstop. */
  search(
    query: string,
    batchId: string | null,
    opts: { topK?: number },
  ): Promise<Omit<RankedHit, 'rank' | 'ageDays'>[]>;
}

export interface FetchContextOptions {
  /** Per-source top-K. Default 3. */
  topK?: number;
  /** Final cap on returned hits. Default 15. */
  maxHits?: number;
  /** Filter by program. null = all programs. */
  batchId?: string | null;
  /** Include the comments source. Default true. */
  includeComments?: boolean;
  /** Days for `freshness` to drop to 0.5. Default 90. */
  freshnessHalfLifeDays?: number;
}

export interface FetchContextResult {
  hits: RankedHit[];
  sources: { name: string; returned: number; weight: number }[];
  query: string;
  takenAt: string;
}

// ─── Source registry ───────────────────────────────────────────────────────

const sources = new Map<string, RetrievalSource>();

export function registerSource(source: RetrievalSource): void {
  sources.set(source.name, source);
}

export function listSources(): RetrievalSource[] {
  return Array.from(sources.values());
}

/** Reset the source registry. Test-only — production code should
 *  rely on `registerDefaultSources()` being called at module load. */
export function _resetSources(): void {
  sources.clear();
}

// ─── fetchContext ──────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_MAX_CHARS = 2000;

export async function fetchContext(
  query: string,
  opts: FetchContextOptions = {},
): Promise<FetchContextResult> {
  const {
    topK = 3,
    maxHits = 15,
    batchId = null,
    includeComments = true,
    freshnessHalfLifeDays = 90,
  } = opts;

  // 1. Truncate query to match what auto-answer does today. Anything
  //    past 2k chars is noise for a text-search retriever.
  const trimmedQuery = (query ?? '').slice(0, QUERY_MAX_CHARS);

  // 2. Build the list of sources to run. The comments source is
  //    opt-out via includeComments=false.
  const sourcesToRun = listSources().filter((s) => {
    if (!includeComments && s.name === 'comments') return false;
    return true;
  });

  // 3. Fan out via Promise.allSettled so one failing source doesn't
  //    kill the whole fetch.
  const results = await Promise.allSettled(
    sourcesToRun.map((src) =>
      src.search(trimmedQuery, batchId, { topK }),
    ),
  );

  const perSource: { name: string; returned: number; weight: number }[] = [];
  const allRaw: Array<Omit<RankedHit, 'rank' | 'ageDays'> & { _sourceWeight: number }> = [];

  results.forEach((r, idx) => {
    const src = sourcesToRun[idx];
    if (r.status === 'rejected') {
      cronLog.warn(`[contextRetriever] source "${src.name}" failed: ${(r.reason as Error)?.message ?? r.reason}`);
      perSource.push({ name: src.name, returned: 0, weight: src.weight });
      return;
    }
    const hits = r.value ?? [];
    perSource.push({ name: src.name, returned: hits.length, weight: src.weight });
    // 4. Normalize each source's hits: remap raw score to 0..1 by
    //    dividing by the max score in this source's result set.
    //    (Mongo $text's textScore is unbounded — top hit is always 1.0.)
    const maxScore = hits.reduce((m, h) => Math.max(m, h.score || 0), 0);
    for (const h of hits) {
      const normalized = maxScore > 0 ? (h.score || 0) / maxScore : 0;
      allRaw.push({
        ...h,
        score: normalized,
        _sourceWeight: src.weight,
      });
    }
  });

  // 5-7. Compute ageDays, freshness, and rank; sort descending by rank;
  //      slice to maxHits.
  const now = Date.now();
  const halfLife = Math.max(freshnessHalfLifeDays, 1);
  const halfLifeMs = halfLife * DAY_MS;

  const ranked: RankedHit[] = allRaw.map((h) => {
    const lastVerified = (h.meta?.lastVerifiedDate as Date | string | undefined) ?? null;
    const ageDays =
      lastVerified
        ? Math.max(0, (now - new Date(lastVerified).getTime()) / DAY_MS)
        : 0;
    const freshness = Math.pow(0.5, ageDays / halfLife);
    const rank = h.score * (h.confidence * h._sourceWeight) * freshness;
    return {
      source: h.source,
      sourceId: h.sourceId,
      question: h.question,
      answer: h.answer,
      score: h.score,
      confidence: h.confidence,
      ageDays,
      rank,
      matchedOn: h.matchedOn,
      batchId: h.batchId,
      meta: h.meta,
    };
  });

  ranked.sort((a, b) => b.rank - a.rank);

  return {
    hits: ranked.slice(0, maxHits),
    sources: perSource,
    query: trimmedQuery,
    takenAt: new Date(now).toISOString(),
  };
}

// ─── Default source registration ───────────────────────────────────────────

let defaultSourcesRegistered = false;

/** Idempotent: registers the 5 default text sources exactly once.
 *  Synchronous — callers can immediately call fetchContext afterwards. */
export function registerDefaultSources(): void {
  if (defaultSourcesRegistered) return;
  defaultSourcesRegistered = true;
  registerSource(faqTextSource);
  registerSource(kbTextSource);
  registerSource(communityTextSource);
  registerSource(commentsSource);
  registerSource(recentActivitySource);
  registerSource(webTextSource);
  registerSource(documentTextSource);
}

// Auto-register on module load — the retriever is supposed to be
// ready to serve as soon as any code imports it.
registerDefaultSources();