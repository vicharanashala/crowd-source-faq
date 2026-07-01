import mongoose, { Schema as MongooseSchema } from 'mongoose';
const featureFlagSchema = new MongooseSchema({
    key: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 60,
    },
    enabled: { type: Boolean, default: false, index: true },
    label: { type: String, required: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    updatedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    // v1.69 — Phase 8: per-program override scoping. null = global
    // default; non-null = per-program override.
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    firstEnabledAt: { type: Date, default: null },
    lastDisabledAt: { type: Date, default: null },
}, { timestamps: true });
// v1.69 — Phase 8: compound unique index (key, batchId) so a
// single feature key can have at most one global default (where
// batchId: null) AND one per-program override per batch. The
// sparse option means the global default with batchId: null is
// indexed; programmatic overrides are also indexed (batchId is
// always a real ObjectId when not null).
featureFlagSchema.index({ key: 1, batchId: 1 }, { unique: true, partialFilterExpression: { $or: [{ key: { $type: 'string' } }] } });
export default mongoose.model('FeatureFlag', featureFlagSchema, 'yaksha_faq_feature_flags');
