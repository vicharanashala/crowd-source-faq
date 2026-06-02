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
import { detectDuplicatesWithAI } from '../utils/duplicateDetector.js';
import FreshReviewVote from '../models/FreshReviewVote.js';

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
    const query: Record<string, unknown> = {};
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
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        cursorId = new mongoose.Types.ObjectId(decoded);
        query._id = { $lt: cursorId };
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
    const { title, body, tags } = req.body as { title?: string; body?: string; tags?: string[] };

    // Validate inputs
    if (!title || !body) {
      res.status(400).json({ message: 'Title and body are required.' });
      return;
    }

    // Normalize tags: array of trimmed non-empty strings, max 10
    const safeTags: string[] = Array.isArray(tags)
      ? tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 10)
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
      console.warn('Failed to generate embedding for post:', (err as Error).message);
    }

    // Create post linked to the authenticated user with a default 'unanswered' status
    const post = await CommunityPost.create({
      title: sanitizeHtml(title),
      body: sanitizeHtml(body),
      author: req.user!._id,
      status: 'unanswered',
      embedding,
      tags: safeTags,
    });

    // Hydrate the author field before sending back the response
    await post.populate('author', 'name');

    // Invalidate search cache so new post appears in community search immediately
    await invalidateCache().catch(() => {});

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
      const { checkPromotionEligibility, startPromotionReview } = await import('../services/promotionService.js').catch(() => ({ checkPromotionEligibility: null, startPromotionReview: null }));
      if (checkPromotionEligibility && startPromotionReview) {
        try {
          const eligible = await checkPromotionEligibility(updated ?? post);
          if (eligible && !(updated ?? post).promotionPendingAt) {
            await startPromotionReview(updated ?? post);
            logger.info(`Post ${(updated ?? post)._id} crossed threshold, entered promotion review`);
          }
        } catch (e) {
          logger.warn(`Promotion eligibility check failed: ${(e as Error).message}`);
        }
      }
    }

    // Notify post author on new upvote only (self-votes and vote retractions send nothing)
    const isSelfVote = post.author.toString() === userId;
    if (!isSelfVote && !alreadyUpvoted) {
      dispatchNotification({
        recipientId: post.author,
        eventType: 'upvote',
        link: `/community?post=${post._id}`,
      }).catch(() => {});
      // Tea drop: your post was upvoted
      createTeaDrop({
        userId: post.author,
        eventType: 'post_upvoted',
        postId: post._id as Types.ObjectId,
        postTitle: post.title,
        triggeredBy: req.user!._id,
        triggeredByName: req.user!.name,
      }).catch(() => {});
      // Award +5 points to post author for receiving upvote (atomic, race-safe)
      const updatedAuthor = await User.findByIdAndUpdate(
        post.author,
        { $inc: { points: 5, reputation: 5 } },
        { new: true }
      );
      if (updatedAuthor) {
        updatedAuthor.tier = calculateTier(updatedAuthor.points);
        await updatedAuthor.save();
        // Auto-award tier badges if threshold crossed
        autoAwardBadges(post.author.toString()).catch(() => {});
      }
      await ReputationLog.create({
        userId: post.author,
        delta: 5,
        reason: `Upvote received on post "${post.title.slice(0, 40)}"`,
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
    await invalidateCache().catch(() => {});

    // ── Check if post is now eligible for FAQ promotion ───────────────────────
    const { checkPromotionEligibility, startPromotionReview } = await import('../services/promotionService.js');
    try {
      const eligible = await checkPromotionEligibility(post);
      if (eligible) {
        await startPromotionReview(post);
        logger.info(`Resolved post ${post._id} entered promotion review`, { postId: post._id.toString() });
      }
    } catch (e) {
      logger.warn(`Promotion eligibility check failed for post ${post._id}: ${(e as Error).message}`);
    }

    // ── Notify post author ────────────────────────────────────────────────────
    dispatchNotification({
      recipientId: post.author,
      eventType: 'accepted_answer',
      link: `/community?post=${post._id}`,
      title: 'Your question was resolved!',
    }).catch(() => {});

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
      }).catch(() => {});
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
      ).catch(() => {})
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
      }).catch(() => {});
    }

    await CommunityPost.findByIdAndDelete(req.params.id);

    // Invalidate search cache so deleted post is removed from results
    await invalidateCache().catch(() => {});

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
      console.warn('Failed to generate embedding for FAQ:', (err as Error).message);
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
    await invalidateCache().catch(() => {});

    res.status(201).json({ message: 'FAQ created from community post.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/community/:id/report — Report a community post
export const reportPost = async (req: Request<{ id: string }, {}, { reason: string }>, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      res.status(400).json({ message: 'Reason is required.' });
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

// ─── Duplicate Detection ──────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DUPLICATE_VECTOR_THRESHOLD = 0.85;    // cosine similarity minimum
const DUPLICATE_TEXT_THRESHOLD = 0.50;      // TF-IDF cosine minimum
const DUPLICATE_SHORT_QUERY_THRESHOLD = 0.90;

// Stop words — highly common English + programming terms that cause noise
const STOP_WORDS = new Set([
  'i', 'a', 'an', 'the', 'is', 'it', 'to', 'of', 'in', 'for', 'on', 'with',
  'my', 'we', 'you', 'do', 'can', 'be', 'are', 'as', 'at', 'by', 'if', 'or',
  'not', 'how', 'what', 'when', 'where', 'why', 'will', 'get', 'got', 'have',
  'has', 'had', 'do', 'does', 'did', 'this', 'that', 'these', 'those', 'from',
  'up', 'out', 'about', 'who', 'which', 'but', 'they', 'he', 'she', 'his', 'her',
  'all', 'some', 'any', 'would', 'could', 'should', 'there', 'here', 'their',
  'them', 'been', 'being', 'am', 'was', 'were', 'so', 'no', 'yes', 'may',
  'please', 'thanks', 'thank', 'hi', 'hello', 'hey', 'dear', 'sorry',
  // common programming/generic terms that add noise in this domain
  'access', 'server', 'servers', 'production', 'production', 'access',
  'use', 'using', 'used', 'want', 'need', 'like', 'just', 'also', 'one',
  'two', 'new', 'want', 'know', 'work', 'working', 'help', 'question',
]);

// Terms that should never be counted as "significant" for matching
const GENERIC_TERMS = new Set([
  'offer', 'letter', 'access', 'server', 'production', 'question',
  'help', 'issue', 'problem', 'error', 'please', 'thanks', 'urgent',
]);

export interface DuplicateMatch {
  _id: string;
  title: string;
  question?: string;
  answer?: string;
  body?: string;
  score: number;
  source: 'faq' | 'community' | 'knowledge';
  sourceTitle?: string;
  confidence?: number;
  reason?: string;
  matchType: 'vector' | 'text' | 'ai';
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function normalizeWord(w: string): string {
  return w.replace(/(ing|s|ed|es|e)$/, '').toLowerCase();
}

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w) && !GENERIC_TERMS.has(w));
}

function wordOverlap(queryWords: string[], targetWords: string[]): { overlap: number; total: number; jaccard: number } {
  const qSet = new Set(queryWords.map(normalizeWord));
  const tSet = new Set(targetWords.map(normalizeWord));
  const qNorm = new Set([...qSet].filter((w) => !GENERIC_TERMS.has(w)));
  const tNorm = new Set([...tSet].filter((w) => !GENERIC_TERMS.has(w)));

  let overlap = 0;
  for (const w of qNorm) {
    if (tNorm.has(w)) overlap++;
  }
  const total = Math.min(qNorm.size, tNorm.size);
  const jaccard = total > 0 ? overlap / total : 0;
  return { overlap, total, jaccard };
}

function textMatchScore(query: string, target: string): number {
  const qWords = significantWords(query);
  const tWords = significantWords(target);
  if (qWords.length === 0 || tWords.length === 0) return 0;
  const { overlap, jaccard } = wordOverlap(qWords, tWords);
  if (overlap < 2) return 0; // require at least 2 significant shared words
  // Combine Jaccard with overlap ratio
  const qSet = new Set(qWords);
  const tSet = new Set(tWords);
  const overlapRatio = [...qSet].filter((w) => tSet.has(normalizeWord(w))).length / qSet.size;
  return Math.min(1, (jaccard * 0.5 + overlapRatio * 0.5));
}

// ─── checkDuplicate ───────────────────────────────────────────────────────────

export async function checkDuplicate(query: string, isShortQuery: boolean): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = [];
  const lower = query.toLowerCase().trim();

  // ── 1. FAQ hybrid search ──────────────────────────────────────────────────
  try {
    const queryEmbedding = await generateEmbedding(query).catch(() => null);
    const vectorThreshold = isShortQuery ? DUPLICATE_SHORT_QUERY_THRESHOLD : DUPLICATE_VECTOR_THRESHOLD;

    const [vectorResults, textResults] = await Promise.all([
      // Vector search — only run if embedding succeeded
      queryEmbedding
        ? FAQ.find({ embedding: { $exists: true, $ne: null }, status: 'approved' })
            .select('_id question answer category embedding')
            .lean()
            .then((faqs) => {
              const scored = faqs
                .map((f) => {
                  const dot = f.embedding!.reduce(
                    (s: number, v: number, i: number) => s + v * queryEmbedding[i],
                    0
                  );
                  return { faq: f, similarity: dot };
                })
                .filter((x) => x.similarity >= vectorThreshold)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 5);
              return scored.map((x) => ({
                _id: x.faq._id.toString(),
                title: x.faq.question,
                question: x.faq.question,
                answer: x.faq.answer,
                category: x.faq.category,
                score: x.similarity,
                matchType: 'vector' as const,
              }));
            })
        : Promise.resolve([]),

      // Pure text match — TF-IDF Jaccard
      FAQ.find({ status: 'approved' })
        .select('_id question answer category')
        .lean()
        .then((faqs) => {
          const scored = faqs
            .map((f) => {
              const score = textMatchScore(lower, f.question + ' ' + (f.answer ?? ''));
              return { faq: f, score };
            })
            .filter((x) => x.score >= DUPLICATE_TEXT_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          return scored.map((x) => ({
            _id: x.faq._id.toString(),
            title: x.faq.question,
            question: x.faq.question,
            answer: x.faq.answer,
            category: x.faq.category,
            score: x.score,
            matchType: 'text' as const,
          }));
        }),
    ]);

    const seenFaq = new Set<string>();
    for (const r of [...vectorResults, ...textResults]) {
      if (!seenFaq.has(r._id)) {
        seenFaq.add(r._id);
        matches.push({ ...r, source: 'faq' });
      }
    }
  } catch (err) {
    console.warn('FAQ duplicate check failed:', (err as Error).message);
  }

  // ── 2. Community post keyword search ───────────────────────────────────────
  try {
    const qWords = significantWords(lower);
    if (qWords.length > 0) {
      const textResults = await CommunityPost.find({
        $or: [
          { title: { $regex: escapeRegex(lower), $options: 'i' } },
          ...qWords.slice(0, 8).map((w) => ({ title: { $regex: `\\b${escapeRegex(w)}\\b`, $options: 'i' } })),
        ],
      })
        .select('_id title body status')
        .lean()
        .then((posts) => {
          const scored = posts
            .map((p) => {
              const score = textMatchScore(lower, p.title + ' ' + (p.body ?? ''));
              return { post: p, score };
            })
            .filter((x) => x.score >= DUPLICATE_TEXT_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          return scored.map((x) => ({
            _id: x.post._id.toString(),
            title: x.post.title,
            body: x.post.body,
            status: x.post.status,
            score: x.score,
            matchType: 'text' as const,
          }));
        });

      const seenComm = new Set<string>();
      for (const r of textResults) {
        if (!seenComm.has(r._id)) {
          seenComm.add(r._id);
          matches.push({ ...r, source: 'community' });
        }
      }
    }
  } catch (err) {
    console.warn('Community duplicate check failed:', (err as Error).message);
  }

  // Sort by score, return top 5
  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

// POST /api/community/check-duplicate
export const checkDuplicateController = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const { query } = req.body as { query?: string };
    if (!query?.trim()) {
      res.json({ isDuplicate: false, matches: [] });
      return;
    }

    const q = query.trim();

    // ── Primary: AI-powered semantic duplicate detection (FAQ + community) ─
    let matches = await detectDuplicatesWithAI(q);

    // ── Also search knowledge base ──────────────────────────────────────────
    try {
      const { searchKnowledge } = await import('../services/knowledgeBase.js');
      const knowledgeMatches = await searchKnowledge(q, 3);
      for (const km of knowledgeMatches) {
        matches.push({
          _id: km._id,
          title: km.question,
          question: km.question,
          answer: km.answer,
          source: 'knowledge' as const,
          sourceTitle: km.sourceTitle,
          score: km.score,
          confidence: km.confidence,
          reason: km.reason ?? `From ${km.source}: ${km.answer}`,
          matchType: 'ai' as const,
        });
      }
    } catch (err) {
      // Non-fatal: knowledge search is best-effort
      console.warn('[checkDuplicate] knowledge search failed:', (err as Error).message);
    }

    // ── Fallback: keyword heuristics if AI + knowledge return nothing ───────
    if (matches.length === 0) {
      const words = q.split(' ').filter((w) => w.length >= 3);
      const isShortQuery = words.length < 3;
      matches = await checkDuplicate(q, isShortQuery);
    }

    // Sort combined results by score, dedupe by _id
    const seen = new Set<string>();
    const deduped: typeof matches = [];
    for (const m of matches.sort((a, b) => b.score - a.score)) {
      if (!seen.has(m._id)) { seen.add(m._id); deduped.push(m); }
    }

    res.json({
      isDuplicate: deduped.length > 0,
      matches: deduped.slice(0, 5),
      matchCount: deduped.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Duplicate check failed', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/community/:id/dna — Set/update Solution DNA on a post (author or admin)
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

    post.tags = tags.map((t: string) => t.trim()).filter(Boolean);
    await post.save();

    res.json({ message: 'Tags updated.', tags: post.tags });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};
