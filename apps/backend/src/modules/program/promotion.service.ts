/**
 * promotionService.ts
 *
 * 7-stage knowledge lifecycle pipeline.
 * Handles community → FAQ auto-promotion, admin upgrades, and moderator objections.
 *
 * Stage gates:
 *   OPEN (open) → ANSWERED (answered) → COMMUNITY_ACCEPTED (community_accepted)
 *     → AI_VALIDATED (ai_validated) → ADMIN_ACCEPTED (admin_accepted)
 *     → CONVERTED_TO_FAQ (converted_to_faq)
 *
 * See: context/knowledge-lifecycle-design.md
 */

import mongoose, { Types } from 'mongoose';
import CommunityPost from '../community/community-post.model.js';
import FAQ from '../faq/faq.model.js';
import User from '../auth/user.model.js';
import { generateEmbedding } from '../../utils/ai/embeddings.js';
import { invalidateCache } from '../../utils/http/cache.js';
import { invalidatePublicCaches } from '../faq/public-faq.controller.js';
import { logger } from '../../utils/http/logger.js';
import type { Request, Response } from 'express';
import type { LifecycleStatus } from '../community/community-post.model.js';

// ─── Config ──────────────────────────────────────────────────────────────────
const _UPVOTE_THRESHOLD = parseInt(process.env['FAQ_PROMOTION_UPVOTE_THRESHOLD'] ?? '10');
const REVIEW_WINDOW_HOURS = parseInt(process.env['FAQ_PROMOTION_REVIEW_WINDOW_HOURS'] ?? '24');

// Stage 4 Community-Validation thresholds (per spec)
// Quality score 0-100, must clear this for promotion to be eligible
const MIN_QUALITY_SCORE = parseInt(process.env['FAQ_PROMOTION_MIN_QUALITY'] ?? '60');
// Engagement score 0+, must clear this for promotion to be eligible
const MIN_ENGAGEMENT_SCORE = parseInt(process.env['FAQ_PROMOTION_MIN_ENGAGEMENT'] ?? '10');

// ─── Config ──────────────────────────────────────────────────────────────────

/** Push a lifecycle statusHistory entry */
function pushAudit(
  post: any,
  to: LifecycleStatus,
  changedBy: string,
  note?: string
): void {
  if (!post.lifecycle) {
    post.lifecycle = { status: 'open', statusHistory: [] };
  }
  const from = post.lifecycle.status ?? 'open';
  (post.lifecycle.statusHistory ??= []).push({
    from,
    to,
    changedBy: new Types.ObjectId(changedBy),
    changedAt: new Date(),
    note: note ?? null,
  });
  post.lifecycle.status = to;
}

// ─── Stage 4 Quality + Engagement Scores ─────────────────────────────────────

/**
 * Answer quality score (0-100). Replaces the spec's vague "minimum answer
 * quality score reached" with a concrete, explainable rubric.
 *
 * Components (each 0-20):
 *   1. Length sweet spot: 50-2000 chars → 20; 20-50 or 2000-4000 → 10
 *   2. Has a verified/accepted answer
 *   3. Author was privileged (admin/mod/expert)
 *   4. Accepted answer received at least one upvote
 *   5. Has structured DNA (steps + tools) for reproducibility
 */
export function computeAnswerQuality(post: any): number {
  let score = 0;
  const answer = (post.answer ?? '').trim();
  const len = answer.length;

  // 1. Length
  if (len >= 50 && len <= 2000) score += 20;
  else if (len >= 20 && len < 50) score += 10;
  else if (len > 2000 && len <= 4000) score += 10;

  // 2. Accepted answer present
  if (answer) score += 20;

  // 3. Author privilege — only meaningful if answer is from a privileged user
  if (post.answerIsExpert) score += 20;

  // 4. Upvotes on the answer
  const answerUpvotes = post.comments?.find?.((c: any) =>
    c._id?.toString?.() === post.promotionCandidateCommentId?.toString?.()
  )?.upvotes?.length ?? 0;
  if (answerUpvotes >= 1) score += 20;

  // 5. DNA present (steps or tools)
  const dna = post.dna;
  if (dna && ((dna.steps?.length ?? 0) > 0 || (dna.tools?.length ?? 0) > 0)) score += 20;

  return Math.min(100, score);
}

