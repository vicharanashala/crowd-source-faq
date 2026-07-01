/**
 * Course — v1.69
 *
 * A selectable training unit WITHIN an Internship (Batch). The
 * existing FAQ `category` field is the topic-section within a
 * course (e.g. "Prerequisites", "Submission"); this `Course` is the
 * higher-level grouping (e.g. "Web Development Foundations",
 * "AI/ML Foundations").
 *
 * The home page shows a course picker; the user's selection scopes
 * the Popular / Recent / Categories cards to that course's FAQs.
 * "All courses" is a reset option that shows program-wide content.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface ICourse extends Document {
  batchId: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  order: number;
  isActive: boolean;
  // Optional visual hint: when set, the course card shows this
  // icon (e.g. an SVG or emoji). Falls back to a generic tag.
  icon?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new MongooseSchema<ICourse>(
  {
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    // URL-safe slug, auto-derived from name on save. Unique per
    // program so `/program/:programSlug/course/:courseSlug` works.
    slug: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      lowercase: true,
    },
    description: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    order: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    icon: { type: String, default: null, maxlength: 16 },
  },
  { timestamps: true }
);

// v1.69 — slug unique per (batch, slug) so two programs can each
// have a "Foundations" course without colliding.
courseSchema.index({ batchId: 1, slug: 1 }, { unique: true });

// Most-used query: list active courses in a batch, sorted by order.
courseSchema.index({ batchId: 1, isActive: 1, order: 1 });

// Auto-slug on save (keeps the slug in sync with name; only fires
// when `name` is dirty or slug is empty).
courseSchema.pre('validate', function (next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = String(this.name || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'course';
  }
  next();
});

export default mongoose.model<ICourse>('Course', courseSchema, 'yaksha_faq_courses');
