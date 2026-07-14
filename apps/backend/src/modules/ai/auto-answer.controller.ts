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
import CommunityPost from '../community/community-post.model.js';
import FAQ from '../faq/faq.model.js';
import Notification from '../notification/notification.model.js';
import { readSetting } from '../program/app-setting.model.js';
// L1 fix (v1.68): use the named `cronLog` for the auto-answer
// scheduler + manual trigger so every line carries the [cron]
// category tag (grep filter). 28 bare `logger` calls
// converted in one pass — every one was a cron/AI event.
import { cronLog } from '../../utils/http/logger.js';
import { searchKnowledge, searchRelevantFaqs, searchRelevantCommunityPosts } from '../knowledge/knowledge-base.service.js';
import { chatWithConfig, getPipelineProviderConfig } from '../../utils/ai/aiProvider.js';
import { PipelineResult } from './pipeline-result.model.js';
import {
  searchKnowledgeWithFallback,
  triageByScore,
  buildAuditMetaUpdate,
  logPipelineEvent,
  isSensitiveContent,
} from '../../utils/ai/pipelineCommon.js';

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
 * Find the best answer for a community post by searching all three
 * knowledge sources in parallel: FAQ, Community posts, and Transcript
 * Knowledge. After gathering matches, we segregate by confidence:
 *
 *  - ≥ APPROVE_THRESHOLD (0.85) → return top match's answer verbatim
 *  - ≥ SUGGEST_THRESHOLD (0.60) and we have at least one decent match →
 *      generate a synthesized answer using the matched context
 *  - below SUGGEST_THRESHOLD or nothing matched → return null (escalate)
 *
 * The three sources are queried in parallel (faster) and their scores are
 * normalized onto the same 0-1 scale so they can be compared.
 */
