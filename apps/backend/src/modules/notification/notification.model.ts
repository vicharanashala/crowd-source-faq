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
  | 'accepted_answer'
  // ── Session Support (experimental — additively added) ─────────
  | 'support';           // a session-support ticket the user owns was updated

export interface INotification extends Document {
  recipient: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link: string;          // URL to navigate to when clicked
  read: boolean;
  /** v1.69 — Program context (the event source). Mostly for analytics. */
  batchId?: Types.ObjectId | null;
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
        // ── Session Support (experimental) ──────────────────────
        'support',
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
    // v1.69 — carry the source program on the notification for
    // cohort-aware analytics. The notification itself is still
    // routed to the user via `recipient`.
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index for efficient per-user unread count queries
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

// v1.68 — schema TTL: read notifications auto-expire after
//   30 days. The unread-bell count is what's important;
//   the historical list of read items doesn't need to
//   live forever. UNREAD notifications (read: false) are
//   excluded by the partialFilterExpression so the user
//   never loses something they haven't seen yet.
notificationSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { read: true },
  }
);

export default mongoose.model<INotification>('Notification', notificationSchema, 'yaksha_faq_notifications');