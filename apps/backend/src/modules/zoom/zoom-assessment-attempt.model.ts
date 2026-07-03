import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IZoomAssessmentAttempt extends Document {
  zoomSessionId: Types.ObjectId;
  userId: Types.ObjectId;
  batchId?: Types.ObjectId | null;
  questions: Array<{
    _id: Types.ObjectId;
    question: string;
    options: string[];
    correctOptionIndex: number;
    type?: string;
    sourceType?: string;
  }>;
  answers: Map<string, number>; // questionId -> selectedIndex
  currentIdx: number;
  status: 'started' | 'passed' | 'failed';
  score?: number;
  passScore: number;
  zoomQuestionCount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

const zoomAssessmentAttemptSchema = new Schema<IZoomAssessmentAttempt>(
  {
    zoomSessionId: { type: Schema.Types.ObjectId, ref: 'ZoomSession', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    questions: [
      {
        _id: { type: Schema.Types.ObjectId, required: true },
        question: { type: String, required: true },
        options: [{ type: String, required: true }],
        correctOptionIndex: { type: Number, required: true },
        type: { type: String },
        sourceType: { type: String },
      },
    ],
    answers: {
      type: Map,
      of: Number,
      default: {},
    },
    currentIdx: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['started', 'passed', 'failed'],
      default: 'started',
      index: true,
    },
    score: { type: Number },
    passScore: { type: Number, required: true },
    zoomQuestionCount: { type: Number, required: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

// Index to quickly fetch a user's latest attempt
zoomAssessmentAttemptSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IZoomAssessmentAttempt>(
  'ZoomAssessmentAttempt',
  zoomAssessmentAttemptSchema,
  'yaksha_faq_zoom_attempts'
);
