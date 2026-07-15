/**
 * feedback.controller.ts — AI Quality Feedback HTTP layer
 * Spec reference: 03_AI_Quality_Feedback_System.md
 */

import type { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import Feedback, {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type IExplainabilitySnapshot,
  type ICitationSnapshot,
} from './feedback.model.js';
import { httpLog } from '../../utils/http/logger.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function clampString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function asObjectIdOrEmpty(value: unknown): Types.ObjectId | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined;
}

function safeNum(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function computeAnswerId(parts: { question?: string; provider?: string; modelName?: string; confidence?: number }): string {
  const hashInput = [
    parts.question ?? '',
    parts.provider ?? '',
    parts.modelName ?? '',
    String(parts.confidence ?? ''),
  ].join('|');
  return crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 24);
}

function sanitizeCitations(input: unknown): ICitationSnapshot[] {
  if (!Array.isArray(input)) return [];
  const out: ICitationSnapshot[] = [];
  for (const raw of input.slice(0, 10)) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const id = typeof c.id === 'string' ? c.id : '';
    const title = typeof c.title === 'string' ? c.title : '';
    const sourceType = c.sourceType;
    if (!id || !title) continue;
    if (!['FAQ', 'Document', 'Zoom', 'KnowledgeBase'].includes(String(sourceType))) continue;
    const sim = Number(c.similarity);
    out.push({
      id: id.slice(0, 128),
      title: title.slice(0, 200),
      sourceType: sourceType as ICitationSnapshot['sourceType'],
      similarity: Number.isFinite(sim) ? Math.max(0, Math.min(1, sim)) : 0,
      section: typeof c.section === 'string' ? c.section.slice(0, 80) : undefined,
    });
  }
  return out;
}

function sanitizeExplainability(input: unknown): IExplainabilitySnapshot | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const e = input as Record<string, unknown>;
  const provider = typeof e.provider === 'string' ? e.provider : 'unknown';
  const modelName = typeof e.modelName === 'string' ? e.modelName : 'unknown';
  const conf = Number(e.confidence);
  if (!Number.isFinite(conf)) return undefined;
  return {
    confidence: Math.max(0, Math.min(1, conf)),
    provider: provider.slice(0, 64),
    modelName: modelName.slice(0, 128),
    latencyMs: Math.max(0, Math.round(Number(e.latencyMs) || 0)),
    documentsRetrieved: Math.max(0, Math.round(Number(e.documentsRetrieved) || 0)),
    documentsUsed: Math.max(0, Math.round(Number(e.documentsUsed) || 0)),
    vectorScore: Math.max(0, Math.min(1, Number(e.vectorScore) || 0)),
    keywordScore: Math.max(0, Math.min(1, Number(e.keywordScore) || 0)),
    duplicateDetected: !!e.duplicateDetected,
  };
}

// ─── Public submit endpoint ───────────────────────────────────────────────────

/**
 * POST /api/feedback
 */