/**
 * Community engagement score (0+, no upper cap).
 * Combines discussion depth (comments, distinct authors) with signal strength
 * (upvotes). A "minimum community engagement" gate per spec.
 */
export function computeCommunityEngagement(post: any): number {
  const commentCount = post.comments?.length ?? 0;
  const upvoteCount = post.upvotes?.length ?? 0;

  // Distinct commenter IDs (top-level + nested replies)
  const distinctAuthors = new Set<string>();
  (post.comments ?? []).forEach((c: any) => {
    if (c.author) distinctAuthors.add(c.author.toString());
    (c.replies ?? []).forEach((r: any) => {
      if (r.author) distinctAuthors.add(r.author.toString());
    });
  });

  return commentCount * 1 + upvoteCount * 2 + distinctAuthors.size * 5;
}

// ─── Eligibility Check ────────────────────────────────────────────────────────

/**
 * A post is eligible for promotion review when ALL of the following hold
 * (per spec Stage 4 — "Community Validation"):
 *   - lifecycle.status === 'answered'
 *   - Has an accepted answer
 *   - Answer quality score >= MIN_QUALITY_SCORE
 *   - Community engagement score >= MIN_ENGAGEMENT_SCORE
 *   - No unresolved reports
 *   - Not objected by a moderator
 *   - Not already pending/promoted
 */
export async function checkPromotionEligibility(post: any): Promise<boolean> {
  if (!post) return false;
  const lc = post.lifecycle?.status ?? 'open';
  if (lc !== 'answered') return false;
  if (!post.answer || !post.answer.trim()) return false;
  if ((post.reports ?? []).length > 0) return false;
  if (post.promotionObjectedBy) return false;
  if (post.eligibleForPromotion && post.promotionPendingAt) return false;

  // Stage 4 gates
  const quality = computeAnswerQuality(post);
  const engagement = computeCommunityEngagement(post);
  if (quality < MIN_QUALITY_SCORE) return false;
  if (engagement < MIN_ENGAGEMENT_SCORE) return false;

  return true;
}

// ─── Start Review Window ───────────────────────────────────────────────────────

/**
 * Mark post as entering the community review window.
 * Sets lifecycle.status = 'community_accepted' and starts the clock.
 * Idempotent — safe to call multiple times.
 */
export async function startPromotionReview(
  post: any,
  changedBy?: string
): Promise<void> {
  if (post.eligibleForPromotion && post.promotionPendingAt) return;

  post.eligibleForPromotion = true;
  post.promotionPendingAt = new Date();
  post.lifecycle ??= { status: 'open', statusHistory: [] };

  const wasAlreadyAccepted = post.lifecycle.status === 'community_accepted';
  if (!wasAlreadyAccepted) {
    pushAudit(
      post,
      'community_accepted',
      changedBy ?? 'system',
      `Entered ${REVIEW_WINDOW_HOURS}h community review window (${post.upvotes?.length ?? 0} upvotes)`
    );
    post.lifecycle.communityAcceptedAt = new Date();
  }

  await post.save();
  logger.info(`Post ${post._id} entered promotion review window`, {
    postId: post._id.toString(),
    upvotes: post.upvotes?.length ?? 0,
  });
}

// ─── Auto-promote to Community Approved ─────────────────────────────────────

/**
 * Promote a post to Community Approved FAQ.
 * Called by the nightly runPromotionCycle when the review window has elapsed.
 * Awards +15 to question author.
 */
