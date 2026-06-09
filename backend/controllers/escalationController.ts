/**
 * escalationController.ts
 *
 * Handles the unanswered-question auto-escalation system.
 *
 * Flow:
 *  1. runUnansweredEscalationCheck() is called periodically by the scheduler
 *     (started in server.ts). It finds all 'unanswered' posts where
 *     escalationStatus === 'none' and createdAt is older than
 *     UNANSWERED_ESCALATION_DAYS, then marks them as 'escalated'.
 *  2. Answering a post (resolvePost) clears escalationStatus back to 'none'
 *     so an answered post is never escalated.
 *  3. Admins review escalated posts via GET /admin/escalated-posts and can
 *     resolve (mark as answered by the mod) or dismiss them.
 *
 * All admin actions are idempotent — running the escalation check on already-
 * escalated or already-answered posts is a no-op.
 */
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { logAction } from './adminController.js';
import { escalationsTotal } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

// ─── Config ──────────────────────────────────────────────────────────────────
// Threshold in days after which an unanswered post is auto-escalated.
const UNANSWERED_ESCALATION_DAYS = parseInt(
  process.env['UNANSWERED_ESCALATION_DAYS'] || '7'
);

// Time-Trial: threshold in hours after which an unanswered post enters the challenge window.
const TIME_TRIAL_HOURS = parseInt(process.env['TIME_TRIAL_HOURS'] || '16');

// ─── Scheduler ───────────────────────────────────────────────────────────────
// Interval handle stored so server.ts can clear it on shutdown.
let escalationIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the auto-escalation scheduler.
 * Calls runUnansweredEscalationCheck() every `UNANSWERED_ESCALATION_CHECK_MINUTES`
 * minutes. Safe to call multiple times — previous interval is always cleared first.
 */
export function startEscalationScheduler(): void {
  const CHECK_INTERVAL_MINUTES = parseInt(
    process.env['UNANSWERED_ESCALATION_CHECK_MINUTES'] || '60'
  );
  const ms = CHECK_INTERVAL_MINUTES * 60 * 1000;

  if (escalationIntervalHandle) {
    clearInterval(escalationIntervalHandle);
  }

  escalationIntervalHandle = setInterval(() => {
    // Run fire-and-forget — errors are logged inside the functions.
    runUnansweredEscalationCheck().catch((err) => {
      logger.error(`[escalation] Scheduler error: ${(err as Error).message}`);
    });
    runTimeTrialCheck().catch((err) => {
      logger.error(`[time-trial] Scheduler error: ${(err as Error).message}`);
    });
  }, ms);

  logger.info(
    `[escalation] Scheduler started — checking every ${CHECK_INTERVAL_MINUTES}m ` +
    `for posts unanswered > ${UNANSWERED_ESCALATION_DAYS}d`
  );
}

/** Stop the scheduler (call on server shutdown). */
export function stopEscalationScheduler(): void {
  if (escalationIntervalHandle) {
    clearInterval(escalationIntervalHandle);
    escalationIntervalHandle = null;
    logger.info('[escalation] Scheduler stopped.');
  }
}

/**
 * Core escalation logic — idempotent.
 *
 * Finds all posts that:
 *   - status === 'unanswered'
 *   - escalationStatus === 'none'
 *   - createdAt older than UNANSWERED_ESCALATION_DAYS
 *
 * Marks each as 'escalated', logs ModerationLog, and notifies all admins/mods.
 *
 * Can be called manually or by the scheduler. Safe to run repeatedly — already
 * escalated posts have escalationStatus !== 'none' so they are skipped.
 */
export async function runUnansweredEscalationCheck(): Promise<void> {
  const cutoff = new Date(Date.now() - UNANSWERED_ESCALATION_DAYS * 24 * 60 * 60 * 1000);

  // Find all eligible posts in one query
  const eligible = await CommunityPost.find({
    status: 'unanswered',
    escalationStatus: 'none',
    createdAt: { $lt: cutoff },
  }).select('_id title author createdAt');

  if (eligible.length === 0) return;

  const adminOrModRole = { role: { $in: ['admin', 'moderator'] } };
  const adminsAndMods = await User.find(adminOrModRole).select('_id').lean();

  // Batch-notify in parallel with the post updates
  const notifications = adminsAndMods.map((mod) =>
    Notification.create({
      recipient: mod._id,
      type: 'expert_request' as any, // reuse existing type — fits the escalation alert use case
      title: 'Unanswered question escalated',
      message: `${eligible.length} community question${eligible.length === 1 ? '' : 's'} ha${eligible.length === 1 ? 's' : 've'} been unanswered for ${UNANSWERED_ESCALATION_DAYS}+ days and need moderator attention.`,
      link: '/admin/moderation?tab=escalated',
    }).catch((err) => {
      logger.warn(`[escalation] Failed to notify mod/admin ${mod._id} on unanswered question escalation: ${(err as Error).message}`);
    }) // non-critical
  );

  await Promise.all([
    CommunityPost.updateMany(
      { _id: { $in: eligible.map((p) => p._id) } },
      {
        escalationStatus: 'escalated',
        escalatedAt: new Date(),
        escalationReason: `Unanswered for ${UNANSWERED_ESCALATION_DAYS}+ days (auto-escalated)`,
      }
    ),
    ...notifications,
  ]);

  escalationsTotal.inc({ count: eligible.length });

  logger.info(
    `[escalation] Auto-escalated ${eligible.length} unanswered post${eligible.length === 1 ? '' : 's'}.`
  );
}

// ─── Time-Trial scheduler ─────────────────────────────────────────────────────

