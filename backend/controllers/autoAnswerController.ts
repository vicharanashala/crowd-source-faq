/**
 * autoAnswerController.ts
 *
 * AI-powered auto-answering engine for unanswered community posts.
 *
 * How it works:
 *  1. Finds unanswered posts where aiAnswerStatus is null or 'pending'
 *     (hasn't been processed recently)
 *  2. For each post, searches FAQ and knowledge base for relevant answers
 *  3. If a high-confidence match is found (≥ AUTO_APPROVE_THRESHOLD):
 *     → sets aiAnswerStatus='approved', answer=AI_answer, posts to thread
 *  4. If medium confidence (≥ SUGGEST_THRESHOLD, < AUTO_APPROVE_THRESHOLD):
 *     → sets aiAnswerStatus='suggested', shows in admin review queue
 *  5. If low confidence or nothing found (AI thinks it's sensitive/complex):
 *     → sets aiAnswerStatus='escalated', needs human review
 *
 * Manual flow:
 *  → Admin reviews 'suggested' answers: approve (posts) or reject
 *  → Admin reviews 'escalated' posts: answer manually or dismiss
 *
 * Auto-scheduler runs every 24h. Admins can also trigger manually via
 * POST /admin/community/auto-answer (with optional ?dry_run=true).
 */
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import FAQ from '../models/FAQ.js';
import { TranscriptKnowledge } from '../models/TranscriptKnowledge.js';
import Notification from '../models/Notification.js';
import { logger } from '../utils/logger.js';
import { searchKnowledge } from '../services/knowledgeBase.js';
import { chatWithConfig, getPipelineProviderConfig } from '../utils/aiProvider.js';
import { PipelineResult } from '../models/PipelineResult.js';
import {
  searchKnowledgeWithFallback,
  triageByScore,
  buildAuditMetaUpdate,
  logPipelineEvent,
  isSensitiveContent,
} from '../utils/pipelineCommon.js';

// ─── Sensitive content detection (shared — imported from pipelineCommon) ──────
// Minimum confidence to auto-approve and post the answer (0–1)
const AUTO_APPROVE_THRESHOLD = parseFloat(
  process.env['AUTO_ANSWER_APPROVE_THRESHOLD'] || '0.85'
);
// Minimum confidence to suggest for admin review
const SUGGEST_THRESHOLD = parseFloat(
  process.env['AUTO_ANSWER_SUGGEST_THRESHOLD'] || '0.60'
);
// Max posts to process per scheduler run (prevents runaway batch jobs)
const BATCH_SIZE = parseInt(process.env['AUTO_ANSWER_BATCH_SIZE'] || '20');
// Posts must be unanswered for at least this many hours before being eligible
const MIN_POST_AGE_HOURS = parseInt(process.env['AUTO_ANSWER_MIN_POST_AGE_HOURS'] || '2');
// Max AI answer length (characters)
const MAX_ANSWER_CHARS = 1500;

// ─── Core answer-finding logic ───────────────────────────────────────────────

interface AnswerMatch {
  answer: string;
  confidence: number;
  source: string;
  sourceId: string;
  matchedQuestion?: string;
}

/**
 * Search FAQ and knowledge base for the best answer to a given post.
 * Returns the best match or null if nothing relevant is found.
 */
