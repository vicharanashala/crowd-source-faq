import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { moderateText } from '../../config/moderationEngine.js';

// ─── Reply sub-schema (nested inside comments) ──────────────────────────────────
const replySchema = new MongooseSchema(
  {
    author: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    upvotes: { type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] },
    downvotes: { type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] },
    verified: { type: Boolean, default: false },
    isExpertAnswer: { type: Boolean, default: false },
    isFirstResponder: { type: Boolean, default: false },
    firstResponderAwardedAt: { type: Date, default: null },
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true, timestamps: true }
);

// Soft-censor the reply body before persisting (catches leetspeak + spaced-out variants).
replySchema.pre('save', function (next) {
  if (this.isModified('body') && typeof this.body === 'string') {
    this.body = moderateText(this.body);
  }
  next();
});

// ─── Comment sub-schema ─────────────────────────────────────────────────────────
const commentSchema = new MongooseSchema(
  {
    author: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    upvotes: { type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] },
    downvotes: { type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] },
    verified: { type: Boolean, default: false },
    isExpertAnswer: { type: Boolean, default: false },
    isFirstResponder: { type: Boolean, default: false },
    firstResponderAwardedAt: { type: Date, default: null },
    parentId: { type: MongooseSchema.Types.ObjectId, default: null },
    depth: { type: Number, default: 0 },
    replies: { type: [replySchema], default: [] },
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    // Solution DNA — structured answer metadata
    solutionDNA: {
      type: {
        keyPoints: { type: [String], default: [] },
        summary: { type: String, default: null },
        tags: { type: [String], default: [] },
      },
      default: null,
    },
  },
  { timestamps: true }
);

// Soft-censor the comment body before persisting. Mongoose fires this hook
// on each modified subdoc when the parent CommunityPost calls .save().
commentSchema.pre('save', function (next) {
  if (this.isModified('body') && typeof this.body === 'string') {
    this.body = moderateText(this.body);
  }
  next();
});

// ─── Enums ─────────────────────────────────────────────────────────────────────
export type CommunityPostStatus = 'answered' | 'unanswered';
export type EscalationStatus = 'none' | 'escalated' | 'resolved' | 'dismissed';
export type TimeTrialStatus = 'none' | 'pending' | 'awarded';

/** Lifecycle pipeline statuses — see context/knowledge-lifecycle-design.md */
export type LifecycleStatus =
  | 'open'
  | 'answered'
  | 'community_accepted'
  | 'ai_validated'
  | 'admin_accepted'
  | 'converted_to_faq';

