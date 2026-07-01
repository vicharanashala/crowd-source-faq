/**
 * OnboardingKnowledgeSource — text content indexed for AI Q&A and
 * downstream generation (FAQs, quizzes, summaries, etc.).
 *
 * v1.69 — Welcome Package Management: replaces the legacy
 * `Orientation.transcript` field with a generalized, multi-source
 * knowledge store. The legacy `Orientation.transcript` continues
 * to work — this is a parallel system, not a replacement.
 *
 * A knowledge source can be:
 *   - pasted text (no file upload; stored as `body`)
 *   - an uploaded transcript (.txt)
 *   - an uploaded knowledge base (.md / .txt)
 *
 * Each source belongs to exactly one program (`batchId`) and
 * contains a `body` string. The OnboardingKnowledgeChunk child
 * collection holds the embedding-indexed chunks used by the AI
 * Q&A endpoint, so users can ask questions sourced from any
 * uploaded material — not just the legacy orientation transcript.
 *
 * The chunking + embedding flow reuses the existing AiClient and
 * the existing /admin/knowledge/document pipeline patterns where
 * they apply (see OnboardingKnowledgeController for the
 * implementation; the chunk model is deliberately separate from
 * ZoomTranscriptChunk so per-program scoping and search filters
 * stay clean).
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type OnboardingKnowledgeSourceKind = 'pasted' | 'transcript' | 'knowledge_base';

export interface IOnboardingKnowledgeSource extends Document {
  batchId: Types.ObjectId | null;
  kind: OnboardingKnowledgeSourceKind;

  /** Display title; admins sort + filter by this. */
  title: string;
  /** Optional short description (e.g. "Day-40 onboarding transcript"). */
  description: string;

  /** Body text — what the student/AI reads. */
  body: string;

  /** Optional link back to a resource this knowledge came from. */
  sourceResourceId?: Types.ObjectId | null;

  /** Original filename for uploaded sources. */
  fileName?: string | null;

  /** Approximate character count, denormalized for the UI. */
  charCount: number;

  /** When false, the source is excluded from AI Q&A + generation. */
  indexed: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const onboardingKnowledgeSourceSchema = new MongooseSchema<IOnboardingKnowledgeSource>(
  {
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    kind: {
      type: String,
      enum: ['pasted', 'transcript', 'knowledge_base'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    description: { type: String, default: '', maxlength: 1000 },
    body: { type: String, required: true, default: '' },
    sourceResourceId: { type: MongooseSchema.Types.ObjectId, ref: 'OnboardingResource', default: null },
    fileName: { type: String, default: null },
    charCount: { type: Number, default: 0 },
    indexed: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

onboardingKnowledgeSourceSchema.index({ batchId: 1, indexed: 1, createdAt: -1 });

export default mongoose.model<IOnboardingKnowledgeSource>(
  'OnboardingKnowledgeSource',
  onboardingKnowledgeSourceSchema,
  'yaksha_faq_onboarding_knowledge'
);

/* ─── Chunks: small text snippets + their embedding vectors ─────────────── */

export interface IOnboardingKnowledgeChunk extends Document {
  sourceId: Types.ObjectId;
  batchId: Types.ObjectId | null;
  /** Sequential index of this chunk within the source (0-based). */
  index: number;
  /** The chunk's text content (typically 800–1200 chars). */
  text: string;
  /**
   * Embedding vector. Stored as plain Array<Number> rather than
   * [Number] typed in Mongoose because Mongo's BSON doesn't
   * distinguish — the field stays flexible across embedding
   * dimensions. The AI pipeline writes the same shape that
   * DocumentInsight and ZoomTranscriptChunk use elsewhere.
   */
  embedding: number[];
  createdAt: Date;
}

const onboardingKnowledgeChunkSchema = new MongooseSchema<IOnboardingKnowledgeChunk>(
  {
    sourceId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'OnboardingKnowledgeSource',
      required: true,
      index: true,
    },
    batchId: { type: MongooseSchema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    index: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], default: [] },
  },
  { timestamps: true }
);

onboardingKnowledgeChunkSchema.index({ sourceId: 1, index: 1 });

export const OnboardingKnowledgeChunk = mongoose.model<IOnboardingKnowledgeChunk>(
  'OnboardingKnowledgeChunk',
  onboardingKnowledgeChunkSchema,
  'yaksha_faq_onboarding_knowledge_chunks'
);