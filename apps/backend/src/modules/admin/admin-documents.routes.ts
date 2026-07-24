/**
 * admin-documents.routes — Phase 6.
 *
 * Mounted at /admin in bootstrap/routes.ts. Admin / ai_moderator /
 * moderator only. Uses multer disk storage to apps/backend/uploads/documents/.
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';
import { adminWriteLimiter } from '../../utils/auth/rateLimit.js';
import {
  addDocument,
  listDocuments,
  deleteDocument,
} from './adminDocuments.controller.js';
import { reindexDocuments, getReindexDiagnostics } from './adminReindex.controller.js';

const UPLOAD_DIR = path.resolve(
  process.cwd(),
  'apps/backend/uploads/documents',
);

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
];

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      // Ensure the directory exists before multer writes to it
      try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
      } catch (err) {
        cb(err as Error, UPLOAD_DIR);
        return;
      }
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ts = Date.now();
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${ts}-${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_MIME_TYPES.includes(file.mimetype);
    cb(null, ok);
  },
});

const router = Router();
router.use(protect);
router.use(authorize('admin', 'ai_moderator', 'moderator'));
// S5-13 (MEDIUM) fix: previously this route had no rate limiter.
// An admin (or attacker with a stolen admin JWT) could spam
// POST /admin/documents to fill the AI quota + disk. Apply the
// existing adminWriteLimiter (per-identity, 30/min) which is the
// project-wide pattern for admin write endpoints.
router.use(adminWriteLimiter);
router.post('/documents', upload.single('file'), addDocument);
router.get('/documents', listDocuments);
router.delete('/documents/:id', deleteDocument);
// Reindex trigger — re-extracts metadata + (when EMBEDDING_MODEL is
// set) re-embeds DocumentAsset rows. Idempotent. Accepts
// ?target=all (default) or ?target=<documentId>.
router.post('/documents/reindex', reindexDocuments);
// Diagnostics — in-memory ring of the last 50 reindex events, plus
// the per-doc index state. Consumed by /admin/document-index.
router.get('/documents/diagnostics', getReindexDiagnostics);
export default router;