export async function promoteToCommunityApproved(
  post: any,
  promotedBy?: string
): Promise<any> {
  // Idempotent: skip if FAQ already exists for this post
  const existing = await FAQ.findOne({ sourceCommunityPostId: post._id });
  if (existing) return existing;

  let embedding: number[] | undefined;
  try {
    embedding = await generateEmbedding(`Question: ${post.title}. Answer: ${post.answer}`);
  } catch (err) {
    logger.warn(`Failed to generate embedding for promotion: ${(err as Error).message}`);
  }

  const now = new Date();
  const faq = await FAQ.create({
    question: post.title,
    answer: post.answer,
    batchId: post.batchId,
    category: 'Community',
    status: 'approved',
    embedding,
    createdBy: post.author,
    trustLevel: 'medium',        // medium = community_approved
    sourceType: 'community_promotion',
    sourceCommunityPostId: post._id,
    promotedAt: now,
    objectionStatus: 'none',
    sourceCommentId: post.promotionCandidateCommentId ?? null,
    promotionMetadata: {
      upvotesAtPromotion: post.upvotes?.length ?? 0,
      helpfulVotesAtPromotion: null,
      communityAnswerAuthorId: post.answerAuthorId ?? null,
      promotedBy: promotedBy ? new Types.ObjectId(promotedBy) : null,
      objectionReason: null,
      objectionRaisedBy: null,
      objectionRaisedAt: null,
    },
  });

  // Advance lifecycle to ai_validated (auto-AI runs after community approval)
  pushAudit(post, 'ai_validated', promotedBy ?? 'system', 'Community review window elapsed — AI validation queued');
  post.lifecycle.aiValidatedAt = new Date();

  // Award +15 to question author for question → FAQ conversion
  await awardPromotionReputation(
    post.author?.toString() ?? '',
    'faq_converted',
    15,
    faq._id as Types.ObjectId
  );

  await post.save();
  logger.info(`Post ${post._id} promoted to Community Approved FAQ ${faq._id}`, {
    faqId: faq._id.toString(),
    postId: post._id.toString(),
  });

  await invalidateCache();
  invalidatePublicCaches();
  return faq;
}

// ─── Admin Upgrades ──────────────────────────────────────────────────────────

/**
 * Promote FAQ from 'medium' (community_approved) to 'expert' (admin_approved).
 * Awards +25 to answer author (if different from question author) and +10 bonus
 * to question author.
 */
export async function promoteToAdminApproved(
  faqId: string,
  adminUserId: string
): Promise<void> {
  const faq = await FAQ.findById(faqId);
  if (!faq) throw new Error('FAQ not found');
  if (faq.trustLevel === 'expert') throw new Error('FAQ is already at expert trust level');

  const _oldLevel = faq.trustLevel;
  faq.trustLevel = 'expert'; // expert = admin_approved
  if (!faq.promotionMetadata) faq.promotionMetadata = {} as any;
  const meta = faq.promotionMetadata!;
  meta.promotedBy = new Types.ObjectId(adminUserId);
  await faq.save();

  const questionAuthorId = faq.createdBy?.toString() ?? '';
  const answerAuthorId = meta.communityAnswerAuthorId?.toString() ?? '';

  // +25 to answer author for answer being used in FAQ
  if (answerAuthorId && answerAuthorId !== questionAuthorId) {
    await awardPromotionReputation(answerAuthorId, 'faq_answer_used', 25, faq._id as Types.ObjectId);
  }

  // +10 admin approval bonus to question author
  if (questionAuthorId) {
    await awardPromotionReputation(
      questionAuthorId,
      'admin_approval_bonus',
      10,
      faq._id as Types.ObjectId
    );
  }

  // Advance community post lifecycle
  const sourcePost = await CommunityPost.findById(faq.sourceCommunityPostId);
  if (sourcePost) {
    pushAudit(sourcePost, 'admin_accepted', adminUserId, `Admin approved FAQ ${faqId}`);
    sourcePost.lifecycle.adminAcceptedAt = new Date();
    await sourcePost.save();
  }

  logger.info(`FAQ ${faqId} promoted to admin_approved by ${adminUserId}`);
  await invalidateCache();
  invalidatePublicCaches();
}

/**
 * Promote FAQ from 'expert' (admin_approved) to 'high' (official).
 */
