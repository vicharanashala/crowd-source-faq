import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export type BadgeType = 'positive' | 'negative';
export type BadgeTrigger = 'auto' | 'manual';

export interface IBadge extends Document {
  name: string;
  slug: string;
  description: string;
  icon: string;
  type: BadgeType;
  pointsRequired?: number;
  actionTrigger: BadgeTrigger;
  /**
   * v1.69 — null = badge is global (e.g. "first answer"). Non-null =
   * badge is awarded only within a specific program run.
   * Admin UI lets the user flip this from /admin/badges.
   */
  batchId?: MongooseSchema.Types.ObjectId | null;
  active: boolean;
  createdAt: Date;
}

// ─── Default badges ──────────────────────────────────────────────────────────

const DEFAULT_BADGES: Array<{
  name: string; slug: string; description: string; icon: string;
  type: BadgeType; pointsRequired?: number; actionTrigger: BadgeTrigger;
}> = [
  // Positive
  { name: 'Curious Mind',     slug: 'curious-mind',     description: 'Asked your first question',             icon: '❓', type: 'positive', actionTrigger: 'auto' },
  { name: 'First Answer',      slug: 'first-answer',      description: 'Posted your first community answer',     icon: '💡', type: 'positive', actionTrigger: 'auto' },
  { name: 'Helpful',           slug: 'helpful',            description: 'Your answer was marked helpful',         icon: '👍', type: 'positive', actionTrigger: 'auto' },
  { name: 'Contributor',      slug: 'contributor',        description: 'Submitted 5 FAQs',                      icon: '📝', type: 'positive', pointsRequired: 50,  actionTrigger: 'auto' },
  { name: 'Expert',           slug: 'expert',             description: 'Reached silver tier',                    icon: '🏅', type: 'positive', pointsRequired: 200, actionTrigger: 'auto' },
  { name: 'Top Contributor',   slug: 'top-contributor',   description: 'Reached gold tier',                     icon: '🥇', type: 'positive', pointsRequired: 500, actionTrigger: 'auto' },
  { name: 'Legend',            slug: 'legend',             description: 'Reached legend tier',                   icon: '⭐', type: 'positive', pointsRequired: 2500,actionTrigger: 'auto' },
  { name: 'Bug Hunter',        slug: 'bug-hunter',         description: 'Reported a valid issue',                icon: '🐛', type: 'positive', actionTrigger: 'auto' },
  { name: 'On Fire',           slug: 'on-fire',            description: '10+ helpful votes in one day',          icon: '🔥', type: 'positive', actionTrigger: 'auto' },
  { name: '3-Day Streak',      slug: '3-day-streak',       description: 'Active for 3 consecutive days',          icon: '🔥', type: 'positive', actionTrigger: 'auto' },
  { name: '7-Day Streak',      slug: '7-day-streak',       description: 'Active for 7 consecutive days',          icon: '⚡', type: 'positive', actionTrigger: 'auto' },
  { name: '30-Day Streak',     slug: '30-day-streak',      description: 'Active for 30 consecutive days',         icon: '👑', type: 'positive', actionTrigger: 'auto' },
  // Negative
  { name: 'Warning',           slug: 'warning',            description: 'Received an admin warning',               icon: '⚠️', type: 'negative', actionTrigger: 'manual' },
  { name: 'Point Penalty',     slug: 'point-penalty',      description: 'Lost points due to rule violation',     icon: '📉', type: 'negative', actionTrigger: 'manual' },
  { name: 'Suspended',         slug: 'suspended',           description: 'Account temporarily suspended',          icon: '⏸️', type: 'negative', actionTrigger: 'manual' },
];

const badgeSchema = new MongooseSchema<IBadge>({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '🏷️' },
  type: { type: String, enum: ['positive', 'negative'] as BadgeType[], required: true },
  pointsRequired: { type: Number },
  actionTrigger: { type: String, enum: ['auto', 'manual'] as BadgeTrigger[], default: 'manual' },
  // v1.69 — see interface. Index covers "all badges for program X"
  // and lets us do a partial unique index on global badge slugs
  // (null) vs per-program badge slugs (specific batchId).
  batchId: {
    type: MongooseSchema.Types.ObjectId,
    ref: 'Batch',
    default: null,
    index: true,
  },
  active: { type: Boolean, default: true },
}, { timestamps: true });

// Seed default badges on first load
badgeSchema.static('seedDefaults', async function () {
  for (const b of DEFAULT_BADGES) {
    await this.findOneAndUpdate({ slug: b.slug }, b, { upsert: true, new: true });
  }
});

badgeSchema.index({ type: 1 });

export default mongoose.model<IBadge>('Badge', badgeSchema, 'yaksha_faq_badges');
