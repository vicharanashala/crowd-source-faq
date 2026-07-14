/**
 * adminTrain.routes — Admin endpoints for the "Train this program" tab.
 *
 *   GET  /admin/train/stats?batchId=xxx   → BatchKnowledgeStats[]
 *   POST /admin/train/search               → top-N retrieval hits for a test query
 *   POST /admin/train/bulk-urls           → bulk-fetch N URLs into WebPage
 *   POST /admin/train/bulk-documents       → bulk-upload N documents (async OCR+AI)
 *   POST /admin/train/promote-cross-program → clone a ProgramKnowledge row to N batches
 *
 * All endpoints require admin / ai_moderator / moderator role, matching
 * the existing admin routes (admin-web-pages.routes.ts etc).
 *
 * Build on existing modules — do not modify autoAnswer.ts, contextRetriever.ts,
 * retrievalSources/, webFetcher.ts, documentUpload.ts, or documentJob.ts.
 * This file is the thin admin layer over those modules.
 */
import { Router } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { Types } from 'mongoose';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';
import { getBatchKnowledgeStats, type BatchKnowledgeStats } from '../../services/trainAggregator.js';
import { fetchContext } from '../../services/contextRetriever.js';
import { fetchAndExtract } from '../../services/webFetcher.js';
import { addDocumentJob } from '../../utils/jobs/documentQueue.js';
import { mimeToFileType } from '../../utils/documentExtractor.js';
import ProgramKnowledge from '../../models/ProgramKnowledge.js';
import WebPage from '../../models/WebPage.js';
import { logger } from '../../utils/http/logger.js';

// Mirror the knowledge/document.controller.ts upload path: the original
// file is written to disk at UPLOAD_DIR, then enqueued for the BullMQ
// worker (utils/jobs/documentJob.ts) which does OCR + AI extraction
// and produces DocumentInsight rows that surface in the admin review queue.
const UPLOAD_DIR = path.resolve(process.cwd(), 'apps/backend/uploads/documents');

const router = Router();
router.use(protect);
router.use(authorize('admin', 'ai_moderator', 'moderator'));

// ─── A1 + A2: aggregator ────────────────────────────────────────────────────

router.get('/train/stats', async (req, res) => {
  try {
    const batchId = typeof req.query.batchId === 'string' ? req.query.batchId : undefined;
    const stats: BatchKnowledgeStats[] = await getBatchKnowledgeStats(batchId);
    res.json({ stats });
  } catch (err) {
    logger.error(`[adminTrain] stats failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to fetch training stats' });
  }
});

// ─── A4: search-test ────────────────────────────────────────────────────────

router.post('/train/search', async (req, res) => {
  const { question, batchId, topK } = (req.body ?? {}) as {
    question?: string;
    batchId?: string;
    topK?: number;
  };
  if (!question || !batchId) {
    res.status(400).json({ message: 'question and batchId are required' });
    return;
  }
  try {
    const result = await fetchContext(question, {
      batchId,
      topK: typeof topK === 'number' && topK > 0 ? Math.min(topK, 20) : 5,
    });
    res.json({
      query: result.query,
      takenAt: result.takenAt,
      hits: result.hits,
      sources: result.sources,
    });
  } catch (err) {
    logger.error(`[adminTrain] search failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Search failed' });
  }
});

// ─── B1: bulk URL ingestion ────────────────────────────────────────────────

const MAX_URLS_PER_REQUEST = 50;

router.post('/train/bulk-urls', async (req, res) => {
  const { urls, batchId } = (req.body ?? {}) as { urls?: string[]; batchId?: string };
  if (!Array.isArray(urls) || urls.length === 0 || !batchId) {
    res.status(400).json({ message: 'urls (non-empty array) and batchId are required' });
    return;
  }
  if (urls.length > MAX_URLS_PER_REQUEST) {
    res
      .status(400)
      .json({ message: `At most ${MAX_URLS_PER_REQUEST} URLs per request (got ${urls.length})` });
    return;
  }
  if (!Types.ObjectId.isValid(batchId)) {
    res.status(400).json({ message: 'batchId must be a valid ObjectId' });
    return;
  }

  const added: Array<{ url: string; id: string; title: string }> = [];
  const failed: Array<{ url: string; error: string }> = [];

  // Process sequentially — fetchAndExtract makes external HTTP calls,
  // and a fan-out of 50 concurrent outbound requests to arbitrary
  // websites is a bad neighbor. Bump parallelism later if needed.
  for (const url of urls) {
    try {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        failed.push({ url: String(url), error: 'invalid URL' });
        continue;
      }
      const fetched = await fetchAndExtract(url);
      const page = await WebPage.create({
        url,
        title: fetched.title?.slice(0, 500) || url,
        text: fetched.text,
        statusCode: fetched.statusCode,
        source: 'admin_uploaded',
        approved: false,
      });
      added.push({ url, id: String(page._id), title: page.title });
    } catch (err) {
      failed.push({ url, error: (err as Error).message });
    }
  }

  logger.info(
    `[adminTrain] bulk-urls: batchId=${batchId} added=${added.length} failed=${failed.length}`,
  );
  res.json({ added, failed });
});

// ─── B2: bulk document upload ──────────────────────────────────────────────

const MAX_DOCS_PER_REQUEST = 20;

