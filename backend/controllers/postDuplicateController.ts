/**
 * postDuplicateController.ts
 *
 * Handles duplicate detection for community posts and FAQs.
 * Extracted from postController.ts (was lines 711–981).
 *
 * Detection layers:
 *  1. Vector similarity (embedding cosine) against approved FAQs
 *  2. TF-IDF Jaccard text match against approved FAQs
 *  3. Keyword overlap against existing community posts
 *  4. AI-powered semantic detection (primary, via detectDuplicatesWithAI)
 *  5. Knowledge base search as fallback
 */

import { Request, Response } from 'express';
import FAQ from '../models/FAQ.js';
import CommunityPost from '../models/CommunityPost.js';
import { generateEmbedding, generateQueryEmbedding } from '../utils/ai/embeddings.js';
import { detectDuplicatesWithAI } from '../utils/ai/duplicateDetector.js';
import { resolveProviderAsync } from '../utils/ai/aiProvider.js';
import { communityLog } from '../utils/http/logger.js';

// ─── Thresholds ────────────────────────────────────────────────────────────────

export const DUPLICATE_VECTOR_THRESHOLD = 0.85;
export const DUPLICATE_TEXT_THRESHOLD = 0.50;
export const DUPLICATE_SHORT_QUERY_THRESHOLD = 0.90;

// ─── Stop words & generic terms ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'i', 'a', 'an', 'the', 'is', 'it', 'to', 'of', 'in', 'for', 'on', 'with',
  'my', 'we', 'you', 'do', 'can', 'be', 'are', 'as', 'at', 'by', 'if', 'or',
  'not', 'how', 'what', 'when', 'where', 'why', 'will', 'get', 'got', 'have',
  'has', 'had', 'do', 'does', 'did', 'this', 'that', 'these', 'those', 'from',
  'up', 'out', 'about', 'who', 'which', 'but', 'they', 'he', 'she', 'his', 'her',
  'all', 'some', 'any', 'would', 'could', 'should', 'there', 'here', 'their',
  'them', 'been', 'being', 'am', 'was', 'were', 'so', 'no', 'yes', 'may',
  'please', 'thanks', 'thank', 'hi', 'hello', 'hey', 'dear', 'sorry',
  // common programming/generic terms that add noise in this domain
  'access', 'server', 'servers', 'production', 'access',
  'use', 'using', 'used', 'want', 'need', 'like', 'just', 'also', 'one',
  'two', 'new', 'know', 'work', 'working', 'help', 'question',
]);

const GENERIC_TERMS = new Set([
  'offer', 'letter', 'access', 'server', 'production', 'question',
  'help', 'issue', 'problem', 'error', 'please', 'thanks', 'urgent',
]);

// ─── Public interface ──────────────────────────────────────────────────────────

export interface DuplicateMatch {
  _id: string;
  title: string;
  question?: string;
  answer?: string;
  body?: string;
  score: number;
  source: 'faq' | 'community' | 'knowledge';
  sourceTitle?: string;
  confidence?: number;
  reason?: string;
  matchType: 'vector' | 'text' | 'ai';
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWord(w: string): string {
  return w.replace(/(ing|s|ed|es|e)$/, '').toLowerCase();
}

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w) && !GENERIC_TERMS.has(w));
}

function wordOverlap(
  queryWords: string[],
  targetWords: string[]
): { overlap: number; total: number; jaccard: number } {
  const qSet = new Set(queryWords.map(normalizeWord));
  const tSet = new Set(targetWords.map(normalizeWord));
  const qNorm = new Set([...qSet].filter((w) => !GENERIC_TERMS.has(w)));
  const tNorm = new Set([...tSet].filter((w) => !GENERIC_TERMS.has(w)));

  let overlap = 0;
  for (const w of qNorm) {
    if (tNorm.has(w)) overlap++;
  }
  const total = Math.min(qNorm.size, tNorm.size);
  const jaccard = total > 0 ? overlap / total : 0;
  return { overlap, total, jaccard };
}

function textMatchScore(query: string, target: string): number {
  const qWords = significantWords(query);
  const tWords = significantWords(target);
  if (qWords.length === 0 || tWords.length === 0) return 0;
  const { overlap, jaccard } = wordOverlap(qWords, tWords);
  if (overlap < 2) return 0;
  const qSet = new Set(qWords);
  const tSet = new Set(tWords);
  const overlapRatio =
    [...qSet].filter((w) => tSet.has(normalizeWord(w))).length / qSet.size;
  return Math.min(1, jaccard * 0.5 + overlapRatio * 0.5);
}

// ─── checkDuplicate (pure fallback — used when AI is unavailable) ──────────────

