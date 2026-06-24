import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * GlobalAlert.ts
 * Feature: Predictive Friction Clusters
 * Author: Mayank Garg (gargmayank1805@gmail.com)
 * Description: Mongoose schema for AI-generated incident alerts.
 */

export interface IGlobalAlert extends Document {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  isActive: boolean;
  clusterQueries: string[];
  resolvedAt?: Date | null;
  resolvedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const globalAlertSchema = new MongooseSchema<IGlobalAlert>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'warning',
    },
    isActive: { type: Boolean, default: true, index: true },
    clusterQueries: { type: [String], default: [] },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IGlobalAlert>('GlobalAlert', globalAlertSchema, 'yaksha_faq_globalalerts');
