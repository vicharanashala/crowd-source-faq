/**
 * commentVoteController.ts
 *
 * Handles upvote/downvote operations on community post comments.
 * Extracted from commentController.ts to consolidate voting logic
 * alongside postVoteController pattern.
 *
 * Exports:
 *  - toggleCommentUpvote  (+5 pts to comment author on new upvote)
 *  - toggleCommentDownvote (auto-delete at net score <= -5)
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import User, { calculateTier } from '../models/User.js';
import ReputationLog from '../models/ReputationLog.js';
import { autoAwardBadges } from './reputationController.js';
import { createTeaDrop } from './teaNotificationController.js';

// ─── toggleCommentUpvote ───────────────────────────────────────────────────────
// POST /api/community/:id/comments/:commentId/upvote
export const toggleCommentUpvote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) { res.status(404).json({ message: 'Comment not found.' }); return; }

    const commentId: string = req.params.commentId as string;
    const userId = req.user!._id.toString();
    const alreadyUpvoted = comment.upvotes.map((u: Types.ObjectId) => u.toString()).includes(userId);

    const commentAuthorId = comment.author;
    const isSelfVote = commentAuthorId.toString() === userId;
    const wasNewUpvote = !alreadyUpvoted;

    // Reverse reputation when removing upvote
    if (!isSelfVote && alreadyUpvoted) {
      await User.findByIdAndUpdate(commentAuthorId, { $inc: { points: -5, reputation: -5 } });
      await ReputationLog.deleteMany({
        userId: commentAuthorId,
        targetId: post._id as Types.ObjectId,
        targetType: 'comment',
        action: 'upvote_received',
      });
    }

    // Atomic $pull/$addToSet — avoids race-condition duplicates
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

    // Re-fetch for accurate counts
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

      // Award +5 points to comment author for receiving answer upvote
      const updatedCommentAuthor = await User.findByIdAndUpdate(
        commentAuthorId,
        { $inc: { points: 5, reputation: 5 } },
        { new: true }
      );
      if (updatedCommentAuthor) {
        updatedCommentAuthor.tier = calculateTier(updatedCommentAuthor.points);
        await updatedCommentAuthor.save();
        autoAwardBadges(commentAuthorId.toString()).catch(() => {});
        await ReputationLog.create({
          userId: commentAuthorId,
          delta: 5,
          reason: `Answer upvote received on post "${post.title.slice(0, 40)}"`,
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
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── toggleCommentDownvote ─────────────────────────────────────────────────────
// POST /api/community/:id/comments/:commentId/downvote
export const toggleCommentDownvote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) { res.status(404).json({ message: 'Comment not found.' }); return; }

    const userId = req.user!._id.toString();
    const alreadyDownvoted = comment.downvotes.map((u: Types.ObjectId) => u.toString()).includes(userId);

    if (alreadyDownvoted) {
      comment.downvotes = comment.downvotes.filter((u: Types.ObjectId) => u.toString() !== userId);
    } else {
      comment.downvotes.push(req.user!._id);
      comment.upvotes = comment.upvotes.filter((u: Types.ObjectId) => u.toString() !== userId);
    }

    const netScore = comment.upvotes.length - comment.downvotes.length;

    // Auto-delete deeply downvoted comments (net score <= -5)
    if (netScore <= -5) {
      comment.deleteOne();
      await post.save();
      res.json({ deleted: true, message: 'Comment obliterated.' });
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
    res.status(500).json({ message: 'Server error' });
  }
};