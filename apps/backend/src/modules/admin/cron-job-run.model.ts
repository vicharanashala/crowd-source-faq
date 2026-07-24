import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

/**
 * CronJobRun — persistent history of every cronManager execution.
 *
 * One document per execution. CronManager writes one on every tick
 * (success/error/skipped) and on every admin manual trigger.
 *
 * Retention: each job keeps only the most recent 50 runs. A post-save
 * hook in cronManager prunes older rows so the collection doesn't
 * grow unboundedly. Default 50 — admins can tweak via
 * CRON_RUN_HISTORY_LIMIT env var.
 */

export type CronRunStatus = 'success' | 'error' | 'skipped';

export interface ICronJobRun extends Document {
  /** cronManager job name. */
  name: string;
  /** When the handler was invoked. */
  startedAt: Date;
  /** When the handler returned (success or error). Null if still in flight. */
  finishedAt: Date | null;
  /** 'cron' for scheduled ticks, 'admin' for manual triggers. */
  triggeredBy: 'cron' | 'admin';
  status: CronRunStatus;
  /** Wall-clock duration in ms (null while still running). */
  durationMs: number | null;
  /** Error message if status === 'error'. */
  error: string | null;
}

const cronJobRunSchema = new MongooseSchema<ICronJobRun>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    triggeredBy: {
      type: String,
      enum: ['cron', 'admin'],
      required: true,
    },
    status: {
      type: String,
      enum: ['success', 'error', 'skipped'],
      required: true,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    error: {
      type: String,
      maxlength: 4000,
      default: null,
    },
  },
  { timestamps: false }, // startedAt IS the createdAt
);

// Compound index — efficient "last N runs for job X" queries
cronJobRunSchema.index({ name: 1, startedAt: -1 });

export default mongoose.model<ICronJobRun>(
  'CronJobRun',
  cronJobRunSchema,
  'yaksha_cron_job_runs',
);