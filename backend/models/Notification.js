import mongoose, { Schema as MongooseSchema } from 'mongoose';
const notificationSchema = new MongooseSchema({
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
        ],
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
}, { timestamps: true });
// Compound index for efficient per-user unread count queries
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
// v1.68 — schema TTL: read notifications auto-expire after
//   30 days. The unread-bell count is what's important;
//   the historical list of read items doesn't need to
//   live forever. UNREAD notifications (read: false) are
//   excluded by the partialFilterExpression so the user
//   never loses something they haven't seen yet.
notificationSchema.index({ createdAt: 1 }, {
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { read: true },
});
export default mongoose.model('Notification', notificationSchema, 'yaksha_faq_notifications');
