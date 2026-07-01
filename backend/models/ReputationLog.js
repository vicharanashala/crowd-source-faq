import mongoose, { Schema as MongooseSchema } from 'mongoose';
const reputationLogSchema = new MongooseSchema({
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    // v1.69 — per-program reputation. Index covers the
    // "leaderboard for program X" query path.
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        required: false,
        index: true,
        default: null,
    },
    delta: { type: Number, required: true },
    reason: { type: String, default: '' },
    action: { type: String, required: true },
    targetId: { type: MongooseSchema.Types.ObjectId },
    // v1.68 — schema fix: targetType was a free string. Now
    // constrained to the literal union that the controllers
    // actually write. A typo in a new code path now fails
    // the schema validation rather than silently
    // mis-classifying the log entry.
    targetType: {
        type: String,
        enum: ['faq', 'comment', 'post', 'support', 'document'],
    },
    awardedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
reputationLogSchema.index({ userId: 1, createdAt: -1 });
// v1.68 — schema index: "show me all answer_accepted
// events for user X" — common moderation view.
reputationLogSchema.index({ userId: 1, action: 1, createdAt: -1 });
reputationLogSchema.index({ userId: 1 });
export default mongoose.model('ReputationLog', reputationLogSchema, 'yaksha_faq_reputation_logs');
