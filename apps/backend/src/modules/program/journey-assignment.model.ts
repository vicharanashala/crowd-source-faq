/**
 * JourneyAssignment — who can see a JourneyTrack.
 *
 * v1.76 — Welcome Package: Journey Tracks.
 *
 * Four scopes (only one row per user-per-track):
 *   user     — single user (the most common for "personal invites")
 *   batch    — every user in a ProgramEnrollment with batchId = X
 *   program  — every user in any batch belonging to the program
 *              (resolves to a list of batchIds at assignment time;
 *              the programId is kept on the row for analytics
 *              filter performance)
 *   all      — every user in the system (use sparingly; admin
 *              typically assigns to a batch instead)
 *
 * The model intentionally does NOT denormalise the user list at
 * `all` / `batch` / `program` scope into N rows. Instead, the
 * user-side "my assigned tracks" query joins on ProgramEnrollment
 * to resolve the user's batches, then finds matching rows by
 * `scope: 'all' | OR (scope:'batch' AND batchId IN <my batches>)
 * | OR (scope:'program' AND programId IN <my programs>) |
 * OR (scope:'user' AND userId = me)`.
 *
 * Index strategy:
 *   { userId: 1, trackId: 1 } unique  — dedupe per-user-per-track
 *   { trackId: 1, scope: 1 }         — admin "who's assigned?"
 *   { trackId: 1, batchId: 1 }       — admin progress by batch
 */
import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type JourneyAssignmentScope = 'user' | 'batch' | 'program' | 'all';

export interface IJourneyAssignment extends Document {
  trackId: Types.ObjectId;
  userId: Types.ObjectId;        // set even on batch/program rows (so the unique index is stable)
  scope: JourneyAssignmentScope;
  batchId: Types.ObjectId | null; // required for scope='batch'
  programId: Types.ObjectId | null; // required for scope='program'
  assignedAt: Date;
  assignedBy: Types.ObjectId;
}

const journeyAssignmentSchema = new MongooseSchema<IJourneyAssignment>(
  {
    trackId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'JourneyTrack',
      required: true,
      index: true,
    },
    // Always set, even for batch/program scope, so the unique
    // (userId, trackId) index can dedupe repeat assignments.
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    scope: {
      type: String,
      enum: ['user', 'batch', 'program', 'all'],
      required: true,
      index: true,
    },
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null },
    programId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: false }
);

// Per-user dedupe.
journeyAssignmentSchema.index({ userId: 1, trackId: 1 }, { unique: true });
// Admin listing: who is assigned to this track, broken down by scope.
journeyAssignmentSchema.index({ trackId: 1, scope: 1 });
// Admin progress by batch.
journeyAssignmentSchema.index({ trackId: 1, batchId: 1 });

export default mongoose.model<IJourneyAssignment>(
  'JourneyAssignment',
  journeyAssignmentSchema,
  'yaksha_journey_assignments'
);
