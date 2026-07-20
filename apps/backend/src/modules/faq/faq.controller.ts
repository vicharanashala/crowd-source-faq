import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import FAQ, { type IFAQ } from './faq.model.js';
import FaqVersion from './faq-version.model.js';
import CommunityPost from '../community/community-post.model.js';
import { generateQueryEmbedding } from '../../utils/ai/embeddings.js';
import { adminLog } from '../../utils/http/logger.js';
import { invalidateCache } from '../../utils/http/cache.js';
import { createTeaDropsForFAQ } from '../notification/tea-notification.controller.js';
import FreshReviewVote from './fresh-review-vote.model.js';
import FreshReviewLog, { type FreshReviewEventType } from './fresh-review-log.model.js';
import User, { calculateTier } from '../auth/user.model.js';
import ReputationLog from '../moderation/reputation-log.model.js';
import { autoAwardBadges } from '../moderation/reputation.controller.js';
import { sanitizeHtml } from '../../utils/http/sanitize.js';
import Batch from '../program/batch.model.js';
import { invalidatePublicCaches } from './public-faq.controller.js';
import { readSetting } from '../program/app-setting.model.js';
// v1.69 — Phase 3a: every public read in this file funnels its
// Mongoose filter through withProgramScope. Single tenant callers
// (no batchId) keep working until the rollout flips required=true.
import { withProgramScope, assertSameProgram } from '../../utils/db/scopedQuery.js';

export async function handleFaqEditHistory(
  faq: IFAQ,
  newFields: { question?: string; answer?: string; category?: string; batchId?: Types.ObjectId; tags?: string[] },
  changeSummary: string,
  userId: Types.ObjectId | string
) {
  const count = await FaqVersion.countDocuments({ faqId: faq._id });
  let nextVersionNumber = 1;

  if (count === 0) {
    let initialSummary = 'Initial FAQ creation';
    if (faq.sourceType === 'zoom_transcript') {
      initialSummary = 'Initial FAQ ingestion from Zoom meeting transcript.';
    }
    
    await FaqVersion.create({
      faqId: faq._id,
      versionNumber: 1,
      question: faq.question,
      answer: faq.answer,
      tags: faq.tags || [],
      category: faq.category,
      editedBy: faq.createdBy || new Types.ObjectId(userId),
      editedAt: faq.createdAt || new Date(),
      changeSummary: initialSummary,
      batchId: faq.batchId || null,
    });
    
    nextVersionNumber = 2;
  } else {
    const lastVersionDoc = await FaqVersion.findOne({ faqId: faq._id })
      .sort({ versionNumber: -1 })
      .select('versionNumber');
    nextVersionNumber = (lastVersionDoc?.versionNumber ?? 1) + 1;
  }

  const updatedQuestion = newFields.question !== undefined ? newFields.question : faq.question;
  const updatedAnswer = newFields.answer !== undefined ? newFields.answer : faq.answer;
  const updatedCategory = newFields.category !== undefined ? newFields.category : faq.category;
  const updatedBatchId = newFields.batchId !== undefined ? newFields.batchId : faq.batchId;
  const updatedTags = newFields.tags !== undefined ? newFields.tags : faq.tags;

  await FaqVersion.create({
    faqId: faq._id,
    versionNumber: nextVersionNumber,
    question: updatedQuestion,
    answer: updatedAnswer,
    tags: updatedTags || [],
    category: updatedCategory,
    editedBy: new Types.ObjectId(userId),
    editedAt: new Date(),
    changeSummary: changeSummary || 'Manual update',
    batchId: updatedBatchId || null,
  });

  const threshold = nextVersionNumber - 15;
  if (threshold > 0) {
    await FaqVersion.deleteMany({ faqId: faq._id, versionNumber: { $lte: threshold } });
  }
}

// v1.69 — batchIdFromQuery helper: read ?batchId=... from
// any request. The type is intentionally narrow ({query: any})
// so it accepts every Request<T, ..., CustomQuery, ...>
// shape in the codebase. The value is validated against
// Types.ObjectId.isValid.
function batchIdFromQuery(req: { query: any }): string | null {
  const raw = req.query?.batchId;
  return typeof raw === 'string' && Types.ObjectId.isValid(raw) ? raw : null;
}

