import mongoose, { Schema as MongooseSchema } from 'mongoose';
const categorySchema = new MongooseSchema({
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: [true, 'Category name is required'],
        trim: true,
        maxlength: 120,
    },
    slug: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 140,
        // v1.68 — schema fix: enforce kebab-case at write time
        // (matches the slugifyCategoryName() helper). Admins
        // who try to create "My Category!" now get a schema
        // validation error instead of a broken URL later.
        match: /^[a-z0-9-]+$/,
    },
    description: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });
// (batchId, slug) unique — stable lookup key for the migration + admin UI
categorySchema.index({ batchId: 1, slug: 1 }, { unique: true });
// (batchId, name) unique (case-insensitive) so admins can't double-add
categorySchema.index({ batchId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
/** Lower-case, dash-separated slug. Stable, URL-safe. */
export function slugifyCategoryName(name) {
    return name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '') // strip combining marks
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 140);
}
export default mongoose.model('Category', categorySchema, 'yaksha_faq_categories');