export async function promoteToOfficial(
  faqId: string,
  adminUserId: string
): Promise<void> {
  const faq = await FAQ.findById(faqId);
  if (!faq) throw new Error('FAQ not found');

  faq.trustLevel = 'high'; // high = official
  if (!faq.promotionMetadata) faq.promotionMetadata = {} as any;
  (faq.promotionMetadata as any).promotedBy = new Types.ObjectId(adminUserId);
  await faq.save();

  // Mark community post as fully converted
  const sourcePost = await CommunityPost.findById(faq.sourceCommunityPostId);
  if (sourcePost) {
    pushAudit(sourcePost, 'converted_to_faq', adminUserId, `FAQ ${faqId} is now official`);
    sourcePost.lifecycle.convertedToFaqAt = new Date();
    await sourcePost.save();
  }

  logger.info(`FAQ ${faqId} promoted to official by ${adminUserId}`);
  await invalidateCache();
  invalidatePublicCaches();
}

// ─── Moderator Objection ──────────────────────────────────────────────────────

/**
 * Block promotion — moderator objects to a community post entering the pipeline.
 */
export async function objectToPromotion(
  postId: string,
  moderatorId: string,
  reason: string
): Promise<void> {
  const post = await CommunityPost.findById(postId);
  if (!post) throw new Error('Post not found');

  post.promotionObjectedBy = new Types.ObjectId(moderatorId);
  post.promotionObjectedAt = new Date();
  post.promotionObjectionReason = reason;
  post.eligibleForPromotion = false;
  post.promotionPendingAt = null;
  await post.save();

  logger.warn(`Promotion objected for post ${postId} by ${moderatorId}: ${reason}`);
}

/**
 * Moderator objects to an existing FAQ that was promoted from community.
 */
export async function objectToFAQPromotion(
  faqId: string,
  moderatorId: string,
  reason: string
): Promise<void> {
  const faq = await FAQ.findById(faqId);
  if (!faq) throw new Error('FAQ not found');

  faq.objectionStatus = 'objected';
  if (!faq.promotionMetadata) faq.promotionMetadata = {} as any;
  const meta = faq.promotionMetadata!;
  meta.objectionRaisedBy = new Types.ObjectId(moderatorId);
  meta.objectionRaisedAt = new Date();
  meta.objectionReason = reason;
  await faq.save();
  await invalidateCache();
  invalidatePublicCaches();

  logger.warn(`FAQ promotion objected for FAQ ${faqId} by ${moderatorId}: ${reason}`);
}

// ─── Reputation ───────────────────────────────────────────────────────────────

/**
 * Award (or deduct) promotion-related reputation points.
 * Logs to ReputationLog and triggers auto-badge check.
 */
async function awardPromotionReputation(
  userId: string,
  action: string,
  points: number,
  targetId?: Types.ObjectId
): Promise<void> {
  if (!userId) return;
  try {
    const user = await User.findById(userId);
    if (!user) return;
    user.points = Math.max(0, user.points + points);
    user.reputation = user.points;

    // Increment denormalized counters for leaderboard trust score
    if (action === 'faq_converted') {
      user.faqContributions = (user.faqContributions ?? 0) + 1;
    } else if (action === 'faq_answer_used') {
      user.faqContributions = (user.faqContributions ?? 0) + 1;
    }

    await user.save();

    const ReputationLog = (await import('../moderation/reputation-log.model.js')).default;
    await ReputationLog.create({
      userId: new Types.ObjectId(userId),
      delta: points,
      reason: `FAQ promotion: ${action}`,
      action: action as any,
      targetId: targetId ?? null,
      targetType: 'faq_promotion',
    });

    const { autoCheckBadges } = await import('../moderation/reputation.controller.js');
    await autoCheckBadges(userId);
  } catch (e) {
    logger.error(`Failed to award promotion reputation: ${(e as Error).message}`);
  }
}

// ─── Spurti Points (SP) — Golden Ticket currency (v1.65, additive) ──────
//
// SP is a separate, spendable currency for the Golden Ticket feature.
// It lives in `User.sp` (distinct from `User.points`, which drives the
// tier system) and is recorded in `ReputationLog` with one of the new
// `sp_*` action values. The two systems NEVER share balance updates —
// `points` is reputation, `sp` is wallet. Awarding / spending /
// refunding all go through these three helpers so the audit trail is
// always consistent and the wallet can never go negative.

