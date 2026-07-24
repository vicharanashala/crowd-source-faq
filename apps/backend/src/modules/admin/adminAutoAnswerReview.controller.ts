/**
 * adminAutoAnswerReview.ts — Phase 3 R12 admin endpoints.
 *
 * New endpoints (added in Phase 3):
 *   POST /admin/auto-answer/:postId/approve          — set status='answered', answer=aiAnswer
 *   POST /admin/auto-answer/:postId/approve-edit    — set answer from body, write ProgramKnowledge admin_corrected
 *   POST /admin/auto-answer/:postId/reject          — clear aiAnswer, status='rejected', clear snapshot
 *   POST /admin/auto-answer/:postId/ask-ai-again    — re-run pipeline with augmented context
 *   GET  /admin/auto-answer/queue/paginated         — paginated, filter by status
 *
 * Pre-existing endpoints kept (in admin-auto-answer.routes.ts) for backward compat:
 *   GET  /admin/auto-answer/queue                   — legacy queue fetch
 *   POST /admin/community/auto-answer               — manual run
 *   PATCH /admin/auto-answer/:postId                — legacy approve/reject/escalate
 *
 * All routes use atomic `findOneAndUpdate` to avoid the H3 race-condition
 * pattern from commit 60c1af0. Admin/moderator only.
 */
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../../modules/community/community-post.model.js';
import ProgramKnowledge from '../../models/ProgramKnowledge.js';
import {
  processPost,
  rerunWithContext,
  promoteCorrectedAnswer,
} from '../../services/autoAnswer.js';
import { adminLog } from '../../utils/http/logger.js';

function userIdFromReq(req: Request): Types.ObjectId | null {
  const id = (req as Request & { user?: { _id?: string | Types.ObjectId } }).user?._id;
  if (!id) return null;
  try {
    return new Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

const POST_ID_RE = /^[a-f\d]{24}$/i;

function validatePostId(raw: string | string[] | undefined): Types.ObjectId | null {
  if (!raw || Array.isArray(raw) || !POST_ID_RE.test(raw)) return null;
  try {
    return new Types.ObjectId(raw);
  } catch {
    return null;
  }
}

function bodyString(value: unknown, maxLen = 5000): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s.trim().slice(0, maxLen);
}

/** POST /admin/auto-answer/:postId/approve */
export const approveAutoAnswer = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const postId = validatePostId(req.params.postId);
  if (!postId) {
    res.status(400).json({ message: 'invalid postId' });
    return;
  }
  try {
    const reviewerId = userIdFromReq(req);
    const updated = await CommunityPost.findOneAndUpdate(
      { _id: postId, aiAnswerStatus: { $in: ['suggested', 'approved'] } },
      [
        {
          $set: {
            answer: '$aiAnswer',
            status: 'answered',
            aiAnswerStatus: 'approved',
            aiAnswerReviewedAt: new Date(),
            aiAnswerReviewedBy: reviewerId,
          },
        },
      ],
      { new: true },
    ).lean();
    if (!updated) {
      res.status(404).json({ message: 'post not found or not in suggested state' });
      return;
    }
    adminLog.info(`[autoAnswer] admin approved post ${String(postId)}`);
    res.json({ ok: true, post: updated });
  } catch (err) {
    adminLog.warn(`[autoAnswer] approve failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'approve failed' });
  }
};

/** POST /admin/auto-answer/:postId/approve-edit body:{answer} */
export const approveEditAutoAnswer = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const postId = validatePostId(req.params.postId);
  if (!postId) {
    res.status(400).json({ message: 'invalid postId' });
    return;
  }
  const correctedAnswer = bodyString(req.body?.answer, 5000);
  if (!correctedAnswer) {
    res.status(400).json({ message: 'answer is required' });
    return;
  }
  try {
    const reviewerId = userIdFromReq(req);
    const post = await CommunityPost.findOneAndUpdate(
      { _id: postId, aiAnswerStatus: { $in: ['suggested', 'ask_human', 'escalated', 'approved'] } },
      [
        {
          $set: {
            answer: correctedAnswer,
            status: 'answered',
            aiAnswerStatus: 'approved',
            aiAnswerReviewedAt: new Date(),
            aiAnswerReviewedBy: reviewerId,
            pendingReviews: false,
          },
        },
      ],
      { new: true },
    );
    if (!post) {
      res.status(404).json({ message: 'post not found' });
      return;
    }
    // Promote to ProgramKnowledge with seedSource='admin_corrected' so
    // future retrievals rank this above the original AI answer.
    await promoteCorrectedAnswer({
      post,
      correctedAnswer,
      createdBy: reviewerId,
    });
    adminLog.info(
      `[autoAnswer] admin approve-edit post ${String(postId)} (${correctedAnswer.length} chars)`,
    );
    res.json({ ok: true, post: post.toObject ? post.toObject() : post });
  } catch (err) {
    adminLog.warn(`[autoAnswer] approve-edit failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'approve-edit failed' });
  }
};

