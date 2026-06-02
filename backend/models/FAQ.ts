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
  },
  { timestamps: true }
);

faqSchema.index({ question: 'text', answer: 'text' });
faqSchema.index({ trustLevel: 1, objectionStatus: 1, promotedAt: 1 });
faqSchema.index({ sourceType: 1, sourceCommunityPostId: 1 });
// Hot-field indexes for admin/frontend queries
faqSchema.index({ status: 1, category: 1 });
faqSchema.index({ freshnessTier: 1, lastVerifiedDate: 1 });
faqSchema.index({ createdAt: -1 });
faqSchema.index({ helpfulVotes: -1, views: -1 });

export default mongoose.model<IFAQ>('FAQ', faqSchema, 'yaksha_faq_faqs');