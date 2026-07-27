/**
 * rag.score-normalization.test — regression guard for the cross-source
 * score scale bug in the /ask-ai RAG pipeline.
 *
 * Bug: runRag() in rag.service.ts merges hits from three retrieval
 * sources and sorts them by `.score` to decide citation order AND
 * which sources survive the MAX_CONTEXT_CHARS truncation. FAQ/Community
 * hits carry a Reciprocal Rank Fusion score (max ~0.033, see
 * searchFaqs()/searchCommunity()); Knowledge hits carry an independent
 * cosine-similarity-based score already normalized to [0, 1] (see
 * scoreAndSort() in knowledge-base.service.ts). Sorting these unmodified
 * meant a barely-relevant Knowledge hit (score just over its 0.05 floor)
 * always outranked even a rank-#1-in-both-searches FAQ/Community hit —
 * silently degrading answer quality.
 *
 * Fix: normalizeRrfScore() rescales the RRF score onto the same [0, 1]
 * ceiling as the Knowledge score before the merged sources are sorted.
 * These tests pin that behavior down with pure-function assertions —
 * no Mongo/Atlas Search/HTTP required.
 */

import { describe, it, expect } from 'vitest';
import { normalizeRrfScore, RRF_SCORE_CEILING } from '../rag.service.js';

describe('normalizeRrfScore', () => {
  it('maps the RRF ceiling (rank #1 in both vector + text search) to exactly 1', () => {
    const bestPossibleRrf = 1 / 60 + 1 / 60; // rank 0 in both lists
    expect(normalizeRrfScore(bestPossibleRrf)).toBeCloseTo(1, 10);
  });

  it('maps a single rank-#1 hit (only in one of the two lists) to 0.5', () => {
    const singleListTopRank = 1 / 60;
    expect(normalizeRrfScore(singleListTopRank)).toBeCloseTo(0.5, 10);
  });

  it('never exceeds 1 even if given an out-of-range value', () => {
    expect(normalizeRrfScore(RRF_SCORE_CEILING * 5)).toBe(1);
  });

  it('demonstrates the pre-fix bug is resolved: a top-ranked FAQ hit now outranks a barely-passing Knowledge hit', () => {
    const topFaqRrfScore = 1 / 60 + 1 / 60; // best possible FAQ RRF score
    const weakKnowledgeScore = 0.06; // just above the 0.05 floor in scoreAndSort()

    // Before the fix, sources were compared as raw scores:
    const rawFaqScore = topFaqRrfScore; // ~0.0333
    expect(rawFaqScore < weakKnowledgeScore).toBe(true); // this was the bug — FAQ always lost

    // After the fix, scores are normalized onto a comparable [0, 1] scale:
    const normalizedFaqScore = normalizeRrfScore(topFaqRrfScore);
    expect(normalizedFaqScore > weakKnowledgeScore).toBe(true); // FAQ now correctly outranks it
  });
});
