/**
 * DocumentAsset — Phase 6.
 *
 * Admin-uploaded documents (PDF / TXT / MD / CSV) that the auto-answer
 * context retriever can pull into its fan-out via `documentTextSource`.
 *
 * Schema notes
 * ------------
 *  - `title` is the searchable label — defaults to the original
 *    filename without the extension. Admins can rename later (out of
 *    scope for v1, but the field is plain `String` so renaming is
 *    trivial).
 *  - `filename` preserves the original on-disk name for display in the
 *    admin list and download link construction.
 *  - `storagePath` is the absolute path under
 *    `apps/backend/uploads/documents/` where multer wrote the file.
 *    Delete must `unlink` this path AND remove the DB row (the
 *    `deleteDocument` controller does both).
 *  - `mimeType` is restricted to the four types we can actually
 *    extract text from with `pdf-parse` + plain UTF-8 reads.
 *  - `text` is the extracted main content — what `$text` index hits
 *    on. Capped at 500_000 chars in `processDocumentFile` so a single
 *    massive PDF can't dominate the index.
 *  - `pageCount` is 0 for non-PDF uploads; >0 for PDFs. Surfaced in
 *    the retrieval hit meta for debugging / display.
 *  - `batchId` is OPTIONAL. Documents without a batchId are global
 *    (any program can match them). With a batchId, only fetches for
 *    that program will return the document. Mirrors the WebPage
 *    pattern where the global-with-attachable-program is the v1.
 *  - `lastFetchError` is reserved for future re-extraction flows
 *    (e.g. if we add OCR later). When set, the source excludes the
 *    document. v1 always sets it to `null`.
 *  - The text index weights `title` at 10 and `text` at 2 — the same
 *    weighting used by `WebPage` because the relevance signal is
 *    identical (a title match is much stronger than a body match).
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type DocumentMimeType =
  | 'application/pdf'
  | 'text/plain'
  | 'text/markdown'
  | 'text/csv';

export interface IDocumentAsset extends Document {
  title: string;
  filename: string;
  storagePath: string;
  mimeType: DocumentMimeType;
  sizeBytes: number;
  text: string;
  pageCount: number;
  batchId?: Types.ObjectId | null;
  lastFetchError: string | null;
  uploadedAt: Date;
  uploadedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const documentAssetSchema = new MongooseSchema<IDocumentAsset>(
  {
    title: {
      type: String,
      required: [true, 'title is required'],
      trim: true,
      maxlength: 500,
    },
    filename: {
      type: String,
      required: [true, 'filename is required'],
      trim: true,
      maxlength: 500,
    },
    storagePath: {
      type: String,
      required: [true, 'storagePath is required'],
      trim: true,
      maxlength: 4096,
    },
    mimeType: {
      type: String,
      enum: [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'text/csv',
      ] as DocumentMimeType[],
      required: [true, 'mimeType is required'],
    },
    sizeBytes: {
      type: Number,
      required: [true, 'sizeBytes is required'],
      min: 0,
    },
    text: {
      type: String,
      required: [true, 'text is required'],
    },
    pageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    batchId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
    lastFetchError: {
      type: String,
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    uploadedBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

// Primary retrieval path — weighted text index on title (10) + text (2).
// Same weighting as WebPage because the relevance signal is identical.
documentAssetSchema.index(
  { title: 'text', text: 'text' },
  { weights: { title: 10, text: 2 }, name: 'document_asset_text' },
);

// Program-scoped view: by-batch, newest-first.
documentAssetSchema.index(
  { batchId: 1, uploadedAt: -1 },
  { name: 'document_asset_batch_uploadedAt' },
);

// Admin view filter: by mime-type, newest-first.
documentAssetSchema.index(
  { mimeType: 1, uploadedAt: -1 },
  { name: 'document_asset_mime_uploadedAt' },
);

export default mongoose.model<IDocumentAsset>(
  'DocumentAsset',
  documentAssetSchema,
  'yaksha_documents',
);