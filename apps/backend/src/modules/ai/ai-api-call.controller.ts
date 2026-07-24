/**
 * ai-api-call.controller.ts
 *
 * Admin observability for the AI API call audit log. Every external
 * AI call (chat + embedding) is persisted to the `AiApiCall`
 * collection via utils/ai/apiUsageLog.ts. This controller exposes
 * the data through four admin endpoints:
 *
 *   GET    /api/admin/ai/api-logs              → paginated table w/ filters
 *   GET    /api/admin/ai/api-logs/stats        → Datadog-style aggregations
 *   GET    /api/admin/ai/api-logs/:id          → single-record detail
 *   GET    /api/admin/ai/api-logs/export       → CSV stream for a date range
 *   POST   /api/admin/ai/api-logs/cleanup      → granular delete (age | range | day | hour)
 *   POST   /api/admin/ai/api-logs/cleanup/preview → count-only preview for the UI
 *
 * All routes are adminOnly (existing middleware on the /admin router).
 */

import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  AiApiCall,
  buildCleanupQuery,
  cleanupApiCalls,
  type AiApiCallCleanupFilter,
  type AiApiCallCleanupResult,
  type IAiApiCall,
} from './ai-api-call.model.js';
import { logAction } from '../admin/admin.controller.js';

// ── helpers ─────────────────────────────────────────────────────────────────

type SortKey = 'createdAt' | 'durationMs' | 'estimatedCostUsd' | 'tokensUsed';
type SortOrder = 'asc' | 'desc';

/** Parse a query-string param into a Date, or undefined if absent/invalid. */
function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Clamp `limit` to [1, 100] with a sensible default. */
function parseLimit(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(n, 100);
}

function parsePage(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function asObjectIdOrEmpty(value: unknown): Types.ObjectId | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined;
}

/** Project a mongoose doc to the wire shape — drops __v, keeps all business fields. */
function toWireShape(doc: IAiApiCall): Record<string, unknown> {
  const obj = doc.toObject({ versionKey: false });
  // Stringify ObjectIds so the JSON is easy to consume in the admin UI.
  if (obj.batchId) obj.batchId = String(obj.batchId);
  if (obj.userId) obj.userId = String(obj.userId);
  obj._id = String(obj._id);
  return obj;
}

