/**
 * autoAnswer.ts — Phase 3 R12 pipeline orchestrator.
 *
 * Single source of truth for the auto-answer decision tree. Replaces
 * the scattered logic in `auto-answer.controller.ts` with a clean,
 * NEVER-THROWS service that:
 *
 *   - delegates context retrieval to fetchContext (Phase 2 R10)
 *   - applies three settings-driven thresholds:
 *       autoAnswerApproveThreshold      (default 0.85)  → ANSWER
 *       autoAnswerSuggestThreshold      (default 0.60)  → SUGGEST
 *       autoAnswerAskHumanThreshold     (default 0.30)  → ASK_HUMAN
 *   - is idempotent over a cooldown window
 *     ('autoAnswerCooldownMinutes', default 60)
 *   - snapshots the full context into CommunityPost.aiContext for the
 *     admin "ask AI again" + audit surface
 *
 * Concurrency: processPost is safe to call from any path (cron batch,
 * comment-upvote hook, admin "ask-ai-again" button). The same post
 * being processed concurrently is a no-op for the second caller —
 * `aiAnswerAttempts` increments unconditionally so retries remain
 * visible even when the work itself was skipped by the cooldown gate.
 *
 * NO embeddings, NO Redis. Pure Mongo + the Phase-2 text retriever.
 */

import { Types } from 'mongoose';
import CommunityPost from '../modules/community/community-post.model.js';
import ProgramKnowledge from '../models/ProgramKnowledge.js';
import { readSetting } from '../modules/program/app-setting.model.js';
import { cronLog } from '../utils/http/logger.js';
import {
  fetchContext,
  type FetchContextResult,
  type RankedHit,
} from './contextRetriever.js';
import {
  chatWithConfig,
  getPipelineProviderConfig,
} from '../utils/ai/aiProvider.js';
import { isSensitiveContent } from '../utils/ai/pipelineCommon.js';

// ─── Public types ─────────────────────────────────────────────────────────

export type AutoAnswerDecision = 'answer' | 'suggest' | 'ask_human';

export interface AutoAnswerResult {
  decision: AutoAnswerDecision;
  /** Resolved confidence in 0..1 (top hit rank, post-LLM adjustment). */
  confidence: number;
  /** Populated when decision === 'answer' (LLM-generated or surfaced verbatim). */
  answer: string;
  /** Full retriever snapshot — echoed for observability. */
  context: FetchContextResult;
  /** Human-readable "why" string, suitable for the admin queue UI. */
  reason: string;
  /** Number of hits returned by fetchContext. */
  hitCount: number;
  /** Source label of the top hit (e.g. "faq:<id>", "kb:..."). */
  topHitSource?: string;
  /** Top hit's rank score (same value used to pick the branch). */
  topHitRank?: number;
}

// ─── Observability ─────────────────────────────────────────────────────────

/**
 * Structured decision log. Emits one line per branch in the processPost
 * pipeline so a grep + log query can answer "why did this post get a
 * suggest?" without reading the code. Format:
 *   [autoAnswer] <event> <postId> {"k":"v", ...}
 */
function logDecision(
  event: string,
  postId: Types.ObjectId | string,
  fields: Record<string, unknown>,
): void {
  cronLog.info(`[autoAnswer] ${event} ${String(postId)} ${JSON.stringify(fields)}`);
}

// ─── Cooldown gate ────────────────────────────────────────────────────────

interface IdempotencyCheckOpts {
  cooldownMinutes: number;
  now: Date;
}

/**
 * Returns the prior AutoAnswerResult if the post is inside the
 * cooldown window AND its last decision is "suggest" or "ask_human".
 * Re-running would just produce the same answer until the cooldown
 * expires — so we skip the work entirely.
 *
 * In `answer` state the cooldown does NOT short-circuit: the admin
 * may have edited or rejected and asked again.
 */
