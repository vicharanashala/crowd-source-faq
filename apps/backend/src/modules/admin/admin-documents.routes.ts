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
import {
  addDocument,
  listDocuments,
  deleteDocument,
} from './adminDocuments.controller.js';

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
router.post('/documents', upload.single('file'), addDocument);
router.get('/documents', listDocuments);
router.delete('/documents/:id', deleteDocument);
export default router;
