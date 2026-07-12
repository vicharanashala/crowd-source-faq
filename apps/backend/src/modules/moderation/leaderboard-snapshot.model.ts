import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export interface ILeaderboardSnapshotEntry {
  userId: mongoose.Types.ObjectId;
  rank: number;
  points: number;
}

export interface ILeaderboardSnapshot extends Document {
  /** null = global snapshot, non-null = per-program */
  batchId: mongoose.Types.ObjectId | null;
  snapshotDate: Date;
  entries: ILeaderboardSnapshotEntry[];
  createdAt: Date;
}

const leaderboardSnapshotSchema = new MongooseSchema<ILeaderboardSnapshot>(
  {
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
    },
    snapshotDate: { type: Date, required: true },
    entries: [
      {
        userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
        rank: { type: Number, required: true },
        points: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true }
);

// One snapshot per batch per day at most
leaderboardSnapshotSchema.index({ batchId: 1, snapshotDate: -1 });
leaderboardSnapshotSchema.index({ snapshotDate: -1 });

export default mongoose.model<ILeaderboardSnapshot>(
  'LeaderboardSnapshot',
  leaderboardSnapshotSchema,
  'yaksha_leaderboard_snapshots'
);
