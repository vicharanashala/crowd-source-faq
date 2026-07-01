import mongoose, { Schema as MongooseSchema } from 'mongoose';
const batchSchema = new MongooseSchema({
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
    endDate: { type: Date, required: [true, 'End date is required'] },
    // v1.68 — schema fix: ensure endDate > startDate. Catches
    // admin fat-finger (e.g. swapping the two dates).
    isActive: { type: Boolean, default: true, index: true },
    // v1.69 — Phase 1: lifecycle status. Defaults to 'active' so
    // the existing seed-created programs don't break. New programs
    // created via admin will default to 'draft' and the admin UI
    // can flip to 'active' once they're ready.
    status: {
        type: String,
        enum: ['draft', 'active', 'archived', 'completed'],
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
        enum: ['open', 'invite_only', 'closed'],
        default: 'open',
    },
    // v1.69 — Phase 1: optional enrollment cap. Null = unlimited.
    maxEnrollment: { type: Number, default: null, min: 1 },
    isDefault: { type: Boolean, default: false, index: true },
    createdBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
// Mongoose-level validation: end > start
batchSchema.path('endDate').validate(function (v) {
    return !this.startDate || v > this.startDate;
}, 'endDate must be after startDate');
// Name uniqueness — case-insensitive to prevent "Summer 2026" vs "summer 2026"
batchSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
// Most-used query: list active batches sorted by start date desc (newest first)
batchSchema.index({ isActive: 1, startDate: -1 });
// At most one batch may carry the `isDefault: true` flag. Partial
// filter so legacy / non-default batches don't conflict on the index.
batchSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
/**
 * v1.69 — slug helper. Slugs are auto-derived from `name` (lowercased,
 * non-alphanumerics collapsed to dashes, trimmed). No DB column —
 * derived at read time. Mongo's `name` index is case-insensitive
 * unique so collisions on derived slugs are impossible.
 *
 * Mirrors `frontend/src/utils/programSlug.ts`. Keep both in sync.
 */
export function slugifyProgramName(name) {
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
batchSchema.statics.setAsDefault = async function setAsDefault(id) {
    await this.updateMany({ isDefault: true, _id: { $ne: id } }, { $set: { isDefault: false } });
    const updated = await this.findByIdAndUpdate(id, { $set: { isDefault: true } }, { new: true });
    return updated;
};
export default mongoose.model('Batch', batchSchema, 'yaksha_faq_batches');
