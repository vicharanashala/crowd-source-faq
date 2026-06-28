import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type FeedbackSentiment = 'outdated' | 'unclear' | 'incomplete' | 'wrong' | 'positive' | 'other';

export interface IAIResponseFeedback extends Document {
  question: string;
  aiAnswer: string;
  rating: number;
  comment: string;
  faqId: Types.ObjectId | null;
  faqQuestion: string;
  hasFaqSource: boolean;
  sentiment: FeedbackSentiment;
  batchId: Types.ObjectId | null;
  // Deduplication fields
  askCount: number;
  avgRating: number;
  comments: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Classify feedback sentiment from comment text and rating.
 * Pure function — no AI calls, keyword matching only.
 */
export function classifySentiment(comment: string, rating: number): FeedbackSentiment {
  if (!comment || !comment.trim()) {
    return rating >= 4 ? 'positive' : 'other';
  }
  const lower = comment.toLowerCase();
  if (/old|outdated|changed|wrong date/.test(lower)) return 'outdated';
  if (/unclear|confusing|dont understand|don't understand/.test(lower)) return 'unclear';
  if (/incomplete|missing|more info|not enough/.test(lower)) return 'incomplete';
  if (/wrong|incorrect|false|not true/.test(lower)) return 'wrong';
  if (rating >= 4) return 'positive';
  return 'other';
}

const aiResponseFeedbackSchema = new MongooseSchema(
  {
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
    },
    aiAnswer: {
      type: String,
      required: [true, 'AI answer is required'],
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: '',
      maxlength: 500,
    },
    faqId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'FAQ',
      default: null,
    },
    faqQuestion: {
      type: String,
      default: '',
    },
    hasFaqSource: {
      type: Boolean,
      default: false,
    },
    sentiment: {
      type: String,
      enum: ['outdated', 'unclear', 'incomplete', 'wrong', 'positive', 'other'] as FeedbackSentiment[],
      default: 'other',
    },
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
    },
    // ── Deduplication / aggregation fields ─────────────────────────────────
    /** Number of times this exact question was asked to the AI. */
    askCount: {
      type: Number,
      default: 1,
    },
    /** Running average rating across all submissions for this question. */
    avgRating: {
      type: Number,
      default: 0,
    },
    /** Up to 50 unique non-empty comments collected for this question. */
    comments: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────
aiResponseFeedbackSchema.index({ faqId: 1 });
aiResponseFeedbackSchema.index({ rating: 1 });
aiResponseFeedbackSchema.index({ hasFaqSource: 1 });
aiResponseFeedbackSchema.index({ question: 'text' });
aiResponseFeedbackSchema.index({ createdAt: -1 });

export default mongoose.model<IAIResponseFeedback>(
  'AIResponseFeedback',
  aiResponseFeedbackSchema,
  'yaksha_faq_ai_feedback'
);
