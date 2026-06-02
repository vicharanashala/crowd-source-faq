/**
 * promotionService.ts
 *
 * Trust-based FAQ promotion system.
 * Handles community → FAQ auto-promotion, admin upgrades, and moderator objections.
 */

import mongoose, { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import FAQ from '../models/FAQ.js';
import User from '../models/User.js';
import { generateEmbedding } from '../utils/embeddings.js';
import { invalidateCache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import type { Request, Response } from 'express';

// ─── Config ──────────────────────────────────────────────────────────────────
const UPVOTE_THRESHOLD = parseInt(process.env['FAQ_PROMOTION_UPVOTE_THRESHOLD'] ?? '10');
const REVIEW_WINDOW_HOURS = parseInt(process.env['FAQ_PROMOTION_REVIEW_WINDOW_HOURS'] ?? '24');

// ─── Eligibility Check ────────────────────────────────────────────────────────

export async function checkPromotionEligibility(post: any): Promise<boolean> {
  if (post.status !== 'answered') return false;
  if (!post.answer || !post.answer.trim()) return false;
  if ((post.reports ?? []).length > 0) return false;
  if (post.promotionObjectedBy) return false;
  if (post.eligibleForPromotion && post.promotionPendingAt) return false; // already pending or promoted
  const upvoteCount = post.upvotes?.length ?? 0;
  return upvoteCount >= UPVOTE_THRESHOLD;
}

// ─── Start Review Window ───────────────────────────────────────────────────────

export async function startPromotionReview(post: any): Promise<void> {
  if (post.eligibleForPromotion && post.promotionPendingAt) return; // already pending
  post.eligibleForPromotion = true;
  post.promotionPendingAt = new Date();
  await post.save();
  logger.info(`Post ${post._id} entered promotion review window`, { postId: post._id.toString() });
}

// ─── Auto-promote to Community Approved ─────────────────────────────────────

export async function promoteToCommunityApproved(post: any): Promise<any> {
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
  const reviewWindowEndsAt = new Date(now.getTime() + REVIEW_WINDOW_HOURS * 3600 * 1000);

  const faq = await FAQ.create({
    question: post.title,
    answer: post.answer,
    category: 'Community',
    status: 'approved',
    embedding,
    createdBy: post.author,
    trustLevel: 'medium', // 'medium' = community_approved equivalent
    sourceType: 'community_promotion',
    sourceCommunityPostId: post._id,
    promotedAt: now,
    objectionStatus: 'none',
    promotionMetadata: {
      upvotesAtPromotion: post.upvotes?.length ?? 0,
      helpfulVotesAtPromotion: null,
      communityAnswerAuthorId: null,
      promotedBy: null,
      objectionReason: null,
      objectionRaisedBy: null,
      objectionRaisedAt: null,
    },
  });

  // Award reputation to the question author
  await awardPromotionReputation(post.author?.toString() ?? '', 'faq_promotion_community', 50);

  logger.info(`Post ${post._id} promoted to Community Approved FAQ ${faq._id}`, {
    faqId: faq._id.toString(),
    postId: post._id.toString(),
  });

  await invalidateCache();
  return faq;
}

// ─── Admin Upgrades ──────────────────────────────────────────────────────────

export async function promoteToAdminApproved(faqId: string, adminUserId: string): Promise<void> {
  const faq = await FAQ.findById(faqId);
  if (!faq) throw new Error('FAQ not found');
  if (faq.trustLevel === 'expert') throw new Error('FAQ is already at highest trust level');

  const oldLevel = faq.trustLevel;
  faq.trustLevel = 'expert'; // 'expert' = admin_approved equivalent
  if (!faq.promotionMetadata) faq.promotionMetadata = {};
  faq.promotionMetadata.promotedBy = new Types.ObjectId(adminUserId);
  await faq.save();

  if (oldLevel === 'medium') {
    await awardPromotionReputation(faq.createdBy?.toString() ?? '', 'faq_promotion_admin', 30);
  }

  logger.info(`FAQ ${faqId} promoted to admin_approved by ${adminUserId}`);
  await invalidateCache();
}

export async function promoteToOfficial(faqId: string, adminUserId: string): Promise<void> {
  const faq = await FAQ.findById(faqId);
  if (!faq) throw new Error('FAQ not found');

  faq.trustLevel = 'high'; // 'high' = official equivalent
  if (!faq.promotionMetadata) faq.promotionMetadata = {};
  faq.promotionMetadata.promotedBy = new Types.ObjectId(adminUserId);
  await faq.save();

  await awardPromotionReputation(faq.createdBy?.toString() ?? '', 'faq_promotion_official', 20);
  logger.info(`FAQ ${faqId} promoted to official by ${adminUserId}`);
  await invalidateCache();
}

// ─── Moderator Objection ──────────────────────────────────────────────────────

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

export async function objectToFAQPromotion(
  faqId: string,
  moderatorId: string,
  reason: string
): Promise<void> {
  const faq = await FAQ.findById(faqId);
  if (!faq) throw new Error('FAQ not found');

  faq.objectionStatus = 'objected';
  if (!faq.promotionMetadata) faq.promotionMetadata = {};
  faq.promotionMetadata.objectionRaisedBy = new Types.ObjectId(moderatorId);
  faq.promotionMetadata.objectionRaisedAt = new Date();
  faq.promotionMetadata.objectionReason = reason;
  await faq.save();

  logger.warn(`FAQ promotion objected for FAQ ${faqId} by ${moderatorId}: ${reason}`);
}

// ─── Reputation ───────────────────────────────────────────────────────────────

async function awardPromotionReputation(
  userId: string,
  action: string,
  points: number
): Promise<void> {
  if (!userId) return;
  try {
    const user = await User.findById(userId);
    if (!user) return;
    user.points = Math.max(0, user.points + points);
    await user.save();

    const ReputationLog = (await import('../models/ReputationLog.js')).default;
    await ReputationLog.create({
      userId: new Types.ObjectId(userId),
      delta: points,
      reason: `FAQ promotion: ${action}`,
      action,
      targetId: null,
      targetType: 'faq_promotion',
    });

    const { autoCheckBadges } = await import('../controllers/reputationController.js');
    await autoCheckBadges(userId);
  } catch (e) {
    logger.error(`Failed to award promotion reputation: ${(e as Error).message}`);
  }
}

// ─── Admin Controllers ─────────────────────────────────────────────────────────

export async function getCommunityPendingFAQs(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'))));

    const [faqs, total] = await Promise.all([
      FAQ.find({ sourceType: 'community_promotion' })
        .populate('sourceCommunityPostId', 'title status upvotes')
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

export async function promoteFAQ(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { targetLevel } = req.body as { targetLevel?: string };

    if (!['expert', 'high'].includes(targetLevel ?? '')) {
      res.status(400).json({ message: 'targetLevel must be expert (admin_approved) or high (official)' });
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

// ─── Idempotent Promotion Scheduler ──────────────────────────────────────────

export async function runPromotionCycle(): Promise<void> {
  try {
    const reviewCutoff = new Date(Date.now() - REVIEW_WINDOW_HOURS * 3600 * 1000);

    const eligiblePosts = await CommunityPost.find({
      eligibleForPromotion: true,
      promotionPendingAt: { $ne: null, $lte: reviewCutoff },
      promotionObjectedBy: null,
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