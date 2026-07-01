import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IZoomSession extends Document {
  // v1.69 — multi-program provisioning: every onboarding Zoom
  // session belongs to exactly one program. `null` is allowed for
  // legacy / pre-feature data; new code paths always set a real
  // ObjectId.
  batchId: Types.ObjectId | null;
  title: string;
  description: string;
  duration: string;
  zoomUrl: string;
  isActive: boolean;
  transcript: string;
  questionCount: number;
  passScore: number;
  dailyResetTime: string;
  createdAt: Date;
  updatedAt: Date;
}

const zoomSessionSchema = new MongooseSchema<IZoomSession>(
  {
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    duration: { type: String, default: '60 minutes' },
    zoomUrl: { type: String, required: true },
    isActive: { type: Boolean, default: false, index: true },
    transcript: { type: String, default: '' },
    questionCount: { type: Number, default: 10, min: 5, max: 20 },
    passScore: { type: Number, default: 70, min: 0, max: 100 },
    dailyResetTime: { type: String, default: '09:00 AM' }
  },
  { timestamps: true }
);

export default mongoose.model<IZoomSession>(
  'ZoomSession',
  zoomSessionSchema,
  'yaksha_faq_zoom_sessions'
);
