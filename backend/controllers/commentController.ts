import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import User, { IUser, calculateTier } from '../models/User.js';
// v1.69 — Phase 7: per-program reputation writes. The User
// document keeps the global aggregate (backwards compat); the
// ProgramReputation row is the per-program source of truth.
import { awardToUser } from '../models/ProgramReputation.js';
import ReputationLog from '../models/ReputationLog.js';
import { autoAwardBadges } from './reputationController.js';
import { sanitizeHtml } from '../utils/http/sanitize.js';
import { createTeaDrop } from './teaNotificationController.js';
import { dispatchNotification } from '../utils/http/notificationDispatcher.js';
import { communityLog } from '../utils/http/logger.js';
import { assertCanCreateContent } from '../utils/banUtils.js';
// v1.69 — Phase 3e: program-scope guard for all comment writes.
import { assertSameProgram } from '../utils/db/scopedQuery.js';
import { trackUserActivity } from '../services/streakService.js';

// Extend Express Request to include user (same pattern as auth middleware)
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

// GET /api/community/answers/list — Paginated list of posts with an official expert answer
export const getAnswersList = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(0, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter = { status: 'answered' };

    const total = await CommunityPost.countDocuments(filter);

    const posts = await CommunityPost.find(filter)
      .select('-embedding')
      .populate('author', 'name')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      posts,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasMore: skip + posts.length < total,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/comments — Add a comment or reply to another comment
// Query param: ?parentId=<commentId> to reply to a specific comment
export const addComment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  // v1.66 — Golden-ban gate. 72h ban blocks new comments.
  if (!assertCanCreateContent(req.user, res)) return;
  try {
    const { body } = req.body as { body?: string };
    const { parentId } = req.query as { parentId?: string };

    if (!body || !body.trim()) {
      res.status(400).json({ message: 'Comment body is required.' });
      return;
    }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    if (assertSameProgram(post, req.programContext, res)) return;
    if (post.isLocked) {
      res.status(403).json({ message: 'This post is locked. New comments are disabled.' });
      return;
    }
    if (post.isHidden) {
      res.status(403).json({ message: 'This post is hidden.' });
      return;
    }

    // Resolve parent comment if this is a reply
    let resolvedParent: any = null;
    if (parentId) {
      resolvedParent = (post.comments as any).id(parentId);
      if (!resolvedParent) {
        res.status(404).json({ message: 'Parent comment not found.' });
        return;
      }
      if (resolvedParent.depth >= 3) {
        res.status(400).json({ message: 'Maximum reply depth (3) reached. Cannot nest deeper.' });
        return;
      }
    }

    // Build comment object with parentId and depth for replies
    const commentObj: Record<string, unknown> = { author: req.user!._id, body: sanitizeHtml(body.trim()) };
    if (resolvedParent) {
      commentObj.parentId = new Types.ObjectId(parentId);
      commentObj.depth = resolvedParent.depth + 1;
    } else {
      commentObj.parentId = null;
      commentObj.depth = 0;
    }

    post.comments.push(commentObj as any);
    await post.save();

    // Track user streak activity on comment/answer submission
    trackUserActivity(req.user!._id.toString(), 'answer').catch((err) => {
      communityLog.warn(`[comment] Failed to track streak activity: ${err.message}`);
    });

    await post.populate('comments.author', 'name');
    const newComment = post.comments[post.comments.length - 1];

    // ── First Responder award (atomic) ─────────────────────────────────────────
    // Only the very first top-level comment (depth=0) on a 'pending' Time-Trial
    // post wins. Replies (depth > 0) are excluded.
    if (post.timeTrialStatus === 'pending' && (commentObj.depth === 0)) {
      const awardResult = await CommunityPost.findOneAndUpdate(
        {
          _id: post._id,
          timeTrialStatus: 'pending',
        },
        {
          $set: {
            timeTrialStatus: 'awarded',
            timeTrialFirstResponder: req.user!._id,
            timeTrialFirstResponderAt: new Date(),
          },
        },
        { new: false }
      );

      if (awardResult) {
        // We won the race — mark the comment
        const wonComment = (post.comments as any).id(newComment._id);
        if (wonComment) {
          wonComment.isFirstResponder = true;
          wonComment.firstResponderAwardedAt = new Date();
          await post.save();
        }

        // Notify the winner
        import('./notificationController.js').then(n =>
          n.createNotification({
            recipient: req.user!._id,
            type: 'accepted_answer' as any,
            title: '🏅 First Responder!',
            message: `You were the first to answer "${post.title}" during the Time-Trial challenge!`,
            link: `/community?post=${post._id}`,
          })
        ).catch((err) => {
          communityLog.warn(`[comment] Failed to send First Responder notification to ${req.user!._id}: ${(err as Error).message}`);
        });

        // Award +20 points + First Responder badge to the winner
        const winner = await User.findById(req.user!._id);
        if (winner) {
          winner.points = Math.max(0, winner.points + 20);
          winner.reputation = winner.points;
          winner.tier = calculateTier(winner.points);
          await winner.save();
          await ReputationLog.create({
            userId: winner._id,
            delta: 20,
            reason: `First Responder on post "${post.title.slice(0, 40)}"`,
            action: 'answer_accepted',
            targetId: post._id as Types.ObjectId,
            targetType: 'community_post',
          });
        }
      }
    }

    // Notify post author
    if (post.author.toString() !== req.user!._id.toString()) {
      import('./notificationController.js').then(n =>
        n.createNotification({
          recipient: post.author,
          type: 'comment_replied',
          title: 'New comment on your post',
          message: `${req.user!.name} commented on "${post.title}": "${body.trim().slice(0, 80)}${body.trim().length > 80 ? '…' : ''}"`,
          link: `/community?post=${post._id}`,
        })
      ).catch((err) => {
        communityLog.warn(`[comment] Failed to notify post author ${post.author}: ${(err as Error).message}`);
      });

      // ── Tea drop: "someone answered your post" ─────────────────────────────
      createTeaDrop({
        userId: post.author,
        eventType: 'post_answered_user',
        postId: post._id as Types.ObjectId,
        postTitle: post.title,
        triggeredBy: req.user!._id,
        triggeredByName: req.user!.name,
        content: body.trim().slice(0, 200),
      }).catch((err) => {
        communityLog.warn(`[comment] Failed to create tea drop for post author ${post.author}: ${(err as Error).message}`);
      });
    }

    // Notify parent comment author
    if (resolvedParent && resolvedParent.author.toString() !== req.user!._id.toString()) {
      import('./notificationController.js').then(n =>
        n.createNotification({
          recipient: resolvedParent.author,
          type: 'comment_replied',
          title: 'Someone replied to your comment',
          message: `${req.user!.name} replied: "${body.trim().slice(0, 80)}${body.trim().length > 80 ? '…' : ''}"`,
          link: `/community?post=${post._id}`,
        })
      ).catch((err) => {
        communityLog.warn(`[comment] Failed to notify parent comment author ${resolvedParent.author}: ${(err as Error).message}`);
      });
    }

    res.status(201).json({ comment: newComment, total: post.comments.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/community/:id/comments/:commentId/dna — Set or update solution DNA on a comment
export const setCommentDNA = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const { keyPoints, summary, tags } = req.body as {
      keyPoints?: string[];
      summary?: string;
      tags?: string[];
    };

    if (!keyPoints && !summary && !tags) {
      res.status(400).json({ message: 'At least one DNA field (keyPoints, summary, tags) is required.' });
      return;
    }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    if (assertSameProgram(post, req.programContext, res)) return;

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found.' });
      return;
    }

    // Merge with existing DNA
    const existing = comment.solutionDNA ?? { keyPoints: [], summary: null, tags: [] };
    comment.solutionDNA = {
      keyPoints: keyPoints ?? existing.keyPoints,
      summary: summary ?? existing.summary,
      tags: tags ?? existing.tags,
    };

    await post.save();
    res.json({ solutionDNA: comment.solutionDNA, commentId: req.params.commentId });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// DELETE /api/community/:id/comments/:commentId/dna — Clear solution DNA from a comment
export const clearCommentDNA = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    if (assertSameProgram(post, req.programContext, res)) return;

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found.' });
      return;
    }

    comment.solutionDNA = null;
    await post.save();
    res.json({ message: 'DNA cleared', commentId: req.params.commentId });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/community/:id/comments/:commentId/verify — Mark a comment as verified top answer
export const verifyComment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    if (assertSameProgram(post, req.programContext, res)) return;

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found.' });
      return;
    }

    comment.verified = !comment.verified;
    await post.save();

    res.json({ verified: comment.verified, commentId: req.params.commentId });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/community/:id/comments/:commentId/accept-answer — Accept a comment as the official answer
// Only the post author can accept an answer; sets answer, answerAuthorId, status=answered, clears escalation
export const acceptCommentAnswer = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    if (assertSameProgram(post, req.programContext, res)) return;

    // Only the post author can accept an answer
    if (post.author.toString() !== req.user!._id.toString()) {
      res.status(403).json({ message: 'Only the post author can accept an answer.' });
      return;
    }

    const commentId = req.params.commentId as string;
    if (!commentId) {
      res.status(400).json({ message: 'Comment ID is required.' });
      return;
    }
    const comment = (post.comments as any).id(commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found.' });
      return;
    }

    // Set the comment body as the official answer
    post.answer = comment.body;
    post.answerIsExpert = false;
    post.answerAuthorId = comment.author;
    post.status = 'answered';
    // Track which comment was accepted so FAQ promotion can reference it
    post.promotionCandidateCommentId = new Types.ObjectId(commentId);
    // Lifecycle: transition to 'answered' stage (knowledge-lifecycle-design.md)
    if (post.lifecycle?.status === 'open') {
      (post.lifecycle.statusHistory ??= []).push({
        from: 'open',
        to: 'answered',
        changedBy: req.user!._id,
        changedAt: new Date(),
        note: 'Answer accepted by question author',
      });
      post.lifecycle.status = 'answered';
    }
    // Clear any pending escalation
    post.escalationStatus = 'none';
    post.escalatedAt = null;
    post.escalationReason = null;
    post.escalatedBy = null;

    // Mark this comment as verified
    comment.verified = true;

    await post.save();

    // ── Award +20 to answer author for accepted answer ───────────────────────
    const answerAuthorId = (comment.author as Types.ObjectId).toString();
    if (answerAuthorId !== req.user!._id.toString()) {
      // v1.69 — Phase 7: dual write. The User document keeps the
      // global aggregate (sum across programs — backwards compat
      // for the existing cross-program leaderboard / user
      // profile). ProgramReputation is the per-program source of
      // truth and drives the per-program leaderboard.
      const answerAuthor = await User.findByIdAndUpdate(
        answerAuthorId,
        { $inc: { points: 20, reputation: 20, acceptedAnswers: 1 } },
        { new: true }
      );
      if (answerAuthor) {
        answerAuthor.tier = calculateTier(answerAuthor.points);
        await answerAuthor.save();
        // Per-program write. The post's batchId is the program
        // context for the reputation delta.
        await awardToUser(answerAuthorId, post.batchId as Types.ObjectId, {
          points: 20,
          acceptedAnswers: 1,
        }).catch((err) => {
          communityLog.warn(`[comment] ProgramReputation write failed for ${answerAuthorId}: ${(err as Error).message}`);
        });
        autoAwardBadges(answerAuthorId).catch((err) => {
          communityLog.warn(`[comment] Failed to auto-award badges to ${answerAuthorId}: ${(err as Error).message}`);
        });
        await ReputationLog.create({
          userId: new Types.ObjectId(answerAuthorId),
          batchId: post.batchId ?? null, // v1.69 — scope the log
          delta: 20,
          reason: `Answer accepted on post "${post.title.slice(0, 40)}"`,
          action: 'answer_accepted',
          targetId: post._id as Types.ObjectId,
          targetType: 'comment',
        });
      }
    }

    // ── Check if post is now eligible for FAQ promotion ───────────────────────
    const { checkPromotionEligibility, startPromotionReview } = await import('../services/promotionService.js');
    try {
      const eligible = await checkPromotionEligibility(post);
      if (eligible) {
        await startPromotionReview(post, req.user!._id.toString());
        communityLog.info(`Accepted answer on post ${post._id} entered promotion review`, { postId: post._id.toString() });
      }
    } catch (e) {
      communityLog.warn(`Promotion eligibility check failed for post ${post._id}: ${(e as Error).message}`);
    }

    // ── Notify the comment author ────────────────────────────────────────────
    if (comment.author.toString() !== req.user!._id.toString()) {
      dispatchNotification({
        recipientId: comment.author as Types.ObjectId,
        eventType: 'accepted_answer',
        link: `/community?post=${post._id}`,
        title: 'Your answer was accepted!',
      }).catch((err) => {
        communityLog.warn(`[comment] Failed to dispatch accepted answer notification to ${comment.author}: ${(err as Error).message}`);
      });

      createTeaDrop({
        userId: comment.author,
        eventType: 'post_answered',
        postId: post._id as Types.ObjectId,
        postTitle: post.title,
        triggeredBy: req.user!._id,
        triggeredByName: req.user!.name,
        content: comment.body.slice(0, 200),
      }).catch((err) => {
        communityLog.warn(`[comment] Failed to create tea drop for accepted answer to ${comment.author}: ${(err as Error).message}`);
      });
    }

    res.json({ message: 'Answer accepted.', post });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};

