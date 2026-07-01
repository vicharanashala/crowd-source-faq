/**
 * ResourceCompletion — student-side record of completing an
 * OnboardingResource.
 *
 * v1.69 — Welcome Package Management: parallel to the legacy
 * `User.orientationCompleted` flag, but per-resource (so the new
 * system can track PDF/markdown/video completion independently).
 *
 * One document per (resource, user) pair. Upsert pattern — admins
 * can rebuild completions by re-running POST.
 *
 * `durationSeconds` is what the frontend measured (view time for
 * non-video, watch time for video). The backend stores it as the
 * ground truth, but the completion eligibility check is computed
 * client-side from `OnboardingResource.completionThreshold`. This
 * keeps the eligibility policy in one place.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IResourceCompletion extends Document {
  resourceId: Types.ObjectId;
  userId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  /** Echo of the resource kind at the time of completion. */
  kind: string;
  durationSeconds: number;
  completedAt: Date;
}

const resourceCompletionSchema = new MongooseSchema<IResourceCompletion>(
  {
    resourceId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'OnboardingResource',
      required: true,
      index: true,
    },
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true },
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    kind: { type: String, default: '' },
    durationSeconds: { type: Number, default: 0 },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

resourceCompletionSchema.index({ resourceId: 1, userId: 1 }, { unique: true });

export default mongoose.model<IResourceCompletion>(
  'ResourceCompletion',
  resourceCompletionSchema,
  'yaksha_faq_resource_completions'
);