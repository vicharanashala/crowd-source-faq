/**
 * EscalationQueue — questions the AI First Responder couldn't safely
 * answer (error, timeout, or low confidence), routed here for a human
 * admin to review. See first-responder.controller.ts.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type EscalationReason = 'ai_error' | 'ai_timeout' | 'low_confidence';
export type EscalationStatus = 'pending_admin_review' | 'resolved' | 'dismissed';

export interface IEscalationQueue extends Document {
  question: string;
  userId: Types.ObjectId | null;
  reason: EscalationReason;
  /** Truncated AI error message or raw model output, for admin debugging. Never shown to the user. */
  debugDetail: string | null;
  status: EscalationStatus;
  resolvedBy: Types.ObjectId | null;
  resolvedAt: Date | null;
  /** Program this question was asked from, if any. */
  batchId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const escalationQueueSchema = new MongooseSchema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reason: {
      type: String,
      enum: ['ai_error', 'ai_timeout', 'low_confidence'] as EscalationReason[],
      required: true,
    },
    debugDetail: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['pending_admin_review', 'resolved', 'dismissed'] as EscalationStatus[],
      default: 'pending_admin_review',
    },
    resolvedBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

escalationQueueSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IEscalationQueue>(
  'EscalationQueue',
  escalationQueueSchema,
  'yaksha_faq_escalation_queue'
);
