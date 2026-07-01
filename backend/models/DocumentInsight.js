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
import mongoose, { Schema as MongooseSchema } from 'mongoose';
// ─── Schema ──────────────────────────────────────────────────────────────────
const documentInsightSchema = new MongooseSchema({
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
}, { timestamps: true });
// ─── Indexes ─────────────────────────────────────────────────────────────────
// Admin review queue: pending first, newest within status
documentInsightSchema.index({ status: 1, createdAt: -1 });
// The cron's hot path: find pending insights with a non-zero match
// count, sorted by frequency descending
documentInsightSchema.index({ status: 1, searchMatchCount: -1, createdAt: -1 });
// "Insights from this document" detail view
documentInsightSchema.index({ documentId: 1, createdAt: -1 });
// ─── Export ──────────────────────────────────────────────────────────────────
export default mongoose.model('DocumentInsight', documentInsightSchema, 'yaksha_faq_document_insights');
