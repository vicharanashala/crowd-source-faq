import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AssessmentQuestionType = 'MCQ' | 'TrueFalse' | 'Scenario';
export type AssessmentSourceType = 'faq' | 'transcript' | 'recent_faq';

export interface IZoomAssessmentQuestion extends Document {
  zoomSessionId: Types.ObjectId;
  batchId?: Types.ObjectId | null;
  question: string;
  options: string[];
  correctOptionIndex: number;
  type: AssessmentQuestionType;
  sourceType: AssessmentSourceType;
  createdAt: Date;
  updatedAt: Date;
}

const zoomAssessmentQuestionSchema = new MongooseSchema<IZoomAssessmentQuestion>(
  {
    zoomSessionId: { type: MongooseSchema.Types.ObjectId, ref: 'ZoomSession', required: true, index: true },
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctOptionIndex: { type: Number, required: true, min: 0 },
    type: { 
      type: String, 
      enum: ['MCQ', 'TrueFalse', 'Scenario'] as AssessmentQuestionType[], 
      required: true 
    },
    sourceType: { 
      type: String, 
      enum: ['faq', 'transcript', 'recent_faq'] as AssessmentSourceType[], 
      required: true 
    },
  },
  { timestamps: true }
);

export default mongoose.model<IZoomAssessmentQuestion>(
  'ZoomAssessmentQuestion',
  zoomAssessmentQuestionSchema,
  'yaksha_faq_zoom_assessment_questions'
);
