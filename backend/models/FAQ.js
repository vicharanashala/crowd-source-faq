import mongoose, { Schema as MongooseSchema } from 'mongoose';
const faqSchema = new MongooseSchema({
    question: {
        type: String,
        required: [true, 'Question is required'],
        trim: true,
    },
    answer: {
        type: String,
        required: [true, 'Answer is required'],
    },
    tags: {
        type: [String],
        default: [],
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        trim: true,
    },
    embedding: {
        type: [Number],
        default: undefined,
    },
    searchCount: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'approved',
    },
    views: {
        type: Number,
        default: 0,
    },
    helpfulVotes: {
        type: Number,
        default: 0,
    },
    unhelpfulVotes: {
        type: Number,
        default: 0,
    },
    createdBy: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    reports: {
        type: [{
                reportedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
                reason: { type: String, trim: true },
                createdAt: { type: Date, default: Date.now },
            }],
        default: [],
    },
    suggestions: {
        type: [{
                suggestedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
                suggestion: { type: String, required: true, trim: true },
                createdAt: { type: Date, default: Date.now },
            }],
        default: [],
    },
    // Freshness system
    freshnessTier: {
        type: String,
        enum: ['evergreen', 'seasonal', 'volatile'],
        default: 'evergreen',
    },
    reviewIntervalDays: {
        type: Number,
        default: 0,
    },
    reviewStatus: {
        type: String,
        enum: ['verified', 'pending_review', 'update_requested'],
        default: 'verified',
    },
    lastVerifiedDate: {
        type: Date,
        default: () => new Date(),
    },
    flaggedAt: {
        type: Date,
        default: null,
    },
    flagType: {
        type: String,
        enum: ['auto', 'manual', null],
        default: null,
    },
    flagReason: {
        type: String,
        default: null,
    },
    flaggedBy: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    reviewCycle: {
        type: Number,
        default: 0,
    },
    // AI audit tracking
    lastCheckedAt: { type: Date, default: null },
    // Promotion system — trust levels
    trustLevel: {
        type: String,
        enum: ['low', 'medium', 'high', 'expert'],
        default: 'high', // Existing FAQs default to 'high' (Official)
    },
    sourceType: {
        type: String,
        enum: ['manual', 'community_promotion', 'expert_verified', 'zoom_transcript'],
        default: 'manual',
    },
    // When sourceType === 'zoom_transcript', track the source meeting for traceability
    sourceMeetingId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'ZoomMeeting',
        default: null,
    },
    sourceMeetingTopic: {
        type: String,
        default: null,
    },
    sourceInsightId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'ZoomInsight',
        default: null,
    },
    sourceCommunityPostId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'CommunityPost',
        default: null,
    },
    sourceCommentId: {
        type: MongooseSchema.Types.ObjectId,
        default: null,
    },
    promotedAt: {
        type: Date,
        default: null,
    },
    objectionStatus: {
        type: String,
        enum: ['none', 'objected', 'resolved'],
        default: 'none',
    },
    promotionMetadata: {
        type: {
            upvotesAtPromotion: { type: Number, default: null },
            helpfulVotesAtPromotion: { type: Number, default: null },
            communityAnswerAuthorId: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
            promotedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
            objectionReason: { type: String, default: null },
            objectionRaisedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
            objectionRaisedAt: { type: Date, default: null },
        },
        default: null,
    },
    // ── Batch + Category scoping ────────────────────────────────────────────
    /** The program run (e.g. "Summer Internship 2026") this FAQ belongs to. */
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        required: false, // false during migration; the migrate script backfills
        index: true,
        default: null,
    },
    // v1.69 — see interface. Indexes the (courseId, status) path
    // used by the public FAQs endpoint when the user picks a course.
    courseId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Course',
        required: false,
        index: true,
        default: null,
    },
    /** Optional reference to the canonical Category document. */
    categoryId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Category',
        default: null,
        index: true,
    },
    // ── Public guest-page analytics (additive, computed fields) ────────────
    popularityScore: { type: Number, default: 0 },
    guestViewCount: { type: Number, default: 0 },
    avgReadCompletion: { type: Number, default: 0 },
    avgTimeSpentRatio: { type: Number, default: 0 },
    guestViewLast24h: { type: Number, default: 0 },
    wordCount: { type: Number, default: 0 },
    expectedReadMs: { type: Number, default: 0 },
    popularityUpdatedAt: { type: Date, default: null },
}, { timestamps: true });
faqSchema.index({ question: 'text', answer: 'text' });
faqSchema.index({ trustLevel: 1, objectionStatus: 1, promotedAt: 1 });
faqSchema.index({ sourceType: 1, sourceCommunityPostId: 1 });
// Hot-field indexes for admin/frontend queries
faqSchema.index({ status: 1, category: 1 });
faqSchema.index({ freshnessTier: 1, lastVerifiedDate: 1 });
faqSchema.index({ createdAt: -1 });
faqSchema.index({ helpfulVotes: -1, views: -1 });
// Public page: ranked queries
faqSchema.index({ status: 1, popularityScore: -1 });
faqSchema.index({ status: 1, category: 1, popularityScore: -1 });
// Batch-scoped: every public read filters by batchId first
faqSchema.index({ batchId: 1, status: 1, createdAt: -1 });
faqSchema.index({ batchId: 1, status: 1, popularityScore: -1 });
faqSchema.index({ batchId: 1, category: 1, status: 1, createdAt: -1 });
faqSchema.index({ batchId: 1, status: 1, category: 1, popularityScore: -1 });
export default mongoose.model('FAQ', faqSchema, 'yaksha_faq_faqs');
