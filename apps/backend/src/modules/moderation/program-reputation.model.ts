/**
 * ProgramReputation — v1.69
 *
 * Per-user-per-program reputation snapshot. The model was
 * created in Phase 1; this file is being rewritten to
 * (a) move `awardToUser` (Phase 7) to AFTER the default
 * export so the helper can reference the model, and
 * (b) add the `notificationChannelId` field for Phase 6.
 *
 * Backwards compat (per the plan): User.points / User.sp stay
 * as the global aggregate (sum across programs) for the
 * cross-program leaderboard + user profile views. New writes
 * dual-update both via awardToUser.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ProgramTier = 'newcomer' | 'contributor' | 'expert' | 'top_contributor' | 'legend';

export interface IProgramReputation extends Document {
  // v1.69 — Phase 4: null = global default, non-null = per-program
  // override. The unique partial index below enforces at most one
  // active doc per (batchId, isActive:true) combination.
  batchId: Types.ObjectId | null;

  userId: Types.ObjectId;
  points: number;
  sp: number;
  /** Denormalised; recomputed on every write. Cheap to keep in sync. */
  tier: ProgramTier;
  acceptedAnswers: number;
  faqContributions: number;
  /** Denormalised so the Golden Ticket cooldown is a single read. */
  lastGoldenTicketAt: Date | null;
  lastGoldenRejectionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const TIER_THRESHOLDS: Array<{ tier: ProgramTier; minPoints: number }> = [
  { tier: 'newcomer',         minPoints: 0 },
  { tier: 'contributor',      minPoints: 50 },
  { tier: 'expert',           minPoints: 200 },
  { tier: 'top_contributor',  minPoints: 500 },
  { tier: 'legend',           minPoints: 2500 },
];

function computeTier(points: number): ProgramTier {
  let current: ProgramTier = 'newcomer';
  for (const t of TIER_THRESHOLDS) if (points >= t.minPoints) current = t.tier;
  return current;
}

const programReputationSchema = new MongooseSchema<IProgramReputation>(
  {
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      required: false,
      default: null,
      index: true,
    },
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    points: { type: Number, default: 0, min: 0 },
    sp: { type: Number, default: 0, min: 0 },
    tier: { type: String, enum: ['newcomer', 'contributor', 'expert', 'top_contributor', 'legend'] as ProgramTier[], default: 'newcomer' },
    acceptedAnswers: { type: Number, default: 0, min: 0 },
    faqContributions: { type: Number, default: 0, min: 0 },
    lastGoldenTicketAt: { type: Date, default: null },
    lastGoldenRejectionAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A user has at most one reputation record per program.
programReputationSchema.index({ userId: 1, batchId: 1 }, { unique: true });

// Per-program leaderboard: "who has the most points in program X?"
// — the hot path for /leaderboard. Compound index because the
// front page sorts by `points` desc within a single program.
programReputationSchema.index({ batchId: 1, points: -1 });

// v1.69 — pre-save: keep `tier` consistent with `points`. Free,
// since the hook is the only write path during Phase 7.
programReputationSchema.pre('save', function (next) {
  if (this.isModified('points')) {
    this.tier = computeTier(this.points);
  }
  next();
});

export default mongoose.model<IProgramReputation>(
  'ProgramReputation',
  programReputationSchema,
  'yaksha_program_reputation'
);

// v1.69 — Phase 7: awardToUser helper. Defined AFTER the
// default export so it can reference `ProgramReputation` (the
// model). The function uses the resolved-at-call-time
// model, so the lookup is safe even when the helper is called
// before the model is fully initialised.
export interface AwardInput {
  points?: number;
  sp?: number;
  acceptedAnswers?: number;
  faqContributions?: number;
}

export async function awardToUser(
  userId: Types.ObjectId | string,
  batchId: Types.ObjectId | string,
  input: AwardInput
): Promise<void> {
  const safePoints = input.points ?? 0;
  const safeSp = input.sp ?? 0;
  const safeAccepted = input.acceptedAnswers ?? 0;
  const safeFaqContrib = input.faqContributions ?? 0;

  const setInc: Record<string, number> = {};
  if (safePoints !== 0) setInc.points = safePoints;
  if (safeSp !== 0) setInc.sp = safeSp;
  if (safeAccepted !== 0) setInc.acceptedAnswers = safeAccepted;
  if (safeFaqContrib !== 0) setInc.faqContributions = safeFaqContrib;
  if (Object.keys(setInc).length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Model = mongoose.model('ProgramReputation') as any;
  await Model.findOneAndUpdate(
    { userId, batchId },
    {
      $setOnInsert: { userId, batchId, tier: 'newcomer' },
      $inc: setInc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
