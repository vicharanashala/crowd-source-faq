/**
 * JourneyProgress — per-user-per-item completion record.
 *
 * v1.76 — Welcome Package: Journey Tracks.
 *
 * One row per (userId, itemId) — unique so the controller can
 * upsert via `findOneAndUpdate` without races. We store
 * `trackId` and `checkpointId` as denormalised fields for two
 * reasons:
 *   1. The progress-monitor aggregation (per-user progress on
 *      a given track) becomes a single indexed read instead of
 *      a join on the embedded tree.
 *   2. The user-side "my journey" route can pivot rows back
 *      into the tree shape without re-fetching the track.
 *
 * Only items with `type: 'task' AND required: true` get progress
 * rows — non-required tasks and informational items don't block
 * completion, so the renderer doesn't surface them in the
 * progress fraction.
 */
import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IJourneyProgress extends Document {
  userId: Types.ObjectId;
  trackId: Types.ObjectId;
  checkpointId: Types.ObjectId;
  itemId: Types.ObjectId;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const journeyProgressSchema = new MongooseSchema<IJourneyProgress>(
  {
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    trackId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'JourneyTrack',
      required: true,
      index: true,
    },
    checkpointId: {
      type: MongooseSchema.Types.ObjectId,
      required: true,
    },
    itemId: {
      type: MongooseSchema.Types.ObjectId,
      required: true,
    },
    completed: { type: Boolean, default: false, required: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One row per (user, item). The same item clicked twice toggles
// in place — no duplicate rows.
journeyProgressSchema.index({ userId: 1, itemId: 1 }, { unique: true });
// Admin progress-monitor aggregation: all rows for a track.
journeyProgressSchema.index({ trackId: 1, userId: 1, completed: 1 });
// "Last activity" lookup.
journeyProgressSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model<IJourneyProgress>(
  'JourneyProgress',
  journeyProgressSchema,
  'yaksha_journey_progress'
);
