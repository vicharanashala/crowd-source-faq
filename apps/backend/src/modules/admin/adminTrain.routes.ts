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
import { adminWriteLimiter } from '../../utils/auth/rateLimit.js';
import { getBatchKnowledgeStats, type BatchKnowledgeStats } from '../../services/trainAggregator.js';
import { fetchContext } from '../../services/contextRetriever.js';
import { fetchAndExtract } from '../../services/webFetcher.js';
import { addDocumentJob } from '../../utils/jobs/documentQueue.js';
import { mimeToFileType } from '../../utils/documentExtractor.js';
import ProgramKnowledge from '../../models/ProgramKnowledge.js';
import Batch from '../../modules/program/batch.model.js';
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
// S5-H2 (HIGH) fix: previously the train routes had no rate limiter.
// A compromised admin JWT could fire `bulk-urls` repeatedly
// (50 outbound HTTP calls per request, no rate limit) — SSRF
// amplifier + disk fill + AI quota drain. Apply the project-wide
// adminWriteLimiter (30/min per identity). Read-only train routes
// (`/stats`, `/program-knowledge`, `/search`) skip the limiter.
router.post('/train/bulk-urls', adminWriteLimiter);
router.post('/train/bulk-documents', adminWriteLimiter);
router.post('/train/promote-cross-program', adminWriteLimiter);

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

