/**
 * aiPromotionController.ts
 *
 * Stage 5 (AI Validation) for the knowledge lifecycle.
 *
 * Performs per community post:
 *  1. FAQ generation + category + tag assignment (AI)
 *  2. Duplicate detection vs. existing approved FAQs
 *  3. Hallucination check (unsupported factual claims)
 *  4. Grammar / clarity check
 *
 * Stores result on post.lifecycle.aiGeneratedFaq and transitions
 * lifecycle.status to 'ai_validated' (or keeps 'community_accepted'
 * if flagged as duplicate for admin merge decision).
 *
 * Exported:
 *  runCommunityPromotionReview — core review logic (idempotent)
 *  triggerAIReview              — POST /api/admin/community-promotions/:id/ai-review
 *  triggerAIReviewBatch         — POST /api/admin/community-promotions/ai-review-batch
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../community/community-post.model.js';
import FAQ from '../faq/faq.model.js';
import { cronLog } from '../../utils/http/logger.js';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AIReviewResult {
  question: string;
  answer: string;
  category: string;
  tags: string[];
  confidenceScore: number;
  duplicateOf: string | null;
  hallucinationFlags: string[];
  grammarIssues: string[];
}

interface ParsedReview {
  refinedQuestion: string;
  refinedAnswer: string;
  category: string;
  tags: string[];
  confidence: number;
  hallucinationFlags: string[];
  grammarIssues: string[];
  isDuplicate: boolean;
  duplicateOfId: string | null;
}

// ─── runCommunityPromotionReview ──────────────────────────────────────────────

/**
 * Stage 5: AI Validation — reviews a community post that has reached 'community_accepted'.
 * Idempotent — safe to call multiple times. Only processes posts where
 * lifecycle.status = 'community_accepted' and lifecycle.aiGeneratedFaq is not set.
 */
