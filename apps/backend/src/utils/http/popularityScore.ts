/**
 * popularityScore.ts — scoring algorithm for the public FAQ page.
 *
 * The score blends four signals:
 *   1. View volume  (log-scaled to dampen outliers)
 *   2. Recency      (exponential decay, half-life ~21 days)
 *   3. Engagement   (mean read-completion × time-spent ratio)
 *   4. Trust        (FAQ trustLevel — expert/high/medium/low)
 *
 * Why a custom formula?
 *  - Pure `view_count` is gameable: one attacker refreshing 10k times
 *    would dominate. We dampen with log + add an engagement gate.
 *  - Pure `helpfulVotes` is biased: new visitors can't vote, so a fresh
 *    but useful FAQ ranks near zero. View + engagement cover this.
 *  - Recency decay stops old but still-good FAQs from monopolising
 *    "popular" forever; combined with engagement, evergreen winners
 *    naturally float to the top.
 *
 * The score is a pure function of an input object — no I/O — so it
 * can run cheaply in the aggregation pipeline (`$expr`) and also be
 * re-derived in JS for tests / debugging.
 *
 * Weights are exported as constants so they can be tuned in one place
 * and reviewed.
 */

import type { TrustLevel } from '../../modules/faq/faq.model.js';

// ── Weights (sum to 1.0; tweak together) ─────────────────────────────────────
export const WEIGHTS = {
  view: 0.4,
  recency: 0.2,
  engagement: 0.3,
  trust: 0.1,
} as const;

// Reference points — log10 saturation targets.
// 500 views ≈ "very popular in our domain"; 5000+ gets clipped.
const VIEW_LOG_REFERENCE = Math.log10(1 + 500);
const HALF_LIFE_DAYS = 21;

// Words-per-minute baseline for "expected read time" caching.
const WORDS_PER_MINUTE = 200;

// ── Per-component calculators (all return 0..1) ─────────────────────────────

/** Log-scaled view count, capped at 1.0. */
export function viewComponent(guestViewCount: number): number {
  if (!guestViewCount || guestViewCount <= 0) return 0;
  return Math.min(1, Math.log10(1 + guestViewCount) / VIEW_LOG_REFERENCE);
}

/** Exponential decay by age in days. */
export function recencyComponent(createdAt: Date | string | null | undefined): number {
  if (!createdAt) return 0;
  const d = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  if (isNaN(d.getTime())) return 0;
  const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 1;
  return Math.exp(-ageDays / HALF_LIFE_DAYS);
}

/** Engagement: average of read-completion and time-spent ratio. */
export function engagementComponent(
  avgReadCompletion: number,
  avgTimeSpentRatio: number,
): number {
  const c = clamp01(avgReadCompletion);
  const t = clamp01(avgTimeSpentRatio);
  return 0.5 * c + 0.5 * t;
}

/** Trust boosts verified content; never required, just a tie-breaker. */
export function trustComponent(level: TrustLevel | string | undefined): number {
  switch (level) {
    case 'expert': return 1.0;
    case 'high':   return 0.8;
    case 'medium': return 0.5;
    case 'low':    return 0.2;
    default:       return 0.4;
  }
}

// ── Top-level score ──────────────────────────────────────────────────────────

export interface PopularityInputs {
  guestViewCount: number;
  createdAt: Date | string | null | undefined;
  avgReadCompletion: number;
  avgTimeSpentRatio: number;
  trustLevel: TrustLevel | string | undefined;
}

export function popularityScore(input: PopularityInputs): number {
  const v = viewComponent(input.guestViewCount);
  const r = recencyComponent(input.createdAt);
  const e = engagementComponent(input.avgReadCompletion, input.avgTimeSpentRatio);
  const t = trustComponent(input.trustLevel);

  return (
    WEIGHTS.view       * v +
    WEIGHTS.recency    * r +
    WEIGHTS.engagement * e +
    WEIGHTS.trust      * t
  );
}

// ── Word count / expected read time ─────────────────────────────────────────

/**
 * Cheap word counter. Whitespace-split, filters empty strings.
 * Strips common markdown markers so they don't inflate the count.
 */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const cleaned = text
    .replace(/[`*_>#[\]()]/g, ' ')   // strip markdown
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(' ').length;
}

/** Expected reading time in ms for a given word count, capped at 10 min. */
export function expectedReadMs(wordCount: number): number {
  if (!wordCount || wordCount <= 0) return 0;
  const minutes = wordCount / WORDS_PER_MINUTE;
  return Math.min(10 * 60 * 1000, Math.round(minutes * 60 * 1000));
}

// ── MongoDB aggregation expression (used in the background job) ──────────────

/**
 * Build a $expr-style object that Mongo can evaluate server-side during
 * the aggregation job. Mirrors `popularityScore()` exactly — if you
 * change one, change the other.
 *
 * Returns the score formula suitable for $add / $set. Weights are
 * hard-coded to match `WEIGHTS` so the formula compiles; changing
 * `WEIGHTS` requires updating this expression too.
 */
export function buildScoreExpression(fieldPrefix: string): Record<string, unknown> {
  const guest = `$${fieldPrefix}guestViewCount`;
  const created = `$${fieldPrefix}createdAt`;
  const completion = `$${fieldPrefix}avgReadCompletion`;
  const timeratio = `$${fieldPrefix}avgTimeSpentRatio`;
  const trust = `$${fieldPrefix}trustLevel`;

  const viewTerm: Record<string, unknown> = {
    $multiply: [
      WEIGHTS.view,
      {
        $min: [
          1,
          {
            $divide: [
              { $log10: { $add: [1, guest] } },
              VIEW_LOG_REFERENCE,
            ],
          },
        ],
      },
    ],
  };

  // Recency uses $$NOW server-side — handles clock-skew across pods.
  const recencyTerm: Record<string, unknown> = {
    $multiply: [
      WEIGHTS.recency,
      {
        $exp: {
          $divide: [
            { $subtract: [created, '$$NOW'] },
            1000 * 60 * 60 * 24 * HALF_LIFE_DAYS,
          ],
        },
      },
    ],
  };

  const engagementTerm: Record<string, unknown> = {
    $multiply: [
      WEIGHTS.engagement,
      {
        $avg: [
          {
            $cond: [
              { $gt: [completion, 1] },
              1,
              { $cond: [{ $lt: [completion, 0] }, 0, completion] },
            ],
          },
          {
            $cond: [
              { $gt: [timeratio, 1] },
              1,
              { $cond: [{ $lt: [timeratio, 0] }, 0, timeratio] },
            ],
          },
        ],
      },
    ],
  };

  // Trust: $switch mirrors the JS function exactly
  const trustTerm: Record<string, unknown> = {
    $multiply: [
      WEIGHTS.trust,
      {
        $switch: {
          branches: [
            { case: { $eq: [trust, 'expert'] }, then: 1.0 },
            { case: { $eq: [trust, 'high'] },   then: 0.8 },
            { case: { $eq: [trust, 'medium'] }, then: 0.5 },
            { case: { $eq: [trust, 'low'] },    then: 0.2 },
          ],
          default: 0.4,
        },
      },
    ],
  };

  return {
    $add: [viewTerm, recencyTerm, engagementTerm, trustTerm],
  };
}

// ── Utilities ────────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
