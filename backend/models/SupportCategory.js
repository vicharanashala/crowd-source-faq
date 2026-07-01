import mongoose, { Schema as MongooseSchema } from 'mongoose';
export const SUPPORT_FIELD_TYPES = [
    'text', 'textarea', 'number', 'date', 'boolean', 'dropdown',
];
export const SUPPORT_ICON_KEYS = [
    'wifi', 'camera', 'mic', 'device', 'power', 'generic',
];
// ─── Sub-schemas ────────────────────────────────────────────────────────────
const optionSubSchema = new MongooseSchema({
    value: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
}, { _id: false });
const fieldSubSchema = new MongooseSchema({
    key: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 60,
        match: [/^[a-z0-9][a-z0-9-]*$/, 'key must be kebab-case (a-z, 0-9, dash)'],
    },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: SUPPORT_FIELD_TYPES, required: true },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: '', maxlength: 200 },
    helpText: { type: String, default: '', maxlength: 500 },
    options: { type: [optionSubSchema], default: [] },
    displayOrder: { type: Number, default: 0 },
    archived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
}, { _id: true });
// ─── Schema ─────────────────────────────────────────────────────────────────
const supportCategorySchema = new MongooseSchema({
    // v1.69 — Phase 9: per-program scoping.
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        default: null,
        index: true,
    },
    issueType: {
        type: String,
        required: true,
        unique: true, // legacy global uniqueness — Phase 9+ relies on (batchId, issueType)
        trim: true,
        lowercase: true,
        maxlength: 60,
        match: [/^[a-z0-9][a-z0-9-]*$/, 'issueType must be kebab-case (a-z, 0-9, dash)'],
    },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    shortLabel: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, default: '', maxlength: 1000 },
    iconKey: {
        type: String,
        enum: SUPPORT_ICON_KEYS,
        default: 'generic',
    },
    steps: { type: [String], default: [] },
    fields: { type: [fieldSubSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 0 },
    createdBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
// v1.69 — Phase 9: per-program uniqueness. A (batchId, issueType)
// pair is unique; a null batchId represents the global default.
// Allows a single kebab-case key to be reused across programs
// when the meaning diverges (e.g. program A has a 'device' issue
// type with different steps than program B).
supportCategorySchema.index({ batchId: 1, issueType: 1 }, { unique: true, partialFilterExpression: { issueType: { $type: 'string' } } });
// "Active categories for this program, ordered for the picker"
// — the public listUsers endpoint uses this with the active
// program's batchId. The (batchId, isActive, displayOrder)
// index covers both the per-program picker and the fallback
// global-list (when batchId=null).
supportCategorySchema.index({ batchId: 1, isActive: 1, displayOrder: 1 });
// "All categories, ordered" — admin schema editor
supportCategorySchema.index({ displayOrder: 1 });
export default mongoose.model('SupportCategory', supportCategorySchema, 'yaksha_faq_support_categories');
