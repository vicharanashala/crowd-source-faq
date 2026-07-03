/**
 * DocumentRecord — tracks a user-uploaded knowledge document (image,
 * PDF, DOCX, XLSX) and its processing pipeline status.
 *
 * v1 — additive. Companion to the existing `ZoomMeeting` /
 * `ZoomInsight` pair, but for static documents instead of Zoom
 * recordings. The pipeline:
 *
 *   uploaded
 *     → extracting      (tesseract.js for images, markitdown-ts
 *                        for PDFs/DOCX/XLSX)
 *     → ai_processing   (Q&A extraction via the document AI prompt)
 *     → completed       (N DocumentInsight rows written)
 *   or → failed         (terminal error)
 *
 * The actual extraction and AI work run inside a BullMQ worker
 * (see `utils/jobs/documentJob.ts`) so the upload HTTP request
 * returns 202 immediately.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type DocumentFileType = 'image' | 'pdf' | 'docx' | 'xlsx';

export type DocumentStatus =
  | 'uploaded'
  | 'extracting'
  | 'ai_processing'
  | 'completed'
  | 'failed';

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IDocumentRecord extends Document {
  userId: Types.ObjectId;
  batchId?: Types.ObjectId | null;
  fileName: string;
  fileType: DocumentFileType;
  mimeType: string;
  /** Size in bytes. Validated server-side (max 25 MB). */
  fileSize: number;
  /** Short label / description provided by the uploader. */
  title: string;
  status: DocumentStatus;
  /** Extracted raw text (filled by tesseract.js / markitdown-ts). */
  rawExtractedText: string;
  /** BullMQ job id for tracing / cancellation. */
  jobId: string | null;
  /** Count of DocumentInsight rows created from this document. */
  insightsGenerated: number;
  /** Wall-clock time for the extraction step in ms. */
  extractionDurationMs: number | null;
  /** Wall-clock time for the AI extraction step in ms. */
  aiDurationMs: number | null;
  /** Terminal error message if status === 'failed'. */
  errorMessage: string | null;
  /** Cloudinary public_id if the binary is stored there. Optional. */
  cloudinaryPublicId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const documentRecordSchema = new MongooseSchema<IDocumentRecord>(
  {
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true },
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    fileName: { type: String, required: true, maxlength: 500 },
    fileType: { type: String, enum: ['image', 'pdf', 'docx', 'xlsx'], required: true, index: true },
    mimeType: { type: String, required: true, maxlength: 100 },
    fileSize: { type: Number, required: true, min: 1, max: 25 * 1024 * 1024 },
    title: { type: String, required: true, maxlength: 200 },
    status: {
      type: String,
      enum: ['uploaded', 'extracting', 'ai_processing', 'completed', 'failed'],
      default: 'uploaded',
      index: true,
    },
    rawExtractedText: { type: String, default: '', maxlength: 2_000_000 },
    jobId: { type: String, default: null },
    insightsGenerated: { type: Number, default: 0, min: 0 },
    extractionDurationMs: { type: Number, default: null },
    aiDurationMs: { type: Number, default: null },
    errorMessage: { type: String, default: null, maxlength: 2000 },
    cloudinaryPublicId: { type: String, default: null, maxlength: 200 },
  },
  { timestamps: true },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

// Admin queue: "show me all in-flight + failed" — by status + recency
documentRecordSchema.index({ status: 1, createdAt: -1 });

// Per-user "my uploads" feed
documentRecordSchema.index({ userId: 1, createdAt: -1 });

// ─── Export ──────────────────────────────────────────────────────────────────

export default mongoose.model<IDocumentRecord>(
  'DocumentRecord',
  documentRecordSchema,
  'yaksha_faq_documents',
);
