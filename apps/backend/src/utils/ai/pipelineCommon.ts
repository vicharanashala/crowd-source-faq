/**
 * pipelineCommon.ts — Shared utilities for AI pipeline controllers.
 *
 * Exposes:
 *  - searchKnowledgeWithFallback  — search with circuit breaker fallback
 *  - triageByScore                — threshold-based decision: auto-approve / queue / escalate
 *  - updateAuditMeta              — set lastCheckedAt + reviewCycle on any document
 *  - logPipelineEvent             — structured logging for pipeline runs
 *
 * Used by: autoAnswerController, faqAuditController
 */
import { Types } from 'mongoose';
import { logger } from '../http/logger.js';

// ─── Search with circuit-breaker fallback ─────────────────────────────────────

/**
 * Search knowledge base with a graceful circuit-breaker fallback.
 * If the knowledge base is unavailable, returns null instead of throwing.
 * This prevents a single downstream failure from stopping the whole pipeline.
 */
export async function searchKnowledgeWithFallback(
  query: string,
  topK = 5
): Promise<unknown[] | null> {
  try {
    const { searchKnowledge } = await import('../../modules/knowledge/knowledge-base.service.js');
    return await searchKnowledge(query, topK);
  } catch (err) {
    logger.warn(`[pipeline] searchKnowledge failed for "${query.slice(0, 50)}": ${(err as Error).message}`);
    return null;
  }
}

// ─── Threshold-based triage ───────────────────────────────────────────────────

export type TriageVerdict = 'auto_approve' | 'queue_review' | 'escalate';

export interface TriageResult {
  verdict: TriageVerdict;
  confidence: number;
  reason: string;
}

/**
 * Apply threshold rules to decide what to do with an AI-generated answer or audit finding.
 *
 * @param confidence  — score from 0–1
 * @param opts        — override thresholds (reads env vars as defaults)
 */
export function triageByScore(
  confidence: number,
  opts?: {
    approveThreshold?: number;
    queueThreshold?: number;
    minConfidence?: number;
  }
): TriageResult {
  const approveThreshold = opts?.approveThreshold ?? parseFloat(process.env['PIPELINE_APPROVE_THRESHOLD'] ?? '0.85');
  const queueThreshold   = opts?.queueThreshold   ?? parseFloat(process.env['PIPELINE_QUEUE_THRESHOLD']   ?? '0.60');
  const minConfidence    = opts?.minConfidence    ?? parseFloat(process.env['PIPELINE_MIN_CONFIDENCE']    ?? '0.35');

  // Low confidence — always escalate for human judgment
  if (confidence < minConfidence || isNaN(confidence)) {
    return { verdict: 'escalate', confidence, reason: `Low AI confidence (${Math.round(confidence * 100)}%) — human review required` };
  }

  if (confidence >= approveThreshold) {
    return { verdict: 'auto_approve', confidence, reason: `High confidence (${Math.round(confidence * 100)}%) — auto-approved` };
  }

  if (confidence >= queueThreshold) {
    return { verdict: 'queue_review', confidence, reason: `Medium confidence (${Math.round(confidence * 100)}%) — queued for review` };
  }

  return { verdict: 'escalate', confidence, reason: `Below queue threshold — escalated for human review` };
}

// ─── Audit metadata update ────────────────────────────────────────────────────

/**
 * Build the update object for setting lastCheckedAt and reviewCycle.
 * Returns both fields so callers can $set or $inc as appropriate.
 */
export function buildAuditMetaUpdate(
  existingCycle?: number
): { $set: { lastCheckedAt: Date }; $inc: { reviewCycle: number } } {
  return {
    $set: { lastCheckedAt: new Date() },
    $inc: { reviewCycle: 1 },
  };
}

/**
 * Apply lastCheckedAt + reviewCycle to a document by model.
 * Works for CommunityPost and FAQ (both have the same field shape).
 */
export async function touchDocument(
  modelName: 'CommunityPost' | 'FAQ',
  docId: Types.ObjectId,
  existingCycle?: number
): Promise<void> {
  const now = new Date();
  const inc = existingCycle != null ? { $inc: { reviewCycle: 1 }, $set: { lastCheckedAt: now } } : { $set: { lastCheckedAt: now } };
  // Dynamically resolve to avoid circular imports
  const Model = (await import(`../../models/${modelName}.js`)).default;
  await Model.updateOne({ _id: docId }, inc);
}

// ─── Pipeline event logging ───────────────────────────────────────────────────

export interface PipelineLogMeta {
  pipeline: string;
  action: string;
  targetId?: string;
  targetTitle?: string;
  confidence?: number;
  verdict?: string;
  flagged?: boolean;
  durationMs?: number;
  error?: string;
}

export function logPipelineEvent(meta: PipelineLogMeta): void {
  const { pipeline, action, targetId, targetTitle, confidence, verdict, flagged, durationMs, error } = meta;
  const label = `[${pipeline}] ${action}`;
  const context = [
    targetId    ? `id=${targetId}`             : null,
    targetTitle ? `title="${targetTitle.slice(0, 40)}"` : null,
    confidence  != null ? `conf=${(confidence * 100).toFixed(0)}%` : null,
    verdict     ? `verdict=${verdict}`          : null,
    flagged     != null ? `flagged=${flagged}`  : null,
    durationMs  != null ? `ms=${durationMs}`    : null,
    error       ? `error=${error}`              : null,
  ].filter(Boolean).join(' ');

  if (error) {
    logger.error(`${label} ${context}`);
  } else if (flagged) {
    logger.warn(`${label} ${context}`);
  } else {
    logger.info(`${label} ${context}`);
  }
}

// ─── Sensitive-topic detection (shared) ───────────────────────────────────────

const SENSITIVE_PATTERNS = [
  'how to hack', 'exploit', 'vulnerability', 'breach', 'attack',
  'password', 'credentials', 'secret', 'api.?key', 'token',
  'payment', 'billing', 'credit card', 'ssn', 'personal data',
  'gdpr', 'legal', 'compliance', 'contract', 'lawsuit',
  'firing', 'termination', 'hr complaint', 'discrimination',
  'security incident', 'data breach', 'unauthorized',
];

const sensitiveRegex = SENSITIVE_PATTERNS.map((p) => new RegExp(p, 'i'));

/**
 * Check if a piece of text describes sensitive topics that should
 * always be escalated to human review regardless of AI confidence.
 */
export function isSensitiveContent(text: string): boolean {
  const lower = text.toLowerCase();
  return sensitiveRegex.some((re) => re.test(lower));
}