router.post('/train/bulk-documents', async (req, res) => {
  const { documents, batchId } = (req.body ?? {}) as {
    documents?: Array<{
      title?: string;
      contentBase64?: string;
      mimeType?: string;
      filename?: string;
    }>;
    batchId?: string;
  };
  if (!Array.isArray(documents) || documents.length === 0 || !batchId) {
    res.status(400).json({ message: 'documents (non-empty array) and batchId are required' });
    return;
  }
  if (documents.length > MAX_DOCS_PER_REQUEST) {
    res
      .status(400)
      .json({ message: `At most ${MAX_DOCS_PER_REQUEST} documents per request` });
    return;
  }
  if (!Types.ObjectId.isValid(batchId)) {
    res.status(400).json({ message: 'batchId must be a valid ObjectId' });
    return;
  }

  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    logger.error(`[adminTrain] ensureUploadDir failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'storage init failed' });
    return;
  }

  const uploaderUserId = String(
    (req as typeof req & { user?: { _id?: string | Types.ObjectId } }).user?._id ?? '',
  );
  if (!uploaderUserId) {
    res.status(401).json({ message: 'authenticated user required' });
    return;
  }

  const accepted: Array<{ title: string; documentId: string }> = [];
  const failed: Array<{ title: string; error: string }> = [];

  for (const doc of documents) {
    try {
      const title = (doc.title || 'untitled').slice(0, 200);
      const mimeType = doc.mimeType ?? 'application/octet-stream';
      // mimeToFileType maps Content-Type → the union
      // ('image' | 'pdf' | 'docx' | 'xlsx') that the BullMQ worker
      // understands. Anything outside the union (text/*, csv, etc.) is
      // rejected at the admin boundary rather than silently no-op'd.
      const fileType = mimeToFileType(mimeType);
      if (!fileType) {
        failed.push({ title, error: `unsupported mime-type: ${mimeType}` });
        continue;
      }
      const buffer = Buffer.from(doc.contentBase64 ?? '', 'base64');
      if (buffer.length === 0) {
        failed.push({ title, error: 'empty content' });
        continue;
      }
      // Write to disk at UPLOAD_DIR — same path the single-doc endpoint
      // uses. The BullMQ worker reads from this path.
      const ts = Date.now();
      const safeName = (doc.filename || `${ts}-${title}.bin`)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 120);
      const filePath = path.join(UPLOAD_DIR, `${ts}-${safeName}`);
      await fs.writeFile(filePath, buffer);

      const jobId = await addDocumentJob({
        documentId: String(new Types.ObjectId()), // placeholder; overwritten by worker via jobId lookup
        bufferBase64: buffer.toString('base64'),
        fileName: safeName,
        fileType,
        mimeType,
        title,
        uploaderUserId,
        batchId,
      });
      accepted.push({ title, documentId: jobId });
    } catch (err) {
      failed.push({ title: doc.title ?? '(untitled)', error: (err as Error).message });
    }
  }

  logger.info(
    `[adminTrain] bulk-documents: batchId=${batchId} accepted=${accepted.length} failed=${failed.length}`,
  );
  res.json({ accepted, failed });
});

// ─── B3: cross-program knowledge promotion ────────────────────────────────

router.post('/train/promote-cross-program', async (req, res) => {
  const { programKnowledgeId, targetBatchIds } = (req.body ?? {}) as {
    programKnowledgeId?: string;
    targetBatchIds?: string[];
  };
  if (!programKnowledgeId || !Array.isArray(targetBatchIds) || targetBatchIds.length === 0) {
    res.status(400).json({ message: 'programKnowledgeId and non-empty targetBatchIds required' });
    return;
  }

  const source = await ProgramKnowledge.findById(programKnowledgeId).lean();
  if (!source) {
    res.status(404).json({ message: 'Source ProgramKnowledge row not found' });
    return;
  }

  // Filter valid ObjectIds. Skip bad ones silently — admin UI shows
  // "promoted N of M" so partial failures are visible.
  const validIds = targetBatchIds.filter((id) => Types.ObjectId.isValid(id));
  const skipped: string[] = targetBatchIds.filter((id) => !Types.ObjectId.isValid(id));

  // Idempotent: findOneAndUpdate with upsert on (batchId, question).
  // Re-running promotes no duplicates — existing rows are matched and
  // left alone (no $set), only new batch+question combos are inserted.
  const promoted: Array<{ batchId: string; id: string }> = [];
  const skippedDup: string[] = [];
  for (const batchId of validIds) {
    const batchObjectId = new Types.ObjectId(batchId);
    const result = await ProgramKnowledge.findOneAndUpdate(
      { batchId: batchObjectId, question: source.question },
      {
        $setOnInsert: {
          batchId: batchObjectId,
          question: source.question,
          answer: source.answer,
          keywords: source.keywords ?? [],
          // Cross-program copies inherit the source's provenance. This
          // means admin edits to the source still flow through the
          // "promoteCorrectedAnswer" loop in autoAnswer.ts, which writes
          // a NEW row keyed by (batchId, question) — so cross-program
          // copies become independent over time.
          seedSource: source.seedSource ?? 'admin_seeded',
          confidenceBoost: source.confidenceBoost ?? 1.0,
          deletedAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    // If the upsert matched an existing row, _id equals source._id —
    // skip counting it as a "promoted" row.
    if (result && String(result._id) !== String(source._id)) {
      promoted.push({ batchId, id: String(result._id) });
    } else {
      skippedDup.push(batchId);
    }
  }

  logger.info(
    `[adminTrain] promote-cross-program: source=${programKnowledgeId} promoted=${promoted.length} skippedDuplicates=${skippedDup.length} invalidIds=${skipped.length}`,
  );
  res.json({ promoted, skippedDuplicates: skippedDup, invalidBatchIds: skipped });
});

export default router;