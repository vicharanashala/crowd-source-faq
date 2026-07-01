import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * GuestEvent — raw anonymous analytics events from the public FAQ page.
 *
 * No PII is ever stored here. `guestId` is a random UUID minted by the
 * server and returned as an httpOnly cookie; it is used only for
 * per-guest dedup windows (e.g. "did this guest view this FAQ in the
 * last 30 min?") and can be discarded at any time without loss of
 * product behaviour.
 *
 * Events are folded into FAQ aggregate fields (avgReadCompletion,
 * avgTimeSpentRatio, guestViewLast24h) by a 5-minute background job
 * (`recomputePopularity` in publicFaqController), and the raw
 * collection is auto-pruned by a 7-day TTL index.
 */

export type GuestEventType = 'view' | 'read' | 'completion' | 'scroll';

export interface IGuestEvent extends Document {
  faqId: Types.ObjectId;
  /** Random UUID — server-issued, httpOnly cookie. */
  guestId: string;
  /** Per-tab session id, used in dedup keys alongside guestId. */
  sessionId: string;
  /** The program run (batch) this event belongs to. */
  batchId: Types.ObjectId | null;
  type: GuestEventType;
  /** Dwell time for 'read' events, in milliseconds. */
  dwellMs?: number;
  /** 0..1, captured at event time. */
  scrollPct?: number;
  /** Word count snapshot, captured at event time for accurate aggregation. */
  faqLength?: number;
  createdAt: Date;
}

const guestEventSchema = new MongooseSchema<IGuestEvent>(
  {
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
      enum: ['view', 'read', 'completion', 'scroll'] as GuestEventType[],
      required: true,
    },
    dwellMs: { type: Number, default: null },
    // v1.68 — schema fix: bound to [0..1]. Same for scrollPct
    // (already 0..1 by definition). Keeps aggregations honest.
    scrollPct: { type: Number, default: null, min: 0, max: 1 },
    faqLength: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

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

export default mongoose.model<IGuestEvent>('GuestEvent', guestEventSchema, 'yaksha_faq_guestevents');
