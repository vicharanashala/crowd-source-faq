import mongoose, { Document, Schema, Types } from 'mongoose';

export type PriorityLevel = 'low' | 'medium' | 'high';

export interface ICommunityReminder extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  eventDate?: Date | null;
  priority: PriorityLevel;
  tags: string[];
  author: Types.ObjectId;
  upvotes: Types.ObjectId[];
  downvotes: Types.ObjectId[];
  score: number;
  isPinned: boolean;
  pinnedAt?: Date | null;
  pinnedBy?: Types.ObjectId | null;
  isVerified: boolean;
  verifiedAt?: Date | null;
  verifiedBy?: Types.ObjectId | null;
  batchId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const communityReminderSchema = new Schema<ICommunityReminder>(
  {
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 3000 },
    eventDate: { type: Date, default: null },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
    tags: { type: [String], default: [] },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    upvotes: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    downvotes: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    score: { type: Number, default: 0, index: true },
    isPinned: { type: Boolean, default: false, index: true },
    pinnedAt: { type: Date, default: null },
    pinnedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isVerified: { type: Boolean, default: false, index: true },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
  },
  {
    timestamps: true,
  }
);

// Search & Sort Indices
communityReminderSchema.index({ title: 'text', description: 'text', tags: 'text' });
communityReminderSchema.index({ batchId: 1, isPinned: -1, score: -1, createdAt: -1 });

const CommunityReminder = mongoose.models.CommunityReminder || mongoose.model<ICommunityReminder>('CommunityReminder', communityReminderSchema);

export default CommunityReminder;
