/**
 * NotificationOutbox — outbox for notification deliveries that failed
 * to persist on the first attempt.
 *
 * Why this exists (per docs/redesign-plan.md §2.4 R3):
 *   The previous dispatcher (utils/http/notificationDispatcher.ts) caught
 *   the Mongo error and logged a warning, then returned. A transient
 *   blip during a user's upvote/answer/accept would permanently lose
 *   that "you got an answer" notification — nobody knew it didn't
 *   land. The audit called this out as a UX regression nobody can see.
 *
 * Pattern: write-through outbox. The service first attempts the
 * happy-path write to Notification; on any failure it inserts a
 * durable row here. A background drain (run every 60s by
 * bootstrap/startup.ts) retries every pending row. Once it succeeds,
 * the row is deleted. Worst case: a notification arrives late, never
 * lost.
 *
 * Capped: the outbox holds at most OUTBOX_MAX_ROWS; on overflow,
 * the oldest pending row is deleted and an error is logged.
 * Operations don't see this — they always succeed at the outbox
 * level, even when the notification write failed.
 */
import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface INotificationOutbox extends Document {
  recipient: Types.ObjectId;
  type: string;
  title: string;
  message: string;
  link: string;
  /** Number of drain attempts. Bumped each time a drain tries this row. */
  attempts: number;
  /** Last error message, for debugging. */
  lastError?: string;
  /** When the next drain attempt should be allowed. */
  nextAttemptAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationOutboxSchema = new MongooseSchema<INotificationOutbox>(
  {
    recipient: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: { type: String, required: true },
    title: { type: String, required: true, default: '' },
    message: { type: String, required: true, default: '' },
    link: { type: String, required: true, default: '' },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    // Index for the drain's "due for retry" query (nextAttemptAt <= now).
    nextAttemptAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true },
);

notificationOutboxSchema.index({ nextAttemptAt: 1, _id: 1 });

export default mongoose.model<INotificationOutbox>(
  'NotificationOutbox',
  notificationOutboxSchema,
  'yaksha_notification_outbox',
);
