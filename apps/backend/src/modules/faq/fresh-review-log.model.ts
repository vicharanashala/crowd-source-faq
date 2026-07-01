import mongoose, { Document, Types } from 'mongoose';

export type FreshReviewEventType =
  | 'auto_flag'
  | 'manual_flag'
  | 'freshness_vote'
  | 'auto_verified'
  | 'escalated'
  | 'mod_verified'
  | 'mod_dismissed';

export interface IFreshReviewLog extends Document {
  event: FreshReviewEventType;
  faqId: Types.ObjectId;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const freshReviewLogSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: [
        'auto_flag',
        'manual_flag',
        'freshness_vote',
        'auto_verified',
        'escalated',
        'mod_verified',
        'mod_dismissed',
      ] as FreshReviewEventType[],
      required: true,
    },
    faqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FAQ',
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

freshReviewLogSchema.index({ faqId: 1, createdAt: -1 });
freshReviewLogSchema.index({ event: 1, createdAt: -1 });

export default mongoose.model<IFreshReviewLog>(
  'FreshReviewLog',
  freshReviewLogSchema,
  'yaksha_faq_fresh_review_logs'
);