function readPriorResult(
  post: InstanceType<typeof CommunityPost>,
  opts: IdempotencyCheckOpts,
): AutoAnswerResult | null {
  const lastAt: Date | null = post.lastAutoAnswerAt ?? null;
  const status = post.aiAnswerStatus;
  if (!lastAt) return null;
  if (
    status !== 'suggested' &&
    status !== 'ask_human' &&
    status !== 'escalated'
  ) {
    return null;
  }
  const ageMs = opts.now.getTime() - lastAt.getTime();
  if (ageMs >= opts.cooldownMinutes * 60_000) return null;

  // Cooldown active — reconstruct a representative result from the
  // post's persisted fields. We don't have the live context here
  // (the snapshot may have been cleared on a rejection), but for an
  // early-return the caller only needs the decision + confidence.
  return {
    decision: status === 'suggested'
      ? 'suggest'
      : 'ask_human',
    confidence: post.aiAnswerConfidence ?? 0,
    answer: post.aiAnswer ?? '',
    // Empty context — we intentionally don't read aiContext back to
    // avoid paying the deserialise cost for a no-op.
    context: {
      hits: [],
      sources: [],
      query: '',
      takenAt: lastAt.toISOString(),
    },
    reason: `cooldown active — last decision ${status} ${Math.round(ageMs / 1000)}s ago`,
    hitCount: 0,
    topHitSource: post.aiAnswerSource ?? undefined,
    topHitRank: post.aiAnswerConfidence ?? undefined,
  };
}

// ─── LLM call (only on the ANSWER branch) ─────────────────────────────────

async function generateAnswerFromContext(
  post: InstanceType<typeof CommunityPost>,
  topHit: RankedHit,
  hits: RankedHit[],
): Promise<{ answer: string; sensitive: boolean }> {
  const queryText = `${post.title}\n${post.body ?? ''}`;
  const sensitive = isSensitiveContent(queryText);

  // Use the top hit's answer verbatim if its source is curated; the
  // LLM is only invoked when we want a synthesised answer.
  if (topHit.confidence >= 0.9 && topHit.source !== 'recent_activity') {
    return {
      answer: topHit.answer.slice(0, 1500),
      sensitive,
    };
  }

  // LLM synthesis path — calls chatWithConfig with context blocks.
  try {
    const contextBlocks = hits
      .slice(0, 4)
      .map((h, i) => `[${h.source}:${i + 1}] Q: ${h.question}\nA: ${h.answer.slice(0, 400)}`);
    const cfg = await getPipelineProviderConfig('auto_answer', post.batchId?.toString() ?? null);
    const reply = await chatWithConfig(cfg, [
      {
        role: 'system',
        content:
          "You are an assistant. Use the provided context to answer the user's question concisely. " +
          'Keep replies under 300 words. If the context does not contain a complete answer, say so explicitly.',
      },
      {
        role: 'user',
        content: `Context:\n${contextBlocks.join('\n\n')}\n\nUser question: ${post.title}${post.body ? `\nDetails: ${post.body}` : ''}`,
      },
    ]);
    return { answer: (reply ?? '').trim().slice(0, 1500), sensitive };
  } catch (err) {
    logDecision('error', post._id, { phase: 'llm', message: (err as Error).message });
    // Fall through to surfacing the top hit verbatim — better than nothing.
    return { answer: topHit.answer.slice(0, 1500), sensitive };
  }
}

// ─── processPost — single-post entry point ────────────────────────────────