export const submitFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const question = clampString(body.question, 2000);
    if (!question) {
      res.status(400).json({ message: 'question is required' });
      return;
    }

    if (typeof body.helpful !== 'boolean') {
      res.status(400).json({ message: 'helpful must be a boolean' });
      return;
    }
    const helpful: boolean = body.helpful;

    let category: FeedbackCategory | undefined;
    if (typeof body.category === 'string') {
      const c = body.category;
      const set = FEEDBACK_CATEGORIES as readonly string[];
      if (set.includes(c)) category = c as FeedbackCategory;
      else if (!helpful) {
        res.status(400).json({ message: `invalid category "${c}"` });
        return;
      }
    } else if (!helpful) {
      res.status(400).json({ message: 'category is required when helpful=false' });
      return;
    }

    const pipelineRaw = typeof body.pipeline === 'string' ? body.pipeline : 'ask_ai';
    const pipeline: 'search' | 'ask_ai' | 'auto_answer' | 'faq_audit' | 'other' =
      ['search', 'ask_ai', 'auto_answer', 'faq_audit', 'other'].includes(pipelineRaw)
        ? (pipelineRaw as 'search' | 'ask_ai' | 'auto_answer' | 'faq_audit' | 'other')
        : 'other';

    const provider = clampString(body.provider, 64);
    const modelName = clampString(body.modelName, 128);
    const confidence = safeNum(body.confidence);
    const latencyMs = safeNum(body.latencyMs);
    const citations = sanitizeCitations(body.citations);
    const explainability = sanitizeExplainability(body.explainability);

    const suppliedAnswerId = typeof body.answerId === 'string' && body.answerId.length > 0
      ? body.answerId.slice(0, 128)
      : null;
    const answerId = suppliedAnswerId ?? computeAnswerId({ question, provider, modelName, confidence });

    const comment = clampString(body.comment, 2000);
    const normalizedQuestion = question.toLowerCase().trim().replace(/\s+/g, ' ');
    const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint.slice(0, 128) : undefined;

    // ─── Identity (best effort; never fail the request) ─────────────────
    const user = (req as Request & { user?: { _id?: Types.ObjectId | string } }).user;
    let userId: Types.ObjectId | undefined;
    if (user?._id) {
      userId = typeof user._id === 'string' ? new Types.ObjectId(user._id) : user._id;
    }
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 128) : undefined;
    const questionId = asObjectIdOrEmpty(body.questionId);
    const programContext = (req as Request & { programContext?: { batchId?: string } }).programContext;
    const batchId = asObjectIdOrEmpty(body.batchId)
      ?? (programContext?.batchId && Types.ObjectId.isValid(programContext.batchId)
        ? new Types.ObjectId(programContext.batchId)
        : undefined);

    // Upsert: one feedback record per (answerId, userId) or (answerId, sessionId)
    // Falls back to (answerId, fingerprint) for anonymous users with no session.
    const filter: Record<string, unknown> = { answerId };
    if (userId) {
      filter.userId = userId;
    } else if (sessionId) {
      filter.sessionId = sessionId;
    } else if (fingerprint) {
      filter.fingerprint = fingerprint;
    } else {
      // No identity at all — just create (rare edge case)
      filter._id = new Types.ObjectId();
    }

    const update: Record<string, unknown> = {
      $set: {
        question,
        normalizedQuestion,
        pipeline,
        helpful,
        comment,
        provider,
        modelName,
        confidence: Number.isFinite(confidence) ? confidence : undefined,
        latencyMs: latencyMs > 0 ? latencyMs : undefined,
        citations,
        explainability,
        batchId: batchId ?? null,
        questionId: questionId ?? null,
        fingerprint: fingerprint ?? null,
        feedbackVersion: 1,
      },
      $setOnInsert: {
        userId: userId ?? null,
        sessionId,
        createdAt: new Date(),
      },
    };

    // If updating an existing record's comment, track the edit time
    if (comment) {
      (update.$set as Record<string, unknown>).editedAt = new Date();
    }

    const doc = await Feedback.findOneAndUpdate(
      filter,
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({
      success: true,
      id: String(doc._id),
      answerId,
    });
  } catch (err) {
    httpLog.warn(`[feedback] submit failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error', success: false });
  }
};

// ─── Admin analytics endpoint ────────────────────────────────────────────────

/**
 * GET /api/admin/feedback/stats?fromDate=&toDate=
 */
export const getFeedbackStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const now = new Date();
    const toDate = parseDate(q.toDate) ?? now;
    const fromDate = parseDate(q.fromDate) ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dateMatch = { createdAt: { $gte: fromDate, $lte: toDate } };

    const [
      overallAgg,
      categoryAgg,
      providerAgg,
      confidenceBuckets,
      topQuestions,
    ] = await Promise.all([
      Feedback.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            helpful: { $sum: { $cond: [{ $eq: ['$helpful', true] }, 1, 0] } },
          },
        },
      ]),
      Feedback.aggregate([
        { $match: { ...dateMatch, helpful: false, category: { $ne: null } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Feedback.aggregate([
        { $match: { ...dateMatch, provider: { $ne: null } } },
        {
          $group: {
            _id: '$provider',
            total: { $sum: 1 },
            helpful: { $sum: { $cond: [{ $eq: ['$helpful', true] }, 1, 0] } },
          },
        },
        { $sort: { total: -1 } },
      ]),
      Feedback.aggregate([
        { $match: { ...dateMatch, confidence: { $ne: null } } },
        {
          $bucket: {
            groupBy: '$confidence',
            boundaries: [0, 0.33, 0.66, 1.0001],
            default: 'unknown',
            output: {
              total: { $sum: 1 },
              helpful: { $sum: { $cond: [{ $eq: ['$helpful', true] }, 1, 0] } },
            },
          },
        },
      ]),
      Feedback.aggregate([
        { $match: { ...dateMatch, helpful: false, question: { $ne: null } } },
        {
          $group: {
            _id: '$question',
            count: { $sum: 1 },
            lastReported: { $max: '$createdAt' },
            categories: { $addToSet: '$category' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const overall = (overallAgg[0] ?? { total: 0, helpful: 0 }) as { total: number; helpful: number };
    const helpfulRate = overall.total > 0 ? +(overall.helpful / overall.total).toFixed(4) : 0;

    const bucketMap: Record<string, { total: number; helpful: number; helpfulRate: number }> = {
      low: { total: 0, helpful: 0, helpfulRate: 0 },
      medium: { total: 0, helpful: 0, helpfulRate: 0 },
      high: { total: 0, helpful: 0, helpfulRate: 0 },
    };
    for (const row of confidenceBuckets as Array<{ _id: number | string; total: number; helpful: number }>) {
      const total = safeNum(row.total);
      const helpful = safeNum(row.helpful);
      const label = row._id === 0 ? 'low'
        : row._id === 0.33 ? 'medium'
        : row._id === 0.66 ? 'high'
        : null;
      if (!label) continue;
      bucketMap[label] = {
        total,
        helpful,
        helpfulRate: total > 0 ? +(helpful / total).toFixed(4) : 0,
      };
    }

    const timelineAgg = await Feedback.aggregate([
      { $match: dateMatch },
      {
        $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit: 'day' } },
          total: { $sum: 1 },
          helpful: { $sum: { $cond: [{ $eq: ['$helpful', true] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      window: {
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
      },
      overall: {
        total: overall.total,
        helpful: overall.helpful,
        unhelpful: Math.max(0, overall.total - overall.helpful),
        helpfulRate,
      },
      categories: categoryAgg.map((r) => {
        const o = r as Record<string, unknown>;
        return {
          category: o._id as string,
          count: safeNum(o.count),
        };
      }),
      providers: providerAgg.map((r) => {
        const o = r as Record<string, unknown>;
        const total = safeNum(o.total);
        const helpful = safeNum(o.helpful);
        return {
          provider: o._id as string,
          total,
          helpful,
          helpfulRate: total > 0 ? +(helpful / total).toFixed(4) : 0,
        };
      }),
      confidence: bucketMap,
      topReportedQuestions: topQuestions.map((r) => {
        const o = r as Record<string, unknown>;
        return {
          question: o._id as string,
          count: safeNum(o.count),
          lastReported: (o.lastReported as Date).toISOString(),
          categories: ((o.categories as (string | null)[]) ?? []).filter(Boolean) as string[],
        };
      }),
      timeline: timelineAgg.map((r) => {
        const o = r as Record<string, unknown>;
        const total = safeNum(o.total);
        return {
          date: (o._id as Date).toISOString().slice(0, 10),
          total,
          helpful: safeNum(o.helpful),
          unhelpful: Math.max(0, total - safeNum(o.helpful)),
        };
      }),
    });
  } catch (err) {
    httpLog.warn(`[feedback] stats failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Admin list endpoint ──────────────────────────────────────────────────────

const CSV_COLUMNS = [
  'createdAt',
  'pipeline',
  'helpful',
  'category',
  'provider',
  'modelName',
  'confidence',
  'latencyMs',
  'comment',
  'question',
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * GET /api/admin/feedback?limit=50&page=1&helpful=&category=&provider=
 */
export const listFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    const page = Math.max(1, Number(q.page) || 1);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (typeof q.helpful === 'string') {
      if (q.helpful === 'true') filter.helpful = true;
      else if (q.helpful === 'false') filter.helpful = false;
    }
    if (typeof q.category === 'string' && q.category.length > 0) filter.category = q.category;
    if (typeof q.provider === 'string' && q.provider.length > 0) filter.provider = q.provider;
    if (typeof q.pipeline === 'string' && q.pipeline.length > 0) filter.pipeline = q.pipeline;
    const fromDate = parseDate(q.fromDate);
    const toDate = parseDate(q.toDate);
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) (filter.createdAt as Record<string, Date>).$gte = fromDate;
      if (toDate) (filter.createdAt as Record<string, Date>).$lte = toDate;
    }

    const [docs, total] = await Promise.all([
      Feedback.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Feedback.countDocuments(filter),
    ]);

    const rows = docs.map((d: unknown) => {
      const obj: Record<string, unknown> = { ...(d as Record<string, unknown>) };
      obj._id = String(obj._id);
      if (obj.userId) obj.userId = String(obj.userId);
      if (obj.batchId) obj.batchId = String(obj.batchId);
      if (obj.questionId) obj.questionId = String(obj.questionId);
      return obj;
    });

    res.json({
      feedback: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    httpLog.warn(`[feedback] list failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/admin/feedback/export?fromDate=&toDate=&provider=
 */
export const exportFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const filter: Record<string, unknown> = {};
    const fromDate = parseDate(q.fromDate);
    const toDate = parseDate(q.toDate);
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) (filter.createdAt as Record<string, Date>).$gte = fromDate;
      if (toDate) (filter.createdAt as Record<string, Date>).$lte = toDate;
    }
    if (typeof q.provider === 'string' && q.provider.length > 0) filter.provider = q.provider;
    if (typeof q.helpful === 'string' && (q.helpful === 'true' || q.helpful === 'false')) {
      filter.helpful = q.helpful === 'true';
    }

    const filename = `feedback-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.write(CSV_COLUMNS.join(',') + '\n');
    const cursor = Feedback.find(filter).sort({ createdAt: -1 }).cursor();
    for await (const doc of cursor) {
      const obj = doc.toObject({ versionKey: false }) as Record<string, unknown>;
      const row = CSV_COLUMNS.map((col) => csvCell(obj[col])).join(',');
      res.write(row + '\n');
    }
    res.end();
  } catch (err) {
    httpLog.warn(`[feedback] export failed: ${(err as Error).message}`);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    } else {
      res.end();
    }
  }
};

/**
 * Hook used by the graceful-shutdown handler. Currently a no-op because
 * feedback writes are direct `Feedback.create` calls; left in place so
 * a future buffered-write implementation can plug in without changing
 * the shutdown plumbing.
 */
export async function flushFeedbackBuffers(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    await Promise.resolve();
  }
}