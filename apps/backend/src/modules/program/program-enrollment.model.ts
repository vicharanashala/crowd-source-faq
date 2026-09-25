/**
 * ProgramEnrollment — v1.69
 *
 * Join model between `User` and `Batch` (a.k.a. "Program"). A user
 * belongs to zero or more programs; a program has zero or more
 * enrolled users. Each enrollment has a program-scoped role
 * (student / ta / moderator / mentor / program_admin) which is
 * the source of truth for per-program authorisation.
 *
 * Global admins (`User.role === 'admin'`) are NOT modelled here
 * — they bypass enrollment checks via the programScope middleware.
 *
 * The `inviteCode` field supports a future invite-link flow. v1.69
 * just creates the model; the invite routes land in Phase 2.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ProgramRole = 'student' | 'ta' | 'moderator' | 'mentor' | 'program_admin';

/**
 * Incident fix (2026-09-25): which code path created/last-touched this
 * row. Before this field existed, a real Samagama-bridge-asserted
 * enrollment and a blanket-guessed backfill row were byte-for-byte
 * identical (`enrolledBy: null` either way) — there was no way to tell
 * a trustworthy row from a guessed one after the fact. Existing rows
 * predate this field and are `null`/absent (still ambiguous, and
 * deliberately left that way rather than backfilled with a guess about
 * a guess) — only rows written from here forward are traceable.
 */
export type ProgramEnrollmentSource = 'samagama-bridge' | 'self-enroll' | 'backfill' | 'admin';

export interface IProgramEnrollment extends Document {
  userId: Types.ObjectId;
  batchId: Types.ObjectId;
  programRole: ProgramRole;
  enrolledAt: Date;
  enrolledBy: Types.ObjectId | null;
  isActive: boolean;
  inviteCode?: string | null;
  inviteAcceptedAt?: Date | null;
  /** Null/absent = predates this field, unknown provenance. */
  source?: ProgramEnrollmentSource | null;
  createdAt: Date;
  updatedAt: Date;
}

const programEnrollmentSchema = new MongooseSchema<IProgramEnrollment>(
  {
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      required: true,
      index: true,
    },
    programRole: {
      type: String,
      enum: ['student', 'ta', 'moderator', 'mentor', 'program_admin'] as ProgramRole[],
      default: 'student',
      required: true,
    },
    enrolledAt: { type: Date, default: Date.now },
    // The global admin who enrolled this user (null for self-enroll).
    enrolledBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    // Soft-remove without deleting the row — keeps the audit
    // history. Re-enrolling just flips this back to true.
    isActive: { type: Boolean, default: true, index: true },
    // v1.69 — unused until Phase 2 invite flow lands. The field
    // exists so the migration in Phase 11 can populate it
    // alongside the new invite routes.
    inviteCode: { type: String, default: null, sparse: true },
    inviteAcceptedAt: { type: Date, default: null },
    // Incident fix (2026-09-25): provenance marker, see the type doc
    // above. Optional/nullable so existing rows (all predate this
    // field) don't need a migration — they just read as `null`,
    // meaning "unknown, don't trust it as Samagama-confirmed."
    source: {
      type: String,
      enum: ['samagama-bridge', 'self-enroll', 'backfill', 'admin'],
      default: null,
    },
  },
  { timestamps: true }
);

// A user can be enrolled in a given program at most once. The
// unique index is on (userId, batchId) — re-enrolling after a
// soft-delete updates the existing row rather than creating a new
// one.
programEnrollmentSchema.index({ userId: 1, batchId: 1 }, { unique: true });

// "List all members of program X" / "show me active moderators in
// program Y" — the admin views hit this pattern constantly.
programEnrollmentSchema.index({ batchId: 1, programRole: 1, isActive: 1 });
// "Show all programs user Z is in" — the public "my programs"
// view hits this.
programEnrollmentSchema.index({ userId: 1, isActive: 1 });

export default mongoose.model<IProgramEnrollment>(
  'ProgramEnrollment',
  programEnrollmentSchema,
  'yaksha_program_enrollments'
);