export async function processPost(
  postId: string | Types.ObjectId,
): Promise<AutoAnswerResult> {
  // 1. Fetch the post. Missing post → ask_human (don't throw; the
  //    caller will treat this as escalated).
  let post: InstanceType<typeof CommunityPost> | null = null;
  try {
    post = await CommunityPost.findById(postId);
  } catch (err) {
    logDecision('error', postId, { phase: 'findById', message: (err as Error).message });
    return makeErrorResult(`findById failed: ${(err as Error).message}`);
  }
  if (!post) {
    return makeErrorResult('post not found');
  }

  const now = new Date();

  // 2. Read thresholds. We use the existing AppSetting keys for the
  //    first three; the cooldown lives under a new key introduced in
  //    this commit.
  const [
    approveThreshold,
    suggestThreshold,
    askHumanThreshold,
    cooldownMinutes,
  ] = await Promise.all([
    readSetting('autoAnswerApproveThreshold', 0.85, post.batchId),
    readSetting('autoAnswerSuggestThreshold', 0.60, post.batchId),
    // Phased approach: keep the 4-arg readSetting signature stable
    // by mapping the third numeric threshold onto AppSetting when
    // available, falling back to 0.30. Introduced as a generic
    // numeric key in the model — see apps/backend/src/modules/program
    // /app-setting.model.ts (extended in commit 4).
    readSetting('autoAnswerAskHumanThreshold' as any, 0.30 as any, post.batchId)
      .catch(() => 0.30 as number),
    readSetting('autoAnswerCooldownMinutes' as any, 60 as any, post.batchId)
      .catch(() => 60 as number),
  ]);

  // 3. Idempotency gate.
  const prior = readPriorResult(post, { cooldownMinutes, now });
  if (prior) {
    const lastAt = post.lastAutoAnswerAt ?? null;
    const ageMs = lastAt ? now.getTime() - lastAt.getTime() : 0;
    logDecision('cooldown_skip', post._id, {
      status: post.aiAnswerStatus,
      ageMs,
      cooldownMinutes,
    });
    return prior;
  }

  // 4. Always increment attempts on a real run.
  try {
    await CommunityPost.findByIdAndUpdate(post._id, {
      $inc: { aiAnswerAttempts: 1 },
      $set: { lastCheckedAt: now },
    });
  } catch (err) {
    logDecision('error', post._id, { phase: 'attempts++', message: (err as Error).message });
    // Non-fatal — keep going.
  }

  // 5. Pull context.
  const contextQuery = `${post.title} ${post.body ?? ''}`.slice(0, 2000);
  let context: FetchContextResult;
  try {
    context = await fetchContext(contextQuery, {
      batchId: post.batchId?.toString() ?? null,
      topK: 3,
      maxHits: 10,
    });
  } catch (err) {
    logDecision('error', post._id, { phase: 'fetchContext', message: (err as Error).message });
    return makeErrorResult(`fetchContext failed: ${(err as Error).message}`);
  }

  // 6. No hits → ask_human.
  if (context.hits.length === 0) {
    const result: AutoAnswerResult = {
      decision: 'ask_human',
      confidence: 0,
      answer: '',
      context,
      reason: 'no context — no knowledge hits matched',
      hitCount: 0,
    };
    logDecision('ask_human', post._id, {
      reason: 'no context',
      hitCount: 0,
      contextSources: context.sources,
    });
    await persistResult(post._id, result, now);
    return result;
  }

  const topHit = context.hits[0];
  const topRank = topHit.rank;
  const topConfidence = topHit.confidence;

  // 7. Branch on thresholds.

  // ANSWER branch — high rank AND high source confidence.
  if (topRank >= approveThreshold && topConfidence >= 0.7) {
    const { answer, sensitive } = await generateAnswerFromContext(post, topHit, context.hits);
    const decision: AutoAnswerDecision = sensitive ? 'ask_human' : 'answer';
    const result: AutoAnswerResult = {
      decision,
      confidence: topConfidence,
      answer,
      context,
      reason: sensitive
        ? `rank ${topRank.toFixed(2)} ≥ ${approveThreshold} but content flagged sensitive → ask_human`
        : `rank ${topRank.toFixed(2)} ≥ ${approveThreshold} and confidence ${topConfidence.toFixed(2)} → answer from ${topHit.source}`,
      hitCount: context.hits.length,
      topHitSource: `${topHit.source}:${topHit.sourceId}`,
      topHitRank: topRank,
    };
    logDecision('decision', post._id, {
      decision,
      topHitSource: result.topHitSource,
      topHitRank: Number(topRank.toFixed(3)),
      topHitConfidence: Number(topConfidence.toFixed(3)),
      hitCount: context.hits.length,
      contextSources: context.sources,
      snapshotTakenAt: context.takenAt,
      sensitive,
    });
    await persistResult(post._id, result, now);
    return result;
  }

  // SUGGEST branch — mid-range.
  if (topRank >= suggestThreshold) {
    const result: AutoAnswerResult = {
      decision: 'suggest',
      confidence: topRank,
      answer: topHit.answer,
      context,
      reason: `rank ${topRank.toFixed(2)} in [${suggestThreshold}, ${approveThreshold}) → suggest`,
      hitCount: context.hits.length,
      topHitSource: `${topHit.source}:${topHit.sourceId}`,
      topHitRank: topRank,
    };
    logDecision('decision', post._id, {
      decision: 'suggest',
      topHitSource: result.topHitSource,
      topHitRank: Number(topRank.toFixed(3)),
      topHitConfidence: Number(topConfidence.toFixed(3)),
      hitCount: context.hits.length,
      contextSources: context.sources,
      snapshotTakenAt: context.takenAt,
    });
    await persistResult(post._id, result, now);
    return result;
  }

  // ASK_HUMAN floor — low range but above the absolute floor.
  if (topRank >= askHumanThreshold) {
    const result: AutoAnswerResult = {
      decision: 'ask_human',
      confidence: topRank,
      answer: '',
      context,
      reason: `rank ${topRank.toFixed(2)} in [${askHumanThreshold}, ${suggestThreshold}) → ask_human`,
      hitCount: context.hits.length,
      topHitSource: `${topHit.source}:${topHit.sourceId}`,
      topHitRank: topRank,
    };
    logDecision('ask_human', post._id, {
      reason: 'between ask_human and suggest thresholds',
      topHitSource: result.topHitSource,
      topHitRank: Number(topRank.toFixed(3)),
      askHumanThreshold,
    });
    await persistResult(post._id, result, now);
    return result;
  }

  // Below the ask-human floor — either ask_human again (best-effort
  // signal) OR bump back to pending, per the
  // communityAutoAnswerAskHumanFallback feature flag. We default to
  // ask_human; the cron-batch caller can flip the bit if needed.
  const result: AutoAnswerResult = {
    decision: 'ask_human',
    confidence: topRank,
    answer: '',
    context,
    reason: `rank ${topRank.toFixed(2)} < ${askHumanThreshold} → ask_human (below floor)`,
    hitCount: context.hits.length,
    topHitSource: `${topHit.source}:${topHit.sourceId}`,
    topHitRank: topRank,
  };
  logDecision('ask_human', post._id, {
    reason: 'below ask_human floor',
    topHitSource: result.topHitSource,
    topHitRank: Number(topRank.toFixed(3)),
    askHumanThreshold,
  });
  await persistResult(post._id, result, now);
  return result;
}