async function findBestAnswer(postTitle: string, postBody: string): Promise<AnswerMatch | null> {
  const queryText = `${postTitle} ${postBody}`.slice(0, 2000);

  // ── 1. Try knowledge base semantic search (circuit-breaker fallback) ──────
  try {
    const rawMatches = await searchKnowledgeWithFallback(queryText, 3);
    const matches = (rawMatches ?? []) as Exclude<Awaited<ReturnType<typeof searchKnowledge>>, null>;
    if (matches && matches.length > 0) {
      const top = matches[0];
      const confidence = Math.min((top.score ?? 0.7) * 1.1, 0.95);
      if (confidence >= SUGGEST_THRESHOLD) {
        logger.info(`[autoAnswer] Knowledge match for "${postTitle.slice(0, 40)}": conf=${confidence.toFixed(2)}`);
        return {
          answer: top.answer.slice(0, MAX_ANSWER_CHARS),
          confidence: Math.round(confidence * 100) / 100,
          source: top.sourceTitle ?? top.source ?? 'Knowledge Base',
          sourceId: top._id,
          matchedQuestion: top.question,
        };
      }
    }
  } catch (err) {
    logger.warn(`[autoAnswer] Knowledge base search failed: ${(err as Error).message}`);
  }

  // ── 2. Try AI generation from recent FAQ context ─────────────────────────
  try {
    const recentFaqs = await FAQ.find({ status: 'approved' })
      .select('question answer')
      .sort({ createdAt: -1 })
      .limit(5);

    if (recentFaqs.length > 0) {
      const context = recentFaqs
        .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
        .join('\n\n');

      const messages = [
        {
          role: 'system',
          content: `You are Yaksha's AI assistant. Answer the user's question concisely and accurately using the provided knowledge context. If the context doesn't contain enough information to give a complete answer, say so clearly. Keep answers under 300 words. Do not make up information not present in the context.`,
        },
        {
          role: 'user',
          content: `Context (recent FAQs):\n${context}\n\nUser question: ${postTitle}${postBody ? `\nDetails: ${postBody}` : ''}`,
        },
      ];

      const cfg = await getPipelineProviderConfig('auto_answer');
      const reply = await chatWithConfig(cfg, messages);
      if (reply && reply.trim().length > 20) {
        return {
          answer: reply.trim().slice(0, MAX_ANSWER_CHARS),
          confidence: 0.62, // conservative — generated, not matched
          source: 'AI-generated (from FAQ context)',
          sourceId: 'generated',
        };
      }
    }
  } catch (err) {
    logger.warn(`[autoAnswer] AI generation failed: ${(err as Error).message}`);
  }

  return null;
}
// ─── Per-post processor ──────────────────────────────────────────────────────

