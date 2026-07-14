import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IStudentTelemetry extends Document {
  userId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  totalSearches: number;
  failedSearches: number;
  resolvedSupportRequests: number;
  unresolvedSupportRequests: number;
  escalatedSupportRequests: number;
  spurtiPointsSpent: number;
  negativeFeedbackCount: number;
  sentimentScoreSum: number;
  sentimentScoreCount: number;
  distressIndex: number; // 0.0 to 1.0 (1.0 being highly distressed)
  updatedAt: Date;
}

const studentTelemetrySchema = new Schema<IStudentTelemetry>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'Batch',
      default: null,
    },
    totalSearches: {
      type: Number,
      default: 0,
    },
    failedSearches: {
      type: Number,
      default: 0,
    },
    resolvedSupportRequests: {
      type: Number,
      default: 0,
    },
    unresolvedSupportRequests: {
      type: Number,
      default: 0,
    },
    escalatedSupportRequests: {
      type: Number,
      default: 0,
    },
    spurtiPointsSpent: {
      type: Number,
      default: 0,
    },
    negativeFeedbackCount: {
      type: Number,
      default: 0,
    },
    sentimentScoreSum: {
      type: Number,
      default: 0,
    },
    sentimentScoreCount: {
      type: Number,
      default: 0,
    },
    distressIndex: {
      type: Number,
      default: 0.0,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to calculate distressIndex based on telemetry metrics
studentTelemetrySchema.pre('save', function (next) {
  const telemetry = this as IStudentTelemetry;
  
  // Calculate ratios
  const searchFailRatio = telemetry.totalSearches > 0 
    ? (telemetry.failedSearches / telemetry.totalSearches) 
    : 0;

  const totalSupport = telemetry.resolvedSupportRequests + telemetry.unresolvedSupportRequests + telemetry.escalatedSupportRequests;
  const supportEscalationRatio = totalSupport > 0 
    ? (telemetry.escalatedSupportRequests / totalSupport) 
    : 0;

  const averageSentiment = telemetry.sentimentScoreCount > 0 
    ? (telemetry.sentimentScoreSum / telemetry.sentimentScoreCount) 
    : 0.0; // range is -1.0 to 1.0

  // Sentiment normalized to 0 (very positive) to 1.0 (very negative/distressed)
  const sentimentComponent = (1.0 - averageSentiment) / 2.0;

  // Weight components
  // 30% search fail ratio, 30% support escalation ratio, 25% negative sentiment, 15% SP spend density
  const spWeight = Math.min(1.0, telemetry.spurtiPointsSpent / 150); // cap at 150 SP spent

  const rawIndex = 
    (searchFailRatio * 0.3) + 
    (supportEscalationRatio * 0.3) + 
    (sentimentComponent * 0.25) + 
    (spWeight * 0.15) + 
    (telemetry.negativeFeedbackCount * 0.1); // add penalty for flags

  telemetry.distressIndex = Math.min(1.0, Math.max(0.0, rawIndex));
  next();
});

const StudentTelemetry = mongoose.model<IStudentTelemetry>('StudentTelemetry', studentTelemetrySchema, 'yaksha_faq_student_telemetries');
export default StudentTelemetry;
