/**
 * documentController — REST surface for the OCR / document pipeline.
 *
 * Routes (mounted in `routes/documents.ts`):
 *
 *   POST   /api/documents/upload           (authed) — multipart upload,
 *                                             creates a DocumentRecord,
 *                                             enqueues a BullMQ job,
 *                                             returns 202.
 *   GET    /api/documents/my               (authed) — list the caller's
 *                                             uploads, newest first.
 *   GET    /api/documents/:id              (authed) — single document
 *                                             + its insights.
 *   GET    /api/documents/:id/insights     (authed) — insights for a
 *                                             document.
 *
 *   GET    /api/admin/documents/insights                 (admin) — pending
 *                                                          review queue.
 *   GET    /api/admin/documents/insights/:id             (admin) — insight
 *                                                          detail.
 *   PATCH  /api/admin/documents/insights/:id             (admin) — review
 *                                                          (approve | reject
 *                                                          | promote).
 *   POST   /api/admin/documents/insights/promote-popular (admin) — run the
 *                                                          auto-promote
 *                                                          cron on demand.
 *
 * The admin GET/PATCH routes live in the same file because they share
 * a lot of state-validation logic with the user-facing reads.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import multer from 'multer';
import DocumentRecord, { type IDocumentRecord } from '../models/DocumentRecord.js';
import DocumentInsight, { type IDocumentInsight } from '../models/DocumentInsight.js';
import { logger } from '../utils/http/logger.js';
import { addDocumentJob, isDocumentQueueEnabled } from '../utils/jobs/documentQueue.js';
import { runPromotePopularDocumentInsights } from '../controllers/documentPromotionController.js';
import { createIdentityLimiter } from '../utils/auth/rateLimit.js';
import { mimeToFileType, type DocumentFileType } from '../utils/documentExtractor.js';
import { z } from 'zod';

// ─── Multer ───────────────────────────────────────────────────────────────────

// In-memory storage so we can re-encode the file as base64 into the
// BullMQ job payload. Capped at 25 MB to match DocumentRecord's
// fileSize validator.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Upload is gated to logged-in users; rate-limited at 10/hr to
// prevent upload-storm abuse (one PDF takes ~30s to OCR + 10-30s
// for AI — 10/hr is well within a real user's workflow but stops
// bots).
const uploadLimiter = createIdentityLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: 'rl_document_upload',
  message: 'You are uploading documents too frequently. Please wait an hour.',
});

export const uploadMiddleware = [upload.single('file'), uploadLimiter];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAuthedUserId(req: Request): Types.ObjectId | null {
  const u = (req as Request & { user?: { _id?: Types.ObjectId | string } }).user;
  if (!u?._id) return null;
  return new Types.ObjectId(String(u._id));
}

function getAuthedRole(req: Request): string | null {
  const u = (req as Request & { user?: { role?: string } }).user;
  return u?.role ?? null;
}

function stripInsensitive(record: IDocumentRecord): Record<string, unknown> {
  // rawExtractedText can be tens of KB — keep it on the detail
  // endpoint only, not the list endpoint. For the list we return a
  // short snippet to keep the payload small.
  const { rawExtractedText, ...rest } = record.toObject();
  return {
    ...rest,
    rawExtractedTextSnippet: rawExtractedText.slice(0, 200),
  };
}

// ─── User endpoints ───────────────────────────────────────────────────────────

/**
 * POST /api/documents/upload
 * multipart/form-data:
 *   - file:  the binary
 *   - title: short label (max 200 chars)
 */
export async function uploadDocument(req: Request, res: Response): Promise<void> {
  if (!isDocumentQueueEnabled()) {
    res.status(503).json({ message: 'Document processing is not configured on this server. Set REDIS_TCP_URL.' });
    return;
  }
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }
  if (!req.file) { res.status(400).json({ message: 'No file uploaded. Use multipart/form-data with field name "file".' }); return; }

  const fileType: DocumentFileType | null = mimeToFileType(req.file.mimetype);
  if (!fileType) {
    res.status(415).json({
      message: `Unsupported file type: ${req.file.mimetype}. Use PNG, JPEG, PDF, DOCX, or XLSX.`,
    });
    return;
  }
  const titleRaw = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const title = titleRaw || req.file.originalname;
  if (title.length > 200) {
    res.status(400).json({ message: 'title must be 200 characters or fewer.' });
    return;
  }

  const record = await DocumentRecord.create({
    userId,
    fileName: req.file.originalname,
    fileType,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    title: title.slice(0, 200),
    status: 'uploaded',
  });

  // Encode buffer → base64 for the BullMQ payload. Capped by the
  // 25 MB multer limit above.
  const bufferBase64 = req.file.buffer.toString('base64');

  try {
    const jobId = await addDocumentJob({
      documentId: record._id.toString(),
      bufferBase64,
      fileName: record.fileName,
      fileType,
      mimeType: record.mimeType,
      title: record.title,
      uploaderUserId: userId.toString(),
    });
    record.jobId = jobId;
    await record.save();
  } catch (err) {
    logger.error(`[documentController] enqueue failed for ${record._id}: ${(err as Error).message}`);
    record.status = 'failed';
    record.errorMessage = `Failed to enqueue: ${(err as Error).message}`;
    await record.save();
    res.status(500).json({ message: 'Failed to enqueue document for processing.' });
    return;
  }

  res.status(202).json({
    document: {
      _id: record._id,
      fileName: record.fileName,
      fileType: record.fileType,
      title: record.title,
      status: record.status,
      jobId: record.jobId,
      createdAt: record.createdAt,
    },
  });
}

