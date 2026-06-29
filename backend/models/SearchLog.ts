import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

// Top result source enum
export type ResultSource = 'faq' | 'community' | null;

// Interface for the SearchLog document
export interface ISearchLog extends Document {
  query: string;
  resultsCount: number;
  topResultId: Types.ObjectId | null;
  topResultSource: ResultSource;
  // v1.68 — M1: add userId so the admin User Activity chart
  // can show unique user counts (not just search count).
  // Optional for anonymous searches (no req.user); required
  // for logged-in searches.
  userId?: Types.ObjectId | null;
  /** v1.69 — Program this search was performed within. */
  batchId?: Types.ObjectId | null;
}

// Schema designed to track user search behavior for analytics and trending topics
const searchLogSchema = new MongooseSchema(
  {
    query: {
      type: String,
      required: true,
      trim: true, // The exact search term the user entered
    },
    resultsCount: {
      type: Number,
      default: 0, // Tracks how many items were returned (useful for spotting "dead end" searches)
    },
    topResultId: {
      type: MongooseSchema.Types.ObjectId,
      default: null, // Stores the ID of the highest-ranked result to measure click/relevance potential
    },
    topResultSource: {
      type: String,
      enum: ['faq', 'community', 'knowledge', null] as ResultSource[], // Identifies whether the best answer came from official FAQs, user posts, or the auto-extracted knowledge base
      default: null,
    },
    // v1.68 — M1
    userId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true, // for the user-activity aggregation
    },
    // v1.69 — search analytics now scoped to a program so the
    // trending-topics / unresolved-search dashboards can show
    // "this program's hot queries" instead of a global mix.
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
  },
  { timestamps: true } // Automatically records exactly when the search happened via 'createdAt'
);

// v1.68 — schema TTL: search logs auto-expire after 90 days.
//   The trending-topics aggregation only needs the last N
//   days; the 90-day window matches the analytics retention
//   policy and bounds the collection size without losing
//   analytical value. Mongo's TTL monitor runs every 60s.
//   MongoDB restricts TTL indexes to a single field, so this
//   must remain a single-field index.
searchLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

// v1.69 — Compound index to support program-scoped dashboard search trend queries.
//   This complements the TTL index: while the TTL index runs background deletions,
//   this index speeds up analytics queries that match on program (batchId) and
//   range/sort by date (createdAt).
searchLogSchema.index({ batchId: 1, createdAt: -1 });

// Export the model, explicitly defining the target collection name ('yaksha_faq_searchlogs')
export default mongoose.model<ISearchLog>('SearchLog', searchLogSchema, 'yaksha_faq_searchlogs');