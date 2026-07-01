import mongoose, { Schema as MongooseSchema } from 'mongoose';
// ─── Insight Schema ────────────────────────────────────────────────────────────
const zoomInsightSchema = new MongooseSchema({
    meetingId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'ZoomMeeting',
        required: true,
    },
    type: {
        type: String,
        enum: ['FAQ', 'Announcement'],
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
        enum: ['webhook', 'manual_vtt', 'manual_txt', 'manual_raw'],
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
        enum: ['zoom_transcript', 'vtt_file', 'txt_file', 'manual_upload'],
        required: true,
    },
    sourceTitle: String,
    transcript_snippet: {
        type: String,
        maxlength: 500,
    },
}, { timestamps: true });
// ─── Meeting Schema ────────────────────────────────────────────────────────────
const zoomMeetingSchema = new MongooseSchema({
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
        enum: ['pending', 'processing', 'completed', 'failed', 'dead_letter'],
        default: 'pending',
    },
    errorMessage: String,
    processingStartedAt: Date,
    processingCompletedAt: Date,
    // ── Provenance ───────────────────────────────────────────────────────────
    sourcing: {
        type: String,
        enum: ['webhook', 'manual_vtt', 'manual_txt', 'manual_raw'],
        required: true,
    },
    processedBy: String,
    sourceType: {
        type: String,
        enum: ['zoom', 'vtt', 'txt', 'manual'],
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
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    nextRetryAt: { type: Date },
    lastRetryAt: { type: Date },
    failureHistory: [{
            attempt: { type: Number, required: true },
            error: { type: String, required: true },
            timestamp: { type: Date, required: true },
            stage: { type: String, required: true },
        }],
}, { timestamps: true });
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
export const ZoomMeeting = mongoose.model('ZoomMeeting', zoomMeetingSchema, 'yaksha_zoom_meetings');
export const ZoomInsight = mongoose.model('ZoomInsight', zoomInsightSchema, 'yaksha_zoom_insights');