async function logFreshEvent(
  event: FreshReviewEventType,
  faqId: Types.ObjectId | string,
  metadata: Record<string, unknown>
) {
  try {
    await FreshReviewLog.create({ event, faqId, metadata });
  } catch (e) {
    adminLog.warn(`FreshReviewLog failed: ${(e as Error).message}`);
  }
}

// Query params interface for getAllFAQs
interface GetAllFAQsQuery {
  page?: string;
  limit?: string;
  category?: string;
  cursor?: string; // base64-encoded last FAQ _id for cursor pagination
}

// Query params interface for getPaginatedFAQs
interface GetPaginatedFAQsQuery {
  page?: string;
  limit?: string;
  category?: string;
  cursor?: string;
}

// Body interface for checkFAQMatch
interface CheckFAQMatchBody {
  query?: string;
}

// Response type for grouped FAQs
interface GroupedFAQs {
  [category: string]: Array<{
    _id: IFAQ['_id'];
    question: string;
    answer: string;
    createdAt: Date;
    source?: string;
    trustLevel?: string;
    sourceType?: string;
    popularityScore?: number;
    guestViewCount?: number;
    // Freshness system — required for the public FreshnessBadge
    reviewStatus?: IFAQ['reviewStatus'];
    lastVerifiedDate?: IFAQ['lastVerifiedDate'];
    reviewIntervalDays?: IFAQ['reviewIntervalDays'];
    freshnessTier?: IFAQ['freshnessTier'];
  }>;
}