async function findBestAnswer(postTitle: string, postBody: string, batchId?: Types.ObjectId | string | null): Promise<AnswerMatch | null> {
  const AUTO_APPROVE_THRESHOLD = await readSetting('autoAnswerApproveThreshold', 0.85, batchId);
  const SUGGEST_THRESHOLD = await readSetting('autoAnswerSuggestThreshold', 0.60, batchId);
  const queryText = `${postTitle} ${postBody}`.slice(0, 2000);

  // ── Fan out to all three sources in parallel ─────────────────────────────
  const [kbRaw, faqMatches, communityMatches] = await Promise.all([
    // Knowledge base — already circuit-breaker safe via searchKnowledgeWithFallback
    searchKnowledgeWithFallback(queryText, 3).catch((err): null => {
      cronLog.warn(`[autoAnswer] Knowledge base search failed: ${(err as Error).message}`);
      return null;
    }),
    searchRelevantFaqs(queryText, 3).catch((err): Awaited<ReturnType<typeof searchRelevantFaqs>> => {
      cronLog.warn(`[autoAnswer] FAQ search failed: ${(err as Error).message}`);
      return [];
    }),
    searchRelevantCommunityPosts(queryText, 3).catch((err): Awaited<ReturnType<typeof searchRelevantCommunityPosts>> => {
      cronLog.warn(`[autoAnswer] Community search failed: ${(err as Error).message}`);
      return [];
    }),
  ]);

  const kbMatches = (kbRaw ?? []) as Exclude<Awaited<ReturnType<typeof searchKnowledge>>, null>;

  // ── 1. Best KB match — highest baseline confidence (curated transcript data) ──
  let best: AnswerMatch | null = null;
  if (kbMatches && kbMatches.length > 0) {
    const top = kbMatches[0];
    const confidence = Math.min((top.score ?? 0.7) * 1.1, 0.95);
    if (confidence >= SUGGEST_THRESHOLD) {
      cronLog.info(`[autoAnswer] KB match for "${postTitle.slice(0, 40)}": conf=${confidence.toFixed(2)}`);
      best = {
        answer: top.answer.slice(0, MAX_ANSWER_CHARS),
        confidence: Math.round(confidence * 100) / 100,
        source: top.sourceTitle ?? top.source ?? 'Knowledge Base',
        sourceId: top._id,
        matchedQuestion: top.question,
      };
    }
  }

  // ── 2. Best FAQ match — if better than KB, take it ───────────────────────
  if (faqMatches && faqMatches.length > 0) {
    const top = faqMatches[0];
    // FAQ vector scores are typically 0.4-0.85; remap to a more usable range.
    const confidence = Math.min(top.score * 0.95, 0.93);
    if (confidence >= SUGGEST_THRESHOLD && (!best || confidence > best.confidence)) {
      cronLog.info(`[autoAnswer] FAQ match for "${postTitle.slice(0, 40)}": conf=${confidence.toFixed(2)}`);
      best = {
        answer: top.answer.slice(0, MAX_ANSWER_CHARS),
        confidence: Math.round(confidence * 100) / 100,
        source: 'FAQ',
        sourceId: top._id,
        matchedQuestion: top.question,
      };
    }
  }

  // ── 3. Best Community match — if better than both, take it ──────────────
  if (communityMatches && communityMatches.length > 0) {
    const top = communityMatches[0];
    const confidence = Math.min(top.score * 0.9, 0.90);
    if (confidence >= SUGGEST_THRESHOLD && (!best || confidence > best.confidence)) {
      cronLog.info(`[autoAnswer] Community match for "${postTitle.slice(0, 40)}": conf=${confidence.toFixed(2)}`);
      best = {
        answer: top.answer.slice(0, MAX_ANSWER_CHARS),
        confidence: Math.round(confidence * 100) / 100,
        source: 'Community (prior Q&A)',
        sourceId: top._id,
        matchedQuestion: top.title,
      };
    }
  }

  // ── 4. If we have a strong match (≥ AUTO_APPROVE), return it ────────────
  if (best && best.confidence >= AUTO_APPROVE_THRESHOLD) {
    return best;
  }

  // ── 5. Otherwise: synthesize from gathered context ──────────────────────
  // If we found at least one decent match (KB / FAQ / community), pass them
  // all to the LLM as context. Otherwise fall back to "recent FAQs" so the
  // LLM has something to work with.
  try {
    const contextBlocks: string[] = [];

    for (const m of kbMatches.slice(0, 2)) {
      contextBlocks.push(`[Knowledge] Q: ${m.question}\nA: ${m.answer.slice(0, 400)}`);
    }
    for (const m of faqMatches.slice(0, 2)) {
      contextBlocks.push(`[FAQ] Q: ${m.question}\nA: ${m.answer.slice(0, 400)}`);
    }
    for (const m of communityMatches.slice(0, 2)) {
      contextBlocks.push(`[Community Q&A] Q: ${m.title}\nA: ${m.answer.slice(0, 400)}`);
    }

    // Last-resort: top 5 most recent approved FAQs, in case none of the
    // semantic searches found anything relevant.
    if (contextBlocks.length === 0) {
      const recentFaqs = await FAQ.find({ status: 'approved' })
        .select('question answer')
        .sort({ createdAt: -1 })
        .limit(5);
      for (const f of recentFaqs) {
        contextBlocks.push(`[Recent FAQ] Q: ${f.question}\nA: ${f.answer.slice(0, 400)}`);
      }
    }

    if (contextBlocks.length === 0) return best; // no source of context at all

    const context = contextBlocks.join('\n\n');
    const messages = [
      {
        role: 'system',
        content: `You are Yaksha's AI assistant. Answer the user's question concisely and accurately using the provided knowledge context (a mix of FAQ entries, prior community Q&A, and transcript knowledge). If the context doesn't contain enough information to give a complete answer, say so clearly. Keep answers under 300 words. Do not make up information not present in the context.`,
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nUser question: ${postTitle}${postBody ? `\nDetails: ${postBody}` : ''}`,
      },
    ];

    const cfg = await getPipelineProviderConfig('auto_answer');
    const reply = await chatWithConfig(cfg, messages);
    if (reply && reply.trim().length > 20) {
      // Run the Hallucination Guard to validate faithfulness of the generated reply
      const { validateFaithfulness } = await import('../../utils/ai/hallucinationGuard.js');
      const verification = await validateFaithfulness(reply, contextBlocks, batchId?.toString() || null);

      const hadRelevant = (kbMatches.length + faqMatches.length + communityMatches.length) > 0;
      const conf = verification.passed
        ? (hadRelevant ? 0.72 : 0.62)
        : 0.20; // drop confidence to force escalation if verification fails

      if (!verification.passed) {
        cronLog.info(`[autoAnswer] Hallucination detected for "${postTitle.slice(0, 40)}": score=${verification.score}, reason: ${verification.reason}`);
      }

      return {
        answer: reply.trim().slice(0, MAX_ANSWER_CHARS),
        confidence: conf,
        source: hadRelevant
          ? 'AI-generated (from KB/FAQ/Community context)'
          : 'AI-generated (from recent FAQ context)',
        sourceId: 'generated',
      };
    }
  } catch (err) {
    cronLog.warn(`[autoAnswer] AI generation failed: ${(err as Error).message}`);
  }

  // Return the best direct match even if it's below APPROVE — caller decides
  // whether to queue (SUGGEST) or escalate (below SUGGEST).
  return best;
}
// ─── Per-post processor ──────────────────────────────────────────────────────

async function processPost(post: InstanceType<typeof CommunityPost>): Promise<void> {
  const batchId = post.batchId;
  const AUTO_APPROVE_THRESHOLD = await readSetting('autoAnswerApproveThreshold', 0.85, batchId);
  const postTitle = post.title;
  const postBody = post.body ?? '';

  // Skip if already answered
  if (post.status === 'answered') {
    cronLog.info(`[autoAnswer] Skipping already-answered post ${post._id}`);
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

  const match = await findBestAnswer(postTitle, postBody, batchId);
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
      cronLog.info(`[autoAnswer] Escalated (no match): ${postTitle.slice(0, 40)}`);
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
      cronLog.info(`[autoAnswer] Escalated (sensitive): ${postTitle.slice(0, 40)}`);
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
      cronLog.info(`[autoAnswer] Auto-approved (conf=${confidence}): ${postTitle.slice(0, 40)}`);
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
      cronLog.info(`[autoAnswer] Suggested (conf=${confidence}): ${postTitle.slice(0, 40)}`);
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
      batchId:     post.batchId,
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
    cronLog.error(`[autoAnswer] Queue fetch failed: ${(err as Error).message}`);
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

      cronLog.info(`[autoAnswer] Admin approved answer for post ${postId}`);
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
      cronLog.info(`[autoAnswer] Admin rejected AI answer for post ${postId}`);
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
    cronLog.error(`[autoAnswer] Review failed: ${(err as Error).message}`);
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
    const batchIdRaw = req.query.batchId || req.body.batchId;
    const batchId = typeof batchIdRaw === 'string' && Types.ObjectId.isValid(batchIdRaw) ? batchIdRaw : null;
    const MIN_POST_AGE_HOURS = await readSetting('autoAnswerMinAgeHours', 2, batchId);
    const BATCH_SIZE = await readSetting('autoAnswerBatchSize', 20, batchId);
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
        cronLog.info(`[autoAnswer] Processed post ${post._id}: ${prevStatus ?? 'null'} → ${newStatus}`);
      } catch (err) {
        results.errors++;
        cronLog.error(`[autoAnswer] Error processing post ${post._id}: ${(err as Error).message}`);
      }
    }

    cronLog.info(`[autoAnswer] Run complete: ${JSON.stringify(results)}`);
    res.json({ message: 'Auto-answer run complete', ...results });
  } catch (err) {
    cronLog.error(`[autoAnswer] Run failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Scheduler ───────────────────────────────────────────────────────────────
// Phase 3 R12 — autoAnswerIntervalHandle is no longer used; the
// scheduler is now registered via cronManager in bootstrap/startup.ts
// (name: 'auto-answer-batch'). Kept as a typed module-level slot for
// any external code that referenced it during the v1.6x era.
let autoAnswerIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * DEPRECATED — Phase 3 R12. The auto-answer scheduler is now registered
 * via cronManager in bootstrap/startup.ts (name: 'auto-answer-batch').
 * This shim is kept so external callers that import the function don't
 * crash, but the real scheduling is elsewhere.
 */
export async function runScheduledAutoAnswer(): Promise<void> {
  cronLog.warn(
    '[autoAnswer] runScheduledAutoAnswer is deprecated — scheduler is now in cronManager (bootstrap/startup.ts). ' +
      'This call is a no-op.',
  );
}

export function stopAutoAnswerScheduler(): void {
  cronLog.warn(
    '[autoAnswer] stopAutoAnswerScheduler is deprecated — cronManager handles stopAll in stopAllSchedulers().',
  );
  // Still clear the legacy handle if it was set by an old version.
  if (autoAnswerIntervalHandle) {
    clearInterval(autoAnswerIntervalHandle);
    autoAnswerIntervalHandle = null;
  }
}

// Internal version without Express req/res
async function runAutoAnswerInternal(): Promise<void> {
  const MIN_POST_AGE_HOURS = await readSetting('autoAnswerMinAgeHours', 2);
  const BATCH_SIZE = await readSetting('autoAnswerBatchSize', 20);
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
    cronLog.info('[autoAnswer] No eligible posts for auto-answering.');
    return;
  }

  cronLog.info(`Starting scheduled run — ${posts.length} posts to process.`);
  // v1.68 — M5: read interval fresh on every tick.
  // Phase 3 R12 — readCheckIntervalH is now a stub; the real schedule
  // is on cronManager.
  const readCheckIntervalH = (): number => 24;
  cronLog.info(`Starting scheduled run`, { posts: posts.length, intervalH: readCheckIntervalH() });
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
      cronLog.error(`[autoAnswer] Post ${post._id} error: ${(err as Error).message}`);
    }
  }
  cronLog.info(`[autoAnswer] Scheduled run complete: ${JSON.stringify(results)}`);
}