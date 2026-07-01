import mongoose, { Schema as MongooseSchema } from 'mongoose';
const guestEventSchema = new MongooseSchema({
    faqId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'FAQ',
        required: true,
    },
    guestId: {
        type: String,
        required: true,
        trim: true,
    },
    sessionId: {
        type: String,
        required: true,
        trim: true,
    },
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        default: null,
    },
    type: {
        type: String,
        enum: ['view', 'read', 'completion', 'scroll'],
        required: true,
    },
    dwellMs: { type: Number, default: null },
    // v1.68 — schema fix: bound to [0..1]. Same for scrollPct
    // (already 0..1 by definition). Keeps aggregations honest.
    scrollPct: { type: Number, default: null, min: 0, max: 1 },
    faqLength: { type: Number, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
// Primary read path: aggregate per-FAQ metrics over a time window
guestEventSchema.index({ faqId: 1, type: 1, createdAt: -1 });
// Dedup lookup: "did this guest view this FAQ in the last N minutes?"
guestEventSchema.index({ guestId: 1, faqId: 1, type: 1, createdAt: -1 });
// 24h rolling counter (guestViewLast24h) aggregation
guestEventSchema.index({ type: 1, createdAt: -1 });
// Per-batch analytics rollup (future use)
guestEventSchema.index({ batchId: 1, type: 1, createdAt: -1 });
// TTL: auto-prune raw events after 7 days. Aggregation job rolls them up
// into the FAQ collection well before this fires.
guestEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });
export default mongoose.model('GuestEvent', guestEventSchema, 'yaksha_faq_guestevents');
