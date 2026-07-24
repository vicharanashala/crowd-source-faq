import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

/**
 * CronScheduleOverride — per-job admin-editable schedule state.
 *
 * When an admin changes a job's interval or pauses it via the Schedule
 * tab, the change is persisted here. cronManager reads this on every
 * tick and at startup to apply the override.
 *
 * If no override exists for a job, the defaults registered in
 * bootstrap/startup.ts are used.
 */

export interface ICronScheduleOverride extends Document {
  /** cronManager job name. Unique — one override per job. */
  name: string;
  /** When false, cronManager skips this job entirely. Default true. */
  enabled: boolean;
  /** Override interval in ms. When 0, use the registered default. */
  intervalMs: number;
  /** Admin user ID who last edited this override. */
  lastEditedBy: string;
  lastEditedAt: Date;
  /** Optional free-form note (e.g. "paused for migration audit"). */
  note?: string;
}

const cronScheduleOverrideSchema = new MongooseSchema<ICronScheduleOverride>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    intervalMs: {
      type: Number,
      required: true,
      default: 0, // 0 = use registered default
    },
    lastEditedBy: {
      type: String,
      required: true,
      maxlength: 100,
    },
    lastEditedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    note: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

export default mongoose.model<ICronScheduleOverride>(
  'CronScheduleOverride',
  cronScheduleOverrideSchema,
  'yaksha_cron_schedule_overrides',
);