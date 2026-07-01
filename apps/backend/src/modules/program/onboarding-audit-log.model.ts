import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export interface IOnboardingAuditLog extends Document {
  changedBy: mongoose.Types.ObjectId;
  batchId?: mongoose.Types.ObjectId | null;
  // v1.69 — Zoom Session History: `zoom_session` is a new entity
  // type for tracking every lifecycle event on a ZoomSession
  // (create, update, activate, transcript upload, regenerate,
  // delete). `zoom_question` covers per-question edits in the
  // pool. Both are non-breaking additions to the existing enum.
  entityType:
    | 'timeline_step'
    | 'project'
    | 'mentor'
    | 'orientation'
    | 'checklist'
    | 'resource'
    | 'zoom_session'
    | 'zoom_question';
  entityId: mongoose.Types.ObjectId;
  action: 'create' | 'update' | 'delete' | 'reorder' | 'archive' | 'activate' | 'transcript_upload' | 'regenerate' | 'switch_active';
  previousValue?: any;
  newValue?: any;
  timestamp: Date;
}

const onboardingAuditLogSchema = new MongooseSchema<IOnboardingAuditLog>(
  {
    changedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    entityType: {
      type: String,
      enum: [
        'timeline_step', 'project', 'mentor', 'orientation', 'checklist', 'resource',
        'zoom_session', 'zoom_question',
      ],
      required: true,
    },
    entityId: { type: MongooseSchema.Types.ObjectId, required: true },
    action: {
      type: String,
      enum: [
        'create', 'update', 'delete', 'reorder', 'archive', 'activate',
        'transcript_upload', 'regenerate', 'switch_active',
      ],
      required: true,
    },
    previousValue: { type: MongooseSchema.Types.Mixed },
    newValue: { type: MongooseSchema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

onboardingAuditLogSchema.index({ entityType: 1, timestamp: -1 });
onboardingAuditLogSchema.index({ changedBy: 1, timestamp: -1 });

export default mongoose.model<IOnboardingAuditLog>(
  'OnboardingAuditLog',
  onboardingAuditLogSchema,
  'yaksha_faq_onboarding_audit_logs'
);