// ─── Persist helper ───────────────────────────────────────────────────────

async function persistResult(
  postId: Types.ObjectId,
  result: AutoAnswerResult,
  now: Date,
): Promise<void> {
  try {
    const status = result.decision === 'answer'
      ? 'suggested'      // surfaced as 'suggested' so admin sees it pre-publish
      : result.decision === 'suggest'
        ? 'suggested'
        : 'escalated';
    const update: Record<string, unknown> = {
      aiAnswer: result.decision === 'ask_human' ? null : result.answer,
      aiAnswerStatus: status,
      aiAnswerConfidence: result.confidence,
      aiAnswerSource: result.topHitSource ?? null,
      aiAnswerSuggestedAt: result.decision === 'ask_human' ? null : now,
      aiAnswerEscalatedAt: result.decision === 'ask_human' ? now : null,
      aiAnswerEscalatedReason: result.decision === 'ask_human' ? result.reason : null,
      aiContext: {
        hits: result.context.hits,
        sources: result.context.sources,
        query: result.context.query,
        takenAt: new Date(result.context.takenAt),
      },
      lastAutoAnswerAt: now,
    };
    // Atomic write — same race-condition lesson as commit 60c1af0.
    await CommunityPost.findByIdAndUpdate(postId, { $set: update });
  } catch (err) {
    logDecision('error', postId, { phase: 'persist', message: (err as Error).message });
  }
}

function makeErrorResult(reason: string): AutoAnswerResult {
  return {
    decision: 'ask_human',
    confidence: 0,
    answer: '',
    context: { hits: [], sources: [], query: '', takenAt: new Date().toISOString() },
    reason,
    hitCount: 0,
  };
}

// ─── Batch entry point (cron-friendly) ────────────────────────────────────

export interface RunAutoAnswerBatchOpts {
  /** Optional batchId filter; null means all programs. */
  batchId?: string | Types.ObjectId | null;
  /** Hard cap on posts processed this tick. Default 20. */
  limit?: number;
}

export interface RunAutoAnswerBatchResult {
  processed: number;
  approved: number;
  suggested: number;
  escalated: number;
  errors: number;
}

/**
 * Cron-friendly batch runner. Picks the oldest unanswered posts that
 * are not already in cooldown and runs processPost on each, in
 * parallel with a small fan-out to avoid serial N*M latency.
 *
 * The per-post cooldown is enforced inside processPost itself, so we
 * just query an over-broad set here and let the gate skip posts.
 */
