import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDashboardMetric extends Document {
  date: string; // YYYY-MM-DD
  batchId: Types.ObjectId | null;
  searchesCount: number;
  uniqueUsers: Types.ObjectId[];
  faqsCreatedCount: number;
  usersRegisteredCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const dashboardMetricSchema = new Schema<IDashboardMetric>(
  {
    date: {
      type: String,
      required: true,
      index: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
    searchesCount: {
      type: Number,
      default: 0,
    },
    uniqueUsers: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    faqsCreatedCount: {
      type: Number,
      default: 0,
    },
    usersRegisteredCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

dashboardMetricSchema.index({ date: 1, batchId: 1 }, { unique: true });

export default mongoose.model<IDashboardMetric>('DashboardMetric', dashboardMetricSchema, 'yaksha_faq_dashboard_metrics');