export async function checkDuplicate(
  query: string,
  isShortQuery: boolean
): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = [];
  const lower = query.toLowerCase().trim();

  // 1. FAQ hybrid search (vector + text)
  try {
    const queryEmbedding = await generateQueryEmbedding(query).catch((err) => {
      communityLog.warn(`[postDuplicate] Failed to generate embedding for duplicate check query: ${(err as Error).message}`);
      return null;
    });
    const vectorThreshold = isShortQuery
      ? DUPLICATE_SHORT_QUERY_THRESHOLD
      : DUPLICATE_VECTOR_THRESHOLD;

    const [vectorResults, textResults] = await Promise.all([
      // Vector similarity
      queryEmbedding
        ? FAQ.find({ embedding: { $exists: true, $ne: null }, status: 'approved' })
            .select('_id question answer category embedding')
            .lean()
            .then((faqs) => {
              const scored = faqs
                .map((f) => {
                  const dot = (f.embedding as number[]).reduce(
                    (s: number, v: number, i: number) => s + v * queryEmbedding[i],
                    0
                  );
                  return { faq: f, similarity: dot };
                })
                .filter((x) => x.similarity >= vectorThreshold)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 5);
              return scored.map((x) => ({
                _id: x.faq._id.toString(),
                title: x.faq.question,
                question: x.faq.question,
                answer: x.faq.answer,
                category: x.faq.category,
                score: x.similarity,
                matchType: 'vector' as const,
              }));
            })
        : Promise.resolve([]),

      // TF-IDF Jaccard
      FAQ.find({ status: 'approved' })
        .select('_id question answer category')
        .lean()
        .then((faqs) => {
          const scored = faqs
            .map((f) => ({
              faq: f,
              score: textMatchScore(lower, f.question + ' ' + (f.answer ?? '')),
            }))
            .filter((x) => x.score >= DUPLICATE_TEXT_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          return scored.map((x) => ({
            _id: x.faq._id.toString(),
            title: x.faq.question,
            question: x.faq.question,
            answer: x.faq.answer,
            category: x.faq.category,
            score: x.score,
            matchType: 'text' as const,
          }));
        }),
    ]);

    const seenFaq = new Set<string>();
    for (const r of [...vectorResults, ...textResults]) {
      if (!seenFaq.has(r._id)) {
        seenFaq.add(r._id);
        matches.push({ ...r, source: 'faq' });
      }
    }
  } catch (err) {
    communityLog.warn(`FAQ duplicate check failed: ${(err as Error).message}`);
  }

  // 2. Community post keyword search
  try {
    const qWords = significantWords(lower);
    if (qWords.length > 0) {
      const textResults = await CommunityPost.find({
        $or: [
          { title: { $regex: escapeRegex(lower), $options: 'i' } },
          ...qWords.slice(0, 8).map((w) => ({
            title: { $regex: `\\b${escapeRegex(w)}\\b`, $options: 'i' },
          })),
        ],
      })
        .select('_id title body status')
        .lean()
        .then((posts) => {
          const scored = posts
            .map((p) => ({
              post: p,
              score: textMatchScore(lower, p.title + ' ' + (p.body ?? '')),
            }))
            .filter((x) => x.score >= DUPLICATE_TEXT_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          return scored.map((x) => ({
            _id: x.post._id.toString(),
            title: x.post.title,
            body: x.post.body,
            status: x.post.status,
            score: x.score,
            matchType: 'text' as const,
          }));
        });

      const seenComm = new Set<string>();
      for (const r of textResults) {
        if (!seenComm.has(r._id)) {
          seenComm.add(r._id);
          matches.push({ ...r, source: 'community' });
        }
      }
    }
  } catch (err) {
    communityLog.warn(`Community duplicate check failed: ${(err as Error).message}`);
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

// ─── Route handler ─────────────────────────────────────────────────────────────

// POST /api/community/check-duplicate
export const checkDuplicateController = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }
  try {
    const { query } = req.body as { query?: string };
    if (!query?.trim()) {
      res.json({ isDuplicate: false, matches: [] });
      return;
    }

    const q = query.trim();

    // Architecture: when ANY AI provider is configured, the AI is the SOLE
    // evaluator. Its verdict is final — no knowledge base mixing, no keyword
    // fallback. The AI returns nothing if the question is genuinely novel.
    //
    // KB + keyword heuristics are only used when no AI provider is configured
    // (server running with no API keys at all). This keeps the AI's judgment
    // uncontested and prevents low-quality KB noise from polluting results
    // the AI has already evaluated.
    let aiAvailable = false;
    try {
      await resolveProviderAsync();
      aiAvailable = true;
    } catch {
      aiAvailable = false;
    }

    let matches: DuplicateMatch[] = [];

    if (aiAvailable) {
      // AI is the evaluator. Trust its verdict.
      matches = await detectDuplicatesWithAI(q);
    } else {
      // No AI configured — use knowledge base + keyword fallback
      try {
        const { searchKnowledge } = await import('../services/knowledgeBase.js');
        const knowledgeMatches = await searchKnowledge(q, 3);
        for (const km of knowledgeMatches) {
          if (km.score < 0.50) continue;
          matches.push({
            _id: km._id,
            title: km.question,
            question: km.question,
            answer: km.answer,
            source: 'knowledge' as const,
            sourceTitle: km.sourceTitle,
            score: km.score,
            confidence: km.confidence,
            reason: km.reason ?? `From ${km.source}: ${km.answer}`,
            matchType: 'ai' as const,
          });
        }
      } catch (err) {
        communityLog.warn(`[checkDuplicate] knowledge search failed: ${(err as Error).message}`);
      }

      // Keyword heuristics if knowledge base is also empty
      if (matches.length === 0) {
        const words = q.split(' ').filter((w) => w.length >= 3);
        const isShortQuery = words.length < 3;
        matches = await checkDuplicate(q, isShortQuery);
      }
    }

    // Sort and dedupe
    const seen = new Set<string>();
    const deduped: DuplicateMatch[] = [];
    for (const m of matches.sort((a, b) => b.score - a.score)) {
      if (!seen.has(m._id)) {
        seen.add(m._id);
        deduped.push(m);
      }
    }

    res.json({
      isDuplicate: deduped.length > 0,
      matches: deduped.slice(0, 5),
      matchCount: deduped.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Duplicate check failed' });
  }
};