/** Compute a percentile from a sorted-ascending array of numbers. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

/** Sum a numeric field safely across an aggregation row. */
function safeNum(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

// ── GET /api/admin/ai/api-logs ───────────────────────────────────────────────

export const listAiApiLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const page = parsePage(q.page);
    const limit = parseLimit(q.limit);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (typeof q.provider === 'string' && q.provider.length > 0) filter.provider = q.provider;
    if (typeof q.feature === 'string' && q.feature.length > 0) filter.feature = q.feature;
    if (q.status === 'ok' || q.status === 'fail') filter.status = q.status;
    if (q.kind === 'inference' || q.kind === 'embedding') filter.kind = q.kind;
    const batchOid = asObjectIdOrEmpty(q.batchId);
    if (batchOid) filter.batchId = batchOid;
    const userOid = asObjectIdOrEmpty(q.userId);
    if (userOid) filter.userId = userOid;
    const fromDate = parseDate(q.fromDate);
    const toDate = parseDate(q.toDate);
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) (filter.createdAt as Record<string, Date>).$gte = fromDate;
      if (toDate) (filter.createdAt as Record<string, Date>).$lte = toDate;
    }
    if (typeof q.search === 'string' && q.search.trim().length > 0) {
      const rx = new RegExp(q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { modelName: rx },
        { userEmail: rx },
        { error: rx },
        { requestId: rx },
      ];
    }

    const sortKey: SortKey = (['createdAt', 'durationMs', 'estimatedCostUsd', 'tokensUsed'] as SortKey[])
      .includes(q.sort as SortKey) ? (q.sort as SortKey) : 'createdAt';
    const sortOrder: SortOrder = q.order === 'asc' ? 'asc' : 'desc';
    const sort: Record<string, 1 | -1> = { [sortKey]: sortOrder === 'asc' ? 1 : -1 };

    const [docs, total] = await Promise.all([
      AiApiCall.find(filter).sort(sort).skip(skip).limit(limit).lean<IAiApiCall[]>({ virtuals: false, versionKey: false }),
      AiApiCall.countDocuments(filter),
    ]);

    const logs = docs.map((d) => {
      const obj = { ...d } as Record<string, unknown>;
      if (obj.batchId) obj.batchId = String(obj.batchId);
      if (obj.userId) obj.userId = String(obj.userId);
      obj._id = String(obj._id);
      return obj;
    });

    res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    // eslint-disable-next-line no-console -- admin error path
    console.error('[ai-api-logs] list failed', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/admin/ai/api-logs/stats ─────────────────────────────────────────

export const getAiApiLogStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const now = new Date();
    const toDate = parseDate(q.toDate) ?? now;
    const fromDate = parseDate(q.fromDate) ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const windowMs = Math.max(0, toDate.getTime() - fromDate.getTime());
    const windowHours = +(windowMs / (60 * 60 * 1000)).toFixed(2);

    const dateMatch = { createdAt: { $gte: fromDate, $lte: toDate } };

    const [
      totalsAgg,
      durations,
      byProviderAgg,
      byFeatureAgg,
      byKindAgg,
      topErrorsAgg,
      topUsersAgg,
      topModelsAgg,
    ] = await Promise.all([
      AiApiCall.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            successCalls: { $sum: { $cond: [{ $eq: ['$status', 'ok'] }, 1, 0] } },
            failCalls: { $sum: { $cond: [{ $eq: ['$status', 'fail'] }, 1, 0] } },
            totalCostUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
            totalTokens: { $sum: { $ifNull: ['$tokensUsed', 0] } },
            sumDurationMs: { $sum: '$durationMs' },
          },
        },
      ]),
      AiApiCall.find(dateMatch).select({ durationMs: 1 }).lean<{ durationMs: number }[]>(),
      AiApiCall.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: '$provider',
            calls: { $sum: 1 },
            successCalls: { $sum: { $cond: [{ $eq: ['$status', 'ok'] }, 1, 0] } },
            costUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
            sumDurationMs: { $sum: '$durationMs' },
          },
        },
        { $sort: { calls: -1 } },
      ]),
      AiApiCall.aggregate([
        { $match: { ...dateMatch, feature: { $ne: null } } },
        {
          $group: {
            _id: '$feature',
            calls: { $sum: 1 },
            successCalls: { $sum: { $cond: [{ $eq: ['$status', 'ok'] }, 1, 0] } },
            costUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
          },
        },
        { $sort: { calls: -1 } },
      ]),
      AiApiCall.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: '$kind',
            calls: { $sum: 1 },
            successCalls: { $sum: { $cond: [{ $eq: ['$status', 'ok'] }, 1, 0] } },
          },
        },
        { $sort: { calls: -1 } },
      ]),
      AiApiCall.aggregate([
        { $match: { ...dateMatch, status: 'fail' } },
        {
          $group: {
            _id: '$errorKind',
            count: { $sum: 1 },
            lastSeen: { $max: '$createdAt' },
            sampleError: { $first: '$error' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      AiApiCall.aggregate([
        { $match: { ...dateMatch, userId: { $ne: null } } },
        {
          $group: {
            _id: '$userId',
            userEmail: { $first: '$userEmail' },
            calls: { $sum: 1 },
            costUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
          },
        },
        { $sort: { costUsd: -1 } },
        { $limit: 5 },
      ]),
      AiApiCall.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: { provider: '$provider', modelName: '$modelName' },
            calls: { $sum: 1 },
            costUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
            sumDurationMs: { $sum: '$durationMs' },
          },
        },
        { $sort: { costUsd: -1 } },
        { $limit: 5 },
      ]),
    ]);

    // Time-series bucketing. Bucket size adapts to window: hourly <=24h, 6h <=7d, daily otherwise.
    const bucketMs =
      windowHours <= 24 ? 60 * 60 * 1000 :
      windowHours <= 24 * 7 ? 6 * 60 * 60 * 1000 :
      24 * 60 * 60 * 1000;
    const timeSeriesAgg = await AiApiCall.aggregate([
      { $match: dateMatch },
      {
        $group: {
          _id: {
            $toDate: {
              $subtract: [
                { $toLong: '$createdAt' },
                { $mod: [{ $toLong: '$createdAt' }, bucketMs] },
              ],
            },
          },
          calls: { $sum: 1 },
          successCalls: { $sum: { $cond: [{ $eq: ['$status', 'ok'] }, 1, 0] } },
          costUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
          sumDurationMs: { $sum: '$durationMs' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalsRow = totalsAgg[0] as Record<string, unknown> | undefined;
    const totalCalls = safeNum(totalsRow?.totalCalls);
    const successCalls = safeNum(totalsRow?.successCalls);
    const failCalls = safeNum(totalsRow?.failCalls);
    const totalCostUsd = +safeNum(totalsRow?.totalCostUsd).toFixed(6);
    const totalTokens = safeNum(totalsRow?.totalTokens);
    const avgDurationMs = totalCalls > 0 ? Math.round(safeNum(totalsRow?.sumDurationMs) / totalCalls) : 0;

    const sortedDurations = durations.map((d) => safeNum(d.durationMs)).sort((a, b) => a - b);

    res.json({
      windowHours,
      fromDate: fromDate.toISOString(),
      toDate: toDate.toISOString(),
      bucketMs,
      totals: {
        totalCalls,
        successCalls,
        failCalls,
        successRate: totalCalls > 0 ? +(successCalls / totalCalls).toFixed(4) : 0,
        totalCostUsd,
        totalTokens,
        avgDurationMs,
        p50DurationMs: percentile(sortedDurations, 50),
        p95DurationMs: percentile(sortedDurations, 95),
        p99DurationMs: percentile(sortedDurations, 99),
      },
      byProvider: byProviderAgg.map((r) => {
        const o = r as Record<string, unknown>;
        const calls = safeNum(o.calls);
        return {
          provider: o._id as string,
          calls,
          successRate: calls > 0 ? +(safeNum(o.successCalls) / calls).toFixed(4) : 0,
          costUsd: +safeNum(o.costUsd).toFixed(6),
          avgDurationMs: calls > 0 ? Math.round(safeNum(o.sumDurationMs) / calls) : 0,
        };
      }),
      byFeature: byFeatureAgg.map((r) => {
        const o = r as Record<string, unknown>;
        const calls = safeNum(o.calls);
        return {
          feature: (o._id as string | null) ?? 'unknown',
          calls,
          successRate: calls > 0 ? +(safeNum(o.successCalls) / calls).toFixed(4) : 0,
          costUsd: +safeNum(o.costUsd).toFixed(6),
        };
      }),
      byKind: byKindAgg.map((r) => {
        const o = r as Record<string, unknown>;
        const calls = safeNum(o.calls);
        return {
          kind: o._id as string,
          calls,
          successRate: calls > 0 ? +(safeNum(o.successCalls) / calls).toFixed(4) : 0,
        };
      }),
      timeSeries: timeSeriesAgg.map((r) => {
        const o = r as Record<string, unknown>;
        const calls = safeNum(o.calls);
        return {
          bucketStart: (o._id as Date).toISOString(),
          calls,
          successCalls: safeNum(o.successCalls),
          costUsd: +safeNum(o.costUsd).toFixed(6),
          avgDurationMs: calls > 0 ? Math.round(safeNum(o.sumDurationMs) / calls) : 0,
        };
      }),
      topErrors: topErrorsAgg.map((r) => {
        const o = r as Record<string, unknown>;
        return {
          errorKind: (o._id as string | null) ?? 'unknown',
          count: safeNum(o.count),
          lastSeen: (o.lastSeen as Date).toISOString(),
          sampleError: (o.sampleError as string | null) ?? null,
        };
      }),
      topUsers: topUsersAgg.map((r) => {
        const o = r as Record<string, unknown>;
        return {
          userId: String(o._id),
          userEmail: (o.userEmail as string | null) ?? null,
          calls: safeNum(o.calls),
          costUsd: +safeNum(o.costUsd).toFixed(6),
        };
      }),
      topModels: topModelsAgg.map((r) => {
        const o = r as Record<string, unknown>;
        const key = o._id as { provider: string; modelName: string };
        const calls = safeNum(o.calls);
        return {
          provider: key.provider,
          modelName: key.modelName,
          calls,
          costUsd: +safeNum(o.costUsd).toFixed(6),
          avgDurationMs: calls > 0 ? Math.round(safeNum(o.sumDurationMs) / calls) : 0,
        };
      }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console -- admin error path
    console.error('[ai-api-logs] stats failed', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/admin/ai/api-logs/:id ───────────────────────────────────────────

export const getAiApiLogById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid id' });
      return;
    }
    const doc = await AiApiCall.findById(id);
    if (!doc) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    res.json({ log: toWireShape(doc) });
  } catch (err) {
    // eslint-disable-next-line no-console -- admin error path
    console.error('[ai-api-logs] getById failed', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/admin/ai/api-logs/export ───────────────────────────────────────

const CSV_COLUMNS = [
  'createdAt',
  'kind',
  'status',
  'provider',
  'modelName',
  'feature',
  'batchId',
  'userEmail',
  'userRole',
  'tokensUsed',
  'estimatedCostUsd',
  'durationMs',
  'httpStatus',
  'errorKind',
  'error',
  'requestId',
] as const;

/** Minimal CSV cell escaper: quote-wrap anything with comma, quote, or newline. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const exportAiApiLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const fromDate = parseDate(q.fromDate);
    const toDate = parseDate(q.toDate);
    const filter: Record<string, unknown> = {};
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) (filter.createdAt as Record<string, Date>).$gte = fromDate;
      if (toDate) (filter.createdAt as Record<string, Date>).$lte = toDate;
    }
    if (typeof q.provider === 'string' && q.provider.length > 0) filter.provider = q.provider;

    const filename = `ai-api-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream header
    res.write(CSV_COLUMNS.join(',') + '\n');

    // Cursor stream for memory safety on large ranges.
    const cursor = AiApiCall.find(filter).sort({ createdAt: -1 }).cursor();
    for await (const doc of cursor) {
      const obj = doc.toObject({ versionKey: false });
      const row = CSV_COLUMNS.map((col) => csvCell((obj as Record<string, unknown>)[col])).join(',');
      res.write(row + '\n');
    }
    res.end();
  } catch (err) {
    // eslint-disable-next-line no-console -- admin error path
    console.error('[ai-api-logs] export failed', err);
    // If we already started writing the response we can't switch to JSON.
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    } else {
      res.end();
    }
  }
};

// ── POST /api/admin/ai/api-logs/cleanup/preview ────────────────────────────
// Counts the records that WOULD be deleted by the given filter, without
// actually deleting. Lets the admin UI show "Will delete ~N records"
// before they confirm.

export const previewAiApiLogCleanup = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body ?? {}) as AiApiCallCleanupFilter;
    const { query } = buildCleanupQuery(body);
    const count = await AiApiCall.countDocuments(query);
    res.json({ count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid cleanup filter';
    res.status(400).json({ message: msg, count: 0 });
  }
};

// ── POST /api/admin/ai/api-logs/cleanup ─────────────────────────────────────
// Granular delete. Accepts one of four modes (see AiApiCallCleanupFilter).
// Returns the resolved bounds + deleted count so the UI can show what
// was actually removed.

export const cleanupAiApiLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body ?? {}) as AiApiCallCleanupFilter;
    const result: AiApiCallCleanupResult = await cleanupApiCalls(body);

    await logAction(
      (req as { user?: { id?: string } }).user?.id ?? 'system',
      'cleanup_ai_api_logs',
      'ai_api_logs',
      'ai_api_logs',
      JSON.stringify({ mode: result.mode, deletedCount: result.deletedCount, matched: result.matchedQuery }),
    );

    res.json({
      deletedCount: result.deletedCount,
      mode: result.mode,
      matchedQuery: result.matchedQuery,
      cutoffIso: result.cutoffIso,
      fromIso: result.fromIso,
      toIso: result.toIso,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid cleanup filter';
    res.status(400).json({ message: msg, deletedCount: 0 });
  }
};