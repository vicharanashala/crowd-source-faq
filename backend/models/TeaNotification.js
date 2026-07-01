import mongoose, { Schema as MongooseSchema } from 'mongoose';
// ─── Schema ──────────────────────────────────────────────────────────────────
const teaNotificationSchema = new MongooseSchema({
    userId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    eventType: {
        type: String,
        enum: ['faq_published', 'post_answered', 'post_deleted', 'post_answered_user', 'post_upvoted', 'comment_received'],
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
    // v1.69 — see interface.
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        default: null,
        index: true,
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
}, { timestamps: true });
// Prevent duplicate drops for same user + same post + same event type
teaNotificationSchema.index({ userId: 1, postId: 1, eventType: 1 }, { sparse: true });
teaNotificationSchema.index({ userId: 1, faqId: 1, eventType: 1 }, { sparse: true });
// Fast read/unread + time queries
teaNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
export default mongoose.model('TeaNotification', teaNotificationSchema, 'yaksha_faq_tea_notifications');