// ─── PATCH /api/community/:id/comments/:commentId — Edit a comment ──────────
// Author can edit their own comment; admin/moderator can edit any.
// Cannot edit verified or expert answers.
export const updateComment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { body } = req.body as { body?: string };
    if (!body?.trim()) { res.status(400).json({ message: 'Comment body is required' }); return; }
    if (body.length > 5000) { res.status(400).json({ message: 'Comment too long (max 5000 chars)' }); return; }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    if (assertSameProgram(post, req.programContext, res)) return;

    const comment = (post.comments as any).id(req.params.commentId) as any;
    if (!comment) { res.status(404).json({ message: 'Comment not found.' }); return; }

    const isAuthor = comment.author?.toString() === req.user!._id.toString();
    const isPrivileged = req.user!.role === 'admin' || req.user!.role === 'moderator';

    if (!isAuthor && !isPrivileged) {
      res.status(403).json({ message: 'You cannot edit this comment.' }); return;
    }
    if (comment.verified || comment.isExpertAnswer) {
      res.status(403).json({ message: 'Verified or expert answers cannot be edited.' }); return;
    }

    const sanitized = sanitizeHtml(body.trim());
    comment.body = sanitized;
    comment.updatedAt = new Date();
    await post.save();

    const updated = {
      _id: comment._id,
      body: comment.body,
      updatedAt: comment.updatedAt,
      author: comment.author,
      createdAt: comment.createdAt,
      depth: comment.depth,
      parentId: comment.parentId,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      verified: comment.verified,
      isExpertAnswer: comment.isExpertAnswer,
      isFirstResponder: comment.isFirstResponder,
      firstResponderAwardedAt: comment.firstResponderAwardedAt,
    };

    res.json({ comment: updated });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── DELETE /api/community/:id/comments/:commentId — Delete a comment ───────
// Author can delete their own comment; admin/moderator can delete any.
export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    if (assertSameProgram(post, req.programContext, res)) return;

    const comment = (post.comments as any).id(req.params.commentId) as any;
    if (!comment) { res.status(404).json({ message: 'Comment not found.' }); return; }

    const isAuthor = comment.author?.toString() === req.user!._id.toString();
    const isPrivileged = req.user!.role === 'admin' || req.user!.role === 'moderator';

    if (!isAuthor && !isPrivileged) {
      res.status(403).json({ message: 'You cannot delete this comment.' }); return;
    }

    await comment.deleteOne();
    await post.save();

    res.json({ message: 'Comment deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
