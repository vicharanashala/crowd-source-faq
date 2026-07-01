import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IOrientation extends Document {
  // v1.69 — multi-program provisioning: every orientation video
  // belongs to exactly one program. `null` is allowed for legacy /
  // pre-feature data; new code paths always set a real ObjectId.
  batchId: Types.ObjectId | null;
  title: string;
  description: string;
  videoUrl: string;
  transcript: string;
  completionThreshold: number; // 0-100, percentage of video that must be watched
  createdAt: Date;
  updatedAt: Date;
}

const orientationSchema = new MongooseSchema<IOrientation>(
  {
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    videoUrl: { type: String, required: true },
    transcript: { type: String, default: '' },
    completionThreshold: { type: Number, default: 90, min: 0, max: 100 },
  },
  { timestamps: true }
);

export default mongoose.model<IOrientation>('Orientation', orientationSchema, 'yaksha_faq_orientations');