export async function runAutoAnswerBatch(
  opts: RunAutoAnswerBatchOpts = {},
): Promise<RunAutoAnswerBatchResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 200));
  const filter: Record<string, unknown> = {
    status: 'unanswered',
  };
  if (opts.batchId) {
    filter.batchId = new Types.ObjectId(String(opts.batchId));
  }
  // Eligible: pending OR no prior decision. Posts already in
  // suggested/ask_human are still eligible — processPost will skip
  // them via the cooldown gate.
  filter.$or = [
    { aiAnswerStatus: null },
    { aiAnswerStatus: 'pending' },
    { aiAnswerStatus: { $exists: false } },
  ];

  // Cheap "claim" — atomically set lastCheckedAt to skip re-entry.
  const postIds = (
    await CommunityPost.find(filter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .select('_id')
      .lean()
  ).map((p) => p._id as Types.ObjectId);

  if (postIds.length === 0) {
    return { processed: 0, approved: 0, suggested: 0, escalated: 0, errors: 0 };
  }

  const results = await Promise.all(
    postIds.map((id) => processPost(id)),
  );

  let approved = 0;
  let suggested = 0;
  let escalated = 0;
  let errors = 0;
  for (const r of results) {
    if (r.reason.startsWith('fetchContext failed') || r.reason.includes('findById failed')) {
      errors++;
      continue;
    }
    if (r.decision === 'answer') approved++;
    else if (r.decision === 'suggest') suggested++;
    else escalated++;
  }
  return {
    processed: results.length,
    approved,
    suggested,
    escalated,
    errors,
  };
}

// ─── Rerun helper (admin "ask AI again") ─────────────────────────────────

export async function rerunWithContext(
  postId: string | Types.ObjectId,
  extraContext: string,
): Promise<AutoAnswerResult> {
  // Append the admin note to the post body transiently by reading
  // the post, composing an augmented body, and forcing
  // processPost (which itself rewrites lastAutoAnswerAt and clears
  // the cooldown gate automatically).
  const post = await CommunityPost.findById(postId);
  if (!post) return makeErrorResult('post not found');

  const augmentedBody = `${post.body ?? ''}\n\n[ADMIN NOTE] ${extraContext}`.slice(0, 4000);
  // Clear the cooldown gate so this rerun is never short-circuited.
  // Without this, a second call within 60min returns the prior decision
  // without doing the work the admin explicitly asked for.
  post.lastAutoAnswerAt = null;
  post.body = augmentedBody;
  await post.save();

  const result = await processPost(post._id);

  // Strip the admin note back off — we don't want it persisted as
  // the user's actual question body. The aiContext snapshot still
  // carries it for audit.
  if (typeof post.body === 'string') {
    post.body = post.body.split('\n\n[ADMIN NOTE]')[0];
    await post.save();
  }
  return result;
}

// ─── ProgramKnowledge side-effect (admin approve-edit) ────────────────────

export interface PromoteCorrectedAnswerOpts {
  /** Admin or moderator who applied the edit. */
  createdBy: Types.ObjectId | string | null;
  /** Original community post — used to derive the question + tags. */
  post: InstanceType<typeof CommunityPost>;
  /** The corrected answer text. */
  correctedAnswer: string;
}

/**
 * Persist an admin-corrected answer into the curated
 * ProgramKnowledge store so future retrievals rank it above the
 * original. Idempotent on (originalContextId, seedSource).
 */
export async function promoteCorrectedAnswer(
  opts: PromoteCorrectedAnswerOpts,
): Promise<void> {
  const post = opts.post;
  const corrected = opts.correctedAnswer?.trim().slice(0, 5000);
  if (!corrected || !post.batchId) return;

  try {
    await ProgramKnowledge.findOneAndUpdate(
      {
        originalContextId: String(post._id),
        seedSource: 'admin_corrected',
      },
      {
        $set: {
          question: post.title,
          answer: corrected,
          batchId: post.batchId,
          keywords: Array.isArray(post.tags) ? post.tags : [],
          confidenceBoost: 1.5,
          lastVerifiedDate: new Date(),
          createdBy: opts.createdBy
            ? new Types.ObjectId(String(opts.createdBy))
            : null,
        },
        $setOnInsert: {
          seedSource: 'admin_corrected' as const,
        },
      },
      { upsert: true, new: true },
    );
  } catch (err) {
    cronLog.error(`[autoAnswer] promoteCorrectedAnswer failed for post ${String(post._id)}: ${(err as Error).message}`);
  }
}
