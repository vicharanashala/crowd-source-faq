import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type FAQStatus = 'pending' | 'approved' | 'rejected';
export type FreshnessTier = 'evergreen' | 'seasonal' | 'volatile';
export type ReviewStatus = 'verified' | 'pending_review' | 'update_requested';
export type TrustLevel = 'low' | 'medium' | 'high' | 'expert';
export type SourceType = 'manual' | 'community_promotion' | 'expert_verified' | 'zoom_transcript';
export type ObjectionStatus = 'none' | 'objected' | 'resolved';

export interface IPromotionMetadata {
  upvotesAtPromotion?: number;
  helpfulVotesAtPromotion?: number;
  communityAnswerAuthorId?: Types.ObjectId | null;
  promotedBy?: Types.ObjectId | null;
  objectionReason?: string | null;
  objectionRaisedBy?: Types.ObjectId | null;
  objectionRaisedAt?: Date | null;
}

export interface IFAQ extends Document {
  question: string;
  answer: string;
  tags: string[];
  category: string;
  embedding?: number[];
  searchCount: number;
  status: FAQStatus;
  views: number;
  helpfulVotes: number;
  unhelpfulVotes: number;
  createdBy: Types.ObjectId | null;
  reports: Array<{
    reportedBy: Types.ObjectId;
    reason: string;
    createdAt?: Date;
  }>;
  suggestions: Array<{
    suggestedBy: Types.ObjectId;
    suggestion: string;
    createdAt?: Date;
  }>;
  // Freshness system
  freshnessTier: FreshnessTier;
  reviewIntervalDays: number;
  reviewStatus: ReviewStatus;
  lastVerifiedDate: Date;
  flaggedAt: Date | null;
  flagType: 'auto' | 'manual' | null;
  flagReason: string | null;
  flaggedBy: Types.ObjectId | null;
  reviewCycle: number;
  lastCheckedAt: Date | null;
  // Promotion system
  trustLevel: TrustLevel;
  sourceType: SourceType;
  sourceCommunityPostId: Types.ObjectId | null;
  sourceCommentId?: Types.ObjectId | null; // Which comment was promoted (if from a thread answer)
  promotedAt: Date | null;
  objectionStatus: ObjectionStatus;
  promotionMetadata: IPromotionMetadata | null;
  // Zoom transcript provenance (when sourceType === 'zoom_transcript')
  sourceMeetingId: Types.ObjectId | null;
  sourceMeetingTopic: string | null;
  /** The ZoomInsight record this FAQ was promoted from (for traceability) */
  sourceInsightId: Types.ObjectId | null;
  // ── Batch + Category scoping ────────────────────────────────────────────
  /** The program run (e.g. "Summer Internship 2026") this FAQ belongs to. */
  batchId: Types.ObjectId | null;
  /**
   * v1.69 — Course within the internship this FAQ belongs to.
   * Optional during migration; the admin can re-tag FAQs once
   * courses exist. The home page course-picker scopes the FAQ
   * list by this field.
   */
  courseId?: Types.ObjectId | null;
  /** Optional reference to the canonical Category document. */
  categoryId: Types.ObjectId | null;
  // ── Public guest-page analytics (additive, computed fields) ────────────
  // Recomputed every 5 min by the public-page aggregation job. Never written
  // by admin/user paths. Used for /api/public/popular-faqs ranking.
  popularityScore: number;
  /** Anonymous view count — separate from `views` (which tracks authed users). */
  guestViewCount: number;
  /** Mean scroll depth (0..1) across all guest readers in the rolling window. */
  avgReadCompletion: number;
  /** Mean actual/expected read-time ratio (0..1) across guest readers. */
  avgTimeSpentRatio: number;
  /** Rolling 24h anonymous view count — drives "trending" lists. */
  guestViewLast24h: number;
  /** Cached word count of question + answer, used for expectedReadMs. */
  wordCount: number;
  /** Cached expected read time in ms, based on 200 wpm. */
  expectedReadMs: number;
  /** Last popularity score recompute timestamp. */
  popularityUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const faqSchema = new MongooseSchema(
  {
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
      enum: ['pending', 'approved', 'rejected'] as FAQStatus[],
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
      enum: ['evergreen', 'seasonal', 'volatile'] as FreshnessTier[],
      default: 'evergreen',
    },
    reviewIntervalDays: {
      type: Number,
      default: 0,
    },
    reviewStatus: {
      type: String,
      enum: ['verified', 'pending_review', 'update_requested'] as ReviewStatus[],
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
      enum: ['low', 'medium', 'high', 'expert'] as TrustLevel[],
      default: 'high', // Existing FAQs default to 'high' (Official)
    },
    sourceType: {
      type: String,
      enum: ['manual', 'community_promotion', 'expert_verified', 'zoom_transcript'] as SourceType[],
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
      enum: ['none', 'objected', 'resolved'] as ObjectionStatus[],
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
    popularityScore:    { type: Number, default: 0 },
    guestViewCount:     { type: Number, default: 0 },
    avgReadCompletion:  { type: Number, default: 0 },
    avgTimeSpentRatio:  { type: Number, default: 0 },
    guestViewLast24h:   { type: Number, default: 0 },
    wordCount:          { type: Number, default: 0 },
    expectedReadMs:     { type: Number, default: 0 },
    popularityUpdatedAt:{ type: Date, default: null },
  },
  { timestamps: true }
);

// Keyword search index — `tags` (carried forward from insight ingestion
// metadata) are weighted alongside question/answer so tag terms boost both
// the /api/search lexical ranker and the RAG retrieval that share this index.
faqSchema.index(
  { question: 'text', answer: 'text', tags: 'text' },
  { weights: { question: 10, tags: 5, answer: 2 }, name: 'faq_text' },
);
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

export default mongoose.model<IFAQ>('FAQ', faqSchema, 'yaksha_faq_faqs');