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
import mongoose, { Schema as MongooseSchema } from 'mongoose';
const programEnrollmentSchema = new MongooseSchema({
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
        enum: ['student', 'ta', 'moderator', 'mentor', 'program_admin'],
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
}, { timestamps: true });
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
export default mongoose.model('ProgramEnrollment', programEnrollmentSchema, 'yaksha_program_enrollments');