/** GET /api/documents/my */
export async function listMyDocuments(req: Request, res: Response): Promise<void> {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }
  const docs = await DocumentRecord.find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  // Manually project to add the snippet; lean() bypasses toObject.
  const items = docs.map((d) => {
    const { rawExtractedText, ...rest } = d;
    return { ...rest, rawExtractedTextSnippet: (rawExtractedText ?? '').slice(0, 200) };
  });
  res.json({ items });
}

/** GET /api/documents/:id */
export async function getDocument(req: Request, res: Response): Promise<void> {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) { res.status(400).json({ message: 'Invalid document id.' }); return; }
  const doc = await DocumentRecord.findById(id).lean();
  if (!doc) { res.status(404).json({ message: 'Document not found.' }); return; }
  const isAdmin = getAuthedRole(req) === 'admin' || getAuthedRole(req) === 'moderator';
  if (!isAdmin && doc.userId.toString() !== userId.toString()) {
    res.status(403).json({ message: 'You can only view your own uploads.' });
    return;
  }
  const insights = await DocumentInsight.find({ documentId: doc._id })
    .sort({ createdAt: 1 })
    .select('-sourceExcerpt') // don't leak source excerpts to non-admins
    .lean();
  res.json({ document: doc, insights });
}

/** GET /api/documents/:id/insights */
export async function listDocumentInsights(req: Request, res: Response): Promise<void> {
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) { res.status(400).json({ message: 'Invalid document id.' }); return; }
  const doc = await DocumentRecord.findById(id).select('userId').lean();
  if (!doc) { res.status(404).json({ message: 'Document not found.' }); return; }
  const isAdmin = getAuthedRole(req) === 'admin' || getAuthedRole(req) === 'moderator';
  if (!isAdmin && doc.userId.toString() !== userId.toString()) {
    res.status(403).json({ message: 'You can only view your own uploads.' });
    return;
  }
  const insights = await DocumentInsight.find({ documentId: id })
    .sort({ createdAt: 1 })
    .select('-sourceExcerpt')
    .lean();
  res.json({ items: insights });
}

// ─── Admin endpoints ──────────────────────────────────────────────────────────

/** GET /api/admin/documents/insights?status=pending_review */
export async function listPendingInsights(req: Request, res: Response): Promise<void> {
  if (!requireAdmin(getAuthedRole(req))) { res.status(403).json({ message: 'Admin only.' }); return; }
  const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'pending_review';
  const status = ['pending_review', 'approved', 'rejected', 'promoted'].includes(statusRaw)
    ? statusRaw
    : 'pending_review';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    DocumentInsight.find({ status })
      .sort({ searchMatchCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DocumentInsight.countDocuments({ status }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}

/** PATCH /api/admin/documents/insights/:id  body: { action: 'approve' | 'reject' | 'promote' } */
const reviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'promote']),
  reason: z.string().max(1000).optional(),
});

export async function reviewInsight(req: Request, res: Response): Promise<void> {
  if (!requireAdmin(getAuthedRole(req))) { res.status(403).json({ message: 'Admin only.' }); return; }
  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) { res.status(400).json({ message: 'Invalid insight id.' }); return; }
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues }); return; }

  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const insight = await DocumentInsight.findById(id);
  if (!insight) { res.status(404).json({ message: 'Insight not found.' }); return; }

  if (parsed.data.action === 'reject') {
    insight.status = 'rejected';
    insight.reviewedBy = userId;
    insight.reviewedAt = new Date();
    await insight.save();
    res.json({ insight });
    return;
  }

  if (parsed.data.action === 'approve') {
    insight.status = 'approved';
    insight.reviewedBy = userId;
    insight.reviewedAt = new Date();
    await insight.save();
    res.json({ insight });
    return;
  }

  // promote — approve + create the FAQ
  const { promoteInsightToFaq } = await import('../utils/documentPromotion.js');
  const result = await promoteInsightToFaq(insight, userId, 'admin');
  res.json({ insight: result.insight, faq: result.faq });
}

/** POST /api/admin/documents/insights/promote-popular — manual trigger for the cron */
export async function promotePopularNow(req: Request, res: Response): Promise<void> {
  if (!requireAdmin(getAuthedRole(req))) { res.status(403).json({ message: 'Admin only.' }); return; }
  const result = await runPromotePopularDocumentInsights();
  res.json(result);
}

// ─── Shared utils ────────────────────────────────────────────────────────────

function requireAdmin(role: string | null): boolean {
  return role === 'admin' || role === 'moderator';
}

function asStringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
