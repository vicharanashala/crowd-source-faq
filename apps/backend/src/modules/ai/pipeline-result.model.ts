/**
 * PipelineResult.ts — Unified audit/answer result log for all AI pipelines.
 *
 * Single collection, differentiated by `pipeline` field:
 *   - 'faq_audit'      — FAQ correctness audit runs
 *   - 'auto_answer'    — community post auto-answer runs
 *
 * TTL index on `checkedAt` — results auto-expire after 30 days by default.
 * Env: PIPELINE_RESULT_TTL_DAYS (default 30)
 *
 * This lets the admin UI show a unified history across pipelines and keeps
 * the collection lean without manual cleanup jobs.
 */
import mongoose, { Schema, Types } from 'mongoose';

export type PipelineName = 'faq_audit' | 'auto_answer';
export type TargetModel   = 'FAQ' | 'CommunityPost';

export interface IPipelineResult extends mongoose.Document {
  pipeline:      PipelineName;
  targetModel:   TargetModel;
  targetId:      Types.ObjectId;
  batchId?:      Types.ObjectId | null;
  targetTitle:   string;
  score:         number;      // 0–1  correctness / relevance
  verdict:       string;      // pipeline-specific: 'correct'|'drift_detected'|'contradiction'|'stale' | 'approved'|'suggested'|'escalated'
  reason:        string;
  confidence:    number;      // 0–1  AI confidence in this judgment
  sources:       Array<{ id: string; title: string; type: string }>;
  flagged:       boolean;     // true if this result triggered a flag/review
  metadata:      Record<string, unknown>; // pipeline-specific extra fields
  checkedAt:     Date;
}

const pipelineResultSchema = new Schema<IPipelineResult>(
  {
    pipeline:    { type: String, required: true, enum: ['faq_audit', 'auto_answer'] as PipelineName[], index: true },
    targetModel: { type: String, required: true, enum: ['FAQ', 'CommunityPost'] as TargetModel[], index: true },
    targetId:    { type: Schema.Types.ObjectId, required: true, index: true },
    batchId:     { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    targetTitle: { type: String, required: true, maxlength: 300 },
    score:       { type: Number, required: true, min: 0, max: 1 },
    verdict:     { type: String, required: true },
    reason:      { type: String, required: true, maxlength: 500 },
    confidence:  { type: Number, required: true, min: 0, max: 1 },
    sources:     { type: [{ id: String, title: String, type: String }], default: [] },
    flagged:     { type: Boolean, default: false },
    metadata:    { type: Schema.Types.Mixed, default: {} },
    // TTL: documents auto-deleted this many days after checkedAt
    checkedAt:   { type: Date, required: true, default: Date.now,
                   index: { expires: parseInt(process.env['PIPELINE_RESULT_TTL_DAYS'] || '30') + 'd' } },
  },
  { timestamps: false }
);

// Compound indexes for common query patterns
pipelineResultSchema.index({ pipeline: 1, flagged: 1, checkedAt: -1 });
pipelineResultSchema.index({ targetId: 1, pipeline: 1 });

export const PipelineResult = mongoose.model<IPipelineResult>('PipelineResult', pipelineResultSchema);