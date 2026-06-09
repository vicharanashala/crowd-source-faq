import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import FAQ, { type IFAQ } from '../models/FAQ.js';
import { generateEmbedding } from '../utils/embeddings.js';
import { logger } from '../utils/logger.js';
import { invalidateCache } from '../utils/cache.js';
import { createTeaDropsForFAQ } from './teaNotificationController.js';
import FreshReviewVote from '../models/FreshReviewVote.js';
import FreshReviewLog, { type FreshReviewEventType } from '../models/FreshReviewLog.js';
import User, { calculateTier } from '../models/User.js';
import ReputationLog from '../models/ReputationLog.js';
import { autoAwardBadges } from './reputationController.js';
import { sanitizeHtml } from '../utils/sanitize.js';

async function logFreshEvent(
  event: FreshReviewEventType,
  faqId: Types.ObjectId | string,
  metadata: Record<string, unknown>
) {
  try {
    await FreshReviewLog.create({ event, faqId, metadata });
  } catch (e) {
    logger.warn(`FreshReviewLog failed: ${(e as Error).message}`);
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
    // Freshness system — required for the public FreshnessBadge
    reviewStatus?: IFAQ['reviewStatus'];
    lastVerifiedDate?: IFAQ['lastVerifiedDate'];
    reviewIntervalDays?: IFAQ['reviewIntervalDays'];
    freshnessTier?: IFAQ['freshnessTier'];
  }>;
}

// GET /api/faq — All FAQs grouped by category (with optional pagination)
// Query params: page (default 1), limit (default 0=all), category (filter by category), cursor (opaque)
export const getAllFAQs = async (req: Request<{}, {}, {}, GetAllFAQsQuery>, res: Response): Promise<void> => {
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

    const totalCount = await FAQ.countDocuments(
      Object.keys(query).length ? query : {}
    );

    // When limit=0 (default), return all FAQs grouped — backward-compatible behavior
    // Use sort by _id desc so cursor (last _id) works correctly
    const faqs = await FAQ.find(query)
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

    const faqs = await FAQ.find(filter)
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
export const getPaginatedFAQs = async (req: Request<{}, {}, {}, GetPaginatedFAQsQuery>, res: Response): Promise<void> => {
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

    // Fetch one extra to detect hasMore
    const [faqs, total] = await Promise.all([
      FAQ.find(query).select('-embedding').sort({ _id: -1 }).limit(limit + 1),
      FAQ.countDocuments(query),
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
      question, answer, category,
      freshnessTier,
      reviewIntervalDays,
    } = req.body as {
      question?: string; answer?: string; category?: string;
      freshnessTier?: 'evergreen' | 'seasonal' | 'volatile';
      reviewIntervalDays?: number;
    };

    if (!question || !answer || !category) {
      res.status(400).json({ message: 'Question, answer, and category are required.' });
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

    // Invalidate search cache so new FAQ appears in results immediately
    await invalidateCache();

    // Fan out tea drops to all non-admin users
    createTeaDropsForFAQ(faq._id.toString(), question).catch((err) => logger.warn(`[faq] createTeaDropsForFAQ failed: ${(err as Error).message}`));

    res.status(201).json({ message: 'FAQ created successfully.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PUT /api/faq/:id — Update an FAQ (Admin/Moderator only)
export const updateFAQ = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { question, answer, category } = req.body as { question?: string; answer?: string; category?: string };

    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }

    if (question) faq.question = sanitizeHtml(question);
    if (answer) faq.answer = sanitizeHtml(answer);
    if (category) faq.category = sanitizeHtml(category);

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

    // Invalidate search cache so updated FAQ reflects immediately
    await invalidateCache();

    res.json({ message: 'FAQ updated successfully.', faq });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// DELETE /api/faq/:id — Delete an FAQ (Admin/Moderator only)
export const deleteFAQ = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }

    // Invalidate search cache so deleted FAQ is removed from results
    await invalidateCache();

    res.json({ message: 'FAQ deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/faq/check-match — Check if a user's question already exists in the FAQ
// Used by the community board to prevent duplicate questions
export const checkFAQMatch = async (req: Request<{}, {}, CheckFAQMatchBody>, res: Response): Promise<void> => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      res.status(400).json({ message: 'query string is required.' });
      return;
    }

    // Generate embedding for the user's question
    const embedding = await generateEmbedding(query.trim());

    // Run vector search against the FAQ collection
    const mongoose = (await import('mongoose')).default;
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not ready');
    const collection = db.collection('yaksha_faq_faqs');

    const pipeline = [
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
    ];

    const results = await collection.aggregate(pipeline).toArray();

    // Check if the top result has a high similarity score (threshold: 0.82)
    const topMatch = results[0] as {
      _id: IFAQ['_id'];
      question: string;
      answer: string;
      category: string;
      score: number;
    } | null;
    const matched = topMatch && topMatch.score >= 0.82;

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
    logger.error('FAQ match check error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/faq/:id/feedback — Helpful/unhelpful vote on an FAQ
export const submitFeedback = async (req: Request<{ id: string }, {}, { helpful: boolean }>, res: Response): Promise<void> => {
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
          logger.warn(`[faq] Failed to auto-award badges to ${faq.createdBy}: ${(err as Error).message}`);
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
export const reportFAQ = async (req: Request<{ id: string }, {}, { reason: string }>, res: Response): Promise<void> => {
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
    const logs = await FreshReviewLog.find({ faqId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/faq/:id/suggest — Suggest a better answer for an FAQ
export const createFAQSuggestion = async (req: Request<{ id: string }, {}, { suggestion: string }>, res: Response): Promise<void> => {
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

