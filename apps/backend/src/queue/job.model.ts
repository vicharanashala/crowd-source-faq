/**
 * Job — MongoDB-backed queue document.
 *
 * Replaces BullMQ entirely. The atomic claim relies on MongoDB's
 * `findOneAndUpdate` to guarantee only one worker picks up a job.
 * See `queue/queue.service.ts` for the claim algorithm.
 *
 * State machine:
 *   queued ──claimNextJob──> processing ──complete──> completed
 *      │                          │
 *      │                          └─fail──> queued (if attempts < max)
 *      │                                  └─fail──> failed
 *      └─cancel──> cancelled
 *
 * Lease / heartbeat:
 *   - `lockedUntil` is set on claim; another worker can claim after
 *     that date if the original worker crashed.
 *   - Long-running jobs call `renewLease(jobId)` periodically.
 */

import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export type JobType = 'document-processing';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface IJob extends Document {
  type: JobType;
  status: JobStatus;

  /** Free-form payload owned by the processor (e.g. documentJob data). */
  payload: unknown;

  /** Higher = taken first when multiple jobs are due. Default 0. */
  priority: number;

  attempts: number;
  maxAttempts: number;

  /** 0..100 — surfaced via GET /queue/jobs/:id for the frontend. */
  progress: number;

  /** Job is not claimable until `runAfter <= now`. Used for delayed retries. */
  runAfter: Date;

  /** Set on claim. Another worker may claim after this expires. */
  lockedUntil: Date | null;
  /** Stable id for the worker that holds the lease — used for debugging. */
  workerId: string | null;

  /** Last error message — kept until the job is cleaned up by TTL. */
  error: string | null;

  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

const jobSchema = new MongooseSchema<IJob>(
  {
    type: { type: String, enum: ['document-processing'], required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
      required: true,
      default: 'queued',
      index: true,
    },

    payload: { type: MongooseSchema.Types.Mixed, default: {} },

    priority: { type: Number, default: 0 },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },

    progress: { type: Number, default: 0, min: 0, max: 100 },

    runAfter: { type: Date, default: () => new Date(), index: true },

    lockedUntil: { type: Date, default: null, index: true },
    workerId: { type: String, default: null },

    error: { type: String, default: null, maxlength: 2000 },

    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// ─── Compound index for the atomic claim query ───────────────────────────────
//
// findOneAndUpdate filter:
//   { type, status: 'queued', runAfter: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] }
// sort: { priority: -1, runAfter: 1 }
// Index on (type, status, priority, runAfter) lets MongoDB seek directly to
// the next eligible job without scanning the whole collection.
jobSchema.index({ type: 1, status: 1, priority: -1, runAfter: 1 });

// ─── TTL indexes — automatic cleanup, no cron needed ─────────────────────────

// Completed jobs — keep for 24 hours for debugging then drop.
jobSchema.index(
  { completedAt: 1 },
  {
    expireAfterSeconds: 24 * 60 * 60,
    partialFilterExpression: { status: 'completed' },
  },
);

// Failed jobs — keep for 7 days then drop (matches BullMQ's `removeOnFail: { age: 7d }`).
jobSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: { status: 'failed' },
  },
);

// Cancelled jobs — keep for 24 hours then drop.
jobSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 24 * 60 * 60,
    partialFilterExpression: { status: 'cancelled' },
  },
);

export default mongoose.model<IJob>('Job', jobSchema, 'yaksha_faq_jobs');