export async function runCommunityPromotionReview(postId: string): Promise<AIReviewResult | null> {
  const post = await CommunityPost.findById(postId);
  if (!post) { cronLog.warn(`[aiReview] Post ${postId} not found`); return null; }

  const lc = post.lifecycle?.status ?? 'open';
  if (lc !== 'community_accepted') {
    cronLog.info(`[aiReview] Post ${postId} not in community_accepted state (${lc}), skipping`);
    return null;
  }
  if (post.lifecycle?.aiGeneratedFaq?.question) {
    cronLog.info(`[aiReview] Post ${postId} already has AI output, skipping`);
    return post.lifecycle.aiGeneratedFaq as unknown as AIReviewResult;
  }

  try {
    const { default: AiClient } = await import('./ai-client.service.js');
    const client = new AiClient();

    // Gather related context: similar community posts + existing related FAQs for grounding
    const [_relatedFaqs, relatedPosts] = await Promise.all([
      FAQ.find({ status: 'approved' })
        .select('_id question answer category')
        .sort({ helpfulVotes: -1 })
        .limit(5)
        .lean(),
      CommunityPost.find({
        _id: { $ne: post._id },
        status: 'answered',
        tags: { $in: post.tags ?? [] },
      })
        .select('_id title answer')
        .limit(3)
        .lean(),
    ]);

    const relatedContext = [
      ..._relatedFaqs.map(f => `[FAQ] ${f.question}\n  A: ${(f.answer ?? '').slice(0, 300)}`),
      ...relatedPosts.map(p => `[Post] ${p.title}\n  A: ${(p.answer ?? '').slice(0, 200)}`),
    ].join('\n\n');

    const contextNote = relatedContext
      ? `Context from knowledge base:\n${relatedContext}\n\n`
      : '';

    // ── Primary AI call: FAQ generation + analysis ─────────────────────────
    const systemPrompt = `You are an expert FAQ editor for an internship help-desk portal.
Given a community question, its accepted answer, and optional related knowledge,
produce a refined, authoritative FAQ entry.

Respond ONLY with a valid JSON object (no markdown, no preamble) with these fields:
{
  "refinedQuestion": string,   // clarified question (max 200 chars)
  "refinedAnswer": string,     // clear, complete answer (max 2000 chars)
  "category": string,          // one of: General, Internship, Offer Letter, NOC, Project, Certificate, Team, HR, IT, Other
  "tags": string[],            // 2-4 relevant tags (lowercase, single words)
  "confidence": number,        // 0-1: how confident you are this is accurate
  "hallucinationFlags": string[], // list of claims in the answer that need verification against the context (empty if none)
  "grammarIssues": string[],   // grammar/clarity issues found (empty if none)
  "isDuplicate": boolean,      // true if this question is effectively answered by an existing FAQ in the context
  "duplicateOfId": string|null // _id of the duplicate FAQ if isDuplicate=true, otherwise null
}

RULES:
- The answer must directly address the question using only information from the provided context.
- If a claim in the answer is NOT supported by the context, add it to hallucinationFlags.
- Flag any grammar issues, ambiguous language, or missing steps.
- tags should be lowercase, 1-3 words max, no duplicates.
- If isDuplicate=true, provide the id of the existing FAQ that already answers this.`;

    const userContent =
      `${contextNote}` +
      `Original question: "${post.title}"\n\n` +
      `Accepted answer:\n${post.answer ?? '(no answer yet)'}\n\n` +
      `Tags: ${(post.tags ?? []).join(', ') || 'none'}`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userContent },
    ];

    const aiResult = await client.chat(messages, 'faqGeneration', {
      temperature: 0.3,
      maxTokens: 1536,
    });

    // ── Parse AI response ──────────────────────────────────────────────────
    const result = parseCommunityReviewResponse(aiResult.content, _relatedFaqs as any);

    // ── 2. Vector duplicate check (cross-reference) ───────────────────────
    let duplicateOf: string | null = null;
    if (result.isDuplicate && result.duplicateOfId) {
      duplicateOf = result.duplicateOfId;
    } else {
      const { detectDuplicatesWithAI } = await import('../../utils/ai/duplicateDetector.js');
      const dupes = await detectDuplicatesWithAI(post.title);
      const strongDuplicate = dupes.find((d: { score: number; source: string }) => d.score >= 0.80 && d.source === 'faq');
      if (strongDuplicate) duplicateOf = strongDuplicate._id;
    }

    // ── 3. Store result on post lifecycle ─────────────────────────────────
    post.lifecycle ??= { status: 'community_accepted', statusHistory: [] };
    post.lifecycle.aiGeneratedFaq = {
      question: result.refinedQuestion,
      answer: result.refinedAnswer,
      category: result.category,
      tags: result.tags,
      confidenceScore: Math.round(result.confidence * 100),
      duplicateOf: duplicateOf ? new Types.ObjectId(duplicateOf) : undefined,
      hallucinationFlags: result.hallucinationFlags,
      grammarIssues: result.grammarIssues,
    };

    if (!duplicateOf) {
      post.lifecycle.status = 'ai_validated';
      post.lifecycle.aiValidatedAt = new Date();
      (post.lifecycle.statusHistory ??= []).push({
        from: 'community_accepted',
        to: 'ai_validated',
        changedBy: new Types.ObjectId('000000000000000000000000'),
        changedAt: new Date(),
        note: `AI validated — confidence ${Math.round(result.confidence * 100)}%, ${result.hallucinationFlags.length} hallucination flags`,
      });
    } else {
      (post.lifecycle.statusHistory ??= []).push({
        from: 'community_accepted',
        to: 'community_accepted',
        changedBy: new Types.ObjectId('000000000000000000000000'),
        changedAt: new Date(),
        note: `AI flagged duplicate of FAQ ${duplicateOf} — awaiting admin merge decision`,
      });
    }

    await post.save();

    cronLog.info(`[aiReview] Post ${postId} AI review complete. confidence=${Math.round(result.confidence * 100)}%, duplicate=${!!duplicateOf}`);

    return {
      question: result.refinedQuestion,
      answer: result.refinedAnswer,
      category: result.category,
      tags: result.tags,
      confidenceScore: Math.round(result.confidence * 100),
      duplicateOf,
      hallucinationFlags: result.hallucinationFlags,
      grammarIssues: result.grammarIssues,
    };
  } catch (err) {
    cronLog.error(`[aiReview] Post ${postId} failed: ${(err as Error).message}`);
    return null;
  }
}

