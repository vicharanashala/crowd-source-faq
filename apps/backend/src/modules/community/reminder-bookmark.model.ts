import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReminderBookmark extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  reminder: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const reminderBookmarkSchema = new Schema<IReminderBookmark>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reminder: { type: Schema.Types.ObjectId, ref: 'CommunityReminder', required: true, index: true },
  },
  {
    timestamps: true,
  }
);

reminderBookmarkSchema.index({ user: 1, reminder: 1 }, { unique: true });

const ReminderBookmark = mongoose.models.ReminderBookmark || mongoose.model<IReminderBookmark>('ReminderBookmark', reminderBookmarkSchema);

export default ReminderBookmark;
