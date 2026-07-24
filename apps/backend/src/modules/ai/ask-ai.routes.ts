import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import multer from 'multer';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';
import CommunityPost from '../community/community-post.model.js';
import { askAIController } from '../knowledge/knowledge.controller.js';
import { fetchContext } from '../../services/contextRetriever.js';
import { adminLog } from '../../utils/http/logger.js';

const router = Router();

// ── File upload support ────────────────────────────────────────────────────
// Allow images (PNG/JPG/GIF/WebP) and text-ish files (txt/md/csv/json).
// PDFs deliberately excluded — would need pdf-parse; can add later.
const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  'text/plain', 'text/markdown', 'text/csv',
  'application/json', 'application/octet-stream', // some browsers send octet-stream for .txt
]);
const MAX_FILES = 4;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

/**
 * Ask AI — RAG-style free-form Q&A across FAQs + Knowledge Base + Community.
 * Used by the floating "Ask AI" search bar on the frontend.
 *
 * Accepts either application/json (text-only) or multipart/form-data (text + file uploads).
 *
 * Access policy:
 *  - Public — anonymous users get 5 free AI searches per browser per 24h
 *    (enforced client-side via localStorage; see AskAIButton.tsx).
 *  - Logged-in users are unlimited.
 *  - Backend abuse protection: anonymous requests are throttled to 20/min per
 *    IP, logged-in users to 30/min per IP, so a determined attacker can't
 *    drain the AI quota by just clearing localStorage.
 */
const anonAiLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max: 20,                 // 20 anonymous AI searches per minute per IP
  keyGenerator: (req: Request) => `anon:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Skip the anon limiter if a valid auth token is present (the user
    // limiter below will handle them).
    const auth = req.headers.authorization;
    return !!(auth && auth.startsWith('Bearer '));
  },
  message: { message: 'Too many AI searches. Please wait a moment and try again.' },
});

const authedAiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,                 // 30 logged-in AI searches per minute per user
  keyGenerator: (req: Request) => `auth:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many AI searches. Please slow down.' },
});

// Routes that accept text-only (no files) and routes that accept multipart
// (with files) are mounted as the same path — multer's any() only triggers
// on multipart/form-data, so JSON requests pass through untouched.
router.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    const ct = req.headers['content-type'] ?? '';
    if (ct.startsWith('multipart/form-data')) {
      return upload.any()(req, res, (err) => {
        if (err) {
          const msg = (err as Error).message ?? 'File upload failed';
          res.status(400).json({ message: msg });
          return;
        }
        next();
      });
    }
    next();
  },
  anonAiLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    // If a Bearer token is present, verify it (best-effort) and apply the
    // authenticated limiter. Invalid/expired tokens fall through to the anon
    // path — public access is the default; auth only changes the rate limit.
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      return protect(req, res, () => authedAiLimiter(req, res, next));
    }
    next();
  },
  askAIController
);

/**
 * Phase 2 R10 smoke-test endpoint — admin / ai_moderator only.
 *
 * `GET /preview-context/:postId?topK=N&maxHits=N&includeComments=true|false`
 * runs the new `fetchContext` pipeline against a community post and returns
 * the assembled `FetchContextResult` JSON. Useful for verifying Phase 2
 * end-to-end without going through auto-answer.
 *
 * Phase 3 will retire this — by then auto-answer.controller.ts itself
 * will call fetchContext directly.
 */
router.get(
  '/preview-context/:postId',
  protect,
  authorize('admin', 'ai_moderator'),
  async (req: Request, res: Response) => {
    try {
      // S5-M1 (MEDIUM) fix: previously any admin from any program
      // could preview any post — exposing raw post content + persisted
      // aiContext across programs. Now: if the post has a batchId
      // AND the calling admin's `adminPrograms` includes it, allow;
      // otherwise 404 (do not leak existence).
      const post = await CommunityPost.findById(req.params.postId).lean();
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }
      const postBatchId = (post.batchId as { toString(): string } | undefined)?.toString() ?? null;
      const userPrograms: string[] = ((req as any).user?.adminPrograms ?? []) as string[];
      const isGlobalAdmin = userPrograms.length === 0 && (req as any).user?.role === 'admin';
      if (postBatchId && !isGlobalAdmin && !userPrograms.includes(postBatchId)) {
        adminLog.warn(`[previewContext] post=${req.params.postId} outside admin's programs — denied`);
        return res.status(404).json({ message: 'Post not found' });
      }
      const queryText = `${post.title ?? ''} ${post.body ?? ''}`.trim();
      const topK = Number(req.query.topK) || 3;
      const maxHits = Number(req.query.maxHits) || 15;
      const includeComments =
        req.query.includeComments === undefined
          ? true
          : req.query.includeComments !== 'false';
      const batchId = postBatchId;

      adminLog.info(
        `[previewContext] post=${req.params.postId} batch=${batchId} queryLen=${queryText.length}`,
      );
      const result = await fetchContext(queryText, {
        topK,
        maxHits,
        batchId,
        includeComments,
      });
      return res.json(result);
    } catch (err) {
      adminLog.warn(
        `[previewContext] failed: ${(err as Error).message}`,
      );
      return res
        .status(500)
        .json({ message: 'preview-context failed', error: (err as Error).message });
    }
  },
);

export default router;
