/**
 * feedback.model.ts — AI Quality Feedback storage
 *
 * Per spec 03_AI_Quality_Feedback_System.md:
 *   - Structured feedback (helpful + optional category + optional comment)
 *   - Stored alongside explainability + citation metadata so admin
 *     analytics can correlate user perception with retrieval quality.
 *   - Lightweight schema, indexed on the columns the admin dashboard
 *     filters / groups by.
 *
 * Design notes:
 *   - All citation/explainability fields are optional. The submission
 *     endpoint never requires them — the frontend just passes back
 *     whatever the original Ask-AI response included.
 *   - No PII (IP, raw email) is stored. userId is the resolved Mongo
 *     _id of the logged-in user, or null for anonymous submissions.
 *   - The field that stores the AI model name is `modelName` rather
 *     than `model` to avoid colliding with Mongoose Document.model().
 */

import { Schema, model, type Document, type Model, Types } from 'mongoose';

// ─── Category enum (locked-in for v1; future versions read from admin settings) ─
export const FEEDBACK_CATEGORIES = [
  'Incorrect',
  'Missing',
  'Outdated',
  'Hallucination',
  'WrongSource',
  'PoorExplanation',
  'Duplicate',
  'Formatting',
  'Offensive',
  'Other',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

// ─── Document shape ───────────────────────────────────────────────────────────

export interface ICitationSnapshot {
  id: string;
  title: string;
  sourceType: 'FAQ' | 'Document' | 'Zoom' | 'KnowledgeBase';
  similarity: number;
  section?: string;
}

export interface IExplainabilitySnapshot {
  confidence: number;
  provider: string;
  modelName: string;
  latencyMs: number;
  documentsRetrieved: number;
  documentsUsed: number;
  vectorScore: number;
  keywordScore: number;
  duplicateDetected: boolean;
}

export interface IFeedback {
  /** Generated answer id (frontend-generated or hashed fallback). */
  answerId: string;
  /** The user question that produced the answer. */
  question: string;
  /** Lowercased, trimmed version of question for dedup/comparison. */
  normalizedQuestion?: string;
  /** Pipeline that produced the answer: search | ask_ai | auto_answer | faq_audit. */
  pipeline: 'search' | 'ask_ai' | 'auto_answer' | 'faq_audit' | 'other';
  /** Thumbs-up / thumbs-down. */
  helpful: boolean;
  /** Required when helpful=false; optional otherwise. */
  category?: FeedbackCategory;
  /** Free-form user comment. Max 2000 chars (enforced in controller). */
  comment?: string;
  /** Set when user edits an existing comment. */
  editedAt?: Date;

  // ─── AI metadata snapshot (captured at submission time) ───────────────
  provider?: string;
  modelName?: string;
  confidence?: number;
  latencyMs?: number;
  citations?: ICitationSnapshot[];
  explainability?: IExplainabilitySnapshot;

  // ─── Identity / context ────────────────────────────────────────────────
  /** Logged-in user id; null for anonymous submissions. */
  userId?: Types.ObjectId | null;
  /** Anonymous session id (cookie / device id). No raw IP. */
  sessionId?: string;
  /** Browser fingerprint for anonymous dedup (localStorage-based). */
  fingerprint?: string;
  /** Batch/program scope. */
  batchId?: Types.ObjectId | null;
  /** Optional reference to a FAQ or community-post whose answer was rated. */
  questionId?: Types.ObjectId | null;

  // ─── Schema versioning ─────────────────────────────────────────────────
  /** Schema version for future migration tracking. */
  feedbackVersion?: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export type FeedbackDoc = Document<unknown, Record<string, unknown>, IFeedback> & IFeedback;

// ─── Schema ───────────────────────────────────────────────────────────────────

const CitationSnapshotSchema = new Schema<ICitationSnapshot>(
  {
    id:        { type: String, required: true },
    title:     { type: String, required: true },
    sourceType:{ type: String, enum: ['FAQ', 'Document', 'Zoom', 'KnowledgeBase'], required: true },
    similarity:{ type: Number, required: true },
    section:   { type: String },
  },
  { _id: false }
);

const ExplainabilitySnapshotSchema = new Schema<IExplainabilitySnapshot>(
  {
    confidence:         { type: Number, required: true },
    provider:           { type: String, required: true },
    modelName:          { type: String, required: true },
    latencyMs:          { type: Number, required: true },
    documentsRetrieved: { type: Number, required: true },
    documentsUsed:      { type: Number, required: true },
    vectorScore:        { type: Number, required: true },
    keywordScore:       { type: Number, required: true },
    duplicateDetected:  { type: Boolean, required: true },
  },
  { _id: false }
);

const FeedbackSchema = new Schema<IFeedback>(
  {
    answerId:  { type: String, required: true, index: true },
    question:  { type: String, required: true, maxlength: 2000 },
    normalizedQuestion: { type: String, index: true },
    pipeline:  {
      type: String,
      enum: ['search', 'ask_ai', 'auto_answer', 'faq_audit', 'other'],
      default: 'ask_ai',
      index: true,
    },
    helpful:   { type: Boolean, required: true, index: true },
    category:  { type: String, enum: FEEDBACK_CATEGORIES as unknown as string[], index: true },
    comment:   { type: String, maxlength: 2000 },
    editedAt:  { type: Date },

    provider:    { type: String, index: true },
    modelName:   { type: String },
    confidence:  { type: Number },
    latencyMs:   { type: Number },
    citations:   { type: [CitationSnapshotSchema], default: [] },
    explainability: { type: ExplainabilitySnapshotSchema },

    userId:     { type: Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    sessionId:  { type: String, index: true },
    fingerprint: { type: String, index: true },
    batchId:    { type: Schema.Types.ObjectId, index: true, default: null },
    questionId: { type: Schema.Types.ObjectId, index: true, default: null },
    feedbackVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// Spec-recommended indexes for the analytics dashboard
FeedbackSchema.index({ createdAt: -1 });
FeedbackSchema.index({ provider: 1, createdAt: -1 });
FeedbackSchema.index({ category: 1, createdAt: -1 });
FeedbackSchema.index({ helpful: 1, createdAt: -1 });
FeedbackSchema.index({ questionId: 1, helpful: 1 });

// Helpful compound index for "top reported questions"
FeedbackSchema.index({ helpful: 1, question: 1, createdAt: -1 });

// Dedup indexes — enforce one rating per (answerId, userId) for authenticated
// users and one per (answerId, sessionId) for anonymous users.
FeedbackSchema.index(
  { answerId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
);
FeedbackSchema.index(
  { answerId: 1, sessionId: 1 },
  { unique: true, partialFilterExpression: { sessionId: { $type: 'string' } } },
);

const Feedback: Model<FeedbackDoc> = model<FeedbackDoc>('Feedback', FeedbackSchema as unknown as Schema<FeedbackDoc>);
export default Feedback;