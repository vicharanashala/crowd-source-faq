import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IKnowledgeGapReport extends Document {
  dateRange: {
    start: Date;
    end: Date;
  };
  gaps: Array<{
    topic: string;
    summary: string;
    frequency: number;
    suggestedActions: string[];
  }>;
  trendingTopics: string[];
  createdAt: Date;
  updatedAt: Date;
}

const knowledgeGapReportSchema = new MongooseSchema<IKnowledgeGapReport>(
  {
    dateRange: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    gaps: [
      {
        topic: { type: String, required: true },
        summary: { type: String, required: true },
        frequency: { type: Number, required: true },
        suggestedActions: [{ type: String }],
      },
    ],
    trendingTopics: [{ type: String }],
  },
  { timestamps: true }
);

knowledgeGapReportSchema.index({ createdAt: -1 });

export default mongoose.model<IKnowledgeGapReport>(
  'KnowledgeGapReport',
  knowledgeGapReportSchema,
  'yaksha_faq_knowledge_gap_reports'
);
