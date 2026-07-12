import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IFaqFeedback extends Document {
  faqId: Types.ObjectId;
  sessionId: string; // To track and prevent duplicate feedback from same anonymous user session
  userId?: Types.ObjectId | null;
  isHelpful: boolean;
  reason?: string | null;
  comments?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const faqFeedbackSchema = new MongooseSchema(
  {
    faqId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'FAQ',
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isHelpful: {
      type: Boolean,
      required: true,
    },
    reason: {
      type: String,
      default: null,
    },
    comments: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate feedback from same session on the same FAQ
faqFeedbackSchema.index({ faqId: 1, sessionId: 1 }, { unique: true });

export default mongoose.model<IFaqFeedback>('FaqFeedback', faqFeedbackSchema, 'yaksha_faq_feedback');