// ─── triggerAIReview ──────────────────────────────────────────────────────────

/** POST /api/admin/community-promotions/:id/ai-review — manually trigger AI review */
export const triggerAIReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await runCommunityPromotionReview(id);
    if (!result) {
      res.status(404).json({ message: 'Post not found or not eligible for AI review.' });
      return;
    }
    res.json({ message: 'AI review complete.', aiResult: result });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};

// ─── triggerAIReviewBatch ─────────────────────────────────────────────────────

/** POST /api/admin/community-promotions/ai-review-batch — process N pending AI reviews */
export const triggerAIReviewBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '5')), 20);
    const posts = await CommunityPost.find({
      'lifecycle.status': 'community_accepted',
      'lifecycle.aiGeneratedFaq': null,
    }).select('_id title').limit(limit);

    const results: Array<{ postId: string; success: boolean; confidence?: number; error?: string }> = [];
    for (const p of posts) {
      try {
        const r = await runCommunityPromotionReview(p._id.toString());
        results.push({ postId: p._id.toString(), success: !!r, confidence: r?.confidenceScore });
      } catch (e) {
        results.push({ postId: p._id.toString(), success: false, error: (e as Error).message });
      }
    }
    res.json({ processed: results.length, results });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};

// ─── Parse AI response helpers ────────────────────────────────────────────────

function parseCommunityReviewResponse(
  raw: string,
  _relatedFaqs: Array<{ _id: { toString(): string }; question: string }>
): ParsedReview {
  const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return defaultReview();

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const tags = Array.isArray(parsed.tags)
      ? (parsed.tags as unknown[]).map(t => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 4)
      : [];

    let dupId: string | null = null;
    if (parsed.isDuplicate && parsed.duplicateOfId) dupId = String(parsed.duplicateOfId);

    return {
      refinedQuestion: String(parsed.refinedQuestion ?? parsed.question ?? '').slice(0, 200).trim(),
      refinedAnswer:    String(parsed.refinedAnswer ?? parsed.answer ?? '').slice(0, 2000).trim(),
      category:         normalizeCategory(String(parsed.category ?? 'General')),
      tags,
      confidence:       Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
      hallucinationFlags: Array.isArray(parsed.hallucinationFlags)
        ? (parsed.hallucinationFlags as unknown[]).map(f => String(f)).filter(Boolean)
        : [],
      grammarIssues: Array.isArray(parsed.grammarIssues)
        ? (parsed.grammarIssues as unknown[]).map(g => String(g)).filter(Boolean)
        : [],
      isDuplicate:   Boolean(parsed.isDuplicate),
      duplicateOfId: dupId,
    };
  } catch (err) {
    cronLog.warn(`[aiPromotion] Failed to parse community review JSON response: ${(err as Error).message}. Raw response: ${raw.slice(0, 300)}`);
    return defaultReview();
  }
}

const VALID_CATEGORIES = ['General', 'Internship', 'Offer Letter', 'NOC', 'Project', 'Certificate', 'Team', 'HR', 'IT', 'Other'] as const;

function normalizeCategory(cat: string): string {
  const found = VALID_CATEGORIES.find(v => v.toLowerCase() === cat.toLowerCase());
  return found ?? 'General';
}

function defaultReview(): ParsedReview {
  return {
    refinedQuestion: '',
    refinedAnswer: '',
    category: 'General',
    tags: [],
    confidence: 0,
    hallucinationFlags: [],
    grammarIssues: [],
    isDuplicate: false,
    duplicateOfId: null,
  };
}