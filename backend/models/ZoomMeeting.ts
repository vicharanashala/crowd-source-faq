import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ZoomMeetingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
export type ZoomInsightType   = 'FAQ' | 'Announcement';

/**
 * How the transcript entered the system.
 * - webhook    : received via Zoom webhook (auto-download)
 * - manual_vtt : manually uploaded .vtt file
 * - manual_txt : manually uploaded .txt file
 * - manual_raw : raw text pasted directly (via rawText body field)
 */
export type TranscriptSourcing = 'webhook' | 'manual_vtt' | 'manual_txt' | 'manual_raw';

/**
 * Source type for FAQ promotion metadata.
 * Persisted on ZoomInsight so it carries through to the generated FAQ.
 */
export type InsightSourceType = 'zoom_transcript' | 'vtt_file' | 'txt_file' | 'manual_upload';

/**
 * Human-readable source type for the meeting as a whole.
 * Used in ZoomMeeting documents.
 */
export type MeetingSourceType = 'zoom' | 'vtt' | 'txt' | 'manual';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface IZoomInsight extends Document {
  meetingId: Types.ObjectId;
  type: ZoomInsightType;
  question?: string;
  answer_or_content: string;
  confidence_score: number;
  status: 'pending_review' | 'approved' | 'rejected';
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  publishedFaqId?: Types.ObjectId;

  // ── Provenance ─────────────────────────────────────────────────────────────
  /** How this insight's source transcript was obtained */
  sourcing: TranscriptSourcing;
  /** Which AI provider processed this insight */
  processedBy: string;
  /** Wall-clock timestamp from the transcript (e.g. "01:23") when this Q&A occurred */
  transcriptTimestamp?: string;
  /** Speaker name at the time of this Q&A */
  speaker?: string;
  /** Carried forward to the generated FAQ as metadata */
  sourceType: InsightSourceType;
  /** Snapshot of meeting title at processing time (in case topic is edited later) */
  sourceTitle?: string;
  /** Short excerpt from the transcript this was derived from */
  transcript_snippet?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface IZoomMeeting extends Document {
  userId: Types.ObjectId;
  /** v1.69 — Program this recording belongs to. */
  batchId?: Types.ObjectId | null;
  zoomMeetingId: string; // Zoom's ID; 'manual-{timestamp}' for uploads
  topic: string;
  startTime: Date;
  duration?: number;
  rawTranscriptUrl?: string;
  rawTranscriptText?: string;
  insightCount: number;
  status: ZoomMeetingStatus;
  errorMessage?: string;
  summary?: string;
  revisionNotes?: string;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;

  // ── Provenance ─────────────────────────────────────────────────────────────
  /** How the transcript was obtained */
  sourcing: TranscriptSourcing;
  /** Which AI provider processed this meeting */
  processedBy?: string;
  /** Human-readable source type */
  sourceType: MeetingSourceType;
  /** For manual uploads: the user who uploaded (defaults to userId for webhook) */
  manualUploadedBy?: Types.ObjectId;
  /** Real-time processing stage for UI progress bar */
  progress: { stage: 'queued' | 'parsing' | 'extracting' | 'embedding' | 'storing' | 'done' | 'failed'; percent: number; message: string };

  // ── Retry / DLQ ──────────────────────────────────────────────────────────
  /** Number of retry attempts so far (0 on first try) */
  retryCount: number;
  /** Per-meeting retry cap (default 3, allows manual override) */
  maxRetries: number;
  /** When the next automatic retry should fire (exponential backoff) */
  nextRetryAt?: Date;
  /** Timestamp of the most recent retry attempt */
  lastRetryAt?: Date;
  /** Append-only audit log of each failure */
  failureHistory: Array<{ attempt: number; error: string; timestamp: Date; stage: string }>;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Insight Schema ────────────────────────────────────────────────────────────

const zoomInsightSchema = new MongooseSchema<IZoomInsight>(
  {
    meetingId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'ZoomMeeting',
      required: true,
    },
    type: {
      type: String,
      enum: ['FAQ', 'Announcement'] as ZoomInsightType[],
      required: true,
    },
    question: {
      type: String,
      trim: true,
    },
    answer_or_content: {
      type: String,
      required: true,
      trim: true,
    },
    confidence_score: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      default: 'pending_review',
    },
    reviewedBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    publishedFaqId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'FAQ',
    },
    // ── Provenance ───────────────────────────────────────────────────────────
    sourcing: {
      type: String,
      enum: ['webhook', 'manual_vtt', 'manual_txt', 'manual_raw'] as TranscriptSourcing[],
      required: true,
    },
    processedBy: {
      type: String,
      required: true,
    },
    transcriptTimestamp: String,
    speaker: String,
    sourceType: {
      type: String,
      enum: ['zoom_transcript', 'vtt_file', 'txt_file', 'manual_upload'] as InsightSourceType[],
      required: true,
    },
    sourceTitle: String,
    transcript_snippet: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// ─── Meeting Schema ────────────────────────────────────────────────────────────

const zoomMeetingSchema = new MongooseSchema<IZoomMeeting>(
  {
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    zoomMeetingId: {
      type: String,
      required: true,
    },
    // v1.69 — see interface.
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      required: false,
      index: true,
      default: null,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    duration: Number,
    rawTranscriptUrl: String,
    rawTranscriptText: String,
    insightCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'dead_letter'] as ZoomMeetingStatus[],
      default: 'pending',
    },
    errorMessage: String,
    summary: String,
    revisionNotes: String,
    processingStartedAt: Date,
    processingCompletedAt: Date,
    // ── Provenance ───────────────────────────────────────────────────────────
    sourcing: {
      type: String,
      enum: ['webhook', 'manual_vtt', 'manual_txt', 'manual_raw'] as TranscriptSourcing[],
      required: true,
    },
    processedBy: String,
    sourceType: {
      type: String,
      enum: ['zoom', 'vtt', 'txt', 'manual'] as MeetingSourceType[],
      required: true,
    },
    manualUploadedBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
    },
    progress: {
      stage: {
        type: String,
        enum: ['queued', 'parsing', 'extracting', 'embedding', 'storing', 'done', 'failed'],
        default: 'queued',
      },
      percent: { type: Number, default: 0, min: 0, max: 100 },
      message: { type: String, default: 'Queued for processing' },
    },
    // ── Retry / DLQ ────────────────────────────────────────────────────────
    retryCount:    { type: Number, default: 0 },
    maxRetries:    { type: Number, default: 3 },
    nextRetryAt:   { type: Date },
    lastRetryAt:   { type: Date },
    failureHistory: [{
      attempt:   { type: Number, required: true },
      error:     { type: String, required: true },
      timestamp: { type: Date, required: true },
      stage:     { type: String, required: true },
    }],
  },
  { timestamps: true }
);

// ─── Indexes ───────────────────────────────────────────────────────────────────

zoomMeetingSchema.index({ userId: 1, zoomMeetingId: 1 }, { unique: true });
zoomMeetingSchema.index({ userId: 1, status: 1, startTime: -1 });
zoomMeetingSchema.index({ status: 1, startTime: -1 });
// Retry scheduler: efficiently find retryable failed meetings
zoomMeetingSchema.index({ status: 1, nextRetryAt: 1, retryCount: 1 });

zoomInsightSchema.index({ meetingId: 1 });
zoomInsightSchema.index({ status: 1, type: 1 });
zoomInsightSchema.index({ publishedFaqId: 1 }, { sparse: true });

// ─── Models ────────────────────────────────────────────────────────────────────

export const ZoomMeeting = mongoose.model<IZoomMeeting>(
  'ZoomMeeting',
  zoomMeetingSchema,
  'yaksha_zoom_meetings'
);
export const ZoomInsight = mongoose.model<IZoomInsight>(
  'ZoomInsight',
  zoomInsightSchema,
  'yaksha_zoom_insights'
);