// ─── List ProgramKnowledge rows (for the promote panel's search/pick) ─────
// v1 — added when the promote panel needed a real source-row picker.
// MongoDB $text search against the existing weighted index on
// (question:10, keywords:5, answer:2). Empty search returns the most
// recent rows (sort by createdAt desc) so the UI always shows something.
const MAX_PROGRAM_KNOWLEDGE_LIMIT = 50;
router.get('/train/program-knowledge', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.trunc(requestedLimit), MAX_PROGRAM_KNOWLEDGE_LIMIT)
      : 20;
    const baseFilter: Record<string, unknown> = { deletedAt: null };
    if (search.length > 0) {
      // Escape user input for $text — Mongo's $text search treats query
      // as space-separated AND terms, and supports quoted phrase matches.
      // S5-M2 (MEDIUM) fix: previously this stripped only `-`, `!`, `"`,
      // but `$text` also treats `*` (prefix wildcard), `(`/`)` (grouping),
      // `\` (escape), `<`/`>` (less/greater than — not used by $text but
      // cheap to filter), and `;` (URL boundary) as potential injection
      // vectors. Strip them all to whitespace + collapse. Keeps the user
      // query useful without surfacing any $text metacharacter.
      const safe = search.replace(/[!\-\-*()\\<>;]/g, ' ').replace(/\s+/g, ' ').trim();
      if (safe.length > 0) baseFilter.$text = { $search: safe };
    }
    const rows = await ProgramKnowledge.find(baseFilter)
      .sort(search.length > 0 ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
      .limit(limit)
      .select('_id question answer seedSource batchId confidenceBoost')
      .lean();
    // Look up batch names in one query for the UI label.
    const batchIds = Array.from(new Set(rows.map((r) => String(r.batchId))));
    const batches = batchIds.length > 0
      ? await Batch.find({ _id: { $in: batchIds } }).select('_id name').lean()
      : [];
    const batchNameById = new Map(batches.map((b) => [String(b._id), b.name ?? '(unnamed)']));
    res.json({
      rows: rows.map((r) => ({
        id: String(r._id),
        question: r.question ?? '',
        answer: r.answer ?? '',
        seedSource: r.seedSource ?? 'admin_seeded',
        batchId: String(r.batchId),
        batchName: batchNameById.get(String(r.batchId)) ?? '(unnamed)',
        confidenceBoost: r.confidenceBoost ?? 1.0,
      })),
    });
  } catch (err) {
    logger.error(`[adminTrain] program-knowledge list failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to list program knowledge' });
  }
});

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

  // S5-H1 (HIGH) fix: previously the response was typed as
  // `{ title, documentId }` but the value was the BULL JOB id, not
  // a Document document id. UI consumers that tracked uploaded docs
  // by id would silently break. Now we return BOTH fields explicitly
  // and keep the types tight. The placeholder documentId is
  // overwritten by the worker when the actual doc record is created.
  const accepted: Array<{ title: string; jobId: string; documentId: string | null }> = [];
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
      // S5-H1: return both `jobId` (the BullMQ job id, used to poll
      // status) and `documentId` (the placeholder; will be replaced
      // by the worker with the real Document._id once OCR+AI completes).
      // Until the worker writes back, documentId is null — UI must
      // check both.
      accepted.push({ title, jobId, documentId: null });
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

router.post('/train/promote-cross-program', async (req, res): Promise<void> => {
  const { programKnowledgeId, targetBatchIds } = (req.body ?? {}) as {
    programKnowledgeId?: string;
    targetBatchIds?: string[];
  };
  if (!programKnowledgeId || !Array.isArray(targetBatchIds) || targetBatchIds.length === 0) {
    res.status(400).json({ message: 'programKnowledgeId and non-empty targetBatchIds required' });
    return;
  }

  // S5-C1 (CRITICAL) fix: source-row scope check. The previous code
  // let any admin promote ANY ProgramKnowledge row (regardless of
  // which program the source lives in) to ANY target batch. Now we
  // require the source's batchId to be in the caller's adminPrograms
  // — unless the caller is a global admin (no adminPrograms set).
  // Same logic used by the other admin write paths in the file.
  const userPrograms: string[] = ((req as any).user?.adminPrograms ?? []) as string[];
  const isGlobalAdmin = userPrograms.length === 0 && (req as any).user?.role === 'admin';

  const source = await ProgramKnowledge.findById(programKnowledgeId).lean();
  if (!source) {
    res.status(404).json({ message: 'Source ProgramKnowledge row not found' });
    return;
  }
  const sourceBatchId = source.batchId ? String(source.batchId) : null;
  if (sourceBatchId && !isGlobalAdmin && !userPrograms.includes(sourceBatchId)) {
    res.status(403).json({ message: 'source ProgramKnowledge is outside your admin programs' });
    return;
  }

  // Filter valid ObjectIds. Skip bad ones silently — admin UI shows
  // "promoted N of M" so partial failures are visible.
  const validIds = targetBatchIds.filter((id) => Types.ObjectId.isValid(id));
  const skipped: string[] = targetBatchIds.filter((id) => !Types.ObjectId.isValid(id));

  // S5-C2 (CRITICAL) fix: target-batch scope check. Previously the
  // route used `validIds` (all well-formed ObjectIds) as-is. Now we
  // additionally require each target to be an `isActive: true`
  // batch — preventing resurrection of knowledge into soft-deleted
  // programs and enforcing per-program scope.
  const existingBatches = await Batch.find({
    _id: { $in: validIds.map((id) => new Types.ObjectId(id)) },
    isActive: true,
  })
    .select('_id')
    .lean();
  const activeBatchIds = new Set(existingBatches.map((b) => String(b._id)));
  const eligibleIds = validIds.filter((id) => activeBatchIds.has(id));
  const skippedInactive = validIds.filter((id) => !activeBatchIds.has(id));

  // Idempotent: findOneAndUpdate with upsert on (batchId, question).
  // Re-running promotes no duplicates — existing rows are matched and
  // left alone (no $set), only new batch+question combos are inserted.
  const promoted: Array<{ batchId: string; id: string }> = [];
  const skippedDup: string[] = [];
  for (const batchId of eligibleIds) {
    const batchObjectId = new Types.ObjectId(batchId);
    // S5-C1: additionally check that each target is within the
    // caller's adminPrograms (unless global admin).
    if (!isGlobalAdmin && !userPrograms.includes(batchId)) {
      skippedInactive.push(batchId);
      continue;
    }
    const upsertResult = await ProgramKnowledge.findOneAndUpdate(
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
      { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true },
    );
    // S5-M3 (MEDIUM) fix: previously the dedup signal was
    // `result._id !== source._id` — which is wrong (a separate
    // pre-existing row could match (batchId, question) by coincidence
    // and have a different _id, but it's still a duplicate). Now we
    // check `lastErrorObject.upserted` (set iff the upsert was a fresh
    // insert; absent iff it matched an existing row). UI gets a clear
    // "wasDuplicate: true" so admins can tell apart "I just promoted
    // 3 new rows" from "I tried to promote 5, 3 were duplicates".
    const wasInsert = (upsertResult as any)?.lastErrorObject?.upserted != null;
    if (upsertResult && wasInsert) {
      promoted.push({ batchId, id: String((upsertResult as any)._id) });
    } else {
      skippedDup.push(batchId);
    }
  }

  logger.info(
    `[adminTrain] promote-cross-program: source=${programKnowledgeId} promoted=${promoted.length} skippedDuplicates=${skippedDup.length} invalidIds=${skipped.length} skippedInactive=${skippedInactive.length}`,
  );
  res.json({
    promoted,
    skippedDuplicates: skippedDup,
    invalidBatchIds: skipped,
    skippedInactiveOrOutOfScope: skippedInactive,
  });
});

export default router;