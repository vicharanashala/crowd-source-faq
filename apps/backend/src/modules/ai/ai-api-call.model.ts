/**
 * AiApiCall — per-call audit log for every external AI API request.
 *
 * v1.79 — Replaces the implicit "stdout + Discord/Sentry on warn"
 * audit trail in apiUsageLog.ts with a queryable, paginated, exportable
 * record. One document per API call:
 *
 *   - Chat (inference) calls:  utils/ai/aiProvider.ts → chatWithProvider
 *   - Embedding calls:        utils/ai/embeddings.ts → callCustomEmbedding
 *   - Both routes funnel into logAiApiSuccess/logAiApiFailure which
 *     fire-and-forget persists here in addition to the named logger.
 *
 * Fields intentionally cover every audit question an admin would ask:
 *   - Which provider/model/feature was hit?
 *   - Which batch did it belong to? (null = global)
 *   - Which user triggered it?
 *   - Did it succeed? How long did it take? Tokens + cost?
 *   - If it failed, what was the HTTP status and error message?
 *
 * Indexes are sized for the three most common admin queries:
 *   - "Show me everything for batch X in the last 24h" — (batchId, createdAt)
 *   - "Top spenders by provider" — (provider, createdAt)
 *   - "Why did feature X start failing today?" — (feature, createdAt, status)
 *   - "How many calls did user Y make?" — (userId, createdAt)
 *
 * Retention: see cleanupOldApiCalls() in this file. Called from
 * /admin/ai/usage/logs when the result set hits a threshold, and
 * scheduled via cron if you wire it (not done here).
 */
import mongoose, { Schema, type Document, Types } from 'mongoose';

export type AiApiCallKind = 'inference' | 'embedding';
export type AiApiCallStatus = 'ok' | 'fail';

export interface IAiApiCall extends Document {
  // When the external API call returned (or threw).
  createdAt: Date;
  updatedAt: Date;

  kind: AiApiCallKind;        // 'inference' | 'embedding'
  status: AiApiCallStatus;    // 'ok' | 'fail'

  provider: string;           // 'anthropic' | 'openai' | ...
  // Note: not `model` because Mongoose's Document base type has a
  // `model` getter that conflicts with a `string` field of the same
  // name. Use `modelName` everywhere in this codebase.
  modelName: string;          // 'claude-3-5-sonnet-...' | 'text-embedding-3-small' | ...
  feature?: string;           // 'duplicateDetection' | 'knowledgeExtraction' | ... (inference only)

  // Tenant scope. null = global call (no batchId in context).
  batchId?: Types.ObjectId | null;

  // Who triggered the call. null = system (cron, anonymous public path).
  userId?: Types.ObjectId | null;
  userEmail?: string;         // snapshot for audit even if user is deleted
  userRole?: string;

  // Cost & usage. Embeddings have no token counter; that's why these
  // are optional.
  tokensUsed?: number;
  estimatedCostUsd?: number;
  durationMs: number;

  // Failure metadata. Populated only when status === 'fail'.
  httpStatus?: number;        // HTTP status from the upstream provider
  error?: string;             // truncated error message
  errorKind?: string;         // 'timeout' | 'rate_limit' | 'auth' | 'network' | 'unknown'
  /** Outgoing request body that the upstream rejected (stringified, <=2KB).
   *  Only populated on failure. Helps admins spot schema mismatches with
   *  custom / proxied providers — e.g. when a relay renames `model` to
   *  `modelName` before forwarding to Groq. */
  requestBody?: string;

  // A short correlation id (e.g. request id) so admins can grep logs
  // by request — populated from x-request-id header when present.
  requestId?: string;
}

const aiApiCallSchema = new Schema<IAiApiCall>(
  {
    kind: { type: String, enum: ['inference', 'embedding'], required: true },
    status: { type: String, enum: ['ok', 'fail'], required: true },

    provider: { type: String, required: true },
    modelName: { type: String, required: true },
    feature: { type: String },

    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userEmail: { type: String },
    userRole: { type: String },

    tokensUsed: { type: Number },
    estimatedCostUsd: { type: Number },
    durationMs: { type: Number, required: true },

    httpStatus: { type: Number },
    error: { type: String },
    errorKind: { type: String },
    requestBody: { type: String },
    requestId: { type: String },
  },
  {
    timestamps: true,
    // Keep doc size small — we expect millions of these over time.
    minimize: false,
  },
);

// Compound indexes — every admin query filters by a batch/provider/feature
// window, so a compound index on (X, createdAt desc) is the right shape.
// The descending order on createdAt matches our default sort.
aiApiCallSchema.index({ batchId: 1, createdAt: -1 });
aiApiCallSchema.index({ provider: 1, createdAt: -1 });
aiApiCallSchema.index({ feature: 1, createdAt: -1 });
aiApiCallSchema.index({ userId: 1, createdAt: -1 });
aiApiCallSchema.index({ status: 1, createdAt: -1 });
// TTL-style cap: pure createdAt index is already implicit via the
// compound indexes above; this one supports "give me everything in the
// last N hours, no other filter" queries from the dashboard summary.
aiApiCallSchema.index({ createdAt: -1 });

