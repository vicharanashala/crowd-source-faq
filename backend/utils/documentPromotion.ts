/**
 * documentPromotion — single-insight → FAQ promotion.
 *
 * Used by:
 *   - Admin manual "Promote" action (`documentController.reviewInsight`)
 *   - The auto-promote cron (`documentPromotionController.runPromotePopularDocumentInsights`)
 *
 * `source` is either `'admin'` (manual) or `'auto-popular'` (cron).
 * The result is two records updated:
 *   - `DocumentInsight.status` flips to `promoted`
 *   - A new `FAQ` row is created with provenance on its
 *     `promotionMetadata`.
 */

import { Types } from 'mongoose';
import DocumentInsight, { type IDocumentInsight } from '../models/DocumentInsight.js';
import FAQ from '../models/FAQ.js';
import { logger } from './http/logger.js';

export interface PromoteResult {
  insight: IDocumentInsight;
  faq: { _id: Types.ObjectId; question: string } | null;
}

/**
 * Promote one DocumentInsight into a real FAQ. Idempotent: if
 * the insight is already `promoted`, returns the cached FAQ id
 * without re-creating it.
 */
export async function promoteInsightToFaq(
  insight: IDocumentInsight,
  reviewedByUserId: Types.ObjectId | undefined,
  source: 'admin' | 'auto-popular',
): Promise<PromoteResult> {
  if (insight.status === 'promoted' && insight.publishedFaqId) {
    const faq = await FAQ.findById(insight.publishedFaqId).select('_id question').lean();
    return {
      insight,
      faq: faq ? { _id: faq._id as Types.ObjectId, question: faq.question } : null,
    };
  }
  if (insight.status === 'rejected') {
    logger.warn(`[documentPromotion] refusing to promote rejected insight ${insight._id}`);
    return { insight, faq: null };
  }

  // Compose the FAQ question. If the insight is a Policy / HowTo
  // / Announcement with no question, fall back to the insight's
  // document title + a short prefix.
  const fallbackQuestion = insight.question && insight.question.trim().length > 0
    ? insight.question
    : `${(insight as { type?: string }).type ?? 'FAQ'} insight from document`;

  const faq = await FAQ.create({
    question: fallbackQuestion,
    answer: insight.answer_or_content,
    tags: [],
    category: 'document-promotion',
    status: 'approved',
    sourceType: 'manual', // existing union — document-promotion source would be additive; reusing 'manual' for v1
    createdBy: reviewedByUserId ?? null,
    promotionMetadata: {
      promotedBy: reviewedByUserId ?? null,
      // We don't track upvotes/helpfulVotes for v1 — these are
      // community-promo fields. The cron could fill them in
      // later from the searchMatchCount.
    },
  });

  insight.status = 'promoted';
  insight.publishedFaqId = faq._id as Types.ObjectId;
  insight.promotionReason =
    source === 'auto-popular'
      ? `Auto-promoted (${insight.searchMatchCount} matching UnresolvedSearch logs)`
      : 'Manually promoted by admin';
  insight.reviewedBy = reviewedByUserId ?? null;
  insight.reviewedAt = new Date();
  await insight.save();

  logger.info(
    `[documentPromotion] ${source} promoted insight ${insight._id} → FAQ ${faq._id} (type=${(insight as { type?: string }).type ?? 'FAQ'})`,
  );

  return {
    insight,
    faq: { _id: faq._id as Types.ObjectId, question: faq.question },
  };
}
