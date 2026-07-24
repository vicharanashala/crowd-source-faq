/**
 * apiUsageLog.ts — Shared logger for every external AI API call.
 *
 * v1.79 — Two responsibilities:
 *
 *   1. Emit a structured `aiLog.info` / `aiLog.warn` line for stdout
 *      + Discord/Sentry routing.
 *
 *   2. Persist one document in the `AiApiCall` collection so admins
 *      can filter, paginate, and export the full history. The write
 *      is fire-and-forget — failure to persist must never break the
 *      AI pipeline (the call already happened; logging it is the
 *      only thing we control here).
 *
 * Context (batchId/userId/requestId) is read from the request-scoped
 * AsyncLocalStorage (`getContext()`) automatically. Callers may also
 * pass explicit context to override (e.g. cron jobs without a request).
 */

import { Types } from 'mongoose';
import { aiLog } from '../http/logger.js';
import { AiApiCall } from '../../modules/ai/ai-api-call.model.js';
import { getContext } from '../http/requestContext.js';

export type AiApiKind = 'inference' | 'embedding';
export type AiApiStatus = 'ok' | 'fail';

export interface AiApiCallContext {
  batchId?: string | Types.ObjectId | null;
  userId?: string | Types.ObjectId | null;
  userEmail?: string;
  userRole?: string;
  requestId?: string;
}

export interface AiApiUsageSuccess extends AiApiCallContext {
  kind: AiApiKind;
  provider: string;
  modelName: string;
  feature?: string;
  durationMs: number;
  tokensUsed?: number;
  estimatedCostUsd?: number;
  httpStatus?: number;
}

export interface AiApiUsageFailure extends AiApiCallContext {
  kind: AiApiKind;
  provider: string;
  modelName: string;
  feature?: string;
  durationMs: number;
  error: string;
  status?: number;
  errorKind?: string;
  /** Outgoing request body that the upstream rejected — persisted to
   *  the AiApiCall doc so admins can diagnose schema mismatches with
   *  custom / proxied providers (e.g. field-name renames done by an
   *  in-house relay). Capped at 2KB to keep audit rows small. */
  requestBody?: unknown;
}

export function logAiApiSuccess(usage: AiApiUsageSuccess): void {
  const meta: Record<string, unknown> = {
    kind: usage.kind,
    provider: usage.provider,
    modelName: usage.modelName,
    durationMs: usage.durationMs,
  };
  if (usage.feature) meta.feature = usage.feature;
  if (usage.batchId) meta.batchId = usage.batchId;
  if (usage.userId) meta.userId = usage.userId;
  if (usage.requestId) meta.requestId = usage.requestId;
  if (typeof usage.tokensUsed === 'number') meta.tokensUsed = usage.tokensUsed;
  if (typeof usage.estimatedCostUsd === 'number') meta.estimatedCostUsd = usage.estimatedCostUsd;
  if (typeof usage.httpStatus === 'number') meta.httpStatus = usage.httpStatus;

  aiLog.info(
    `AI ${usage.kind} OK · ${usage.provider}/${usage.modelName}` +
      (usage.feature ? ` · ${usage.feature}` : '') +
      ` · ${usage.durationMs}ms` +
      (typeof usage.tokensUsed === 'number' ? ` · ${usage.tokensUsed}tok` : ''),
    meta,
  );

  void persistCall({
    kind: usage.kind,
    status: 'ok',
    provider: usage.provider,
    modelName: usage.modelName,
    feature: usage.feature,
    durationMs: usage.durationMs,
    tokensUsed: usage.tokensUsed,
    estimatedCostUsd: usage.estimatedCostUsd,
    httpStatus: usage.httpStatus,
    batchId: usage.batchId,
    userId: usage.userId,
    userEmail: usage.userEmail,
    userRole: usage.userRole,
    requestId: usage.requestId,
  });
}