// GET /api/faq — All FAQs grouped by category (with optional pagination)
// Query params: page (default 1), limit (default 0=all), category (filter by category), cursor (opaque)
export const getAllFAQs = async (req: Request<Record<string, never>, Record<string, never>, Record<string, never>, GetAllFAQsQuery>, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page ?? '1'));
    const limitVal = req.query.limit ?? '0';
    const limit = Math.max(0, parseInt(limitVal)); // 0 = no limit (full grouped response)
    const category = req.query.category || '';
    const cursor = req.query.cursor;

    // Decode cursor to ObjectId for keyset pagination
    let cursorId: mongoose.Types.ObjectId | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        cursorId = new mongoose.Types.ObjectId(decoded);
      } catch {
        res.status(400).json({ message: 'Invalid cursor.' });
        return;
      }
    }

    const query: Record<string, unknown> = {};
    if (category) query.category = category;
    if (cursorId) query._id = { $lt: cursorId };
    // v1.69 — Phase 3a: scope every read to the active program.
    // withProgramScope returns FilterQuery<T> which is
    // structurally compatible with mongoose's find/count
    // filters — no cast needed.
    const scoped = withProgramScope(query, batchIdFromQuery(req));

    const totalCount = await FAQ.countDocuments(scoped);

    // When limit=0 (default), return all FAQs grouped — backward-compatible behavior
    // Use sort by _id desc so cursor (last _id) works correctly
    const faqs = await FAQ.find(scoped)
      .select('-embedding')
      .sort({ _id: -1 })
      .limit(limit > 0 ? limit + 1 : undefined as unknown as number); // fetch one extra to detect hasMore

    const hasMore = limit > 0 && faqs.length > limit;
    const results = hasMore ? faqs.slice(0, limit) : faqs;

    // If pagination requested, return flat paginated list
    if (limit > 0) {
      const faqItems = results.map((faq, idx) => ({
        _id: faq._id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        createdAt: faq.createdAt,
        source: 'faq',
        trustLevel: faq.trustLevel,
        sourceType: faq.sourceType,
        // Freshness system — required for the public FreshnessBadge
        reviewStatus: faq.reviewStatus,
        lastVerifiedDate: faq.lastVerifiedDate,
        reviewIntervalDays: faq.reviewIntervalDays,
        freshnessTier: faq.freshnessTier,
      }));

      // Encode the last _id as cursor for the next page
      const nextCursor = hasMore && results.length > 0
        ? Buffer.from(results[results.length - 1]._id.toString()).toString('base64')
        : null;

      res.json({
        faqs: faqItems,
        total: totalCount,
        page,
        limit,
        hasMore,
        nextCursor,
      });
      return;
    }

    // Default: return grouped object sorted by category (backward compatible)
    const sorted = [...results].sort((a, b) =>
      a.category.localeCompare(b.category) || a.createdAt.getTime() - b.createdAt.getTime()
    );
    const grouped = sorted.reduce<GroupedFAQs>((acc, faq) => {
      if (!acc[faq.category]) acc[faq.category] = [];
      acc[faq.category].push({
        _id: faq._id,
        question: faq.question,
        answer: faq.answer,
        createdAt: faq.createdAt,
        source: 'faq',
        trustLevel: faq.trustLevel,
        sourceType: faq.sourceType,
        // Ranking signals — let the discovery UI surface the top FAQs per category.
        popularityScore: faq.popularityScore,
        guestViewCount: faq.guestViewCount,
        // Freshness system — required for the public FreshnessBadge
        reviewStatus: faq.reviewStatus,
        lastVerifiedDate: faq.lastVerifiedDate,
        reviewIntervalDays: faq.reviewIntervalDays,
        freshnessTier: faq.freshnessTier,
      });
      return acc;
    }, {});

    res.json({ grouped, total: totalCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/faq/:id — Single FAQ
export const getFAQById = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    // 1. Fetch a specific FAQ by its ID, excluding embeddings
    const faq = await FAQ.findById(req.params.id).select('-embedding');

    // 2. Return a 404 error if no FAQ matches the ID
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;

    res.json(faq);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/faq/recent — Recent approved FAQs (used by HomePage "From Meetings" section)
// Public (no auth) — interns landing on the home page need to see fresh content
// Query params:
//   limit    (default 6, max 20)
//   source   optional — e.g. "zoom_transcript" to surface only Zoom-derived FAQs
//   since    optional ISO date — only return FAQs created on/after this date
export const getRecentFAQs = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.max(1, Math.min(20, parseInt(String(req.query.limit ?? '6'))));
    const source = String(req.query.source ?? '').trim();
    const since = String(req.query.since ?? '').trim();

    const filter: Record<string, unknown> = { status: 'approved' };
    if (source) filter.sourceType = source;
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) filter.createdAt = { $gte: d };
    }
    // v1.69 — Phase 3a: scope by program.
    const scoped = withProgramScope(filter, batchIdFromQuery(req));

    const faqs = await FAQ.find(scoped)
      .select('_id question answer category createdAt sourceType sourceMeetingTopic helpfulVotes tags')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ faqs, count: faqs.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/faq/paginated — Flat paginated list of FAQs with optional category filter
