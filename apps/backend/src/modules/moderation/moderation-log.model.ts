import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export type ModerationAction =
  | 'warn' | 'point_deduct' | 'badge_issue_negative'
  | 'suspend' | 'ban' | 'unban' | 'unsuspend'
  | 'soft_delete' | 'restore' | 'delete_content' | 'lift_warning';

export type ModerationTarget = 'user' | 'faq' | 'comment' | 'post';

export interface IModerationLog extends Document {
  moderatorId: MongooseSchema.Types.ObjectId;
  batchId?: MongooseSchema.Types.ObjectId | null;
  action: ModerationAction;
  targetId: MongooseSchema.Types.ObjectId;
  targetType: ModerationTarget;
  reason: string;
  duration?: string;
  pointsDeduct?: number;
  previousState?: string;
  newState?: string;
  createdAt: Date;
}

const moderationLogSchema = new MongooseSchema<IModerationLog>({
  moderatorId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
  batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
  action: { type: String, enum: ['warn', 'point_deduct', 'badge_issue_negative', 'suspend', 'ban', 'unban', 'unsuspend', 'soft_delete', 'restore', 'delete_content', 'lift_warning'] as ModerationAction[], required: true },
  targetId: { type: MongooseSchema.Types.ObjectId, required: true },
  targetType: { type: String, enum: ['user', 'faq', 'comment', 'post'] as ModerationTarget[], required: true },
  reason: { type: String, default: '' },
  duration: { type: String },
  pointsDeduct: { type: Number },
  previousState: { type: String },
  newState: { type: String },
}, { timestamps: true });

moderationLogSchema.index({ targetId: 1, createdAt: -1 });
moderationLogSchema.index({ moderatorId: 1, createdAt: -1 });
moderationLogSchema.index({ action: 1 });
moderationLogSchema.index({ targetType: 1 });

export default mongoose.model<IModerationLog>('ModerationLog', moderationLogSchema, 'yaksha_faq_moderation_logs');