export function logAiApiFailure(usage: AiApiUsageFailure): void {
  const meta: Record<string, unknown> = {
    kind: usage.kind,
    provider: usage.provider,
    modelName: usage.modelName,
    durationMs: usage.durationMs,
    error: usage.error,
  };
  if (usage.feature) meta.feature = usage.feature;
  if (usage.batchId) meta.batchId = usage.batchId;
  if (usage.userId) meta.userId = usage.userId;
  if (usage.requestId) meta.requestId = usage.requestId;
  if (typeof usage.status === 'number') meta.status = usage.status;
  if (usage.errorKind) meta.errorKind = usage.errorKind;

  aiLog.warn(
    `AI ${usage.kind} FAIL · ${usage.provider}/${usage.modelName}` +
      (usage.feature ? ` · ${usage.feature}` : '') +
      ` · ${usage.durationMs}ms` +
      (typeof usage.status === 'number' ? ` · HTTP ${usage.status}` : '') +
      ` · ${usage.error}`,
    meta,
  );

  if (usage.requestBody !== undefined) {
    try {
      const s = JSON.stringify(usage.requestBody);
      meta.requestBody = s.length > 2000 ? s.slice(0, 2000) + '…' : s;
    } catch {
      meta.requestBody = '[unstringifiable]';
    }
  }

  void persistCall({
    kind: usage.kind,
    status: 'fail',
    provider: usage.provider,
    modelName: usage.modelName,
    feature: usage.feature,
    durationMs: usage.durationMs,
    httpStatus: usage.status,
    error: usage.error,
    errorKind: usage.errorKind ?? classifyError(usage.error, usage.status),
    requestBody: stringifyBody(usage.requestBody),
    batchId: usage.batchId,
    userId: usage.userId,
    userEmail: usage.userEmail,
    userRole: usage.userRole,
    requestId: usage.requestId,
  });
}

/**
 * Safely stringify an arbitrary value (e.g. an outgoing fetch body) for
 * storage. Returns undefined when there's nothing to store so the
 * `requestBody?: string` column stays sparse instead of holding `null`.
 */
function stringifyBody(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return undefined;
  }
}

function classifyError(errorMessage: string, httpStatus?: number): string {
  if (httpStatus === 401 || httpStatus === 403) return 'auth';
  if (httpStatus === 408 || httpStatus === 504) return 'timeout';
  if (httpStatus === 429) return 'rate_limit';
  if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) return 'validation';
  const lower = (errorMessage ?? '').toLowerCase();
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('aborted')) return 'timeout';
  if (lower.includes('rate') || lower.includes('quota') || lower.includes('429')) return 'rate_limit';
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('api key')) return 'auth';
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('network')) return 'network';
  return 'unknown';
}

interface PersistArgs {
  kind: AiApiKind;
  status: AiApiStatus;
  provider: string;
  modelName: string;
  feature?: string;
  durationMs: number;
  tokensUsed?: number;
  estimatedCostUsd?: number;
  httpStatus?: number;
  error?: string;
  errorKind?: string;
  requestBody?: string;
  batchId?: string | Types.ObjectId | null;
  userId?: string | Types.ObjectId | null;
  userEmail?: string;
  userRole?: string;
  requestId?: string;
}

async function persistCall(args: PersistArgs): Promise<void> {
  try {
    const ctx = getContext();
    const batchId = args.batchId ?? ctx?.batchId ?? null;
    const userId = args.userId ?? ctx?.userId ?? null;
    const requestId = args.requestId ?? ctx?.requestId;

    await AiApiCall.create({
      kind: args.kind,
      status: args.status,
      provider: args.provider,
      modelName: args.modelName,
      feature: args.feature,
      durationMs: args.durationMs,
      tokensUsed: args.tokensUsed,
      estimatedCostUsd: args.estimatedCostUsd,
      httpStatus: args.httpStatus,
      error: args.error ? String(args.error).slice(0, 500) : undefined,
      errorKind: args.errorKind,
      requestBody: args.requestBody,
      batchId: batchId ? toObjectId(batchId) : null,
      userId: userId ? toObjectId(userId) : null,
      userEmail: args.userEmail,
      userRole: args.userRole,
      requestId,
    });
  } catch (err) {
    aiLog.warn(
      `AI ${args.kind} audit-log persist failed · ${args.provider}/${args.modelName}` +
        ` · ${(err as Error).message ?? 'unknown error'}`,
      { auditError: (err as Error).message },
    );
  }
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}