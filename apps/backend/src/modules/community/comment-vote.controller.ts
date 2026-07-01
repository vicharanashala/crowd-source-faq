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
import CommunityPost from './community-post.model.js';
import User, { calculateTier } from '../auth/user.model.js';
import ReputationLog from '../moderation/reputation-log.model.js';
// v1.69 — Phase 7: per-program reputation writes (dual write
// with the User global aggregate).
import { awardToUser } from '../moderation/program-reputation.model.js';
import { autoAwardBadges } from '../moderation/reputation.controller.js';
import { createTeaDrop } from '../notification/tea-notification.controller.js';
import { communityLog } from '../../utils/http/logger.js';
// v1.69 — Phase 3e: program-scope guard for comment votes.
import { assertSameProgram } from '../../utils/db/scopedQuery.js';

// ─── toggleCommentUpvote ───────────────────────────────────────────────────────
// POST /api/community/:id/comments/:commentId/upvote
export const toggleCommentUpvote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    if (assertSameProgram(post, req.programContext, res)) return;

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
      // v1.69 — Phase 7: per-program reversal.
      await awardToUser(commentAuthorId.toString(), post.batchId as Types.ObjectId, { points: -5 })
        .catch((err) => communityLog.warn(`[commentVote] ProgramReputation reverse failed: ${(err as Error).message}`));
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
      }).catch((err) => {
        communityLog.warn(`[commentVote] Failed to create tea drop for comment author ${commentAuthorId}: ${(err as Error).message}`);
      });

      // Award +5 points to comment author for receiving answer upvote.
      // v1.68 — C1 fix: the previous code did findByIdAndUpdate
      // (atomic $inc) then mutated tier in memory and called
      // save(). The save() re-wrote the in-memory doc, which was
      // loaded at the time of the $inc — any concurrent
      // findByIdAndUpdate between our $inc and our save() would
      // have its increment clobbered. Fix: split into two
      // atomic updates. Tier is a derived value; eventual
      // consistency is acceptable.
      const updatedCommentAuthor = await User.findByIdAndUpdate(
        commentAuthorId,
        { $inc: { points: 5, reputation: 5 } },
        { new: true },
      );
      if (updatedCommentAuthor) {
        const newTier = calculateTier(updatedCommentAuthor.points);
        await User.updateOne(
          { _id: commentAuthorId },
          { $set: { tier: newTier } },
        );
        autoAwardBadges(commentAuthorId.toString()).catch((err) => {
          communityLog.warn(`[commentVote] Failed to auto-award badges to ${commentAuthorId}: ${(err as Error).message}`);
        });
        // v1.69 — Phase 7: per-program reputation write.
        await awardToUser(commentAuthorId.toString(), post.batchId as Types.ObjectId, { points: 5 })
          .catch((err) => communityLog.warn(`[commentVote] ProgramReputation write failed: ${(err as Error).message}`));
        await ReputationLog.create({
          userId: commentAuthorId,
          batchId: post.batchId ?? null,
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
    const post = await CommunityPost.findById(req.params.id as string);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    if (assertSameProgram(post, req.programContext, res)) return;

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) { res.status(404).json({ message: 'Comment not found.' }); return; }

    const userId = req.user!._id.toString();
    const userObjectId = req.user!._id;
    const alreadyDownvoted = comment.downvotes.map((u: Types.ObjectId) => u.toString()).includes(userId);

    // v1.68 — H3 fix: was read-modify-write on
    //   comment.downvotes.push(req.user!._id)
    //   comment.upvotes = comment.upvotes.filter(...)
    //   await post.save()
    // Two concurrent downvotes on the same comment could both
    // read the same state, both push, and both save() — losing
    // the other's toggle. Same fix shape as toggleCommentUpvote:
    // atomic $pull + $addToSet on the matched comment subdoc.
    await CommunityPost.findOneAndUpdate(
      { _id: post._id, 'comments._id': new Types.ObjectId(req.params.commentId as string) },
      alreadyDownvoted
        ? { $pull: { 'comments.$.downvotes': userObjectId } }
        : {
            $addToSet: { 'comments.$.downvotes': userObjectId },
            $pull: { 'comments.$.upvotes': userObjectId },
          },
      { returnDocument: 'after' }
    );

    // Re-fetch for accurate counts (same pattern as upvote)
    const updated = await CommunityPost.findById(post._id).select('comments.upvotes comments.downvotes');
    const refreshed = (updated?.comments as any).id(req.params.commentId);

    const upvotes = refreshed?.upvotes?.length ?? 0;
    const downvotes = refreshed?.downvotes?.length ?? 0;
    const netScore = upvotes - downvotes;

    // Auto-delete deeply downvoted comments (net score <= -5).
    // v1.68 — H3 fix: the previous code did comment.deleteOne()
    // + post.save() after a read of post. The atomic update
    // above already changed the downvotes array; the deleteOne
    // + save() here is now a separate write. Still racy if two
    // requests both push the net score below -5 simultaneously,
    // but the worst case is a duplicate delete (MongoDB $pull
    // on a missing element is a no-op) — safe.
    let deleted = false;
    if (netScore <= -5) {
      const delRes = await CommunityPost.findOneAndUpdate(
        { _id: post._id, 'comments._id': new Types.ObjectId(req.params.commentId as string) },
        { $pull: { comments: { _id: new Types.ObjectId(req.params.commentId as string) } } },
      );
      deleted = delRes !== null;
      if (deleted) {
        res.json({ deleted: true, message: 'Comment obliterated.' });
        return;
      }
    }

    res.json({
      upvotes,
      downvotes,
      netScore,
      downvotedByMe: !alreadyDownvoted,
      deleted: false,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};