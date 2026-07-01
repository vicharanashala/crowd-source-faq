import mongoose, { Schema as MongooseSchema } from 'mongoose';
// ─── Schema ────────────────────────────────────────────────────────────────────
const transcriptKnowledgeSchema = new MongooseSchema({
    question: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
    },
    answer: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000,
    },
    source: {
        type: String,
        enum: ['zoom_transcript', 'community_high_upvote', 'manual'],
        required: true,
    },
    sourceId: {
        type: MongooseSchema.Types.ObjectId,
        indexed: true,
    },
    sourceTitle: {
        type: String,
        required: true,
        trim: true,
        maxlength: 300,
    },
    confidence: {
        type: Number,
        default: 0.5,
        min: 0,
        max: 1,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'promoted'],
        default: 'pending',
    },
    upvoteCount: {
        type: Number,
        default: 0,
    },
    answeredFromKnowledgeId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'TranscriptKnowledge',
    },
    reviewedBy: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'User',
    },
    reviewedAt: Date,
    promotedFaqId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'FAQ',
    },
    transcriptSnippet: {
        type: String,
        maxlength: 1000,
    },
    keywords: {
        type: [String],
        default: [],
        index: true,
    },
    embedding: {
        type: [Number],
        default: undefined,
    },
    // v1.69 — see interface. KB entries are program-scoped so the
    // public /program/:slug page can show "knowledge from this
    // program" without leaking content from past cohorts.
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        default: null,
        index: true,
    },
}, { timestamps: true });
// ─── Indexes ──────────────────────────────────────────────────────────────────
// Vector candidates query (status + keywords for hybrid search)
transcriptKnowledgeSchema.index({ status: 1, keywords: 1 });
// Text search on question + answer
transcriptKnowledgeSchema.index({ question: 'text', answer: 'text' });
// Source lookup
transcriptKnowledgeSchema.index({ source: 1, sourceId: 1 });
// High-upvote community posts needing review
transcriptKnowledgeSchema.index({ source: 1, upvoteCount: -1, status: 1 });
// Unique per source (prevent duplicate extraction)
transcriptKnowledgeSchema.index({ source: 1, sourceId: 1, question: 1 }, { unique: true, sparse: true });
// ─── Pre-save: auto-generate keywords from question + answer ──────────────────
transcriptKnowledgeSchema.pre('save', function (next) {
    if (this.isModified('question') || this.isModified('answer')) {
        const text = `${this.question} ${this.answer}`.toLowerCase();
        // Extract significant words (≥4 chars, not common stopwords)
        const stopwords = new Set([
            'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has',
            'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'had', 'how',
            'its', 'may', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did',
            'what', 'when', 'will', 'with', 'from', 'have', 'this', 'that', 'than',
        ]);
        const words = text.match(/\b[a-z]{4,}\b/g) ?? [];
        const filtered = words.filter((w) => !stopwords.has(w));
        // Deduplicate + take top 20
        this.keywords = [...new Set(filtered)].slice(0, 20);
    }
    next();
});
// ─── Model ────────────────────────────────────────────────────────────────────
export const TranscriptKnowledge = mongoose.model('TranscriptKnowledge', transcriptKnowledgeSchema, 'yaksha_transcript_knowledge');
