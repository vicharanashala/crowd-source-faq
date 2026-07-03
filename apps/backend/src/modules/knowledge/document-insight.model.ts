/**
 * DocumentInsight — a Q&A pair or factual statement extracted from
 * a `DocumentRecord` by the document AI pipeline.
 *
 * v1 — additive. Companion to the existing `ZoomInsight` model
 * (which is for Zoom recordings) and the `TranscriptKnowledge`
 * model (which is the auto-approved zero-human KB). DocumentInsights
 * always start in `pending_review` and are promoted to an FAQ
 * either by an admin (manual review) or by the
 * `promotePopularDocumentInsights` cron (auto-promote when an
 * `UnresolvedSearch` log matches this insight N times).
 *
 * Lifecycle:
 *
 *   pending_review
 *     → approved     (admin approved OR auto-promote cron)
 *       → promoted   (FAQ was created from this insight)
 *     → rejected     (admin rejected — keeps the insight in the
 *                     collection for audit, never auto-promotes)
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type DocumentInsightType = 'FAQ' | 'Announcement' | 'Policy' | 'HowTo' | 'Fact';

/** Closed taxonomy — kept in sync with documentAiPipeline.INSIGHT_CATEGORIES. */
export type DocumentInsightCategory =
  | 'Onboarding'
  | 'Schedule & Deadlines'
  | 'Assignments & Projects'
  | 'Policies & Rules'
  | 'Technical Setup'
  | 'Certification & Evaluation'
  | 'Payment & Stipend'
  | 'Logistics & Access'
  | 'Career & Placement'
  | 'General';

export type DocumentInsightAudience = 'Intern' | 'Mentor' | 'Admin' | 'All';

export type DocumentInsightStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'promoted';

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IDocumentInsight extends Document {
  documentId: Types.ObjectId;
  /** A short, user-facing question. May be empty for pure Policy/HowTo insights. */
  question: string;
  /** The answer / content body. Markdown is allowed. */
  answer_or_content: string;
  type: DocumentInsightType;
  status: DocumentInsightStatus;
  /** AI confidence (0-1). Echoed from the AI response. */
  confidence_score: number;
  // ── Structural metadata (LLM-tagged at ingestion) ──────────────────────
  /** Single closest category from the closed taxonomy. */
  category: DocumentInsightCategory;
  /** Primary audience this insight serves. */
  audience: DocumentInsightAudience;
  /** Normalized long-tail keyword tags ([a-z0-9-]). */
  tags: string[];
  /** 1-3 sentence summary — also indexed for keyword search recall. */
  summary: string;
  /** Page number / cell reference for tabular sources, if known. */
  pageNumber: number | null;
  /** Short excerpt of the source text this insight was extracted from. */
  sourceExcerpt: string;
  /**
   * How often an UnresolvedSearch log semantically matches this
   * insight. Decremented (counter reset) on admin rejection. The
   * `promotePopularDocumentInsights` cron checks this against the
   * `DOCUMENT_INSIGHT_AUTO_PROMOTE_THRESHOLD` env var (default 3).
   */
  searchMatchCount: number;
  /** Admin that approved/rejected/promoted this insight. */
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  /** When `status === 'promoted'`, the FAQ this was promoted into. */
  publishedFaqId: Types.ObjectId | null;
  /** If promoted by the cron, why. */
  promotionReason: string | null;
  /** AI prompt version for reproducibility / re-extraction. */
  aiPromptVersion: string;
  /** v1.69 — Program this insight was extracted from. */
  batchId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const documentInsightSchema = new MongooseSchema<IDocumentInsight>(
  {
    documentId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'DocumentRecord',
      required: true,
      index: true,
    },
    question: { type: String, default: '', maxlength: 500 },
    answer_or_content: { type: String, required: true, maxlength: 5000 },
    type: {
      type: String,
      enum: ['FAQ', 'Announcement', 'Policy', 'HowTo', 'Fact'],
      default: 'FAQ',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected', 'promoted'],
      default: 'pending_review',
      index: true,
    },
    confidence_score: { type: Number, default: 0, min: 0, max: 1 },
    // ── Structural metadata (LLM-tagged at ingestion) ──────────────────────
    category: {
      type: String,
      enum: [
        'Onboarding',
        'Schedule & Deadlines',
        'Assignments & Projects',
        'Policies & Rules',
        'Technical Setup',
        'Certification & Evaluation',
        'Payment & Stipend',
        'Logistics & Access',
        'Career & Placement',
        'General',
      ],
      default: 'General',
      index: true,
    },
    audience: {
      type: String,
      enum: ['Intern', 'Mentor', 'Admin', 'All'],
      default: 'All',
      index: true,
    },
    tags: { type: [String], default: [], index: true },
    summary: { type: String, default: '', maxlength: 600 },
    pageNumber: { type: Number, default: null },
    sourceExcerpt: { type: String, default: '', maxlength: 500 },
    searchMatchCount: { type: Number, default: 0, min: 0, index: true },
    reviewedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    publishedFaqId: { type: MongooseSchema.Types.ObjectId, ref: 'FAQ', default: null },
    promotionReason: { type: String, default: null, maxlength: 500 },
    aiPromptVersion: { type: String, default: 'v1', maxlength: 20 },
    // v1.69 — see interface. Default null = legacy row that pre-dates
    // the per-program scoping; the migration script backfills these.
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

// Admin review queue: pending first, newest within status
documentInsightSchema.index({ status: 1, createdAt: -1 });

// The cron's hot path: find pending insights with a non-zero match
// count, sorted by frequency descending
documentInsightSchema.index({ status: 1, searchMatchCount: -1, createdAt: -1 });

// "Insights from this document" detail view
documentInsightSchema.index({ documentId: 1, createdAt: -1 });

// Keyword search recall — the LLM summary is term-dense, so indexing it
// alongside question/answer is the cheapest way to recover the relevance
// the embedding model used to provide. `tags` boosts exact keyword hits.
documentInsightSchema.index(
  { question: 'text', answer_or_content: 'text', summary: 'text', tags: 'text' },
  { weights: { question: 10, summary: 6, tags: 4, answer_or_content: 2 }, name: 'insight_text' },
);

// Faceted filtering / tag boosting at search time (status-scoped).
documentInsightSchema.index({ status: 1, category: 1, audience: 1 });

// ─── Export ──────────────────────────────────────────────────────────────────

export default mongoose.model<IDocumentInsight>(
  'DocumentInsight',
  documentInsightSchema,
  'yaksha_faq_document_insights',
);