/** POST /admin/auto-answer/:postId/reject body:{reason?} */
export const rejectAutoAnswer = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const postId = validatePostId(req.params.postId);
  if (!postId) {
    res.status(400).json({ message: 'invalid postId' });
    return;
  }
  const reason = bodyString(req.body?.reason, 1000);
  try {
    const reviewerId = userIdFromReq(req);
    const updated = await CommunityPost.findOneAndUpdate(
      { _id: postId, aiAnswerStatus: { $in: ['suggested', 'ask_human', 'escalated'] } },
      {
        $set: {
          aiAnswerStatus: 'rejected',
          aiAnswer: null,
          aiAnswerConfidence: null,
          aiAnswerSource: null,
          aiContext: null,
          aiAnswerReviewedAt: new Date(),
          aiAnswerReviewedBy: reviewerId,
        },
      },
      { new: true },
    ).lean();
    if (!updated) {
      res.status(404).json({ message: 'post not found or not in a rejectable state' });
      return;
    }
    adminLog.info(
      `[autoAnswer] admin rejected post ${String(postId)}: ${reason || 'no reason'}`,
    );
    res.json({ ok: true, post: updated });
  } catch (err) {
    adminLog.warn(`[autoAnswer] reject failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'reject failed' });
  }
};

/** POST /admin/auto-answer/:postId/ask-ai-again body:{extraContext?} */
export const askAiAgain = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const postId = validatePostId(req.params.postId);
  if (!postId) {
    res.status(400).json({ message: 'invalid postId' });
    return;
  }
  const extra = bodyString(req.body?.extraContext, 2000);
  try {
    // processPost short-circuits inside cooldown — caller can also use
    // rerunWithContext (which mutates the post body to force a re-run).
    // We use rerunWithContext here so admin "ask AI again" is never
    // silently short-circuited by the cooldown gate.
    const result = extra
      ? await rerunWithContext(postId, extra)
      : await processPost(postId);
    adminLog.info(
      `[autoAnswer] admin ask-ai-again post ${String(postId)} → ${result.decision}`,
    );
    res.json({ ok: true, result });
  } catch (err) {
    adminLog.warn(`[autoAnswer] ask-ai-again failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'ask-ai-again failed' });
  }
};

/** GET /admin/auto-answer/queue/paginated?status=asked|suggested|all&page=N&limit=N */
export const getAutoAnswerQueuePaginated = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const status = (typeof req.query.status === 'string' ? req.query.status : 'all').toString();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
  const filter: Record<string, unknown> = { deletedAt: null };
  if (status === 'asked') {
    filter.aiAnswerStatus = 'ask_human';
  } else if (status === 'suggested') {
    filter.aiAnswerStatus = 'suggested';
  } else if (status === 'escalated') {
    filter.aiAnswerStatus = 'escalated';
  } else if (status === 'approved') {
    filter.aiAnswerStatus = 'approved';
  } else if (status !== 'all') {
    res.status(400).json({ message: 'invalid status' });
    return;
  }
  try {
    const [items, total] = await Promise.all([
      CommunityPost.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CommunityPost.countDocuments(filter),
    ]);
    res.json({
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    adminLog.warn(`[autoAnswer] queue fetch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'queue fetch failed' });
  }
};

// Re-export for the test suite to spot-check the public surface.
export const _exports = {
  approveAutoAnswer,
  approveEditAutoAnswer,
  rejectAutoAnswer,
  askAiAgain,
  getAutoAnswerQueuePaginated,
};

/** GET /admin/auto-answer/:postId/context — returns the persisted aiContext snapshot */
export const getAutoAnswerContext = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const postId = validatePostId(req.params.postId);
  if (!postId) {
    res.status(400).json({ message: 'invalid postId' });
    return;
  }
  try {
    const post = await CommunityPost.findById(postId)
      .select(
        'aiContext aiAnswerStatus aiAnswerConfidence aiAnswerSource lastAutoAnswerAt aiAnswerAttempts',
      )
      .lean();
    if (!post) {
      res.status(404).json({ message: 'post not found' });
      return;
    }
    if (!post.aiContext) {
      res.status(404).json({
        message:
          'no context snapshot — post has not been processed by auto-answer yet',
      });
      return;
    }
    res.json({
      postId: String(postId),
      snapshot: post.aiContext,
      decision: {
        aiAnswerStatus: post.aiAnswerStatus,
        aiAnswerConfidence: post.aiAnswerConfidence,
        aiAnswerSource: post.aiAnswerSource,
        lastAutoAnswerAt: post.lastAutoAnswerAt,
        aiAnswerAttempts: post.aiAnswerAttempts,
      },
    });
  } catch (err) {
    adminLog.warn(`[autoAnswer] context fetch failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'context fetch failed' });
  }
};
