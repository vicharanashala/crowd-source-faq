import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import FAQ, { type IFAQ } from './faq.model.js';
import { generateEmbedding, generateQueryEmbedding } from '../../utils/ai/embeddings.js';
import { adminLog } from '../../utils/http/logger.js';
import { invalidateCache, cacheGet, cacheSet, cacheAvailable, invalidateByPattern } from '../../utils/http/cache.js';
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
import { learnFromText } from '../search/aliasMapper.js';

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

async function triggerAllCacheInvalidation(): Promise<void> {
  try {
    await invalidateCache();
    await invalidateByPattern('faq:*');
    await invalidateByPattern('stats:*');
    await invalidateByPattern('trending:*');
    invalidatePublicCaches();
  } catch (err) {
    adminLog.warn(`[cache] Invalidation trigger failed: ${(err as Error).message}`);
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
    const batchId = batchIdFromQuery(req) || '';

    const cacheKey = `faq:all:${page}:${limit}:${category}:${cursor || ''}:${batchId}`;
    if (cacheAvailable()) {
      const cached = await cacheGet<any>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

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

      const responseData = {
        faqs: faqItems,
        total: totalCount,
        page,
        limit,
        hasMore,
        nextCursor,
      };
      if (cacheAvailable()) {
        await cacheSet(cacheKey, responseData, 300); // 5 min TTL
      }
      res.json(responseData);
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

    const responseData = { grouped, total: totalCount };
    if (cacheAvailable()) {
      await cacheSet(cacheKey, responseData, 300); // 5 min TTL
    }
    res.json(responseData);
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/faq/:id — Single FAQ
export const getFAQById = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const cacheKey = `faq:id:${req.params.id}`;
    if (cacheAvailable()) {
      const cached = await cacheGet<any>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

    // 1. Fetch a specific FAQ by its ID, excluding embeddings
    const faq = await FAQ.findById(req.params.id).select('-embedding');

    // 2. Return a 404 error if no FAQ matches the ID
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;

    if (cacheAvailable()) {
      await cacheSet(cacheKey, faq, 600); // 10 min TTL
    }
    learnFromText(`${faq.question} ${faq.answer}`);
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
    const batchId = batchIdFromQuery(req) || '';

    const cacheKey = `faq:recent:${limit}:${source}:${since}:${batchId}`;
    if (cacheAvailable()) {
      const cached = await cacheGet<any>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

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

    const responseData = { faqs, count: faqs.length };
    if (cacheAvailable()) {
      await cacheSet(cacheKey, responseData, 120); // 2 min TTL
    }
    res.json(responseData);
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
    const batchId = batchIdFromQuery(req) || '';

    const cacheKey = `faq:paginated:${page}:${limit}:${category}:${cursor || ''}:${batchId}`;
    if (cacheAvailable()) {
      const cached = await cacheGet<any>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

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

    const responseData = {
      faqs: faqItems,
      total,
      page,
      limit,
      hasMore,
      nextCursor,
    };
    if (cacheAvailable()) {
      await cacheSet(cacheKey, responseData, 300); // 5 min TTL
    }
    res.json(responseData);
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
    } = req.body as {
      question?: string; answer?: string; category?: string; batchId?: string;
      freshnessTier?: 'evergreen' | 'seasonal' | 'volatile';
      reviewIntervalDays?: number;
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

    // Generate vector embedding for semantic search
    const embedding = await generateEmbedding(`Section: ${category_}. Question: ${question_}. Answer: ${answer_}`);

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
      embedding,
      freshnessTier: tier,
      reviewIntervalDays: interval,
      reviewStatus: 'verified',
      lastVerifiedDate: now,
      flaggedAt: null,
      flagType: null,
      flagReason: null,
      flaggedBy: null,
      reviewCycle: 0,
    });

    // Invalidate caches so updated/new FAQ reflects immediately
    await triggerAllCacheInvalidation();

    // Extract any new abbreviation↔long-form pairs from the new FAQ content
    // and persist them to aliases.json so searches expand them immediately.
    learnFromText(`${question_} ${answer_}`);

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
    const { question, answer, category, batchId, status } = req.body as {
      question?: string; answer?: string; category?: string; batchId?: string;
      status?: 'approved' | 'pending' | 'rejected';
    };

    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }
    if (assertSameProgram(faq, req.programContext, res)) return;

    if (question) faq.question = sanitizeHtml(question);
    if (answer) faq.answer = sanitizeHtml(answer);
    if (category) faq.category = sanitizeHtml(category);
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

    // Recalculate embedding if any key field is updated
    if (question || answer || category) {
      faq.embedding = await generateEmbedding(
        `Section: ${faq.category}. Question: ${faq.question}. Answer: ${faq.answer}`
      );
    }

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

    // Invalidate caches so updated/new FAQ reflects immediately
    await triggerAllCacheInvalidation();

    // Re-scan the updated content for any new abbreviation↔long-form pairs.
    learnFromText(`${faq.question} ${faq.answer}`);

    res.json({ message: 'FAQ updated successfully.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
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

    // Invalidate caches so deleted FAQ is removed from results
    await triggerAllCacheInvalidation();

    res.json({ message: 'FAQ deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/faq/check-match — Check if a user's question already exists in the FAQ
// Used by the community board to prevent duplicate questions
export const checkFAQMatch = async (req: Request<Record<string, never>, Record<string, never>, CheckFAQMatchBody>, res: Response): Promise<void> => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      res.status(400).json({ message: 'query string is required.' });
      return;
    }

    // Generate embedding for the user's question
    const embedding = await generateQueryEmbedding(query.trim());

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
    await triggerAllCacheInvalidation();
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
    await triggerAllCacheInvalidation();

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
    await triggerAllCacheInvalidation();
    res.json({ message: 'Suggestion submitted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

