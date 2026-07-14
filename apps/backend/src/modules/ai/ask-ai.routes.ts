import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import multer from 'multer';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';
import CommunityPost from '../community/community-post.model.js';
import { askAIController } from '../knowledge/knowledge.controller.js';
import { fetchContext } from '../../services/contextRetriever.js';
import { adminLog } from '../../utils/http/logger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveProviderAsync, chatWithConfig } from '../../utils/ai/aiProvider.js';
import { runRag } from './rag.service.js';
import OpenAI from 'openai';


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
      const post = await CommunityPost.findById(req.params.postId).lean();
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }
      const queryText = `${post.title ?? ''} ${post.body ?? ''}`.trim();
      const topK = Number(req.query.topK) || 3;
      const maxHits = Number(req.query.maxHits) || 15;
      const includeComments =
        req.query.includeComments === undefined
          ? true
          : req.query.includeComments !== 'false';
      const batchId =
        (post.batchId as { toString(): string } | undefined)?.toString() ?? null;

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

// Multer configuration for single audio file upload (max 15MB)
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

router.post(
  '/transcribe',
  protect,
  audioUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'No audio file uploaded.' });
        return;
      }

      const config = await resolveProviderAsync('openai');
      if (!config.apiKey) {
        res.status(502).json({ message: 'AI transcription (OpenAI Whisper) is not configured.' });
        return;
      }

      // Write memory buffer to a temp file
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `voice-${Date.now()}-${req.file.originalname || 'audio.webm'}`);
      fs.writeFileSync(tempFilePath, req.file.buffer);

      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });

      const response = await client.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
      });

      // Clean up the temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // ignore
      }

      res.status(200).json({ text: response.text });
    } catch (err) {
      res.status(500).json({ message: 'Transcription failed.', error: (err as Error).message });
    }
  }
);

// POST /api/ai/co-pilot — AI Answer Co-pilot / Refinement Assistant
router.post(
  '/co-pilot',
  protect,
  async (req: Request, res: Response) => {
    try {
      const { query, draftAnswer } = req.body as { query?: string; draftAnswer?: string };
      if (!query || !query.trim()) {
        res.status(400).json({ message: 'Query/Question text is required.' });
        return;
      }

      const ragResult = await runRag(query);

      const aiConfig = await resolveProviderAsync();
      if (!aiConfig || !aiConfig.apiKey) {
        res.status(502).json({
          message: 'AI Co-pilot is not configured. Please check AI API keys in settings.',
        });
        return;
      }

      const contextText = ragResult.sources
        .map((s, idx) => `[Source ${idx + 1}]: Title: ${s.title}\nContent: ${s.snippet}`)
        .join('\n\n');

      const systemPrompt = `You are an expert technical assistant co-pilot for a student Q&A forum.
Your task is to refine and enhance a user's DRAFT ANSWER using the provided RETRIEVED KNOWLEDGE CONTEXT.

Retrieved Knowledge Context:
${contextText || 'No relevant knowledge found.'}

User's Original Question:
"${query}"

User's current Draft Answer:
"${draftAnswer || '(User has not typed a draft yet - write a fresh start based on retrieved context)'}"

Instructions:
1. Improve the technical accuracy, structure, grammar, and professionalism of the draft answer.
2. Incorporate correct facts and details from the Retrieved Knowledge Context where appropriate.
3. If the retrieved context doesn't contain useful information, refine the user's draft to be grammatically correct and helpful based on general knowledge, but do not make up specific system facts or log details.
4. Keep the response concise, clear, and structured in Markdown.
5. Do not include introductory text like "Here is your refined answer:" - return ONLY the final refined markdown answer ready to be inserted.`;

      const refinedText = await chatWithConfig(aiConfig, [
        { role: 'user', content: systemPrompt }
      ]);

      res.json({
        enhancedAnswer: refinedText.trim(),
        sources: ragResult.sources,
      });
    } catch (err) {
      res.status(500).json({ message: 'AI Co-pilot refinement failed.', error: (err as Error).message });
    }
  }
);

export default router;