/**
 * Retention cleanup. Drop docs older than `days`. Safe to call from a
 * cron or ad-hoc — uses bulk delete so it's a single round-trip.
 *
 * Returns the number of deleted docs so the caller can log the count.
 */
export async function cleanupOldApiCalls(days: number = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await AiApiCall.deleteMany({ createdAt: { $lt: cutoff } });
  return result.deletedCount ?? 0;
}

/**
 * Cleanup filter shape accepted by the admin UI. Exactly ONE of the
 * four modes must be populated — the controller validates this before
 * calling {@link cleanupApiCalls}.
 *
 *   days:     delete every doc older than `days` days from now
 *   fromDate: ISO date or datetime; required when using toDate mode
 *   toDate:   ISO date or datetime; required when using fromDate mode
 *   date:     ISO date 'YYYY-MM-DD'; required for both day-mode and
 *             hour-mode. The hour mode adds an optional `hour` (0-23)
 *             which narrows to a single hour bucket of that day.
 */
export interface AiApiCallCleanupFilter {
  days?: number;
  fromDate?: string;
  toDate?: string;
  date?: string;
  hour?: number;
}

/**
 * Cleanup payload returned to the admin UI. Includes the resolved
 * bounds so the UI can show the human-readable range that was
 * actually deleted (not just the raw request input).
 */
export interface AiApiCallCleanupResult {
  deletedCount: number;
  matchedQuery: Record<string, unknown>;
  mode: 'age' | 'range' | 'day' | 'hour';
  // The resolved [gte, lt] window in ISO form, when not 'age' mode.
  // The 'age' mode just has cutoffIso.
  cutoffIso?: string;
  fromIso?: string;
  toIso?: string;
}

/**
 * Build the Mongo query for one of the four cleanup modes without
 * running the delete. Exposed for the preview / count endpoint the
 * UI hits before confirmation.
 *
 * Throws an Error with a user-friendly message if the filter is
 * malformed — the controller maps that to a 400.
 */
export function buildCleanupQuery(filter: AiApiCallCleanupFilter): {
  query: Record<string, unknown>;
  mode: AiApiCallCleanupResult['mode'];
  cutoffIso?: string;
  fromIso?: string;
  toIso?: string;
} {
  if (typeof filter.days === 'number' && Number.isFinite(filter.days) && filter.days > 0) {
    const cutoff = new Date(Date.now() - filter.days * 24 * 60 * 60 * 1000);
    return {
      query: { createdAt: { $lt: cutoff } },
      mode: 'age',
      cutoffIso: cutoff.toISOString(),
    };
  }

  if (filter.fromDate || filter.toDate) {
    if (!filter.fromDate || !filter.toDate) {
      throw new Error('fromDate and toDate must both be provided for range cleanup.');
    }
    const from = new Date(filter.fromDate);
    const to = new Date(filter.toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error('fromDate and toDate must be valid ISO date strings.');
    }
    if (from >= to) {
      throw new Error('fromDate must be earlier than toDate.');
    }
    return {
      query: { createdAt: { $gte: from, $lt: to } },
      mode: 'range',
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    };
  }

  if (filter.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filter.date)) {
      throw new Error('date must be in YYYY-MM-DD format.');
    }
    // Parse as UTC midnight so the day boundary is timezone-independent.
    // The UI displays dates in the admin's local tz, but the cut is
    // always on UTC to match how Mongo stores createdAt.
    const dayStart = new Date(`${filter.date}T00:00:00.000Z`);
    if (Number.isNaN(dayStart.getTime())) {
      throw new Error('date must be a valid calendar day.');
    }
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    if (typeof filter.hour === 'number') {
      if (!Number.isInteger(filter.hour) || filter.hour < 0 || filter.hour > 23) {
        throw new Error('hour must be an integer between 0 and 23.');
      }
      const hourStart = new Date(dayStart.getTime() + filter.hour * 60 * 60 * 1000);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
      return {
        query: { createdAt: { $gte: hourStart, $lt: hourEnd } },
        mode: 'hour',
        fromIso: hourStart.toISOString(),
        toIso: hourEnd.toISOString(),
      };
    }
    return {
      query: { createdAt: { $gte: dayStart, $lt: dayEnd } },
      mode: 'day',
      fromIso: dayStart.toISOString(),
      toIso: dayEnd.toISOString(),
    };
  }

  throw new Error('Specify one of: days, fromDate+toDate, date, or date+hour.');
}

/**
 * Granular cleanup. Resolves the filter, runs a single bulk delete,
 * and returns the resolved bounds + count. Reuses
 * {@link buildCleanupQuery} for the parsing + bounds math so the
 * preview endpoint and the destructive endpoint cannot disagree.
 */
export async function cleanupApiCalls(
  filter: AiApiCallCleanupFilter,
): Promise<AiApiCallCleanupResult> {
  const { query, mode, cutoffIso, fromIso, toIso } = buildCleanupQuery(filter);
  const result = await AiApiCall.deleteMany(query);
  return {
    deletedCount: result.deletedCount ?? 0,
    matchedQuery: query,
    mode,
    cutoffIso,
    fromIso,
    toIso,
  };
}

export const AiApiCall = mongoose.model<IAiApiCall>('AiApiCall', aiApiCallSchema);