// ─── Document interface ─────────────────────────────────────────────────────────
export interface ICommunityPost extends Document {
  _id: Types.ObjectId;
  title: string;
  body?: string;
  tags: string[];
  author: Types.ObjectId;
  status: CommunityPostStatus;
  createdAt?: Date;
  answer: string | null;
  answerIsExpert?: boolean;
  answerAuthorId?: Types.ObjectId | null;
  upvotes: Types.ObjectId[];
  bookmarks: Types.ObjectId[];
  // AI auto-answer fields
  aiAnswer?: string | null;
  aiAnswerConfidence?: number | null;   // 0–1
  aiAnswerStatus?: 'pending' | 'suggested' | 'approved' | 'rejected' | 'escalated' | null;
  aiAnswerSource?: string | null;        // FAQ title or 'Knowledge Base' that matched
  aiAnswerSuggestedAt?: Date | null;
  aiAnswerReviewedAt?: Date | null;
  aiAnswerReviewedBy?: Types.ObjectId | null;
  aiAnswerEscalatedAt?: Date | null;
  aiAnswerEscalatedReason?: string | null;
  aiAnswerAttempts?: number;
  // AI audit tracking (shared with FAQ audit)
  lastCheckedAt?: Date | null;
  comments: Types.Subdocument[];
  reports: Array<{ reportedBy: Types.ObjectId; reason: string; createdAt?: Date }>;
  embedding?: number[];
  /**
   * Cloudinary-backed image attachments. Stored as plain metadata
   * (URL + publicId) — the actual bytes live in Cloudinary. We keep
   * width/height so the feed can render a correctly-sized placeholder
   * without re-fetching the image first.
   */
  attachments: Array<{
    url: string;
    publicId?: string;
    gcsUri?: string;
    objectPath?: string;
    width?: number;
    height?: number;
    format?: string;
    bytes?: number;
  }>;
  escalationStatus: EscalationStatus;
  escalatedAt: Date | null;
  escalationReason: string | null;
  escalatedBy: Types.ObjectId | null;
  escalationResolvedAt: Date | null;
  escalationResolvedBy: Types.ObjectId | null;
  escalationOutcome: string | null;
  /** v1.69 — Program this community thread belongs to. */
  batchId?: Types.ObjectId | null;
  answeredFromKnowledgeId?: Types.ObjectId;
  timeTrialStatus: TimeTrialStatus;
  timeTrialStartedAt: Date | null;
  timeTrialFirstResponder: Types.ObjectId | null;
  timeTrialFirstResponderAt: Date | null;
  dna?: {
    steps: string[];
    tools: string[];
    timeToComplete?: string | null;
    difficulty?: 'Easy' | 'Moderate' | 'Tricky' | null;
  };
  // Promotion system fields
  eligibleForPromotion?: boolean;
  promotionPendingAt?: Date | null;
  promotionCandidateCommentId?: Types.ObjectId | null;
  promotionObjectedBy?: Types.ObjectId | null;
  promotionObjectedAt?: Date | null;
  promotionObjectionReason?: string | null;
  // Admin moderation (per spec: hide / lock / merge / delete)
  isHidden?: boolean;
  isLocked?: boolean;
  hiddenAt?: Date | null;
  hiddenBy?: Types.ObjectId | null;
  hiddenReason?: string | null;
  lockedAt?: Date | null;
  lockedBy?: Types.ObjectId | null;
  lockedReason?: string | null;
  /** 7-stage knowledge pipeline — see context/knowledge-lifecycle-design.md */
  lifecycle: {
    status: LifecycleStatus;
    statusHistory: Array<{
      from: string;
      to: string;
      changedBy: Types.ObjectId;
      changedAt: Date;
      note?: string;
    }>;
    communityAcceptedAt?: Date;
    aiValidatedAt?: Date;
    adminAcceptedAt?: Date;
    convertedToFaqAt?: Date;
    aiGeneratedFaq?: {
      question: string;
      answer: string;
      category: string;
      tags: string[];
      confidenceScore: number;
      duplicateOf?: Types.ObjectId;
      hallucinationFlags: string[];
      grammarIssues: string[];
    };
  };
}

