import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * Category — a topic within a Batch (e.g. "Team Formation" inside
 * "Summer Internship 2026"). Replaces the old free-text `FAQ.category`
 * string with a real, batch-scoped collection.
 *
 * The legacy `FAQ.category` string is kept on the FAQ document for
 * backwards-compatible display; admins can edit Categories here and the
 * FAQ's display name will follow.
 */

export interface ICategory extends Document {
  batchId: Types.ObjectId;
  name: string;
  /** Lowercased, dash-separated — stable for URLs/lookups. */
  slug: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new MongooseSchema<ICategory>(
  {
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
  },
  { timestamps: true },
);

// (batchId, slug) unique — stable lookup key for the migration + admin UI
categorySchema.index({ batchId: 1, slug: 1 }, { unique: true });

// (batchId, name) unique (case-insensitive) so admins can't double-add
categorySchema.index(
  { batchId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

/** Lower-case, dash-separated slug. Stable, URL-safe. */
export function slugifyCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export default mongoose.model<ICategory>('Category', categorySchema, 'yaksha_faq_categories');
