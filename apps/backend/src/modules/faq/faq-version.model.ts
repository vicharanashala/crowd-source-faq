import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFaqVersion extends Document {
  faqId: Types.ObjectId;
  versionNumber: number;
  question: string;
  answer: string;
  tags: string[];
  category: string;
  editedBy: Types.ObjectId;
  editedAt: Date;
  changeSummary: string;
  batchId: Types.ObjectId | null;
}

const FaqVersionSchema = new Schema<IFaqVersion>({
  faqId: {
    type: Schema.Types.ObjectId,
    ref: 'FAQ',
    required: true,
    index: true,
  },
  versionNumber: {
    type: Number,
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  category: {
    type: String,
    required: true,
  },
  editedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  editedAt: {
    type: Date,
    default: Date.now,
  },
  changeSummary: {
    type: String,
    default: 'Manual update',
  },
  batchId: {
    type: Schema.Types.ObjectId,
    ref: 'Batch',
    default: null,
    index: true,
  },
});

// Composite unique index ensures no duplicate versions exist for an FAQ item
FaqVersionSchema.index({ faqId: 1, versionNumber: -1 }, { unique: true });

export default mongoose.model<IFaqVersion>('FaqVersion', FaqVersionSchema, 'yaksha_faq_faq_versions');
