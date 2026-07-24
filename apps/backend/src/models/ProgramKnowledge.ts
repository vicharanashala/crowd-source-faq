/**
 * ProgramKnowledge — Phase 2 R9.
 *
 * Curated knowledge store for the auto-answer context retriever.
 * One row per curated Q&A pair scoped to a program (`Batch`). Phase
 * 3 will hit this collection from the auto-answer feedback loop:
 *
 *   1. Migrate `TranscriptKnowledge`, `DocumentInsight`, and answered
 *      `CommunityPost` rows into here (see `scripts/migrate-to-program-knowledge.ts`).
 *   2. When admins correct an AI answer, append a row with
 *      `seedSource='admin_corrected'` and `confidenceBoost=1.5` so the
 *      corrected answer beats the original on the next retrieval.
 *   3. The `services/contextRetriever.ts` pipeline reads from this
 *      collection (and the legacy FAQ / KB / community collections)
 *      via a `$text` index — no embeddings.
 *
 * Schema notes
 * ------------
 *  - `embedding` is reserved for a future Atlas Vector Search source.
 *    It's optional so rows created today don't break when an
 *    embeddings-aware retrieval source comes online later.
 *  - `originalContextId + seedSource` is the idempotency key for the
 *    migration script — re-running it won't double-insert.
 *  - The `text` index on (question, answer, keywords) powers both the
 *    kb source and the migration script's duplicate guard.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/** Where this row came from. Drives the per-source confidence weighting. */
export type ProgramKnowledgeSeed =
  | 'zoom_qa'          // promoted from TranscriptKnowledge (Zoom transcript)
  | 'doc_promoted'     // promoted from a DocumentInsight that became an FAQ
  | 'admin_response'   // captured from a community post answer
  | 'admin_corrected'; // written by an admin to fix a wrong AI answer

export interface IProgramKnowledge extends Document {
  question: string;
  answer: string;
  keywords: string[];
  batchId: Types.ObjectId;
  seedSource: ProgramKnowledgeSeed;
  /** Id of the row in the source collection this was migrated from. */
  originalContextId?: string | null;
  /** Multiplier on the per-row confidence. admin_corrected = 1.5 */
  confidenceBoost: number;
  /** Optional — future Atlas Vector Search hook. NOT required. */
  embedding?: number[];
  embeddingVersion: number;
  embeddingDim: number;
  /** Drives the freshness demotion in fetchContext. */
  lastVerifiedDate: Date;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const programKnowledgeSchema = new MongooseSchema<IProgramKnowledge>(
  {
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
      maxlength: 500,
    },
    answer: {
      type: String,
      required: [true, 'Answer is required'],
      trim: true,
      maxlength: 5000,
    },
    keywords: {
      type: [String],
      default: [],
    },
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      required: [true, 'batchId is required'],
      index: true,
    },
    seedSource: {
      type: String,
      enum: ['zoom_qa', 'doc_promoted', 'admin_response', 'admin_corrected'] as ProgramKnowledgeSeed[],
      required: [true, 'seedSource is required'],
      index: true,
    },
    originalContextId: {
      type: String,
      default: null,
    },
    confidenceBoost: {
      type: Number,
      default: 1.0,
      min: 0,
    },
    // Reserved for a future embeddings-aware retrieval source. NOT required,
    // NOT indexed — when an embeddings source comes online it will declare
    // its own Atlas Vector Search index on this collection.
    embedding: {
      type: [Number],
      default: undefined,
    },
    embeddingVersion: {
      type: Number,
      default: 0,
    },
    embeddingDim: {
      type: Number,
      default: 0,
    },
    lastVerifiedDate: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    createdBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

// Compound text index on (question, answer, keywords). This is the
// primary retrieval path for the kb source — the kb source uses
// `MongoDB $text $search` against ProgramKnowledge alongside
// TranscriptKnowledge and DocumentInsight.
programKnowledgeSchema.index(
  { question: 'text', answer: 'text', keywords: 'text' },
  { weights: { question: 10, keywords: 5, answer: 2 }, name: 'program_knowledge_text' },
);

// Idempotency key for the migration: one ProgramKnowledge row per
// (originalContextId, seedSource) pair. Partial-indexed on
// originalContextId so legacy admin-response rows without an original
// id don't all collide.
programKnowledgeSchema.index(
  { originalContextId: 1, seedSource: 1 },
  {
    unique: true,
    partialFilterExpression: { originalContextId: { $type: 'string' } },
    name: 'program_knowledge_idempotency',
  },
);

// Hot path indexes for the auto-answer pipeline.
programKnowledgeSchema.index({ batchId: 1, seedSource: 1, lastVerifiedDate: -1 });
programKnowledgeSchema.index({ batchId: 1, createdAt: -1 });

export default mongoose.model<IProgramKnowledge>(
  'ProgramKnowledge',
  programKnowledgeSchema,
  'yaksha_program_knowledge',
);