async function processPost(post: InstanceType<typeof CommunityPost>): Promise<void> {
  const postTitle = post.title;
  const postBody = post.body ?? '';

  // Skip if already answered
  if (post.status === 'answered') {
    logger.info(`[autoAnswer] Skipping already-answered post ${post._id}`);
    return;
  }

  // Skip if recently processed
  const recentlyProcessed =
    post.aiAnswerStatus === 'pending' &&
    post.aiAnswerAttempts !== undefined &&
    post.aiAnswerAttempts >= 3;
  if (recentlyProcessed) {
    return;
  }

  // Increment attempt counter
  await CommunityPost.updateOne(
    { _id: post._id },
    { $inc: { aiAnswerAttempts: 1 }, $set: { lastCheckedAt: new Date() } }
  );

  const match = await findBestAnswer(postTitle, postBody);
  const sensitive = isSensitiveContent(`${postTitle} ${postBody}`);

  if (!match) {
      const escalatedAt = new Date();
      await CommunityPost.updateOne(
        { _id: post._id },
        {
          aiAnswerStatus: 'escalated',
          aiAnswer: null,
          aiAnswerConfidence: null,
          aiAnswerSource: null,
          aiAnswerEscalatedAt: escalatedAt,
          aiAnswerEscalatedReason: 'No relevant answer found in FAQ or knowledge base',
        }
      );
      await logResult(post, { verdict: 'escalated', confidence: 0, reason: 'No relevant answer found' }, escalatedAt);
      logger.info(`[autoAnswer] Escalated (no match): ${postTitle.slice(0, 40)}`);
      return;
    }

    const { answer, confidence, source, sourceId } = match;

    // Escalate sensitive topics regardless of confidence
    if (sensitive) {
      const escalatedAt = new Date();
      await CommunityPost.updateOne(
        { _id: post._id },
        {
          aiAnswer: answer,
          aiAnswerConfidence: confidence,
          aiAnswerStatus: 'escalated',
          aiAnswerSource: source,
          aiAnswerSuggestedAt: new Date(),
          aiAnswerEscalatedAt: escalatedAt,
          aiAnswerEscalatedReason: 'Post contains sensitive topics — requires human review',
        }
      );
      await logResult(post, { verdict: 'escalated', confidence, reason: 'Sensitive topic' }, escalatedAt);
      logger.info(`[autoAnswer] Escalated (sensitive): ${postTitle.slice(0, 40)}`);
      return;
    }

    if (confidence >= AUTO_APPROVE_THRESHOLD) {
      // Auto-approve: post the answer directly
      await CommunityPost.updateOne(
        { _id: post._id },
        {
          answer,
          answerAuthorId: null, // AI author — system user
          status: 'answered',
          aiAnswer: answer,
          aiAnswerConfidence: confidence,
          aiAnswerStatus: 'approved',
          aiAnswerSource: source,
          aiAnswerSuggestedAt: new Date(),
          aiAnswerReviewedAt: new Date(),
          lastCheckedAt: new Date(),
          reviewCycle: ((post as unknown as { reviewCycle?: number }).reviewCycle ?? 0) + 1,
          lifecycle: {
            status: 'answered',
            statusHistory: [
              ...(post.lifecycle?.statusHistory ?? []),
              {
                from: post.lifecycle?.status ?? 'open',
                to: 'answered',
                changedBy: new Types.ObjectId('000000000000000000000000'),
                changedAt: new Date(),
                note: `AI auto-answered from ${source}`,
              },
            ],
          },
        }
      );

      // Notify post author
      await Notification.create({
        userId: post.author,
        eventType: 'post_answered',
        content: `Your question "${postTitle.slice(0, 80)}" was auto-answered by AI.`,
      });

      await logResult(post, { verdict: 'approved', confidence, reason: `Auto-answered from ${source}` }, new Date());
      logger.info(`[autoAnswer] Auto-approved (conf=${confidence}): ${postTitle.slice(0, 40)}`);
    } else {
      // Suggest for admin review
      await CommunityPost.updateOne(
        { _id: post._id },
        {
          aiAnswer: answer,
          aiAnswerConfidence: confidence,
          aiAnswerStatus: 'suggested',
          aiAnswerSource: source,
          aiAnswerSuggestedAt: new Date(),
        }
      );
      await logResult(post, { verdict: 'suggested', confidence, reason: `Queued for admin review — source: ${source}` }, new Date());
      logger.info(`[autoAnswer] Suggested (conf=${confidence}): ${postTitle.slice(0, 40)}`);
    }
  }

  /** Log each processed post to the unified PipelineResult collection */
  async function logResult(
    post: InstanceType<typeof CommunityPost>,
    result: { verdict: string; confidence: number; reason: string },
    checkedAt: Date
  ): Promise<void> {
    await PipelineResult.create({
      pipeline:    'auto_answer',
      targetModel: 'CommunityPost',
      targetId:    post._id as Types.ObjectId,
      targetTitle: post.title,
      score:       result.confidence,
      verdict:     result.verdict,
      confidence:  result.confidence,
      reason:      result.reason,
      sources:     [],
      flagged:     result.verdict === 'suggested' || result.verdict === 'escalated',
      metadata:    { sourceId: (post as unknown as { aiAnswerSource?: string }).aiAnswerSource },
      checkedAt,
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

/**
 * GET /admin/auto-answer/queue
 * Returns all posts in the AI answer queue, grouped by status.
 */
export const getAutoAnswerQueue = async (_req: Request, res: Response): Promise<void> => {
  try {
    const posts = await CommunityPost.find({
      aiAnswerStatus: { $in: ['suggested', 'escalated'] },
    })
      .populate('author', 'name email')
      .sort({ aiAnswerSuggestedAt: -1 })
      .select(
        'title body status aiAnswer aiAnswerConfidence aiAnswerStatus aiAnswerSource aiAnswerSuggestedAt aiAnswerAttempts tags createdAt'
      );

    res.json({
      queue: posts,
      counts: {
        suggested: posts.filter((p) => p.aiAnswerStatus === 'suggested').length,
        escalated: posts.filter((p) => p.aiAnswerStatus === 'escalated').length,
      },
    });
  } catch (err) {
    logger.error(`[autoAnswer] Queue fetch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PATCH /admin/auto-answer/:postId
 * Admin action on a suggested/escalated AI answer.
 * Body: { action: 'approve' | 'reject' | 'escalate', manualAnswer?: string }
 */
export const reviewAutoAnswer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { postId } = req.params;
    const { action, manualAnswer } = req.body as {
      action: 'approve' | 'reject' | 'escalate';
      manualAnswer?: string;
    };

    const post = await CommunityPost.findById(postId);
    if (!post) { res.status(404).json({ message: 'Post not found' }); return; }
    if (!['suggested', 'escalated'].includes(post.aiAnswerStatus ?? '')) {
      res.status(400).json({ message: 'Post is not in review queue' });
      return;
    }

    if (action === 'approve') {
      const finalAnswer = manualAnswer?.trim() ?? post.aiAnswer ?? '';
      if (!finalAnswer) {
        res.status(400).json({ message: 'No answer to approve' });
        return;
      }
      await CommunityPost.updateOne(
        { _id: postId },
        {
          answer: finalAnswer,
          status: 'answered',
          answerAuthorId: req.user!._id,
          answerIsExpert: false,
          aiAnswerStatus: 'approved',
          aiAnswer: finalAnswer,
          aiAnswerReviewedAt: new Date(),
          aiAnswerReviewedBy: req.user!._id,
          lifecycle: {
            status: 'answered',
            statusHistory: [
              ...(post.lifecycle?.statusHistory ?? []),
              {
                from: post.lifecycle?.status ?? 'open',
                to: 'answered',
                changedBy: req.user!._id,
                changedAt: new Date(),
                note: manualAnswer ? 'Admin answered manually' : `Admin approved AI answer from ${post.aiAnswerSource}`,
              },
            ],
          },
        }
      );

      await Notification.create({
        userId: post.author,
        eventType: 'post_answered',
        content: `Your question "${post.title.slice(0, 80)}" has been answered!`,
      });

      logger.info(`[autoAnswer] Admin approved answer for post ${postId}`);
      res.json({ message: 'Answer approved and posted', status: 'answered' });
    } else if (action === 'reject') {
      await CommunityPost.updateOne(
        { _id: postId },
        {
          aiAnswerStatus: 'rejected',
          aiAnswer: null,
          aiAnswerConfidence: null,
          aiAnswerSource: null,
          aiAnswerReviewedAt: new Date(),
          aiAnswerReviewedBy: req.user!._id,
        }
      );
      logger.info(`[autoAnswer] Admin rejected AI answer for post ${postId}`);
      res.json({ message: 'AI answer rejected', status: 'rejected' });
    } else if (action === 'escalate') {
      await CommunityPost.updateOne(
        { _id: postId },
        {
          aiAnswerStatus: 'escalated',
          aiAnswerEscalatedAt: new Date(),
          aiAnswerReviewedAt: new Date(),
          aiAnswerReviewedBy: req.user!._id,
        }
      );
      res.json({ message: 'Post escalated to moderator', status: 'escalated' });
    } else {
      res.status(400).json({ message: 'Invalid action' });
    }
  } catch (err) {
    logger.error(`[autoAnswer] Review failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /admin/community/auto-answer
 * Manually trigger the auto-answer processor (with optional dry-run).
 * Query: ?dry_run=true → returns posts that WOULD be processed without changes
 * Query: ?post_id=<id> → processes only that specific post
 * Query: ?all=true → processes all eligible posts (default: limited batch)
 */
export const runAutoAnswer = async (req: Request, res: Response): Promise<void> => {
  const isDryRun = req.query.dry_run === 'true';
  const specificPostId = req.query.post_id as string | undefined;
  const processAll = req.query.all === 'true';

  try {
    // Build query for eligible posts
    const cutoff = new Date(Date.now() - MIN_POST_AGE_HOURS * 60 * 60 * 1000);
    const query: Record<string, unknown> = {
      status: 'unanswered',
      createdAt: { $lte: cutoff },
      $or: [
        { aiAnswerStatus: null },
        { aiAnswerStatus: 'pending' },
        { aiAnswerStatus: { $exists: false } },
      ],
    };

    let posts;
    if (specificPostId) {
      const found = await CommunityPost.findById(specificPostId);
      posts = found ? [found] : [];
    } else {
      posts = await CommunityPost.find(query)
        .sort({ createdAt: 1 })
        .limit(processAll ? 200 : BATCH_SIZE);
    }

    if (posts.length === 0) {
      res.json({ message: 'No eligible posts found', processed: 0 });
      return;
    }

    if (isDryRun) {
      res.json({
        dry_run: true,
        would_process: posts.length,
        posts: posts.map((p) => ({ id: p._id, title: p.title, age_hours: Math.round((Date.now() - (p.createdAt as unknown as Date).getTime()) / 3600000) })),
      });
      return;
    }

    const results = { processed: 0, auto_approved: 0, suggested: 0, escalated: 0, errors: 0 };
    for (const post of posts) {
      try {
        const prevStatus = post.aiAnswerStatus;
        await processPost(post);
        results.processed++;
        // Re-fetch to check new status
        const updated = await CommunityPost.findById(post._id).select('aiAnswerStatus');
        const newStatus = updated?.aiAnswerStatus;
        if (newStatus === 'approved') results.auto_approved++;
        else if (newStatus === 'suggested') results.suggested++;
        else if (newStatus === 'escalated' || newStatus === 'pending') results.escalated++;
        logger.info(`[autoAnswer] Processed post ${post._id}: ${prevStatus ?? 'null'} → ${newStatus}`);
      } catch (err) {
        results.errors++;
        logger.error(`[autoAnswer] Error processing post ${post._id}: ${(err as Error).message}`);
      }
    }

    logger.info(`[autoAnswer] Run complete: ${JSON.stringify(results)}`);
    res.json({ message: 'Auto-answer run complete', ...results });
  } catch (err) {
    logger.error(`[autoAnswer] Run failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Scheduler ───────────────────────────────────────────────────────────────
let autoAnswerIntervalHandle: ReturnType<typeof setInterval> | null = null;

/** Run the auto-answer processor (fire-and-forget). Call this on startup. */
export async function runScheduledAutoAnswer(): Promise<void> {
  const CHECK_INTERVAL_H = parseInt(process.env['AUTO_ANSWER_INTERVAL_HOURS'] || '24');
  const ms = CHECK_INTERVAL_H * 60 * 60 * 1000;

  if (autoAnswerIntervalHandle) clearInterval(autoAnswerIntervalHandle);

  autoAnswerIntervalHandle = setInterval(() => {
    runAutoAnswerInternal().catch((err) => {
      logger.error(`[autoAnswer] Scheduler error: ${(err as Error).message}`);
    });
  }, ms);

  logger.info(`[autoAnswer] Scheduler started — running every ${CHECK_INTERVAL_H}h`);

  // Also run once on startup (with a delay to let the server warm up)
  setTimeout(() => {
    runAutoAnswerInternal().catch((err) => {
      logger.error(`[autoAnswer] Startup run error: ${(err as Error).message}`);
    });
  }, 30_000);
}

export function stopAutoAnswerScheduler(): void {
  if (autoAnswerIntervalHandle) {
    clearInterval(autoAnswerIntervalHandle);
    autoAnswerIntervalHandle = null;
    logger.info('[autoAnswer] Scheduler stopped.');
  }
}

// Internal version without Express req/res
async function runAutoAnswerInternal(): Promise<void> {
  const cutoff = new Date(Date.now() - MIN_POST_AGE_HOURS * 60 * 60 * 1000);
  const posts = await CommunityPost.find({
    status: 'unanswered',
    createdAt: { $lte: cutoff },
    $or: [
      { aiAnswerStatus: null },
      { aiAnswerStatus: 'pending' },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(BATCH_SIZE);

  if (posts.length === 0) {
    logger.info('[autoAnswer] No eligible posts for auto-answering.');
    return;
  }

  logger.info(`[autoAnswer] Starting scheduled run — ${posts.length} posts to process.`);
  const results = { processed: 0, auto_approved: 0, suggested: 0, escalated: 0, errors: 0 };
  for (const post of posts) {
    try {
      await processPost(post);
      results.processed++;
      const updated = await CommunityPost.findById(post._id).select('aiAnswerStatus');
      if (updated?.aiAnswerStatus === 'approved') results.auto_approved++;
      else if (updated?.aiAnswerStatus === 'suggested') results.suggested++;
      else results.escalated++;
    } catch (err) {
      results.errors++;
      logger.error(`[autoAnswer] Post ${post._id} error: ${(err as Error).message}`);
    }
  }
  logger.info(`[autoAnswer] Scheduled run complete: ${JSON.stringify(results)}`);
}