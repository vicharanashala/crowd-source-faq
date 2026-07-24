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
import CommunityPost from './community-post.model.js';
import FAQ from '../faq/faq.model.js';
import User, { calculateTier } from '../auth/user.model.js';
import { invalidateCache } from '../../utils/http/cache.js';
import { dispatchNotification } from '../../utils/http/notificationDispatcher.js';
import { createTeaDrop } from '../notification/tea-notification.controller.js';
import ReputationLog from '../moderation/reputation-log.model.js';
import { autoAwardBadges } from '../moderation/reputation.controller.js';
import { sanitizeHtml } from '../../utils/http/sanitize.js';
// v1.68 — L1: communityLog replaces the bare `logger` so all
// post/comment/upvote log lines carry the [community] tag.
import { communityLog } from '../../utils/http/logger.js';
import { evaluateDuplicates, isBlockingMatch } from './post-duplicate.controller.js';
import { assertCanCreateContent } from '../../utils/banUtils.js';
import { checkIdempotency, storeIdempotency } from '../../utils/http/idempotency.js';

// POST /api/community — Create a new post (protected)
export const createPost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  // v1.66 — Golden-ban gate. 72h ban blocks new posts (questions, answers).
  if (!assertCanCreateContent(req.user, res)) return;

  // Idempotency-Key (RFC 7231-ish): if the client provides a key, the
  // same key within a 60s window returns the original response instead
  // of creating a duplicate. Frontend generates a UUID per form-mount
  // and sends it on submit. The check happens AFTER auth + ban gate
  // so an unauthenticated request can't poison another user's cache.
  // Read the Idempotency-Key header defensively — Express's req.headers
  // is the standard access path but unit-test stubs may provide neither
  // a method nor a property. The nullish fallback lets the controller
  // work in both the real Express runtime and bare test fixtures.
  const rawHeader = (req as { headers?: Record<string, string | string[] | undefined> }).headers?.['idempotency-key'];
  const idempotencyKey = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader ?? '').toString().trim() || null;
  if (idempotencyKey) {
    const cached = checkIdempotency(idempotencyKey, 'createPost', req.user._id.toString());
    if (cached) { res.status(cached.status).json(cached.body); return; }
  }
  try {
    const { title, body, tags, attachments } = req.body as {
      title?: string;
      body?: string;
      tags?: string[];
      // Cloudinary attachment metadata. We never accept raw file blobs here
      // — the browser uploads to Cloudinary directly using /api/upload/sign,
      // then sends back just the publicId + url. We validate ownership of
      // the URL before saving.
      attachments?: Array<{ url?: string; publicId?: string; gcsUri?: string; objectPath?: string; width?: number; height?: number; format?: string; bytes?: number }>;
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

    if (safeTags.length === 0) {
      res.status(400).json({ message: 'At least one category tag is required.' });
      return;
    }

    // ── Server-side duplicate check ──────────────────────────────────────────
    // Uses the SAME AI-aware evaluator as the frontend's /check-duplicate
    // pre-check, so server enforcement is consistent with what the user
    // saw in the dialog. Only HIGH-CONFIDENCE FAQ matches (score >= 0.85)
    // block submission; community/knowledge matches and AI returns below the
    // FAQ-block threshold are informational only — the user already saw the
    // suggestion banner and chose to proceed. Failing open on AI errors
    // (detectDuplicatesWithAI returns [] on throw) keeps the server usable
    // when the AI provider is down.
    const matches = await evaluateDuplicates(
      title,
      req.programContext?.batchId ?? null,
    );
    if (matches.some(isBlockingMatch)) {
      res.status(409).json({
        message: 'This question has already been asked by the universe. Try searching first.',
        matches,
        isDuplicate: true,
      });
      return;
    }

    // ── Same-author duplicate guard ──────────────────────────────────────────
    // The AI / FAQ blocker catches "this has been asked before, see answer"
    // but doesn't catch "you just posted this ten minutes ago, stop spamming".
    // Compare on normalised title (case-folded, whitespace collapsed) so
    // trivial re-submissions ("Hi" vs "hi.") still match. Block creation
    // with the SAME 409 shape the UI already knows how to surface.
    if (req.user?._id) {
      const normalisedTitle = title.toLowerCase().replace(/\s+/g, ' ').trim();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await CommunityPost.findOne({
        author: req.user._id,
        status: { $ne: 'spam_confirmed' },
        createdAt: { $gte: since },
      })
        .select('_id title createdAt status')
        .lean();
      if (recent) {
        const recentNorm = (recent.title ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (recentNorm === normalisedTitle) {
          res.status(409).json({
            message: 'You posted the same question in the last 24 hours. Check your earlier post and add a comment instead of creating a duplicate.',
            isDuplicate: true,
            matches: [{
              _id: recent._id.toString(),
              title: recent.title,
              score: 1.0,
              source: 'community' as const,
              matchType: 'text' as const,
              reason: 'Same author posted this title within 24 hours.',
            }],
          });
          return;
        }
      }
    }

    // Skip live embedding on create. The weekly batch cron (startup.ts
    // embedding-warm) and Atlas vector index handle embeddings offline;
    // live calls here would just produce zero-vectors (since no embedding
    // infra is configured in production). Retrieval is text-based and
    // doesn't need them. See apps/backend/src/utils/ai/embeddings.ts.

    // Validate attachments: cap at 4, drop malformed entries, ensure URLs
    // are on our Cloudinary account. Cloudinary's free plan caps the asset
    // count + size, so we hard-limit per post to keep the feed reasonable.
    const MAX_ATTACHMENTS = 4;
    const safeAttachments: Array<{ url: string; publicId?: string; gcsUri?: string; objectPath?: string; width?: number; height?: number; format?: string; bytes?: number }> = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      if (attachments.length > MAX_ATTACHMENTS) {
        res.status(400).json({ message: `At most ${MAX_ATTACHMENTS} image attachments per post.` });
        return;
      }
      // Validate that every URL is on our storage. v1.71: support both
      // legacy Cloudinary URLs (require publicId) and new GCS URLs
      // (require gcsUri + objectPath). Lazy import — most posts have no
      // attachments and shouldn't pay the import cost.
      let cloudCfg: { cloudName: string } | null = null;
      try {
        const { getCloudinaryConfig } = await import('../../integrations/cloudinary/cloudinary.js');
        cloudCfg = getCloudinaryConfig();
      } catch {
        // Cloudinary not configured — only GCS attachments will validate.
        cloudCfg = null;
      }
      const { isOurCloudinaryAsset } = await import('../../integrations/cloudinary/cloudinary.js');
      const { isOurGcsAsset } = await import('../../integrations/gcs/gcs.js');
      for (const a of attachments) {
        if (!a?.url) continue;
        if (a.url.includes('res.cloudinary.com/')) {
          if (!cloudCfg || !a.publicId) {
            res.status(400).json({ message: 'Cloudinary attachment requires publicId.' });
            return;
          }
          if (!isOurCloudinaryAsset(a.url, cloudCfg.cloudName)) {
            res.status(400).json({ message: 'attachment.url must be a valid Cloudinary URL.' });
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
        } else {
          // GCS branch
          if (!a.gcsUri || !a.objectPath) {
            res.status(400).json({ message: 'GCS attachment requires gcsUri and objectPath.' });
            return;
          }
          if (!isOurGcsAsset(a.url)) {
            res.status(400).json({ message: 'attachment.url must be a valid GCS asset URL.' });
            return;
          }
          safeAttachments.push({
            url: a.url,
            gcsUri: a.gcsUri,
            objectPath: a.objectPath,
            width: a.width,
            height: a.height,
            format: a.format,
            bytes: a.bytes,
          });
        }
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

    if (!resolvedBatchId) {
      res.status(400).json({ message: 'A valid program context (batchId) is required.' });
      return;
    }

    // Create post linked to the authenticated user with a default 'unanswered' status
    const post = await CommunityPost.create({
      title: sanitizeHtml(title),
      body: sanitizeHtml(body),
      author: req.user!._id,
      status: 'unanswered',
      // embedding omitted — assigned offline by the weekly batch cron
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

    // ── Fire-and-forget auto-answer (latency fix: 24h cron → seconds) ─────
    // Same pattern as comment.controller.ts addComment hook: dynamic
    // import + .catch(). The user gets their 201 back immediately;
    // the AI attempt runs in the background and persists its own
    // aiContext / aiAnswerStatus writes asynchronously. The 24h cron
    // stays in place as a safety net for any post that slips through
    // (e.g. processPost threw an exception, the doc was created via
    // a different path, etc.).
    const { processPost } = await import('../../services/autoAnswer.js');
    processPost(post._id).catch((err: Error) => {
      communityLog.warn(
        `[post] autoAnswer processPost failed for ${String(post._id)}: ${err.message}`,
      );
    });

    // Invalidate search cache so new post appears in community search immediately
    await invalidateCache().catch((err) => {
      communityLog.warn(`[post] Failed to invalidate cache on post creation: ${(err as Error).message}`);
    });

    res.status(201).json({ post });
    // Store the response under the idempotency key (if any) so a
    // retried request within 60s gets the same payload verbatim. Done
    // AFTER the success response so the in-memory write doesn't add
    // measurable latency to the user's request.
    if (idempotencyKey) {
      storeIdempotency(idempotencyKey, 'createPost', req.user._id.toString(), 201, { post });
    }
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
    // M4-5 (MEDIUM) fix: previously this read `alreadyUpvoted` from
    // the loaded doc BEFORE the atomic update. Two concurrent upvotes
    // by the same user could both read `alreadyUpvoted === false`,
    // then both call `$addToSet` (idempotent — no double-vote) and
    // both read `alreadyUpvoted === false` afterward, so downstream
    // decisions like "did this user just upvote?" got the wrong
    // answer. Now: rely on the post-update `updated.upvotes` to
    // determine the *current* membership of the user, not the pre-update
    // snapshot. `$addToSet` is idempotent so the membership is
    // always correct after the atomic write.
    const wasUpvotedBefore = post.upvotes.map((u: Types.ObjectId) => u.toString()).includes(userId);

    // Use atomic $pull/$addToSet to avoid race-condition duplicates
    const updated = await CommunityPost.findOneAndUpdate(
      { _id: post._id },
      wasUpvotedBefore
        ? { $pull: { upvotes: new Types.ObjectId(userId) } }
        : { $addToSet: { upvotes: new Types.ObjectId(userId) } },
      { returnDocument: 'after' }
    );

    const newUpvotes = updated?.upvotes?.length ?? 0;
    // S5-M5-style fresh-state check: derive `isUpvotedByMe` from
    // the post-update doc, not the pre-update snapshot. Eliminates
    // the brief read-then-write race where two concurrent upvotes
    // could both think the user was "just upvoting" and both fire
    // the post-promotion side-effect.
    const isUpvotedByMe = !!updated?.upvotes?.some((u: Types.ObjectId) => u.toString() === userId);

    // Check if this upvote just crossed the promotion threshold
    if (wasUpvotedBefore !== isUpvotedByMe) {
      const { checkPromotionEligibility, startPromotionReview } = await import('../program/promotion.service.js').catch((err) => {
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
    // M4-5: use post-update `wasUpvotedBefore` / `isUpvotedByMe` to
    // pick the right branch. `wasUpvotedBefore === true &&
    // !isUpvotedByMe` means the user just retracted an upvote
    // (rollback the +2 author points). The opposite means the
    // user just upvoted (dispatch the notification + add +2).
    if (!isSelfVote && wasUpvotedBefore && !isUpvotedByMe) {
      await User.findByIdAndUpdate(post.author, { $inc: { points: -2, reputation: -2 } });
      await ReputationLog.deleteMany({
        userId: post.author,
        targetId: post._id as Types.ObjectId,
        targetType: 'community_post',
        action: 'upvote_received',
      });
    }
    if (!isSelfVote && !wasUpvotedBefore && isUpvotedByMe) {
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
        batchId: post.batchId ?? null,
        delta: 2,
        reason: `Question upvote received: "${post.title.slice(0, 40)}"`,
        action: 'upvote_received',
        targetId: post._id as Types.ObjectId,
        targetType: 'community_post',
      });
    }

    res.json({ upvotes: newUpvotes, upvotedByMe: isUpvotedByMe });
  } catch (error) {
    communityLog.error(`[post] toggleUpvote failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/community/:id/report — Report a community post
// Reason must be one of the spec's closed set: spam | duplicate | abuse | other
const VALID_REPORT_REASONS = ['spam', 'duplicate', 'abuse', 'other'] as const;
type ReportReason = typeof VALID_REPORT_REASONS[number];

export const reportPost = async (req: Request<{ id: string }, Record<string, never>, { reason: string }>, res: Response): Promise<void> => {
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

    const isAuthor = post.author.toString() === req.user!._id.toString();
    const isPrivileged = ['admin', 'moderator'].includes(req.user!.role);
    if (!isAuthor && !isPrivileged) {
      res.status(403).json({ message: 'Forbidden: you cannot delete this post.' });
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

// PATCH /api/community/:id — Update a community post (Author or Admin/Moderator only)
export const updatePost = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: 'Not authorized' }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    const programContext = req.programContext;
    if (programContext) {
      const postBatch = (post as { batchId?: Types.ObjectId | string | null }).batchId;
      if (!postBatch || postBatch.toString() !== programContext.batchId) {
        res.status(404).json({ message: 'Post not found.' });
        return;
      }
    }

    const isAuthor = post.author.toString() === req.user!._id.toString();
    const isPrivileged = ['admin', 'moderator'].includes(req.user!.role);
    if (!isAuthor && !isPrivileged) {
      res.status(403).json({ message: 'Forbidden: you cannot edit this post.' });
      return;
    }

    if (post.isLocked && !isPrivileged) {
      res.status(403).json({ message: 'This post is locked. Edits are disabled.' });
      return;
    }

    const { title, body, tags } = req.body as {
      title?: string;
      body?: string;
      tags?: string[];
    };

    if (title !== undefined) {
      if (!title.trim()) {
        res.status(400).json({ message: 'Title is required.' });
        return;
      }
      post.title = sanitizeHtml(title.trim());
    }

    if (body !== undefined) {
      if (!body.trim()) {
        res.status(400).json({ message: 'Body is required.' });
        return;
      }
      post.body = sanitizeHtml(body.trim());
    }

    if (tags !== undefined) {
      post.tags = Array.isArray(tags)
        ? tags.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 3)
        : [];
    }

    // Embedding recalculation skipped — handled by weekly batch cron
    // (see startup.ts embedding-warm). Saves one API call per edit.

    await post.save();
    await post.populate('author', 'name');

    // Invalidate search cache so updated post reflects immediately
    await invalidateCache().catch((err) => {
      communityLog.warn(`[post] Failed to invalidate cache on post edit: ${(err as Error).message}`);
    });

    res.json({ post });
  } catch (error) {
    communityLog.error(`[post] updatePost failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

