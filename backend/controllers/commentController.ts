import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import User, { IUser, calculateTier } from '../models/User.js';
import ReputationLog from '../models/ReputationLog.js';
import { autoAwardBadges } from './reputationController.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { createTeaDrop } from './teaNotificationController.js';

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

    await post.populate('comments.author', 'name');
    const newComment = post.comments[post.comments.length - 1];

    // ── First Responder award (atomic) ─────────────────────────────────────────
    // Only the very first comment on a 'pending' Time-Trial post wins.
    // We use findOneAndUpdate so this is race-condition-safe — only the earliest
    // write that lands wins, all others silently get isFirstResponder=false.
    if (post.timeTrialStatus === 'pending') {
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
        ).catch(() => {});

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
      ).catch(() => {});

      // ── Tea drop: "someone answered your post" ─────────────────────────────
      createTeaDrop({
        userId: post.author,
        eventType: 'post_answered_user',
        postId: post._id as Types.ObjectId,
        postTitle: post.title,
        triggeredBy: req.user!._id,
        triggeredByName: req.user!.name,
        content: body.trim().slice(0, 200),
      }).catch(() => {});
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
      ).catch(() => {});
    }

    res.status(201).json({ comment: newComment, total: post.comments.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/comments/:commentId/upvote — Toggle upvote on a comment
export const toggleCommentUpvote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found.' });
      return;
    }

    const commentId: string = req.params.commentId as string;
    const userId = req.user!._id.toString();
    const alreadyUpvoted = comment.upvotes.map((u: Types.ObjectId) => u.toString()).includes(userId);

    // Tea drop: notify comment author on new upvote (not self-votes, not retractions)
    const commentAuthorId = comment.author;
    const isSelfVote = commentAuthorId.toString() === userId;
    const wasNewUpvote = !alreadyUpvoted;

    // Use atomic $pull/$addToSet to avoid race-condition duplicates
    await CommunityPost.findOneAndUpdate(
      { _id: post._id, 'comments._id': new Types.ObjectId(commentId) },
      alreadyUpvoted
        ? { $pull: { 'comments.$.upvotes': new Types.ObjectId(userId) } }
        : {
            $addToSet: { 'comments.$.upvotes': new Types.ObjectId(userId) },
            $pull: { 'comments.$.downvotes': new Types.ObjectId(userId) },
          },
      { returnDocument: 'after' }
    );

    // Re-fetch to get accurate counts
    const updated = await CommunityPost.findById(post._id).select('comments.upvotes comments.downvotes');
    const refreshed = (updated?.comments as any).id(req.params.commentId);

    if (!isSelfVote && wasNewUpvote) {
      createTeaDrop({
        userId: commentAuthorId,
        eventType: 'comment_received',
        postId: post._id as Types.ObjectId,
        postTitle: post.title,
        triggeredBy: req.user!._id,
        triggeredByName: req.user!.name,
      }).catch(() => {});
      // Award +3 points to comment author for receiving upvote (atomic, race-safe)
      const updatedCommentAuthor = await User.findByIdAndUpdate(
        commentAuthorId,
        { $inc: { points: 3, reputation: 3 } },
        { new: true }
      );
      if (updatedCommentAuthor) {
        updatedCommentAuthor.tier = calculateTier(updatedCommentAuthor.points);
        await updatedCommentAuthor.save();
        autoAwardBadges(commentAuthorId.toString()).catch(() => {});
        await ReputationLog.create({
          userId: commentAuthorId,
          delta: 3,
          reason: `Comment upvote on post "${post.title.slice(0, 40)}"`,
          action: 'upvote_received',
          targetId: post._id as Types.ObjectId,
          targetType: 'comment',
        });
      }
    }

    res.json({
      upvotes: refreshed?.upvotes?.length ?? 0,
      downvotes: refreshed?.downvotes?.length ?? 0,
      netScore: (refreshed?.upvotes?.length ?? 0) - (refreshed?.downvotes?.length ?? 0),
      upvotedByMe: !alreadyUpvoted,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/comments/:commentId/downvote — Toggle downvote on a comment
export const toggleCommentDownvote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found.' });
      return;
    }

    const userId = req.user!._id.toString();
    const alreadyDownvoted = comment.downvotes.map((u: Types.ObjectId) => u.toString()).includes(userId);

    if (alreadyDownvoted) {
      comment.downvotes = comment.downvotes.filter((u: Types.ObjectId) => u.toString() !== userId);
    } else {
      comment.downvotes.push(req.user!._id);
      comment.upvotes = comment.upvotes.filter((u: Types.ObjectId) => u.toString() !== userId);
    }

    const netScore = comment.upvotes.length - comment.downvotes.length;

    if (netScore <= -5) {
      comment.deleteOne();
      await post.save();
      res.json({
        deleted: true,
        message: 'Comment obliterated.',
      });
      return;
    }

    await post.save();

    res.json({
      upvotes: comment.upvotes.length,
      downvotes: comment.downvotes.length,
      netScore,
      downvotedByMe: !alreadyDownvoted,
      deleted: false,
    });
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
