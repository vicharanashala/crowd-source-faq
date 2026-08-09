import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IAiFeedback extends Document {
  userId: Types.ObjectId;
  aiQuestionId: Types.ObjectId;
  rating: 'helpful' | 'not_helpful';
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const aiFeedbackSchema = new MongooseSchema<IAiFeedback>(
  {
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true },
    aiQuestionId: { type: MongooseSchema.Types.ObjectId, ref: 'AiQuestion', required: true, index: true },
    rating: { type: String, enum: ['helpful', 'not_helpful'], required: true },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true }
);

aiFeedbackSchema.index({ userId: 1, aiQuestionId: 1 }, { unique: true });

export default mongoose.model<IAiFeedback>('AiFeedback', aiFeedbackSchema, 'yaksha_faq_ai_feedback');
