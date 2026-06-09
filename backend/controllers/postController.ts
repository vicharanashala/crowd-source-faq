import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import CommunityPost, { ICommunityPost } from '../models/CommunityPost.js';
import FAQ from '../models/FAQ.js';
import { generateEmbedding } from '../utils/embeddings.js';
import User, { IUser, calculateTier } from '../models/User.js';
import { invalidateCache } from '../utils/cache.js';
import { dispatchNotification } from '../utils/notificationDispatcher.js';
import { createTeaDrop } from './teaNotificationController.js';
import ReputationLog from '../models/ReputationLog.js';
import { autoAwardBadges } from './reputationController.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';
import { checkDuplicate } from './postDuplicateController.js';

// Extend Express Request to include user (same pattern as auth middleware)
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

/** Build a nested comment tree from a flat comments array */
function buildCommentTree(flat: any[]): any[] {
  const map = new Map<string, any>();
  const roots: any[] = [];

  // Clone each comment so we can mutate safely and ensure plain object structure
  for (const c of flat) {
    const plain = typeof c.toObject === 'function' ? c.toObject() : c;
    const normalized = {
      ...plain,
      _id: plain._id.toString(),
      parentId: plain.parentId ? plain.parentId.toString() : null,
      replies: []
    };
    map.set(normalized._id, normalized);
  }

  for (const c of flat) {
    const plain = typeof c.toObject === 'function' ? c.toObject() : c;
    const commentId = plain._id.toString();
    const node = map.get(commentId)!;
    if (node.parentId) {
      const parent = map.get(node.parentId);
      if (parent) {
        parent.replies.push(node);
      } else {
        roots.push(node); // Orphaned reply — treat as root
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// GET /api/community — All posts (cursor-paginated, filterable, sortable, searchable)
export const getAllPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit as string) || 20));
    const cursor = (req.query.cursor as string) || '';

    const filter = (req.query.filter as string) || 'all';
    const sortParam = (req.query.sort as string) || 'newest';
    const search = (req.query.search as string)?.trim() || '';

    // Build query filter
    const query: Record<string, unknown> = { isHidden: { $ne: true } };
    if (filter === 'unanswered') query.status = 'unanswered';
    else if (filter === 'answered') query.status = 'answered';
    // 'all' → no status filter

    // Text search on title
    if (search.length >= 2) {
      const escaped = search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
      query.title = { $regex: escaped, $options: 'i' };
    }

    // Decode cursor to ObjectId for keyset pagination
    let cursorId: mongoose.Types.ObjectId | null = null;
    if (cursor && sortParam !== 'popular') {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        cursorId = new mongoose.Types.ObjectId(decoded);
        if (sortParam === 'oldest') {
          query._id = { $gt: cursorId };
        } else {
          query._id = { $lt: cursorId };
        }
      } catch {
        res.status(400).json({ message: 'Invalid cursor.' });
        return;
      }
    }

    // Build sort — always by _id desc (required for cursor pagination to work)
    let sortObj: Record<string, 1 | -1> = { _id: -1 };
    if (sortParam === 'oldest') sortObj = { _id: 1 };
    else if (sortParam === 'popular') sortObj = { 'upvotes.length': -1, _id: -1 };

    const total = await CommunityPost.countDocuments(query);

    let postsQuery = CommunityPost.find(query)
      .select('-embedding')
      .populate('author', 'name')
      .populate('comments.author', 'name')
      .populate('comments.upvotes', 'name')
      .populate('comments.downvotes', 'name')
      .populate('comments.replies.upvotes', 'name')
      .populate('comments.replies.downvotes', 'name');

    // ── Sort by upvotes — cursor is incompatible with in-memory sort,
    // so when sorting by popularity we load the full upvote count for all posts
    // rather than using keyset pagination. This is acceptable since the community
    // post list is small enough that loading all posts at once is fast.
    if (sortParam === 'popular') {
      const allPosts = await CommunityPost.find(query)
        .select('-embedding')
        .populate('author', 'name')
        .populate('comments.author', 'name')
        .populate('comments.upvotes', 'name')
        .populate('comments.downvotes', 'name')
        .populate('comments.replies.upvotes', 'name')
        .populate('comments.replies.downvotes', 'name')
        .sort({ _id: -1 })
        .limit(200) // cap at 200 to keep query fast; not cursor-limited
        .exec();

      const sorted = allPosts.sort((a, b) => (b.upvotes?.length ?? 0) - (a.upvotes?.length ?? 0));
      const hasMore = allPosts.length > limit;
      const paged = hasMore ? sorted.slice(0, limit) : sorted;
      const nextCursor = hasMore && paged.length > 0
        ? Buffer.from(paged[paged.length - 1]._id.toString()).toString('base64')
        : null;

      res.json({
        posts: paged.map((p) => {
          const doc = p.toObject() as unknown as Record<string, unknown>;
          if (doc.timeTrialStatus === 'pending' && doc.timeTrialStartedAt) {
            const elapsed = (Date.now() - new Date(doc.timeTrialStartedAt as string).getTime()) / 3_600_000;
            doc.timeTrialHoursRemaining = Math.max(0, Math.round((16 - elapsed) * 10) / 10);
          } else {
            doc.timeTrialHoursRemaining = null;
          }
          return doc;
        }),
        total,
        limit,
        hasMore,
        nextCursor,
      });
      return;
    }

    const posts = await postsQuery
      .sort(sortObj)
      .limit(limit + 1);

    const hasMore = posts.length > limit;
    const results = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && results.length > 0
      ? Buffer.from(results[results.length - 1]._id.toString()).toString('base64')
      : null;

    res.json({
      posts: results.map((p) => {
        const doc = p.toObject() as unknown as Record<string, unknown>;
        // Compute remaining hours for pending Time-Trial posts
        if (doc.timeTrialStatus === 'pending' && doc.timeTrialStartedAt) {
          const elapsed = (Date.now() - new Date(doc.timeTrialStartedAt as string).getTime()) / 3_600_000;
          const TOTAL_HOURS = 16;
          doc.timeTrialHoursRemaining = Math.max(0, Math.round((TOTAL_HOURS - elapsed) * 10) / 10);
        } else {
          doc.timeTrialHoursRemaining = null;
        }
        return doc;
      }),
      total,
      limit,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/community/:id — Single post with nested comment tree
export const getPostById = async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await CommunityPost.findById(req.params.id)
      .select('-embedding')
      .populate('author', 'name')
      .populate('comments.author', 'name')
      .populate('comments.upvotes', 'name')
      .populate('comments.downvotes', 'name')
      .populate('comments.replies.upvotes', 'name')
      .populate('comments.replies.downvotes', 'name');

    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    // Attach nested replies tree to the response
    const postObj = post.toObject() as unknown as Record<string, unknown>;
    const comments = postObj.comments as any[];
    (postObj as any).comments = buildCommentTree(comments);

    // Add timeTrialHoursRemaining for pending Time-Trial posts
    if (postObj.timeTrialStatus === 'pending' && postObj.timeTrialStartedAt) {
      const elapsed = (Date.now() - new Date(postObj.timeTrialStartedAt as string).getTime()) / 3_600_000;
      const TOTAL_HOURS = 24;
      postObj.timeTrialHoursRemaining = Math.max(0, Math.round((TOTAL_HOURS - elapsed) * 10) / 10);
    } else {
      postObj.timeTrialHoursRemaining = null;
    }

    res.json(postObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community — Create a new post (protected)
export const createPost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { title, body, tags, attachments } = req.body as {
      title?: string;
      body?: string;
      tags?: string[];
      // Cloudinary attachment metadata. We never accept raw file blobs here
      // — the browser uploads to Cloudinary directly using /api/upload/sign,
      // then sends back just the publicId + url. We validate ownership of
      // the URL before saving.
      attachments?: Array<{ url?: string; publicId?: string; width?: number; height?: number; format?: string; bytes?: number }>;
    };

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
    const words = title.trim().split(' ').filter((w) => w.length >= 3);
    const isShortQuery = words.length < 3;
    const matches = await checkDuplicate(title, isShortQuery);
    if (matches.length > 0) {
      res.status(409).json({
        message: 'This question has already been asked by the universe. Try searching first.',
        matches,
        isDuplicate: true,
      });
      return;
    }

    // Generate vector embedding for semantic search
    let embedding: number[] | undefined;
    try {
      embedding = await generateEmbedding(`Question: ${title}. Description: ${body}`);
    } catch (err) {
      logger.warn(`Failed to generate embedding for post: ${(err as Error).message}`);
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
        const { getCloudinaryConfig } = await import('../utils/cloudinary.js');
        cfg = getCloudinaryConfig();
      } catch (e) {
        res.status(503).json({ message: (e as Error).message });
        return;
      }
      const { isOurCloudinaryAsset } = await import('../utils/cloudinary.js');
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

    // Create post linked to the authenticated user with a default 'unanswered' status
    const post = await CommunityPost.create({
      title: sanitizeHtml(title),
      body: sanitizeHtml(body),
      author: req.user!._id,
      status: 'unanswered',
      embedding,
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

    // Invalidate search cache so new post appears in community search immediately
    await invalidateCache().catch((err) => {
      logger.warn(`[post] Failed to invalidate cache on post creation: ${(err as Error).message}`);
    });

    res.status(201).json({ post });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/upvote — Toggle upvote
export const toggleUpvote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
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
        logger.warn(`[post] Failed to dynamically import promotionService: ${(err as Error).message}`);
        return { checkPromotionEligibility: null, startPromotionReview: null };
      });
      if (checkPromotionEligibility && startPromotionReview) {
        try {
          const eligible = await checkPromotionEligibility(updated ?? post);
          if (eligible && !(updated ?? post).promotionPendingAt) {
            await startPromotionReview(updated ?? post, userId);
            logger.info(`Post ${(updated ?? post)._id} crossed threshold, entered promotion review`);
          }
        } catch (e) {
          logger.warn(`Promotion eligibility check failed: ${(e as Error).message}`);
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
        logger.warn(`[post] Failed to dispatch upvote notification: ${(err as Error).message}`);
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
        logger.warn(`[post] Failed to create tea drop for upvote: ${(err as Error).message}`);
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
          logger.warn(`[post] Failed to auto-award badges to ${post.author}: ${(err as Error).message}`);
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
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/resolve — Mark a community post as resolved (admin/mod only)
// When resolved, the post author is notified via the notification system
export const resolvePost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const { answer } = req.body as { answer?: string };

    if (!answer || !answer.trim()) {
      res.status(400).json({ message: 'Answer text is required to resolve.' });
      return;
    }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    post.status = 'answered';
    post.answer = answer.trim();
    // Lifecycle: transition to 'answered' stage
    if (post.lifecycle?.status === 'open') {
      (post.lifecycle.statusHistory ??= []).push({
        from: 'open',
        to: 'answered',
        changedBy: req.user!._id,
        changedAt: new Date(),
        note: 'Post resolved / answer accepted',
      });
      post.lifecycle.status = 'answered';
    }
    // Clear any pending escalation — answering resolves the issue
    post.escalationStatus = 'none';
    post.escalatedAt = null;
    post.escalationReason = null;
    post.escalatedBy = null;
    // Set answerIsExpert flag when a moderator or admin resolves the post
    if (req.user?.role === 'moderator' || req.user?.role === 'admin' || req.user?.role === 'expert') {
      post.answerIsExpert = true;
    }
    await post.save();

    // Invalidate search cache so resolved answer reflects immediately
    await invalidateCache().catch((err) => {
      logger.warn(`[post] Failed to invalidate cache on post resolve: ${(err as Error).message}`);
    });

    // ── Check if post is now eligible for FAQ promotion ───────────────────────
    const { checkPromotionEligibility, startPromotionReview } = await import('../services/promotionService.js');
    try {
      const eligible = await checkPromotionEligibility(post);
      if (eligible) {
        await startPromotionReview(post, req.user!._id.toString());
        logger.info(`Resolved post ${post._id} entered promotion review`, { postId: post._id.toString() });
      }
    } catch (e) {
      logger.warn(`Promotion eligibility check failed for post ${post._id}: ${(e as Error).message}`);
    }

    // ── Notify post author ────────────────────────────────────────────────────
    dispatchNotification({
      recipientId: post.author,
      eventType: 'post_resolved',
      link: `/community?post=${post._id}`,
      title: 'Your question was resolved!',
    }).catch((err) => {
      logger.warn(`[post] Failed to dispatch post resolved notification: ${(err as Error).message}`);
    });

    // ── Tea drop: "your post was answered" ───────────────────────────────────
    // Only notify if the resolver is not the author themselves
    if (post.author.toString() !== req.user!._id.toString()) {
      createTeaDrop({
        userId: post.author,
        eventType: 'post_answered',
        postId: post._id as Types.ObjectId,
        postTitle: post.title,
        triggeredBy: req.user!._id,
        triggeredByName: req.user!.name,
        content: answer.trim().slice(0, 200),
      }).catch((err) => {
        logger.warn(`[post] Failed to create tea drop for post answer: ${(err as Error).message}`);
      });
    }

    res.json({ message: 'Post resolved.', post });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/request-expert — Request expert help on an unanswered post (protected)
// Notifies all moderators and admins
export const requestExpertHelp = async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    if (post.status === 'answered') {
      res.status(400).json({ message: 'This post is already answered.' });
      return;
    }

    // Find all moderators and admins
    const moderatorsAndAdmins = await User.find({
      role: { $in: ['moderator', 'admin', 'expert'] },
    }).select('_id');

    // Create notifications for each moderator/admin
    const notificationPromises = moderatorsAndAdmins.map((mod) =>
      import('./notificationController.js').then((n) =>
        n.createNotification({
          recipient: mod._id,
          type: 'expert_request',
          title: 'Expert help requested!',
          message: `A student is waiting for help: "${post.title}"`,
          link: `/community?post=${post._id}`,
        })
      ).catch((err) => {
        logger.warn(`[post] Failed to notify mod/admin ${mod._id} on expert request: ${(err as Error).message}`);
      })
    );

    await Promise.all(notificationPromises);

    res.json({ message: 'Expert help requested. Moderators have been notified.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// DELETE /api/community/:id — Delete a community post (Admin/Moderator only)
export const deletePost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
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
        logger.warn(`[post] Failed to create tea drop for deleted post: ${(err as Error).message}`);
      });
    }

    await CommunityPost.findByIdAndDelete(req.params.id);

    // Invalidate search cache so deleted post is removed from results
    await invalidateCache().catch((err) => {
      logger.warn(`[post] Failed to invalidate cache on post delete: ${(err as Error).message}`);
    });

    res.json({ message: 'Post deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/convert-to-faq — Admin-only: create FAQ from resolved community post
export const convertCommunityPostToFAQ = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    if (!post.answer || !post.answer.trim()) {
      res.status(400).json({ message: 'Post has no answer yet. Resolve it before converting to FAQ.' });
      return;
    }

    // Generate embedding for the new FAQ
    let embedding: number[] | undefined;
    try {
      embedding = await generateEmbedding(`Question: ${post.title}. Answer: ${post.answer}`);
    } catch (err) {
      logger.warn(`Failed to generate embedding for FAQ: ${(err as Error).message}`);
    }

    // Create the FAQ from the post's title (question) and answer
    const faq = await FAQ.create({
      question: post.title,
      answer: post.answer,
      category: 'Community',
      status: 'approved',
      embedding,
      createdBy: post.author,
    });

    // Mark the post as resolved
    post.status = 'answered';
    post.escalationStatus = 'none';
    post.escalatedAt = null;
    post.escalationReason = null;
    post.escalatedBy = null;
    post.answerIsExpert = true;
    await post.save();

    // Invalidate search cache so the new FAQ appears immediately
    await invalidateCache().catch((err) => {
      logger.warn(`[post] Failed to invalidate cache on FAQ conversion: ${(err as Error).message}`);
    });

    res.status(201).json({ message: 'FAQ created from community post.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
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
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/solved — Get recently resolved posts (for "Top Solved Today" widget)
export const getSolvedPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 4, 10);
    const hours = parseInt(req.query.hours as string) || 24;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const posts = await CommunityPost.find({
      status: 'answered',
      updatedAt: { $gte: since },
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .populate('author', 'name')
      .lean();

    res.json({ posts });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── DNA ────────────────────────────────────────────────────────────────────────
export const setPostDNA = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    // IDOR guard: only post author or admin/moderator can edit DNA
    const isAuthor = post.author.toString() === req.user._id.toString();
    const isPrivileged = ['admin', 'moderator'].includes(req.user.role);
    if (!isAuthor && !isPrivileged) {
      res.status(403).json({ message: 'Forbidden: only the post author or admin can edit DNA.' });
      return;
    }

    const { steps, tools, timeToComplete, difficulty } = req.body as {
      steps?: string[];
      tools?: string[];
      timeToComplete?: string;
      difficulty?: 'Easy' | 'Moderate' | 'Tricky';
    };

    post.dna = {
      steps: steps ?? post.dna?.steps ?? [],
      tools: tools ?? post.dna?.tools ?? [],
      timeToComplete: timeToComplete ?? post.dna?.timeToComplete ?? null,
      difficulty: difficulty ?? post.dna?.difficulty ?? null,
    };
    await post.save();

    res.json({ message: 'DNA updated.', dna: post.dna });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/community/:id/tags — Update tags on a community post (author or admin)
export const setPostTags = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    // IDOR guard: only post author or admin/moderator can edit tags
    const isAuthor = post.author.toString() === req.user._id.toString();
    const isPrivileged = ['admin', 'moderator'].includes(req.user.role);
    if (!isAuthor && !isPrivileged) {
      res.status(403).json({ message: 'Forbidden: only the post author or admin can edit tags.' });
      return;
    }

    const { tags } = req.body as { tags?: string[] };
    if (!Array.isArray(tags)) { res.status(400).json({ message: 'tags must be an array.' }); return; }

    post.tags = tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean);
    await post.save();

    res.json({ message: 'Tags updated.', tags: post.tags });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/object-to-promotion — Moderator blocks promotion of a post
export const objectToPromotion = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) { res.status(400).json({ message: 'Reason is required' }); return; }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    post.promotionObjectedBy = req.user._id;
    post.promotionObjectedAt = new Date();
    post.promotionObjectionReason = reason.trim();
    post.eligibleForPromotion = false;
    post.promotionPendingAt = null;
    await post.save();

    res.json({ message: 'Promotion objected. Post removed from promotion queue.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/confirm-spam — Admin: confirm spam report → -20 pts to author
// Per spec: "Spam Report Confirmed: -20 points"
export const confirmSpam = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }

    const offenderId = post.author?.toString();
    if (offenderId) {
      const offender = await User.findById(offenderId);
      if (offender) {
        offender.points = Math.max(0, offender.points - 20);
        offender.reputation = offender.points;
        offender.tier = calculateTier(offender.points);
        await offender.save();

        await ReputationLog.create({
          userId: new Types.ObjectId(offenderId),
          delta: -20,
          reason: `Spam report confirmed on post "${post.title.slice(0, 40)}"`,
          action: 'spam_confirmed',
          targetId: post._id as Types.ObjectId,
          targetType: 'community_post',
          awardedBy: req.user._id,
        });
      }
    }

    // Soft-clear: mark as resolved; keep the post for audit trail
    post.escalationStatus = 'resolved';
    post.escalationResolvedAt = new Date();
    post.escalationResolvedBy = req.user._id;
    post.escalationOutcome = 'spam_confirmed';
    post.lifecycle ??= { status: 'open', statusHistory: [] };
    post.lifecycle.statusHistory.push({
      from: post.lifecycle.status,
      to: post.lifecycle.status,
      changedBy: req.user._id,
      changedAt: new Date(),
      note: 'Spam confirmed — author penalized -20 pts',
    });
    await post.save();

    res.json({ message: 'Spam confirmed. -20 points deducted from author.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/hide — Admin/Mod: hide a post from public lists
// (Per spec moderation actions: Hide / Lock / Merge / Delete)
export const hidePost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { reason } = req.body as { reason?: string };
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    post.isHidden = true;
    post.hiddenAt = new Date();
    post.hiddenBy = req.user._id;
    post.hiddenReason = reason?.trim() || null;
    post.lifecycle ??= { status: 'open', statusHistory: [] };
    post.lifecycle.statusHistory.push({
      from: post.lifecycle.status, to: post.lifecycle.status,
      changedBy: req.user._id, changedAt: new Date(),
      note: `Hidden by admin${reason ? `: ${reason}` : ''}`,
    });
    await post.save();
    res.json({ message: 'Post hidden.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/unhide — Admin/Mod: reverse a hide
export const unhidePost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    post.isHidden = false;
    post.hiddenAt = null;
    post.hiddenBy = null;
    post.hiddenReason = null;
    await post.save();
    res.json({ message: 'Post unhidden.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/lock — Admin/Mod: lock a thread (no new comments)
export const lockPost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { reason } = req.body as { reason?: string };
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    post.isLocked = true;
    post.lockedAt = new Date();
    post.lockedBy = req.user._id;
    post.lockedReason = reason?.trim() || null;
    post.lifecycle ??= { status: 'open', statusHistory: [] };
    post.lifecycle.statusHistory.push({
      from: post.lifecycle.status, to: post.lifecycle.status,
      changedBy: req.user._id, changedAt: new Date(),
      note: `Locked by admin${reason ? `: ${reason}` : ''}`,
    });
    await post.save();
    res.json({ message: 'Post locked.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/unlock — Admin/Mod: reverse a lock
export const unlockPost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) { res.status(404).json({ message: 'Post not found.' }); return; }
    post.isLocked = false;
    post.lockedAt = null;
    post.lockedBy = null;
    post.lockedReason = null;
    await post.save();
    res.json({ message: 'Post unlocked.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};
