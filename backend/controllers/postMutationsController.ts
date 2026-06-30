/**
 * postMutationsController.ts — Post creation, voting, deletion, reporting.
 *
 * Routes (from routes/community.ts):
 *   POST   /api/community                 — createPost (protected, validateBody)
 *   POST   /api/community/:id/upvote      — toggleUpvote (protected)
 *   POST   /api/community/:id/report      — reportPost (protected, validateBody)
 *   DELETE /api/community/:id             — deletePost (admin/moderator)
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import { translatePostInBackground } from '../services/translationService.js';
import FAQ from '../models/FAQ.js';
import { generateEmbedding } from '../utils/ai/embeddings.js';
import User, { calculateTier } from '../models/User.js';
import { invalidateCache } from '../utils/http/cache.js';
import { dispatchNotification } from '../utils/http/notificationDispatcher.js';
import { createTeaDrop } from './teaNotificationController.js';
import ReputationLog from '../models/ReputationLog.js';
import { autoAwardBadges } from './reputationController.js';
import { sanitizeHtml } from '../utils/http/sanitize.js';
// v1.68 — L1: communityLog replaces the bare `logger` so all
// post/comment/upvote log lines carry the [community] tag.
import { communityLog } from '../utils/http/logger.js';
import { getDuplicates } from './postDuplicateController.js';
import { assertCanCreateContent } from '../utils/banUtils.js';

// POST /api/community — Create a new post (protected)
export const createPost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  // v1.66 — Golden-ban gate. 72h ban blocks new posts (questions, answers).
  if (!assertCanCreateContent(req.user, res)) return;
  try {
    const { title, body, tags, attachments, isAnonymous, priority } = req.body as {
      title?: string;
      body?: string;
      tags?: string[];
      // Cloudinary attachment metadata. We never accept raw file blobs here
      // — the browser uploads to Cloudinary directly using /api/upload/sign,
      // then sends back just the publicId + url. We validate ownership of
      // the URL before saving.
      attachments?: Array<{ url?: string; publicId?: string; width?: number; height?: number; format?: string; bytes?: number }>;
      isAnonymous?: boolean;
      priority?: 'low' | 'medium' | 'urgent' | 'critical';
    };

    const validPriorities = ['low', 'medium', 'urgent', 'critical'];
    const resolvedPriority = (priority && validPriorities.includes(priority)) ? priority : 'low';

    // Validate inputs
    if (!title || !body) {
      res.status(400).json({ message: 'Title and body are required.' });
      return;
    }

    // Normalize tags: array of trimmed lowercase non-empty strings, max 3
    const safeTags: string[] = Array.isArray(tags)
      ? tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 3)
      : [];

    // ── Server-side duplicate check ──────────────────────────────────────────
    const duplicates = await getDuplicates(title, req.programContext?.batchId ?? null);
    const criticalMatch = duplicates.find((m) => m.score > 0.9);
    if (criticalMatch) {
      res.status(409).json({
        message: 'This question has already been asked with >90% similarity. Please search first.',
        matches: duplicates,
        isDuplicate: true,
      });
      return;
    }

    // Generate vector embedding for semantic search
    let embedding: number[] | undefined;
    try {
      embedding = await generateEmbedding(`Question: ${title}. Description: ${body}`);
    } catch (err) {
      communityLog.warn(`Failed to generate embedding for post: ${(err as Error).message}`);
    }

    // Validate attachments: cap at 4, drop malformed entries, ensure URLs
    // are on our Cloudinary account. Cloudinary's free plan caps the asset
    // count + size, so we hard-limit per post to keep the feed reasonable.
    const MAX_ATTACHMENTS = 4;
    let safeAttachments: Array<{ url: string; publicId: string; width?: number; height?: number; format?: string; bytes?: number }> = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      if (attachments.length > MAX_ATTACHMENTS) {
        res.status(400).json({ message: `At most ${MAX_ATTACHMENTS} image attachments per post.` });
        return;
      }
      // Validate that every URL is on our Cloudinary. Lazy import — most
      // posts have no attachments and shouldn't pay the import cost.
      let cfg: { cloudName: string };
      try {
        const { getCloudinaryConfig } = await import('../utils/http/cloudinary.js');
        cfg = getCloudinaryConfig();
      } catch (e) {
        res.status(503).json({ message: (e as Error).message });
        return;
      }
      const { isOurCloudinaryAsset } = await import('../utils/http/cloudinary.js');
      for (const a of attachments) {
        if (!a?.url || !a?.publicId) continue;
        if (!isOurCloudinaryAsset(a.url, cfg.cloudName)) {
          res.status(400).json({ message: 'attachment.url must be a valid Cloudinary URL for this account.' });
          return;
        }
        safeAttachments.push({
          url: a.url,
          publicId: a.publicId,
          width: a.width,
          height: a.height,
          format: a.format,
          bytes: a.bytes,
        });
      }
    }

    // v1.69 — Phase 3d: tag new posts with the active program.
    // The programScope middleware (when chained on this route)
    // attaches req.programContext; if the caller didn't chain it,
    // we fall back to the body's batchId, then to null (legacy
    // single-tenant mode).
    const programContext = req.programContext;
    const batchIdFromBody = (req.body as { batchId?: string })?.batchId;
    const resolvedBatchId =
      (programContext?.batchId && Types.ObjectId.isValid(programContext.batchId))
        ? new Types.ObjectId(programContext.batchId)
        : batchIdFromBody && Types.ObjectId.isValid(batchIdFromBody)
          ? new Types.ObjectId(batchIdFromBody)
          : null;

    // Create post linked to the authenticated user with a default 'unanswered' status
    const post = await CommunityPost.create({
      title: sanitizeHtml(title),
      body: sanitizeHtml(body),
      author: req.user!._id,
      status: 'unanswered',
      isAnonymous: !!isAnonymous,
      priority: resolvedPriority,
      embedding,
      batchId: resolvedBatchId,
      tags: safeTags,
      attachments: safeAttachments,
      lifecycle: {
        status: 'open',
        statusHistory: [{
          from: '',
          to: 'open',
          changedBy: req.user!._id,
          changedAt: new Date(),
          note: 'Question created',
        }],
      },
    });

    // Hydrate the author field before sending back the response
    await post.populate('author', 'name');

    // Trigger Hindi translation in the background
    translatePostInBackground(post._id);

    // Invalidate search cache so new post appears in community search immediately
    await invalidateCache().catch((err) => {
      communityLog.warn(`[post] Failed to invalidate cache on post creation: ${(err as Error).message}`);
    });

    res.status(201).json({ post });
  } catch (error) {
    communityLog.error(`[post] createPost failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/upvote — Toggle upvote
export const toggleUpvote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }

  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    // v1.69 — Phase 3d: scope by program. Upvotes must belong to
    // the active program.
    const programContext = req.programContext;
    if (programContext) {
      const postBatch = (post as { batchId?: Types.ObjectId | string | null }).batchId;
      if (!postBatch || postBatch.toString() !== programContext.batchId) {
        res.status(404).json({ message: 'Post not found.' });
        return;
      }
    }

    const userId = req.user!._id.toString();
    const alreadyUpvoted = post.upvotes.map((u: Types.ObjectId) => u.toString()).includes(userId);

    // Use atomic $pull/$addToSet to avoid race-condition duplicates
    const updated = await CommunityPost.findOneAndUpdate(
      { _id: post._id },
      alreadyUpvoted
        ? { $pull: { upvotes: new Types.ObjectId(userId) } }
        : { $addToSet: { upvotes: new Types.ObjectId(userId) } },
      { returnDocument: 'after' }
    );

    const newUpvotes = updated?.upvotes?.length ?? 0;

    // Check if this upvote just crossed the promotion threshold
    if (!alreadyUpvoted) {
      const { checkPromotionEligibility, startPromotionReview } = await import('../services/promotionService.js').catch((err) => {
        communityLog.warn(`[post] Failed to dynamically import promotionService: ${(err as Error).message}`);
        return { checkPromotionEligibility: null, startPromotionReview: null };
      });
      if (checkPromotionEligibility && startPromotionReview) {
        try {
          const eligible = await checkPromotionEligibility(updated ?? post);
          if (eligible && !(updated ?? post).promotionPendingAt) {
            await startPromotionReview(updated ?? post, userId);
            communityLog.info(`Post ${(updated ?? post)._id} crossed threshold, entered promotion review`);
          }
        } catch (e) {
          communityLog.warn(`Promotion eligibility check failed: ${(e as Error).message}`);
        }
      }
    }

    // Notify post author on new upvote only (self-votes and vote retractions send nothing)
    const isSelfVote = post.author.toString() === userId;
    if (!isSelfVote && alreadyUpvoted) {
      await User.findByIdAndUpdate(post.author, { $inc: { points: -2, reputation: -2 } });
      await ReputationLog.deleteMany({
        userId: post.author,
        targetId: post._id as Types.ObjectId,
        targetType: 'community_post',
        action: 'upvote_received',
      });
    }
    if (!isSelfVote && !alreadyUpvoted) {
      dispatchNotification({
        recipientId: post.author,
        eventType: 'upvote',
        link: `/community?post=${post._id}`,
      }).catch((err) => {
        communityLog.warn(`[post] Failed to dispatch upvote notification: ${(err as Error).message}`);
      });
      // Tea drop: your post was upvoted
      createTeaDrop({
        userId: post.author,
        eventType: 'post_upvoted',
        postId: post._id as Types.ObjectId,
        postTitle: post.title,
        triggeredBy: req.user!._id,
        triggeredByName: req.user!.name,
      }).catch((err) => {
        communityLog.warn(`[post] Failed to create tea drop for upvote: ${(err as Error).message}`);
      });
      // Award +2 points to post author for receiving question upvote (knowledge-lifecycle-design.md)
      const updatedAuthor = await User.findByIdAndUpdate(
        post.author,
        { $inc: { points: 2, reputation: 2 } },
        { new: true }
      );
      if (updatedAuthor) {
        updatedAuthor.tier = calculateTier(updatedAuthor.points);
        await updatedAuthor.save();
        // Auto-award tier badges if threshold crossed
        autoAwardBadges(post.author.toString()).catch((err) => {
          communityLog.warn(`[post] Failed to auto-award badges to ${post.author}: ${(err as Error).message}`);
        });
      }
      await ReputationLog.create({
        userId: post.author,
        delta: 2,
        reason: `Question upvote received: "${post.title.slice(0, 40)}"`,
        action: 'upvote_received',
        targetId: post._id as Types.ObjectId,
        targetType: 'community_post',
      });
    }

    res.json({ upvotes: newUpvotes, upvotedByMe: !alreadyUpvoted });
  } catch (error) {
    communityLog.error(`[post] toggleUpvote failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/report — Report a community post
// Reason must be one of the spec's closed set: spam | duplicate | abuse | other
const VALID_REPORT_REASONS = ['spam', 'duplicate', 'abuse', 'other'] as const;
type ReportReason = typeof VALID_REPORT_REASONS[number];

export const reportPost = async (req: Request<{ id: string }, {}, { reason: string }>, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      res.status(400).json({ message: 'Reason is required.' });
      return;
    }
    if (!VALID_REPORT_REASONS.includes(reason as ReportReason)) {
      res.status(400).json({
        message: `Reason must be one of: ${VALID_REPORT_REASONS.join(', ')}`,
      });
      return;
    }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    // v1.69 — Phase 3d: scope by program.
    const programContext = req.programContext;
    if (programContext) {
      const postBatch = (post as { batchId?: Types.ObjectId | string | null }).batchId;
      if (!postBatch || postBatch.toString() !== programContext.batchId) {
        res.status(404).json({ message: 'Post not found.' });
        return;
      }
    }

    // Prevent duplicate reports by the same user
    const alreadyReported = post.reports.some(
      (r) => r.reportedBy.toString() === req.user!._id.toString()
    );
    if (alreadyReported) {
      res.status(409).json({ message: 'You have already reported this post.' });
      return;
    }

    post.reports.push({ reportedBy: req.user!._id, reason: reason.trim() });
    await post.save();

    // Auto-escalate if 3 or more reports accumulated
    if (post.reports.length >= 3 && post.escalationStatus !== 'escalated') {
      post.escalationStatus = 'escalated';
      post.escalatedAt = new Date();
      post.escalationReason = `Auto-escalated: ${post.reports.length} reports received`;
      post.escalatedBy = req.user!._id;
      await post.save();
    }

    res.json({ message: 'Report submitted. Thank you.' });
  } catch (error) {
    communityLog.error(`[post] reportPost failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/community/:id — Delete a community post (Admin/Moderator only)
export const deletePost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }
    // v1.69 — Phase 3d: when a program context is attached, the
    // post must belong to that program. Cross-program deletes are
    // denied (don't 403 — return 404 to avoid leaking existence).
    const programContext = req.programContext;
    if (programContext) {
      const postBatch = (post as { batchId?: Types.ObjectId | string | null }).batchId;
      if (!postBatch || postBatch.toString() !== programContext.batchId) {
        res.status(404).json({ message: 'Post not found.' });
        return;
      }
    }

    const postTitle = post.title;
    const authorId = post.author;

    // ── Tea drop: "your post was deleted" ───────────────────────────────────
    // Don't notify if admin/moderator is deleting their own post
    if (authorId.toString() !== req.user!._id.toString()) {
      createTeaDrop({
        userId: authorId,
        eventType: 'post_deleted',
        postId: post._id as Types.ObjectId,
        postTitle,
        triggeredBy: req.user!._id,
        triggeredByName: req.user!.name,
      }).catch((err) => {
        communityLog.warn(`[post] Failed to create tea drop for deleted post: ${(err as Error).message}`);
      });
    }

    await CommunityPost.findByIdAndDelete(req.params.id);

    // Invalidate search cache so deleted post is removed from results
    await invalidateCache().catch((err) => {
      communityLog.warn(`[post] Failed to invalidate cache on post delete: ${(err as Error).message}`);
    });

    res.json({ message: 'Post deleted successfully.' });
  } catch (error) {
    communityLog.error(`[post] deletePost failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};
