import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type FreshnessVerdict = 'still_accurate' | 'needs_update';

/**
 * One vote per user per FAQ per review cycle.
 * Unique compound index prevents duplicate votes.
 */
export interface IFreshReviewVote extends Document {
  faqId: Types.ObjectId;
  reviewCycle: number;
  voterId: Types.ObjectId;
  verdict: FreshnessVerdict;
  suggestion?: string;   // max 300 chars — only for 'needs_update'
  createdAt: Date;
}

const freshReviewVoteSchema = new MongooseSchema(
  {
    faqId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'FAQ',
      required: true,
    },
    reviewCycle: {
      type: Number,
      required: true,
    },
    voterId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    verdict: {
      type: String,
      enum: ['still_accurate', 'needs_update'] as FreshnessVerdict[],
      required: true,
    },
    suggestion: {
      type: String,
      maxlength: 300,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Unique per (faqId, reviewCycle, voterId)
freshReviewVoteSchema.index(
  { faqId: 1, reviewCycle: 1, voterId: 1 },
  { unique: true }
);

// For fast counting per cycle
freshReviewVoteSchema.index({ faqId: 1, reviewCycle: 1, verdict: 1 });
// v1.68 — schema index: 'show me all my votes' view (profile page).
freshReviewVoteSchema.index({ voterId: 1, createdAt: -1 });

export default mongoose.model<IFreshReviewVote>(
  'FreshReviewVote',
  freshReviewVoteSchema,
  'yaksha_faq_fresh_review_votes'
);