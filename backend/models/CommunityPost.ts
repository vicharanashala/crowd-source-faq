import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

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
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true, timestamps: true }
);

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

// ─── Enums ─────────────────────────────────────────────────────────────────────
export type CommunityPostStatus = 'answered' | 'unanswered';
export type EscalationStatus = 'none' | 'escalated' | 'resolved' | 'dismissed';
export type TimeTrialStatus = 'none' | 'pending' | 'awarded';

// ─── Document interface ─────────────────────────────────────────────────────────
export interface ICommunityPost extends Document {
  title: string;
  body: string;
  tags: string[];
  author: Types.ObjectId;
  status: CommunityPostStatus;
  answer: string | null;
  answerIsExpert?: boolean;
  upvotes: Types.ObjectId[];
  comments: Types.Subdocument[];
  reports: Array<{ reportedBy: Types.ObjectId; reason: string; createdAt?: Date }>;
  embedding?: number[];
  escalationStatus: EscalationStatus;
  escalatedAt: Date | null;
  escalationReason: string | null;
  escalatedBy: Types.ObjectId | null;
  escalationResolvedAt: Date | null;
  escalationResolvedBy: Types.ObjectId | null;
  escalationOutcome: string | null;
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
}

// ─── Schema ─────────────────────────────────────────────────────────────────────
const communityPostSchema = new MongooseSchema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    tags: { type: [String], default: [] },
    author: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['answered', 'unanswered'] as CommunityPostStatus[],
      default: 'unanswered',
    },
    answer: { type: String, default: null },
    answerIsExpert: { type: Boolean, default: false },
    // Solution DNA — compact answer summary for resolved posts
    dna: {
      steps: { type: [String], default: [] },
      tools: { type: [String], default: [] },
      timeToComplete: { type: String, default: null },
      difficulty: { type: String, enum: ['Easy', 'Moderate', 'Tricky', null], default: null },
    },
    upvotes: { type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] },
    comments: { type: [commentSchema], default: [] },
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
  },
  { timestamps: true }
);

// Text index for keyword search
communityPostSchema.index({ title: 'text', body: 'text' });
// Time-Trial activation scheduler
communityPostSchema.index({ status: 1, timeTrialStatus: 1, createdAt: 1 });
// Prevent duplicate upvotes: each user can only appear once in the upvotes array
communityPostSchema.index({ upvotes: 1 }, { unique: true, sparse: true });
// Promotion query indexes
communityPostSchema.index({ eligibleForPromotion: 1, promotionPendingAt: 1 });
communityPostSchema.index({ status: 1, eligibleForPromotion: 1 });
// Hot-field indexes for admin/community/leaderboard queries
communityPostSchema.index({ author: 1, createdAt: -1 });
communityPostSchema.index({ escalationStatus: 1, createdAt: 1 });
communityPostSchema.index({ reports: 1 });

export default mongoose.model<ICommunityPost>(
  'CommunityPost',
  communityPostSchema,
  'yaksha_faq_communityposts'
);