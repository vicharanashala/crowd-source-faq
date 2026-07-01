import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';
import type { ReputationAction } from '../auth/user.model.js';

export interface IReputationLog extends Document {
  userId: MongooseSchema.Types.ObjectId;
  /** v1.69 — Program this reputation event belongs to. null = global. */
  batchId?: MongooseSchema.Types.ObjectId | null;
  delta: number;
  reason: string;
  action: ReputationAction;
  targetId?: MongooseSchema.Types.ObjectId;
  targetType?: string;
  awardedBy?: MongooseSchema.Types.ObjectId;
  createdAt: Date;
}

const reputationLogSchema = new MongooseSchema<IReputationLog>({
  userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
  // v1.69 — per-program reputation. Index covers the
  // "leaderboard for program X" query path.
  batchId: {
    type: MongooseSchema.Types.ObjectId,
    ref: 'Batch',
    required: false,
    index: true,
    default: null,
  },
  delta: { type: Number, required: true },
  reason: { type: String, default: '' },
  action: { type: String, required: true },
  targetId: { type: MongooseSchema.Types.ObjectId },
  // v1.68 — schema fix: targetType was a free string. Now
  // constrained to the literal union that the controllers
  // actually write. A typo in a new code path now fails
  // the schema validation rather than silently
  // mis-classifying the log entry.
  targetType: {
    type: String,
    enum: [
      'faq',
      'comment',
      'post',
      'support',
      'document',
      'community_post',
      'badge',
      'faq_promotion',
      'spurti_point_ledger',
      'system',
      'support_request',
      'user',
    ] as (
      | 'faq'
      | 'comment'
      | 'post'
      | 'support'
      | 'document'
      | 'community_post'
      | 'badge'
      | 'faq_promotion'
      | 'spurti_point_ledger'
      | 'system'
      | 'support_request'
      | 'user'
    )[],
  },
  awardedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

reputationLogSchema.index({ userId: 1, createdAt: -1 });
// v1.68 — schema index: "show me all answer_accepted
// events for user X" — common moderation view.
reputationLogSchema.index({ userId: 1, action: 1, createdAt: -1 });
reputationLogSchema.index({ userId: 1 });

export default mongoose.model<IReputationLog>('ReputationLog', reputationLogSchema, 'yaksha_faq_reputation_logs');
