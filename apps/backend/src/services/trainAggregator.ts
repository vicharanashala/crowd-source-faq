/**
 * trainAggregator — Per-batchId knowledge-base stats for the admin "Train"
 * tab. Surfaces counts and health signals for every collection that feeds
 * the auto-answer retrieval pipeline (fetchContext → retrievalSources/).
 *
 * v1 — pure read-only aggregations. No writes. Safe to call from any
 * admin endpoint.
 *
 * Why a separate module: this is the only place that needs to know the
 * shape of every collection at once. Keeping it isolated means the
 * individual retrieval sources stay focused on search, not analytics.
 *
 * Performance: all count queries run in parallel via Promise.all.
 * For a busy program with thousands of community posts, countDocuments
 * with a batchId filter uses the indexes that already exist on every
 * collection (verified during the original model creation). Soft-delete
 * filter (deletedAt: null) is applied explicitly because aggregations
 * bypass Mongoose query middleware.
 */
import { Types } from 'mongoose';
import ProgramKnowledge from '../models/ProgramKnowledge.js';
import DocumentInsight from '../modules/knowledge/document-insight.model.js';
import FAQ from '../modules/faq/faq.model.js';
import WebPage from '../models/WebPage.js';
import CommunityPost from '../modules/community/community-post.model.js';
import Batch from '../modules/program/batch.model.js';

export interface BatchKnowledgeStats {
  batchId: string;
  batchName: string;
  counts: {
    programKnowledge: number;
    documentInsightPending: number;
    documentInsightPromoted: number;
    faq: number;
    webPage: number;
    communityPostAnswered: number;
  };
  health: {
    pendingReview: number;
    staleItems: number;
    autoPromotedThisWeek: number;
  };
}

const STALE_DAYS = 90;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Return stats for the requested batchId, or every active batch if
 * batchId is undefined. Each batch's counts run in parallel; the
 * per-batch queries are also parallel internally.
 */
export async function getBatchKnowledgeStats(
  batchId?: string,
): Promise<BatchKnowledgeStats[]> {
  // 1. Resolve the batch list. If a specific batchId was passed, fetch
  //    just that row (even if inactive — admins may want to inspect
  //    archived programs). If no batchId, fetch every active batch.
  const batches = batchId
    ? await Batch.find({ _id: safeObjectId(batchId) }).select('_id name isActive').lean()
    : await Batch.find({ isActive: true }).select('_id name isActive').lean();

  if (batches.length === 0) return [];

  // 2. Compute stats for each batch in parallel. Promise.all keeps the
  //    latency at O(slowest-batch) instead of O(sum-of-all).
  return Promise.all(batches.map((b) => statsForBatch(String(b._id), b.name ?? '(unnamed)')));
}

async function statsForBatch(batchId: string, batchName: string): Promise<BatchKnowledgeStats> {
  const batchObjectId = safeObjectId(batchId);
  const softDelete = { deletedAt: null };
  const staleSince = new Date(Date.now() - STALE_MS);
  const weekAgo = new Date(Date.now() - WEEK_MS);

  // Independent count queries — fire all at once.
  const [
    programKnowledge,
    documentInsightPending,
    documentInsightPromoted,
    faq,
    webPage,
    communityPostAnswered,
    pendingReview,
    staleItems,
    autoPromotedThisWeek,
  ] = await Promise.all([
    ProgramKnowledge.countDocuments({ batchId: batchObjectId, deletedAt: null }),
    DocumentInsight.countDocuments({
      batchId: batchObjectId,
      status: 'pending_review',
      deletedAt: null,
    }),
    DocumentInsight.countDocuments({
      batchId: batchObjectId,
      status: 'promoted',
      deletedAt: null,
    }),
    FAQ.countDocuments({
      batchId: batchObjectId,
      status: 'approved',
      deletedAt: null,
    }),
    // WebPage is GLOBAL (no batchId field — see models/WebPage.ts:36-37).
    // We still count it as "available to all programs" so the admin UI
    // shows the full picture. If WebPage.batchId is added later, swap
    // this for `{ batchId: batchObjectId, deletedAt: null }`.
    WebPage.countDocuments({ ...softDelete, approved: true }),
    CommunityPost.countDocuments({
      batchId: batchObjectId,
      status: 'answered',
      deletedAt: null,
    }),
    // Health: pending review across the two collections that have a
    // pending-review state. (WebPage uses `approved: boolean`, not
    // a status enum; we count unapproved WebPages separately if needed.)
    DocumentInsight.countDocuments({
      batchId: batchObjectId,
      status: 'pending_review',
      deletedAt: null,
    }),
    // Stale = lastVerifiedDate > 90 days ago OR (no lastVerifiedDate
    // AND createdAt > 90 days ago). DocumentInsight doesn't have
    // lastVerifiedDate, so we approximate via createdAt.
    DocumentInsight.countDocuments({
      batchId: batchObjectId,
      createdAt: { $lt: staleSince },
      deletedAt: null,
    }),
    DocumentInsight.countDocuments({
      batchId: batchObjectId,
      status: 'promoted',
      reviewedAt: { $gte: weekAgo },
      deletedAt: null,
    }),
  ]);

  return {
    batchId,
    batchName,
    counts: {
      programKnowledge,
      documentInsightPending,
      documentInsightPromoted,
      faq,
      webPage,
      communityPostAnswered,
    },
    health: {
      pendingReview,
      staleItems,
      autoPromotedThisWeek,
    },
  };
}

function safeObjectId(value: string): Types.ObjectId {
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : new Types.ObjectId();
}