// ─── Schema ─────────────────────────────────────────────────────────────────────
const communityPostSchema = new MongooseSchema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    tags: { type: [String], default: [] },
    author: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    // v1.69 — see interface. Every community post is now tagged
    // with the program it's part of, mirroring the FAQ model.
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['answered', 'unanswered'] as CommunityPostStatus[],
      default: 'unanswered',
    },
    answer: { type: String, default: null },
    answerIsExpert: { type: Boolean, default: false },
    answerAuthorId: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    // AI auto-answer
    aiAnswer: { type: String, default: null },
    aiAnswerConfidence: { type: Number, default: null },
    aiAnswerStatus: {
      type: String,
      enum: ['pending', 'suggested', 'approved', 'rejected', 'escalated'],
      default: null,
    },
    aiAnswerSource: { type: String, default: null },
    aiAnswerSuggestedAt: { type: Date, default: null },
    aiAnswerReviewedAt: { type: Date, default: null },
    aiAnswerReviewedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    aiAnswerEscalatedAt: { type: Date, default: null },
    aiAnswerEscalatedReason: { type: String, default: null },
    aiAnswerAttempts: { type: Number, default: 0 },
    // AI audit tracking
    lastCheckedAt: { type: Date, default: null },
    // Solution DNA — compact answer summary for resolved posts
    dna: {
      steps: { type: [String], default: [] },
      tools: { type: [String], default: [] },
      timeToComplete: { type: String, default: null },
      difficulty: { type: String, enum: ['Easy', 'Moderate', 'Tricky', null], default: null },
    },
    upvotes: { type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] },
    bookmarks: { type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] },
    comments: { type: [commentSchema], default: [] },
    // Cloudinary image attachments. Capped at 4 in the controller — the
    // feed can show a grid up to that without reflowing the layout.
    attachments: {
      type: [{
        url: { type: String, required: true },
        publicId: { type: String },
        gcsUri: { type: String },
        objectPath: { type: String },
        width: { type: Number },
        height: { type: Number },
        format: { type: String },
        bytes: { type: Number },
      }],
      default: [],
    },
    reports: {
      type: [{
        reportedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
        reason: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
    embedding: { type: [Number], default: undefined },
    escalationStatus: {
      type: String,
      enum: ['none', 'escalated', 'resolved', 'dismissed'] as EscalationStatus[],
      default: 'none',
    },
    escalatedAt: { type: Date, default: null },
    escalationReason: { type: String, default: null },
    escalatedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    escalationResolvedAt: { type: Date, default: null },
    escalationResolvedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    escalationOutcome: { type: String, default: null },
    answeredFromKnowledgeId: { type: MongooseSchema.Types.ObjectId, ref: 'TranscriptKnowledge' },
    timeTrialStatus: {
      type: String,
      enum: ['none', 'pending', 'awarded'] as TimeTrialStatus[],
      default: 'none',
    },
    timeTrialStartedAt: { type: Date, default: null },
    timeTrialFirstResponder: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    timeTrialFirstResponderAt: { type: Date, default: null },
    // Promotion system
    eligibleForPromotion: { type: Boolean, default: false },
    promotionPendingAt: { type: Date, default: null },
    promotionCandidateCommentId: { type: MongooseSchema.Types.ObjectId, default: null },
    promotionObjectedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    promotionObjectedAt: { type: Date, default: null },
    promotionObjectionReason: { type: String, default: null },
    // Admin moderation
    isHidden: { type: Boolean, default: false },
    isLocked: { type: Boolean, default: false },
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    hiddenReason: { type: String, default: null },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    lockedReason: { type: String, default: null },
    // 7-stage lifecycle pipeline
    lifecycle: {
      type: {
        status: {
          type: String,
          enum: ['open', 'answered', 'community_accepted', 'ai_validated', 'admin_accepted', 'converted_to_faq'] as LifecycleStatus[],
          default: 'open',
        },
        statusHistory: [{
          from: { type: String, default: '' },
          to: { type: String, default: '' },
          changedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
          changedAt: { type: Date, default: Date.now },
          note: { type: String, default: null },
        }],
        communityAcceptedAt: { type: Date, default: null },
        aiValidatedAt: { type: Date, default: null },
        adminAcceptedAt: { type: Date, default: null },
        convertedToFaqAt: { type: Date, default: null },
        aiGeneratedFaq: {
          type: {
            question: { type: String, default: '' },
            answer: { type: String, default: '' },
            category: { type: String, default: '' },
            tags: { type: [String], default: [] },
            confidenceScore: { type: Number, default: 0 },
            duplicateOf: { type: MongooseSchema.Types.ObjectId, default: null },
            hallucinationFlags: { type: [String], default: [] },
            grammarIssues: { type: [String], default: [] },
          },
          default: null,
        },
      },
      default: () => ({ status: 'open', statusHistory: [] }),
    },
  },
  { timestamps: true }
);

// Soft-censor the title and body before persisting. Mongoose fires this
// hook on every .save() — covers createPost, addComment (parent save
// after pushing a subdoc), updateComment, and any future write path.
communityPostSchema.pre('save', function (next) {
  if (this.isModified('title') && typeof (this as { title?: unknown }).title === 'string') {
    (this as { title: string }).title = moderateText((this as { title: string }).title);
  }
  if (this.isModified('body') && typeof (this as { body?: unknown }).body === 'string') {
    (this as { body: string }).body = moderateText((this as { body: string }).body);
  }
  next();
});

// Text index for keyword search
communityPostSchema.index({ title: 'text', body: 'text' });
// Time-Trial activation scheduler
communityPostSchema.index({ status: 1, timeTrialStatus: 1, createdAt: 1 });
communityPostSchema.index({ status: 1, aiAnswerStatus: 1, createdAt: 1 });
// Index for upvote queries (uniqueness per-post is enforced by $addToSet in controller)
communityPostSchema.index({ upvotes: 1 }, { sparse: true });
communityPostSchema.index({ bookmarks: 1 }, { sparse: true });
// Promotion query indexes
communityPostSchema.index({ eligibleForPromotion: 1, promotionPendingAt: 1 });
communityPostSchema.index({ status: 1, eligibleForPromotion: 1 });
// Hot-field indexes for admin/community/leaderboard queries
communityPostSchema.index({ author: 1, createdAt: -1 });
communityPostSchema.index({ escalationStatus: 1, createdAt: 1 });
communityPostSchema.index({ reports: 1 });
// Lifecycle pipeline indexes
communityPostSchema.index({ 'lifecycle.status': 1, createdAt: 1 });
communityPostSchema.index({ 'lifecycle.communityAcceptedAt': 1 });
communityPostSchema.index({ 'lifecycle.aiValidatedAt': 1 });
export default mongoose.model<ICommunityPost>(
  'CommunityPost',
  communityPostSchema,
  'yaksha_faq_communityposts'
);