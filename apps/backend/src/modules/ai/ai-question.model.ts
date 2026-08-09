import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IAiQuestion extends Document {
  userId?: Types.ObjectId | null;
  orientationId?: Types.ObjectId | null;
  /** v1.69 — Program context for the orientation session. */
  batchId?: Types.ObjectId | null;
  question: string;
  answer: string;
  createdAt: Date;
  updatedAt: Date;
}

const aiQuestionSchema = new MongooseSchema<IAiQuestion>(
  {
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    orientationId: { type: MongooseSchema.Types.ObjectId, ref: 'Orientation', default: null },
    // v1.69 — orientation is program-scoped; carry the program
    // forward on the question log so admins can audit AI answers
    // per cohort.
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { timestamps: true }
);

aiQuestionSchema.index({ orientationId: 1 });
aiQuestionSchema.index({ userId: 1 });
aiQuestionSchema.index({ batchId: 1, createdAt: -1 });

export default mongoose.model<IAiQuestion>('AiQuestion', aiQuestionSchema, 'yaksha_faq_ai_questions');