const SP_DELTA_RE = /^-?\d+$/;

/**
 * Award SP to a user. Positive `amount` credits the wallet; the only
 * legitimate use of a negative amount from this helper is for manual
 * admin corrections (audit-logged with the supplied `action` so the
 * reversal is traceable). Throws on non-integer / negative-resulting
 * amounts so we never silently let the balance go below zero.
 */
export async function awardSpurtiPoints(
  userId: string,
  amount: number,
  action: 'sp_awarded' | 'sp_spent' | 'sp_refunded' | 'sp_deducted',
  reason: string,
  targetId?: Types.ObjectId
): Promise<{ newBalance: number }> {
  if (!userId) throw new Error('awardSpurtiPoints: userId required');
  if (!Number.isFinite(amount) || !SP_DELTA_RE.test(String(amount))) {
    throw new Error('awardSpurtiPoints: amount must be an integer');
  }
  const amt = Math.trunc(amount);
  if (amt === 0) throw new Error('awardSpurtiPoints: amount cannot be zero');

  const user = await User.findById(userId);
  if (!user) throw new Error('awardSpurtiPoints: user not found');

  // Guard the BALANCE — must be checked against the prospective total,
  // NOT the clamped result. If we did `Math.max(0, ...) < (user.sp + amt)`
  // a deduction that would push the wallet below zero would silently
  // clamp to 0 because `Math.max(0, -15) = 0` and `0 < -15` is false.
  // The fix: compute the prospective total first, reject if it would
  // go negative, then store it.
  const prospective = (user.sp ?? 0) + amt;
  if (prospective < 0) {
    throw new Error('awardSpurtiPoints: insufficient Spurti Points');
  }
  user.sp = prospective;
  await user.save();

  const ReputationLog = (await import('../moderation/reputation-log.model.js')).default;
  await ReputationLog.create({
    userId: new Types.ObjectId(userId),
    delta: amt,
    reason,
    action: action as any,
    targetId: targetId ?? null,
    targetType: 'spurti_point_ledger',
  });

  return { newBalance: prospective };
}

/** Spend SP — credits the wallet by `-amount`. Throws on insufficient balance. */
export async function spendSpurtiPoints(
  userId: string,
  amount: number,
  reason: string,
  targetId?: Types.ObjectId
): Promise<{ newBalance: number }> {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new Error('spendSpurtiPoints: amount must be a positive integer');
  }
  return awardSpurtiPoints(userId, -amount, 'sp_spent', reason, targetId);
}

/** Refund SP — credits the wallet by `+amount`. Used when a Golden ticket
 *  is rolled back / rejected after the SP was already debited. */
export async function refundSpurtiPoints(
  userId: string,
  amount: number,
  reason: string,
  targetId?: Types.ObjectId
): Promise<{ newBalance: number }> {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new Error('refundSpurtiPoints: amount must be a positive integer');
  }
  return awardSpurtiPoints(userId, amount, 'sp_refunded', reason, targetId);
}

// ─── Admin Controllers ─────────────────────────────────────────────────────────

