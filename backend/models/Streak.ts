import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IStreak extends Document {
  userId: Types.ObjectId;
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: Date;
  activityHistory: string[]; // dates formatted as 'YYYY-MM-DD'
  createdAt: Date;
  updatedAt: Date;
}

const streakSchema = new MongooseSchema<IStreak>(
  {
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    currentStreak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    lastActiveDate: { type: Date, required: true },
    activityHistory: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IStreak>('Streak', streakSchema, 'yaksha_faq_streaks');
