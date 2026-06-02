import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// ─── Event types ─────────────────────────────────────────────────────────────
export type TeaEventType =
  | 'faq_published'    // admin published a new FAQ (kept for backwards compat)
  | 'post_answered'    // community post resolved by admin/mod/AI
  | 'post_deleted'     // community post removed by admin/mod
  | 'post_answered_user' // another user answered your post via addComment
  | 'post_upvoted'     // your post was upvoted by another user
  | 'comment_received'; // your comment was upvoted by another user

// ─── Document interface ───────────────────────────────────────────────────────
export interface ITeaNotification extends Document {
  userId: Types.ObjectId;
  eventType: TeaEventType;
  // FAQ fields (used when eventType === 'faq_published')
  faqId?: Types.ObjectId;
  faqQuestion?: string;
  // Community post fields (used for post_answered / post_deleted / post_answered_user)
  postId?: Types.ObjectId;
  postTitle?: string;
  // Who triggered the event
  triggeredBy?: Types.ObjectId;
  triggeredByName?: string;
  // Snapshot of the answer/change (if applicable)
  content?: string;
  read: boolean;
  createdAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────
const teaNotificationSchema = new MongooseSchema(
  {
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: ['faq_published', 'post_answered', 'post_deleted', 'post_answered_user', 'post_upvoted', 'comment_received'] as TeaEventType[],
      required: true,
    },
    // ── FAQ fields ────────────────────────────────────────────────────────────
    faqId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'FAQ',
    },
    faqQuestion: {
      type: String,
      trim: true,
    },
    // ── Community post fields ────────────────────────────────────────────────
    postId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'CommunityPost',
    },
    postTitle: {
      type: String,
      trim: true,
    },
    triggeredBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
    },
    triggeredByName: {
      type: String,
      trim: true,
    },
    // The answer text (for post_answered / post_answered_user)
    content: {
      type: String,
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Prevent duplicate drops for same user + same post + same event type
teaNotificationSchema.index({ userId: 1, postId: 1, eventType: 1 }, { sparse: true });
teaNotificationSchema.index({ userId: 1, faqId: 1, eventType: 1 }, { sparse: true });
// Fast read/unread + time queries
teaNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export default mongoose.model<ITeaNotification>(
  'TeaNotification',
  teaNotificationSchema,
  'yaksha_faq_tea_notifications'
);