/**
 * runTimeTrialCheck — activates the 16-hour challenge window for unanswered posts.
 *
 * Finds all posts where:
 *   - status === 'unanswered'
 *   - timeTrialStatus === 'none'
 *   - createdAt is older than TIME_TRIAL_HOURS
 *
 * Activates them by setting timeTrialStatus = 'pending' and recording timeTrialStartedAt.
 * This marks them as live Time-Trial challenges.
 *
 * Idempotent: already 'pending' or 'awarded' posts have timeTrialStatus !== 'none'
 * so they are skipped.
 */
export async function runTimeTrialCheck(): Promise<void> {
  const cutoff = new Date(Date.now() - TIME_TRIAL_HOURS * 60 * 60 * 1000);

  const eligible = await CommunityPost.find({
    status: 'unanswered',
    timeTrialStatus: 'none',
    createdAt: { $lt: cutoff },
  }).select('_id title');

  if (eligible.length === 0) return;

  await CommunityPost.updateMany(
    { _id: { $in: eligible.map((p) => p._id) } },
    {
      timeTrialStatus: 'pending',
      timeTrialStartedAt: new Date(),
    }
  );

  logger.info(
    `[time-trial] Activated ${eligible.length} Time-Trial post${eligible.length === 1 ? '' : 's'}.`
  );
}

// ─── Admin endpoints ─────────────────────────────────────────────────────────

/**
 * GET /api/admin/community/escalated-posts
 * Returns all posts with escalationStatus === 'escalated', newest first.
 * Includes author name and comment count for context.
 */
export const getEscalatedPosts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const posts = await CommunityPost.find({ escalationStatus: 'escalated' })
      .select(
        '_id title body status author createdAt escalatedAt escalationReason comments'
      )
      .populate('author', 'name email')
      .sort({ escalatedAt: -1 })
      .lean();

    const result = posts.map((p) => ({
      _id: p._id,
      title: p.title,
      body: p.body,
      status: p.status,
      author: (p.author as any)?.name ?? 'Unknown',
      authorEmail: (p.author as any)?.email,
      commentCount: (p.comments as any)?.length ?? 0,
      createdAt: (p as any).createdAt as Date,
      escalatedAt: p.escalatedAt,
      escalationReason: p.escalationReason,
    }));

    res.json({ posts: result, total: result.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

/**
 * POST /api/admin/community/escalated-posts/:id/resolve
 * Admin/moderator marks an escalated post as resolved.
 * This sets escalationStatus to 'resolved' and clears the escalation flag.
 * Does NOT change the post's status field.
 *
 * Body: { outcome: string }  — e.g. "Answered in thread", "Converted to FAQ #123"
 */
export const resolveEscalatedPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { outcome } = req.body as { outcome?: string };
    const adminId = req.user!._id.toString();

    const post = await CommunityPost.findById(id);
    if (!post) { res.status(404).json({ message: 'Post not found' }); return; }
    if (post.escalationStatus !== 'escalated') {
      res.status(409).json({ message: 'Post is not escalated' }); return;
    }

    post.escalationStatus = 'resolved';
    post.escalationResolvedAt = new Date();
    post.escalationResolvedBy = new Types.ObjectId(adminId);
    post.escalationOutcome = outcome ?? 'Resolved by moderator';
    await post.save();

    await logAction(adminId!, 'resolve_escalated_post', id, 'community_post', outcome ?? 'Resolved');

    res.json({
      postId: id,
      escalationStatus: 'resolved',
      message: 'Escalation resolved.',
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

/**
 * POST /api/admin/community/escalated-posts/:id/dismiss
 * Admin/moderator dismisses an escalated post.
 * The post remains 'unanswered' but escalationStatus becomes 'dismissed'.
 * No further auto-escalation will occur for this post.
 *
 * Body: { reason: string }
 */
export const dismissEscalatedPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };
    const adminId = req.user!._id.toString();

    const post = await CommunityPost.findById(id);
    if (!post) { res.status(404).json({ message: 'Post not found' }); return; }
    if (post.escalationStatus !== 'escalated') {
      res.status(409).json({ message: 'Post is not escalated' }); return;
    }

    post.escalationStatus = 'dismissed';
    post.escalationResolvedAt = new Date();
    post.escalationResolvedBy = new Types.ObjectId(adminId);
    post.escalationOutcome = reason ?? 'Dismissed by moderator';
    await post.save();

    await logAction(adminId!, 'dismiss_escalated_post', id, 'community_post', reason ?? 'Dismissed');

    res.json({
      postId: id,
      escalationStatus: 'dismissed',
      message: 'Escalation dismissed.',
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

/**
 * GET /api/admin/community/escalation-history
 * Paginated history of resolved/dismissed escalations for audit.
 */
export const getEscalationHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')));
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      CommunityPost.find({
        escalationStatus: { $in: ['resolved', 'dismissed'] },
      })
        .select('_id title author escalationStatus escalatedAt escalationResolvedAt escalationResolvedBy escalationOutcome createdAt')
        .populate('author', 'name')
        .populate('escalationResolvedBy', 'name')
        .sort({ escalationResolvedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityPost.countDocuments({ escalationStatus: { $in: ['resolved', 'dismissed'] } }),
    ]);

    const items = posts.map((p) => ({
      _id: p._id,
      title: p.title,
      author: (p.author as any)?.name ?? 'Unknown',
      escalationStatus: p.escalationStatus,
      escalatedAt: p.escalatedAt,
      escalationReason: p.escalationReason,
      escalationResolvedAt: p.escalationResolvedAt,
      escalationResolvedBy: (p.escalationResolvedBy as any)?.name ?? 'Unknown',
      escalationOutcome: p.escalationOutcome,
    }));

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};