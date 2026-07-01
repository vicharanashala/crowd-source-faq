import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * Batch — a program run (e.g. "Summer Internship 2026").
 *
 * Every FAQ, Category, and GuestEvent in the platform is scoped to
 * exactly one Batch. Admins create / edit / archive batches in the
 * admin panel; the public portal lists active batches for the
 * "pick a program" picker.
 *
 * Analytics are computed per batch by the existing popularityScore job.
 */

export interface IBatch extends Document {
  name: string;
  description: string;
  startDate: Date;
  endDate: Date;
  /** Admins can disable a batch without deleting it (hides from public). */
  isActive: boolean;
  /**
   * The single batch that auto-resolves when no batch is selected.
   * Enforced unique via a partial index below — only one Batch may
   * have `isDefault: true` at a time. The seed script and the admin
   * "Set as default" action both clear the flag on other batches
   * before setting it.
   */
  isDefault: boolean;
  /**
   * v1.69 — Phase 1: lifecycle status. Replaces the boolean
   * `isActive` for finer-grained control. New programs default to
   * `draft`. The public portal only shows `active`; the admin
   * dashboard shows all four.
   */
  status: 'draft' | 'active' | 'archived' | 'completed';
  /**
   * v1.69 — Phase 1: who owns this program. The global admin who
   * created it. Not enforced (admin can be deleted) but useful for
   * audit / "who do I ask about this program" queries.
   */
  ownerUserId: Types.ObjectId | null;
  /**
   * v1.69 — Phase 1: enrollment mode. Controls how users join the
   * program:
   *   - 'open'       — anyone can self-enroll via /api/programs/:id/self-enroll
   *   - 'invite_only'— self-enroll is denied; admin must invite
   *   - 'closed'     — admin enrolls only; no public path at all
   */
  enrollmentMode: 'open' | 'invite_only' | 'closed';
  /**
   * v1.69 — Phase 1: optional enrollment cap. Null = unlimited.
   * When set, the self-enroll controller rejects when
   * `ProgramEnrollment.countDocuments({ batchId, isActive: true })`
   * >= maxEnrollment.
   */
  maxEnrollment: number | null;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const batchSchema = new MongooseSchema<IBatch>(
  {
    name: {
      type: String,
      required: [true, 'Batch name is required'],
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    startDate: { type: Date, required: [true, 'Start date is required'] },
    endDate:   { type: Date, required: [true, 'End date is required'] },
    // v1.68 — schema fix: ensure endDate > startDate. Catches
    // admin fat-finger (e.g. swapping the two dates).
    isActive:  { type: Boolean, default: true, index: true },
    // v1.69 — Phase 1: lifecycle status. Defaults to 'active' so
    // the existing seed-created programs don't break. New programs
    // created via admin will default to 'draft' and the admin UI
    // can flip to 'active' once they're ready.
    status: {
      type: String,
      enum: ['draft', 'active', 'archived', 'completed'] as Array<'draft' | 'active' | 'archived' | 'completed'>,
      default: 'active',
      index: true,
    },
    // v1.69 — Phase 1: optional owner (admin who created the
    // program). Not enforced; just a useful pointer.
    ownerUserId: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    // v1.69 — Phase 1: enrollment mode. Defaults to 'open' so
    // existing programs don't reject self-enrolls that used to
    // work.
    enrollmentMode: {
      type: String,
      enum: ['open', 'invite_only', 'closed'] as Array<'open' | 'invite_only' | 'closed'>,
      default: 'open',
    },
    // v1.69 — Phase 1: optional enrollment cap. Null = unlimited.
    maxEnrollment: { type: Number, default: null, min: 1 },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Mongoose-level validation: end > start
batchSchema.path('endDate').validate(function (v: Date) {
  return !this.startDate || v > this.startDate;
}, 'endDate must be after startDate');

// Name uniqueness — case-insensitive to prevent "Summer 2026" vs "summer 2026"
batchSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

// Most-used query: list active batches sorted by start date desc (newest first)
batchSchema.index({ isActive: 1, startDate: -1 });

// At most one batch may carry the `isDefault: true` flag. Partial
// filter so legacy / non-default batches don't conflict on the index.
batchSchema.index(
  { isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

/**
 * v1.69 — slug helper. Slugs are auto-derived from `name` (lowercased,
 * non-alphanumerics collapsed to dashes, trimmed). No DB column —
 * derived at read time. Mongo's `name` index is case-insensitive
 * unique so collisions on derived slugs are impossible.
 *
 * Mirrors `frontend/src/utils/programSlug.ts`. Keep both in sync.
 */
export function slugifyProgramName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'program';
}

/**
 * v1.69 — atomically mark `id` as the default batch. Clears the flag
 * on every other batch first, then sets it on the target. Uses two
 * sequential writes; for higher-stakes deployments, wrap in a
 * `mongoose.startSession()` transaction (Mongoose 7+).
 */
batchSchema.statics.setAsDefault = async function setAsDefault(id: Types.ObjectId): Promise<IBatch | null> {
  await this.updateMany(
    { isDefault: true, _id: { $ne: id } },
    { $set: { isDefault: false } }
  );
  const updated = await this.findByIdAndUpdate(
    id,
    { $set: { isDefault: true } },
    { new: true }
  );
  return updated;
};

export default mongoose.model<IBatch>('Batch', batchSchema, 'yaksha_faq_batches');