// Query params: page (default 1), limit (default 20), category (optional), cursor (opaque)
export const getPaginatedFAQs = async (req: Request<Record<string, never>, Record<string, never>, Record<string, never>, GetPaginatedFAQsQuery>, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20')));
    const category = req.query.category || '';
    const cursor = req.query.cursor;

    // Decode cursor to ObjectId for keyset pagination
    let cursorId: mongoose.Types.ObjectId | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        cursorId = new mongoose.Types.ObjectId(decoded);
      } catch {
        res.status(400).json({ message: 'Invalid cursor.' });
        return;
      }
    }

    const query: Record<string, unknown> = {};
    if (category) query.category = category;
    if (cursorId) query._id = { $lt: cursorId };
    // v1.69 — Phase 3a: scope by program.
    const scoped = withProgramScope(query, batchIdFromQuery(req));

    // Fetch one extra to detect hasMore
    const [faqs, total] = await Promise.all([
      FAQ.find(scoped).select('-embedding').sort({ _id: -1 }).limit(limit + 1),
      FAQ.countDocuments(scoped),
    ]);

    const hasMore = faqs.length > limit;
    const results = hasMore ? faqs.slice(0, limit) : faqs;

    const faqItems = results.map((faq) => ({
      _id: faq._id,
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      createdAt: faq.createdAt,
      updatedAt: faq.updatedAt,
      source: 'faq',
      // Freshness system — required for the public FreshnessBadge
      reviewStatus: faq.reviewStatus,
      lastVerifiedDate: faq.lastVerifiedDate,
      reviewIntervalDays: faq.reviewIntervalDays,
      freshnessTier: faq.freshnessTier,
    }));

    // Encode the last _id as cursor for the next page
    const nextCursor = hasMore && results.length > 0
      ? Buffer.from(results[results.length - 1]._id.toString()).toString('base64')
      : null;

    res.json({
      faqs: faqItems,
      total,
      page,
      limit,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/faq — Create a new FAQ (Admin/Moderator only)
export const createFAQ = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      question, answer, category, batchId: rawBatchId,
      freshnessTier,
      reviewIntervalDays,
      tags,
    } = req.body as {
      question?: string; answer?: string; category?: string; batchId?: string;
      freshnessTier?: 'evergreen' | 'seasonal' | 'volatile';
      reviewIntervalDays?: number;
      tags?: string[];
    };

    const batchId = rawBatchId || req.programContext?.batchId;

    if (!question || !answer || !category) {
      res.status(400).json({ message: 'Question, answer, and category are required.' });
      return;
    }
    if (!batchId || !Types.ObjectId.isValid(batchId)) {
      res.status(400).json({ message: 'A valid batchId is required.' });
      return;
    }
    // Verify the batch exists (and is active — we don't allow new FAQs in archived programs).
    const batchExists = await Batch.exists({ _id: batchId, isActive: true });
    if (!batchExists) {
      res.status(400).json({ message: 'Program not found or archived.' });
      return;
    }

    const question_ = sanitizeHtml(question);
    const answer_ = sanitizeHtml(answer);
    const category_ = sanitizeHtml(category);

    // Skip live embedding on create. Weekly batch cron handles it offline.
    // See apps/backend/src/utils/ai/embeddings.ts for context.

    const now = new Date();
    const tier = freshnessTier ?? 'evergreen';
    const seasonalDefault = parseInt(process.env['FAQ_SEASONAL_DAYS'] ?? '15');
    const volatileDefault  = parseInt(process.env['FAQ_VOLATILE_DAYS']  ?? '4');

    const interval = reviewIntervalDays
      ?? (tier === 'seasonal' ? seasonalDefault : tier === 'volatile' ? volatileDefault : 0);

    const faq = await FAQ.create({
      question: question_,
      answer: answer_,
      category: category_,
      batchId: new Types.ObjectId(batchId),
      tags: tags || [],
      // embedding omitted — assigned offline by weekly batch cron
      freshnessTier: tier,
      reviewIntervalDays: interval,
      reviewStatus: 'verified',
      lastVerifiedDate: now,
      flaggedAt: null,
      flagType: null,
      flagReason: null,
      flaggedBy: null,
      reviewCycle: 0,
      createdBy: req.user!._id,
    });

    // Save Version 1 snapshot
    await FaqVersion.create({
      faqId: faq._id,
      versionNumber: 1,
      question: faq.question,
      answer: faq.answer,
      tags: faq.tags || [],
      category: faq.category,
      editedBy: req.user!._id,
      editedAt: now,
      changeSummary: (req.body as any).changeSummary || 'Initial FAQ creation',
      batchId: faq.batchId || null,
    });

    // Invalidate search cache so new FAQ appears in results immediately
    await invalidateCache();
    // Public page cache (popular/recent/categories) — newly-created FAQ may surface in < 5 min.
    invalidatePublicCaches();

    // Fan out tea drops to all non-admin users
    createTeaDropsForFAQ(faq._id.toString(), question, category_).catch((err) => adminLog.warn(`[faq] createTeaDropsForFAQ failed: ${(err as Error).message}`));

    res.status(201).json({ message: 'FAQ created successfully.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PUT /api/faq/:id — Update an FAQ (Admin/Moderator only)
export const updateFAQ = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { question, answer, category, batchId, status, tags } = req.body as {
      question?: string; answer?: string; category?: string; batchId?: string;
      status?: 'approved' | 'pending' | 'rejected';
      tags?: string[];
    };

    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;

    const tagsChanged = tags && (
      tags.length !== (faq.tags?.length ?? 0) ||
      tags.some((t, i) => t !== faq.tags?.[i])
    );

    // Check if anything actually changed
    const hasChanges = (question && sanitizeHtml(question) !== faq.question) ||
                       (answer && sanitizeHtml(answer) !== faq.answer) ||
                       (category && sanitizeHtml(category) !== faq.category) ||
                       (batchId && batchId !== faq.batchId?.toString()) ||
                       (status && status !== faq.status) ||
                       tagsChanged;

    if (hasChanges) {
      const changeSummary = (req.body as any).changeSummary || 'Manual update';
      const newFields = {
        question: question ? sanitizeHtml(question) : undefined,
        answer: answer ? sanitizeHtml(answer) : undefined,
        category: category ? sanitizeHtml(category) : undefined,
        batchId: batchId ? new Types.ObjectId(batchId) : undefined,
        tags: tags || undefined,
      };
      await handleFaqEditHistory(faq, newFields, changeSummary, req.user!._id);
    }

    if (question) faq.question = sanitizeHtml(question);
    if (answer) faq.answer = sanitizeHtml(answer);
    if (category) faq.category = sanitizeHtml(category);
    if (tags) faq.tags = tags;
    if (batchId) {
      if (!Types.ObjectId.isValid(batchId)) {
        res.status(400).json({ message: 'Invalid batchId.' });
        return;
      }
      // Allow re-assignment to any batch, including archived (admins may want to move FAQs back).
      const batchExists = await Batch.exists({ _id: batchId });
      if (!batchExists) {
        res.status(400).json({ message: 'Program not found.' });
        return;
      }
      faq.batchId = new Types.ObjectId(batchId);
    }
    if (status && ['approved', 'pending', 'rejected'].includes(status)) {
      faq.status = status;
    }

    // Embedding recalculation skipped — handled by weekly batch cron.

    // Admin edit while under review = re-verification
    if (faq.reviewStatus === 'pending_review' || faq.reviewStatus === 'update_requested') {
      const newCycle = faq.reviewCycle + 1;
      faq.reviewStatus = 'verified';
      faq.lastVerifiedDate = new Date();
      faq.flaggedAt = null;
      faq.flagType = null;
      faq.flagReason = null;
      faq.flaggedBy = null;
      faq.reviewCycle = newCycle;
      await FreshReviewVote.deleteMany({ faqId: faq._id });
      await logFreshEvent('mod_verified', faq._id, { moderatorId: req.user!._id.toString(), reviewCycle: newCycle });
    }

    await faq.save();

    // ── Phase 3 R12 auto-answer hook ─────────────────────────────────────
    // When an admin edits a FAQ, find any community posts that quoted
    // this FAQ as the source of their AI-suggested answer and flag them
    // for re-evaluation. Fire-and-forget.
    if (question || answer || category) {
      CommunityPost.updateMany(
        {
          aiAnswerSource: `faq:${String(faq._id)}`,
          aiAnswerStatus: { $in: ['suggested', 'ask_human'] },
        },
        { $set: { pendingReviews: true } },
      ).catch((err: Error) => {
        // Best-effort — log but don't fail the FAQ edit.
        // eslint-disable-next-line no-console
        console.warn(`[updateFAQ] pendingReviews flag failed: ${err.message}`);
      });
    }

    // Invalidate search cache so updated FAQ reflects immediately
    await invalidateCache();
    invalidatePublicCaches();

    res.json({ message: 'FAQ updated successfully.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/faq/categories — list distinct categories for approved FAQs
// Audit fix (2026-07-02): frontend called `/faq/faq-categories` which
// didn't exist; this is the canonical route + handler.
export const getFAQCategories = async (_req: Request, res: Response): Promise<void> => {
  try {
    const cats = await FAQ.distinct('category', { status: 'approved' });
    res.json(cats.filter((c) => typeof c === 'string' && c.length > 0).sort());
  } catch (err) {
    res.status(500).json({ message: 'categories fetch failed' });
  }
};

// DELETE /api/faq/:id — Delete an FAQ (Admin/Moderator only)
export const deleteFAQ = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;
    await faq.deleteOne();

    // Invalidate search cache so deleted FAQ is removed from results
    await invalidateCache();
    invalidatePublicCaches();

    res.json({ message: 'FAQ deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/faq/check-match — Check if a user's question already exists in the FAQ
// Used by the community board to prevent duplicate questions
export const checkFAQMatch = async (req: Request<Record<string, never>, Record<string, never>, CheckFAQMatchBody>, res: Response): Promise<void> => {
  try {
    // Audit fix (2026-07-02): accept either `query` (spec) OR `question` /
    // `body` (what the frontend actually sends) so the route doesn't 500.
    const body = req.body as { query?: string; question?: string; body?: string };
    const query = (body.query || body.question || body.body || '').trim();

    if (!query) {
      res.status(400).json({ message: 'query (or question) is required.' });
      return;
    }

    // v1.71 — Phase 8 R3: do NOT 500 on a flaky embedder during
    // duplicate-check. Previously `checkFAQMatch` was the most visible
    // offender: every community "post a question" attempt called
    // `generateQueryEmbedding` and 500ed on a connection error, so the
    // user couldn't even submit their question. Now: try the embed;
    // if it fails, return `{ matched: false, faq: null }` so the post
    // goes through (the post-create endpoint still gates on
    // `checkDuplicate` which itself already has a graceful
    // `.catch` around its own embed call). The hourly `embedding-warm`
    // cron back-fills embeddings in the background.
    let embedding: number[] | null = null;
    try {
      embedding = await generateQueryEmbedding(query.trim());
    } catch (embErr) {
      adminLog.warn(
        `[checkFAQMatch] Failed to generate embedding for query '${query}': ${(embErr as Error).message}. Returning no-match.`,
      );
    }

    if (embedding == null) {
      // Degrade gracefully — no embedding means no vector match,
      // which we surface to the caller as "no match" rather than a 500.
      res.json({ matched: false, faq: null });
      return;
    }

    // Run vector search against the FAQ collection
    const mongoose = (await import('mongoose')).default;
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const collection = db.collection('yaksha_faq_faqs');

    const batchId = batchIdFromQuery(req);
    const pipeline: mongoose.PipelineStage[] = batchId
      ? [{ $match: { batchId: new Types.ObjectId(batchId) } }]
      : [];
    pipeline.push(
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: embedding,
          numCandidates: 50,
          limit: 3,
        },
      },
      {
        $project: {
          _id: 1,
          question: 1,
          answer: 1,
          category: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    );

    const results = await collection.aggregate(pipeline).toArray();

    // Check if the top result has a high similarity score (threshold: 0.82)
    const topMatch = results[0] as {
      _id: IFAQ['_id'];
      question: string;
      answer: string;
      category: string;
      score: number;
    } | null;
    const matchThreshold = await readSetting('faqDuplicateThreshold', 0.82, batchId);
    const matched = topMatch && topMatch.score >= matchThreshold;

    res.json({
      matched,
      faq: matched ? {
        _id: topMatch._id,
        question: topMatch.question,
        answer: topMatch.answer,
        category: topMatch.category,
        similarity: topMatch.score,
      } : null,
    });
  } catch (error) {
    adminLog.error('FAQ match check error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/faq/:id/feedback — Helpful/unhelpful vote on an FAQ
export const submitFeedback = async (req: Request<{ id: string }, Record<string, never>, { helpful: boolean }>, res: Response): Promise<void> => {
  try {
    const { helpful } = req.body;
    if (typeof helpful !== 'boolean') {
      res.status(400).json({ message: 'helpful boolean is required' });
      return;
    }
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;
    if (helpful) {
      faq.helpfulVotes = (faq.helpfulVotes ?? 0) + 1;
    } else {
      faq.unhelpfulVotes = (faq.unhelpfulVotes ?? 0) + 1;
    }
    await faq.save();
    // Award +2 points to FAQ creator if helpful vote and creator exists
    if (helpful && faq.createdBy) {
      // Atomic increment to prevent race conditions
      const updated = await User.findByIdAndUpdate(
        faq.createdBy,
        { $inc: { points: 2, reputation: 2 } },
        { new: true }
      );
      if (updated) {
        // Recompute tier from atomic value
        updated.tier = calculateTier(updated.points);
        await updated.save();
        autoAwardBadges(faq.createdBy.toString()).catch((err) => {
          adminLog.warn(`[faq] Failed to auto-award badges to ${faq.createdBy}: ${(err as Error).message}`);
        });
        await ReputationLog.create({
          userId: faq.createdBy,
          delta: 2,
          reason: `Helpful vote on FAQ "${faq.question.slice(0, 40)}"`,
          action: 'faq_helpful',
          targetId: faq._id as Types.ObjectId,
        });
      }
    } else {
      // Unhelpful vote: small point penalty (atomic, min 0)
      if (faq.createdBy) {
        await User.findOneAndUpdate(
          { _id: faq.createdBy, points: { $gt: 0 } },
          { $inc: { points: -1, reputation: -1 } },
          { new: true }
        );
      }
    }
    res.json({ helpfulVotes: faq.helpfulVotes, unhelpfulVotes: faq.unhelpfulVotes });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/faq/:id/report — Report an FAQ as inaccurate/outdated
export const reportFAQ = async (req: Request<{ id: string }, Record<string, never>, { reason: string }>, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      res.status(400).json({ message: 'Reason is required.' });
      return;
    }
    if (reason.trim().length < 10) {
      res.status(400).json({ message: 'Please provide a more descriptive reason (min 10 chars).' });
      return;
    }

    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;

    // Prevent duplicate reports by the same user
    const alreadyReported = faq.reports.some(
      (r) => r.reportedBy.toString() === req.user!._id.toString()
    );
    if (alreadyReported) {
      res.status(409).json({ message: 'You have already reported this FAQ.' });
      return;
    }

    faq.reports.push({
      reportedBy: req.user!._id,
      reason: reason.trim(),
      createdAt: new Date(),
    });
    faq.reviewStatus = 'pending_review';
    faq.flaggedAt = new Date();
    faq.flagType = 'manual';
    faq.flagReason = reason.trim();
    faq.flaggedBy = req.user!._id;
    await faq.save();

    res.json({ message: 'Report submitted. Thank you for helping keep the FAQ accurate.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/faq/:id/history — Fetch verification & edit history of an FAQ
export const getFAQHistory = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;

    const logs = await FreshReviewLog.find({ faqId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/faq/:id/suggest — Suggest a better answer for an FAQ
export const createFAQSuggestion = async (req: Request<{ id: string }, Record<string, never>, { suggestion: string }>, res: Response): Promise<void> => {
  try {
    const { suggestion } = req.body;
    if (!suggestion || !suggestion.trim()) {
      res.status(400).json({ message: 'Suggestion is required.' });
      return;
    }
    if (suggestion.trim().length < 5) {
      res.status(400).json({ message: 'Please provide a more detailed suggestion (min 5 characters).' });
      return;
    }
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;
    faq.suggestions = faq.suggestions || [];
    faq.suggestions.push({
      suggestedBy: req.user!._id,
      suggestion: suggestion.trim(),
      createdAt: new Date(),
    });
    await faq.save();
    res.json({ message: 'Suggestion submitted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/faq/:id/versions — Fetch all saved history versions of an FAQ
export const getFAQVersions = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (req.user?.role !== 'admin' && assertSameProgram(faq, req.programContext, res)) return;

    const count = await FaqVersion.countDocuments({ faqId: faq._id });
    if (count === 0) {
      let initialSummary = 'Initial FAQ creation';
      if (faq.sourceType === 'zoom_transcript') {
        initialSummary = 'Initial FAQ ingestion from Zoom meeting transcript.';
      }
      await FaqVersion.create({
        faqId: faq._id,
        versionNumber: 1,
        question: faq.question,
        answer: faq.answer,
        tags: faq.tags || [],
        category: faq.category,
        editedBy: faq.createdBy || faq.flaggedBy || req.user!._id,
        editedAt: faq.createdAt || new Date(),
        changeSummary: initialSummary,
        batchId: faq.batchId || null,
      });
    }

    const versions = await FaqVersion.find({ faqId: req.params.id })
      .sort({ versionNumber: -1 })
      .populate('editedBy', '_id name')
      .lean();

    res.json({ success: true, versions });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/faq/:id/versions/:versionNumber — Fetch specific version snapshot details of an FAQ
export const getFAQVersionSnapshot = async (req: Request<{ id: string; versionNumber: string }>, res: Response): Promise<void> => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (req.user?.role !== 'admin' && assertSameProgram(faq, req.programContext, res)) return;

    const versionNum = parseInt(req.params.versionNumber);
    if (isNaN(versionNum)) {
      res.status(400).json({ message: 'Invalid version number.' });
      return;
    }

    const version = await FaqVersion.findOne({ faqId: req.params.id, versionNumber: versionNum })
      .populate('editedBy', 'name')
      .lean();

    if (!version) {
      res.status(404).json({ message: 'Version not found.' });
      return;
    }

    res.json({ success: true, version });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/faq/:id/rollback/:versionNumber — Revert an FAQ to a previous saved version snapshot
export const rollbackFAQVersion = async (req: Request<{ id: string; versionNumber: string }>, res: Response): Promise<void> => {
  try {
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (req.user?.role !== 'admin' && assertSameProgram(faq, req.programContext, res)) return;

    const targetVersionNum = parseInt(req.params.versionNumber);
    if (isNaN(targetVersionNum)) {
      res.status(400).json({ message: 'Invalid version number.' });
      return;
    }

    const targetSnapshot = await FaqVersion.findOne({ faqId: faq._id, versionNumber: targetVersionNum });
    if (!targetSnapshot) {
      res.status(404).json({ message: 'Target version not found in history.' });
      return;
    }

    const count = await FaqVersion.countDocuments({ faqId: faq._id });
    let currentActiveVersion = 1;
    if (count > 0) {
      const lastVersionDoc = await FaqVersion.findOne({ faqId: faq._id })
        .sort({ versionNumber: -1 })
        .select('versionNumber');
      currentActiveVersion = lastVersionDoc?.versionNumber ?? 1;
    } else {
      let initialSummary = 'Initial FAQ creation';
      if (faq.sourceType === 'zoom_transcript') {
        initialSummary = 'Initial FAQ ingestion from Zoom meeting transcript.';
      }
      await FaqVersion.create({
        faqId: faq._id,
        versionNumber: 1,
        question: faq.question,
        answer: faq.answer,
        tags: faq.tags || [],
        category: faq.category,
        editedBy: faq.createdBy || req.user!._id,
        editedAt: faq.createdAt || new Date(),
        changeSummary: initialSummary,
        batchId: faq.batchId || null,
      });
      currentActiveVersion = 1;
    }

    const nextVersionNum = currentActiveVersion + 1;
    const changeSummary = req.body.changeSummary || `Rollback to Version ${targetVersionNum}`;

    await FaqVersion.create({
      faqId: faq._id,
      versionNumber: nextVersionNum,
      question: targetSnapshot.question,
      answer: targetSnapshot.answer,
      tags: targetSnapshot.tags || [],
      category: targetSnapshot.category,
      editedBy: req.user!._id,
      editedAt: new Date(),
      changeSummary: changeSummary,
      batchId: targetSnapshot.batchId || faq.batchId || null,
    });

    const threshold = nextVersionNum - 15;
    if (threshold > 0) {
      await FaqVersion.deleteMany({ faqId: faq._id, versionNumber: { $lte: threshold } });
    }

    faq.question = targetSnapshot.question;
    faq.answer = targetSnapshot.answer;
    faq.tags = targetSnapshot.tags;
    faq.category = targetSnapshot.category;
    faq.batchId = targetSnapshot.batchId || faq.batchId;
    faq.status = 'approved';
    await faq.save();

    await invalidateCache();
    invalidatePublicCaches();

    res.json({
      success: true,
      message: `FAQ successfully rolled back to version ${targetVersionNum}`,
      faq,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

