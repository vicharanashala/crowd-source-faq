import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type NotificationType =
  | 'post_resolved'      // user's community post was resolved by admin/mod
  | 'comment_replied'     // someone replied to user's comment
  | 'faq_match_found'     // AI found a matching FAQ for user's post
  | 'mention'            // user was mentioned in a comment
  | 'expert_request'     // a user requested expert help on a community post
  // ── Text Bank events ─────────────────────────────────────────
  | 'question_answered'
  | 'new_question'
  | 'upvote'
  | 'downvote'
  | 'accepted_answer';

export interface INotification extends Document {
  recipient: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link: string;          // URL to navigate to when clicked
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new MongooseSchema(
  {
    recipient: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'post_resolved', 'comment_replied', 'faq_match_found',
        'mention', 'expert_request',
        // ── Text Bank events ─────────────────────────────────────
        'question_answered', 'new_question',
        'upvote', 'downvote', 'accepted_answer',
      ] as NotificationType[],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    link: {
      type: String,
      default: '#',
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index for efficient per-user unread count queries
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', notificationSchema, 'yaksha_faq_notifications');