/** GET /api/admin/community-promotions — paginated queue of promoted posts */
export async function getCommunityPendingFAQs(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'))));

    const [faqs, total] = await Promise.all([
      FAQ.find({ sourceType: 'community_promotion' })
        .populate('sourceCommunityPostId', 'title status upvotes lifecycle')
        .sort({ promotedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      FAQ.countDocuments({ sourceType: 'community_promotion' }),
    ]);

    res.json({ faqs, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
}

/**
 * PATCH /api/admin/community-promotions/:id — approve (expert/high), reject, or edit
 * Body: { action: 'approve'|'reject'|'edit', targetLevel?, edits? }
 */
export async function promoteFAQ(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { action, targetLevel, edits } = req.body as {
      action?: string;
      targetLevel?: string;
      edits?: { question?: string; answer?: string; category?: string; tags?: string[] };
    };

    if (action === 'reject') {
      const faq = await FAQ.findById(id);
      if (faq) {
        faq.objectionStatus = 'objected';
        await faq.save();
        await invalidateCache();
        invalidatePublicCaches();
      }
      res.json({ message: 'FAQ rejected.' });
      return;
    }

    if (action === 'edit' && edits) {
      const faq = await FAQ.findById(id);
      if (!faq) { res.status(404).json({ message: 'FAQ not found' }); return; }
      if (edits.question) faq.question = edits.question;
      if (edits.answer) faq.answer = edits.answer;
      if (edits.category) faq.category = edits.category;
      if (edits.tags) faq.tags = edits.tags;
      await faq.save();
      await invalidateCache();
      invalidatePublicCaches();
      res.json({ message: 'FAQ updated.', faq });
      return;
    }

    // Default: approve
    if (!['expert', 'high'].includes(targetLevel ?? '')) {
      res.status(400).json({ message: 'targetLevel must be expert or high' });
      return;
    }

    if (targetLevel === 'expert') {
      await promoteToAdminApproved(id, req.user!._id.toString());
    } else {
      await promoteToOfficial(id, req.user!._id.toString());
    }

    res.json({ message: `FAQ promoted to ${targetLevel === 'expert' ? 'admin_approved' : 'official'}` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
}

/** POST /api/admin/community-promotions/:id/object — record moderator objection */
export async function objectToFAQ(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { reason } = req.body as { reason?: string };

    if (!reason?.trim()) {
      res.status(400).json({ message: 'Reason is required' });
      return;
    }

    await objectToFAQPromotion(id, req.user!._id.toString(), reason.trim());
    res.json({ message: 'Objection recorded.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
}

// ─── Admin Promotion Queue ────────────────────────────────────────────────────

/**
 * GET /api/admin/community-promotions/queue
 *
 * Returns community posts in the admin review pipeline:
 * - lifecycle.status = 'ai_validated' (ready for admin decision)
 * - lifecycle.status = 'community_accepted' with duplicateOf set (needs merge decision)
 *
 * Returns posts with full AI output, source FAQ metadata, and related info.
 */
export async function getPromotionQueue(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'))));

    // 1. Fetch eligible community posts
    const posts = await CommunityPost.find({
      'lifecycle.status': { $in: ['ai_validated', 'community_accepted'] },
      'lifecycle.communityAcceptedAt': { $ne: null },
    })
      .populate('author', 'name')
      .select('-embedding');

    const postIds = posts.map(p => p._id);
    const existingFaqs = await FAQ.find({ sourceCommunityPostId: { $in: postIds } })
      .select('_id sourceCommunityPostId trustLevel')
      .lean();
    const faqMap = new Map(existingFaqs.map(f => [f.sourceCommunityPostId?.toString() ?? '', f]));

    const mappedPosts = posts.map(p => {
      const postObj = p.toObject() as unknown as Record<string, unknown>;
      const existingFaq = faqMap.get(p._id.toString());
      return {
        ...postObj,
        existingFaq: existingFaq ?? null,
        status: p.lifecycle?.status,
        aiGeneratedFaq: p.lifecycle?.aiGeneratedFaq ?? null,
        communityAcceptedAt: p.lifecycle?.communityAcceptedAt,
        aiValidatedAt: p.lifecycle?.aiValidatedAt,
        statusHistory: p.lifecycle?.statusHistory ?? [],
        upvotes: p.upvotes?.length ?? 0,
        commentCount: p.comments?.length ?? 0,
        isReportedFAQ: false,
      };
    });

    // 2. Fetch reported/flagged FAQs that need review
    const reportedFaqs = await FAQ.find({
      reviewStatus: { $in: ['pending_review', 'update_requested'] },
    })
      .populate('createdBy', 'name')
      .select('-embedding')
      .lean();

    const mappedFaqs = reportedFaqs.map((f: any) => ({
      _id: f._id.toString(),
      title: f.question,
      body: f.flagReason || (f.reports && f.reports.length > 0 ? f.reports.map((r: any) => r.reason).join('\n') : 'Flagged as outdated.'),
      answer: f.answer,
      tags: f.tags || [],
      author: f.createdBy ? { name: f.createdBy.name } : { name: 'System' },
      upvotes: f.helpfulVotes ?? 0,
      commentCount: f.reports ? f.reports.length : 0,
      communityAcceptedAt: f.flaggedAt || f.updatedAt || f.createdAt,
      lifecycle: {
        status: f.reviewStatus === 'update_requested' ? 'update_requested' : 'pending_review',
        communityAcceptedAt: f.flaggedAt || f.updatedAt || f.createdAt,
        statusHistory: [],
      },
      aiGeneratedFaq: null,
      existingFaq: {
        _id: f._id.toString(),
        trustLevel: f.trustLevel || 'high',
      },
      isReportedFAQ: true,
      reports: f.reports || [],
      promotedAt: f.promotedAt,
    }));

    // 3. Combine and sort
    const combinedQueue = [...mappedPosts, ...mappedFaqs];
    combinedQueue.sort((a, b) => {
      const dateA = new Date(a.communityAcceptedAt || 0).getTime();
      const dateB = new Date(b.communityAcceptedAt || 0).getTime();
      return dateB - dateA;
    });

    const total = combinedQueue.length;
    const startIndex = (page - 1) * limit;
    const paginatedQueue = combinedQueue.slice(startIndex, startIndex + limit);

    res.json({ queue: paginatedQueue, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
}

// ─── Idempotent Promotion Scheduler ──────────────────────────────────────────

/**
 * Nightly job — promotes posts whose review window has elapsed.
 * Only acts on posts with lifecycle.status = 'community_accepted' and no objection.
 */
export async function runPromotionCycle(): Promise<void> {
  try {
    const reviewCutoff = new Date(Date.now() - REVIEW_WINDOW_HOURS * 3600 * 1000);

    const eligiblePosts = await CommunityPost.find({
      eligibleForPromotion: true,
      promotionPendingAt: { $ne: null, $lte: reviewCutoff },
      promotionObjectedBy: null,
      'lifecycle.status': 'community_accepted',
    }).limit(50);

    let promoted = 0;
    for (const post of eligiblePosts) {
      try {
        await promoteToCommunityApproved(post);
        promoted++;
      } catch (e) {
        logger.error(`Promotion cycle failed for post ${post._id}: ${(e as Error).message}`);
      }
    }

    logger.info(`Promotion cycle complete. Promoted ${promoted}/${eligiblePosts.length} posts.`);
  } catch (e) {
    logger.error(`Promotion cycle error: ${(e as Error).message}`);
  }
}

// ─── Trust badge helper (for frontend) ───────────────────────────────────────

export function getTrustBadgeInfo(level?: string): { label: string; class: string } | null {
  if (!level) return null;
  const map: Record<string, { label: string; class: string }> = {
    high:        { label: 'Official', class: 'bg-stone-100 text-stone-600 border-stone-200' },
    expert:      { label: 'Admin Approved', class: 'bg-blue-50 text-blue-700 border-blue-200' },
    medium:      { label: 'Community Approved', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    low:         { label: 'Community', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  };
  return map[level] ?? null;
}

// ─── Lifecycle status chip helper (for frontend) ─────────────────────────────

export function getLifecycleChipInfo(
  status?: LifecycleStatus
): { label: string; class: string } | null {
  if (!status) return null;
  const map: Record<LifecycleStatus, { label: string; class: string }> = {
    open:               { label: 'Open', class: 'bg-gray-100 text-gray-600 border-gray-200' },
    answered:           { label: 'Answered', class: 'bg-blue-50 text-blue-700 border-blue-200' },
    community_accepted: { label: 'Community Approved', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    ai_validated:       { label: 'AI Validated', class: 'bg-purple-50 text-purple-700 border-purple-200' },
    admin_accepted:     { label: 'Admin Approved', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    converted_to_faq:   { label: 'Official FAQ', class: 'bg-stone-100 text-stone-700 border-stone-300' },
  };
  return map[status] ?? null;
}