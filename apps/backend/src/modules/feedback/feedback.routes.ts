/**
 * feedback.routes.ts
 *
 * Routes for the AI Quality Feedback System (Feature 3).
 *
 * Public endpoint:
 *   POST /feedback                — submit a thumbs-up / thumbs-down / optional
 *                                   free-text comment for an AI-generated
 *                                   answer. The body may also include a
 *                                   snapshot of the citations the user saw
 *                                   and an explainability payload (provider,
 *                                   modelName, confidence, latency, retrieval
 *                                   counts). Rate-limited per IP + per user
 *                                   so a runaway script can't poison the
 *                                   dataset.
 *
 * Admin endpoints (admin / ai_moderator only):
 *   GET  /feedback                — paginated list with filters.
 *   GET  /feedback/stats          — aggregate counts + per-provider averages.
 *   GET  /feedback/export         — CSV export for offline analysis.
 *   POST /feedback/flush          — graceful-shutdown helper (currently a
 *                                   no-op since writes are synchronous; left
 *                                   in place so a future buffered-write
 *                                   implementation can plug in without
 *                                   changing the shutdown plumbing).
 *
 * Mount: registered under `/csfaq/api/feedback` by bootstrap/routes.ts.
 */
import { Router, type Request, type Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';
import { programScope } from '../../middleware/programScope.js';
import {
  submitFeedback,
  getFeedbackStats,
  listFeedback,
  exportFeedback,
  flushFeedbackBuffers,
} from './feedback.controller.js';
import { adminLog } from '../../utils/http/logger.js';

const router = Router();

// ── Per-IP + per-user feedback rate limit ────────────────────────────────────
// 30 submits per minute is plenty for real users (an active power user
// might hit "thumbs down" on ~10 answers in that window) and caps abuse
// at 30 votes/min/IP. Authenticated users key by user id so multiple
// people behind the same NAT don't share a bucket.
const feedbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req: Request) => {
    const userId = (req as Request & { user?: { _id?: unknown } }).user?._id;
    return userId
      ? `user:${String(userId)}`
      : `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many feedback submissions. Please slow down.' },
});

/**
 * Public — submit feedback for an AI answer.
 *
 * Body:
 *   {
 *     question:   string                  (required)
 *     helpful:    boolean                 (required)
 *     category?:  string                  (required when helpful=false)
 *     comment?:   string                  (≤ 2000 chars)
 *     pipeline?:  'search'|'ask_ai'|'auto_answer'|'faq_audit'|'other'
 *     answerId?:  string                  (server hashes question +
 *                                          provider + model + confidence
 *                                          if absent)
 *     provider?:  string                  (≤ 64 chars, e.g. "openai")
 *     modelName?: string                  (≤ 128 chars, e.g. "gpt-4o-mini")
 *     confidence?:number                  ([0,1])
 *     latencyMs?: number
 *     citations?: Array<{
 *       id:         string
 *       title:      string
 *       sourceType: 'FAQ'|'Document'|'Zoom'|'KnowledgeBase'
 *       similarity: number
 *       section?:   string
 *     }>
 *     explainability?: {
 *       confidence:          number
 *       provider:            string
 *       modelName:           string
 *       latencyMs:           number
 *       documentsRetrieved:  number
 *       documentsUsed:       number
 *       vectorScore:         number
 *       keywordScore:        number
 *       duplicateDetected:   boolean
 *     }
 *     sessionId?: string
 *     questionId?: string                  (Mongo ObjectId of related post)
 *     batchId?:    string                  (program scope)
 *   }
 */
router.post('/', feedbackLimiter, submitFeedback);

/**
 * Admin — paginated list of feedback rows.
 * Query: ?page=&limit=&helpful=&category=&provider=&pipeline=&fromDate=&toDate=
 */
router.get(
  '/',
  protect,
  authorize('admin', 'ai_moderator'),
  programScope,
  listFeedback,
);

/**
 * Admin — aggregate stats (overall helpful-rate, category breakdown,
 * provider breakdown, confidence buckets, top reported questions,
 * 30-day timeline). Query: ?fromDate=&toDate=
 */
router.get(
  '/stats',
  protect,
  authorize('admin', 'ai_moderator'),
  programScope,
  getFeedbackStats,
);

/**
 * Admin — CSV export. Streams the filtered feedback rows directly to
 * the response without buffering the full result in memory.
 */
router.get(
  '/export',
  protect,
  authorize('admin', 'ai_moderator'),
  programScope,
  exportFeedback,
);

/**
 * Admin — force-flush any buffered feedback writes (graceful-shutdown helper).
 */
router.post(
  '/flush',
  protect,
  authorize('admin', 'ai_moderator'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await flushFeedbackBuffers();
      res.json({ message: 'Feedback buffers flushed' });
    } catch (err) {
      adminLog.warn(`[feedback] flush failed: ${(err as Error).message}`);
      res.status(500).json({ message: 'Flush failed' });
    }
  },
);

export default router;