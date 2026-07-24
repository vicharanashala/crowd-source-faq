import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminOnly } from '../../middleware/admin.js';
import { validateObjectId } from '../../middleware/validateObjectId.js';
import {
  semanticSearch,
  getTrending,
  getSuggest,
} from './search.controller.js';
import { programScope } from '../../middleware/programScope.js';
import {
  submitUnresolved,
  getUnresolvedSearches,
  resolveUnresolved,
  getUnresolvedStats,
  deleteUnresolved,
  bulkDeleteUnresolved,
} from './unresolved-search.controller.js';
import { validateBody, searchSchema, submitUnresolvedSchema } from '../../utils/auth/validation.js';

const router = Router();

// Tight rate limiter for the unauthenticated suggest endpoint — prevents FAQ enumeration
const suggestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many suggest requests, please try again after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});

// M4-1 (MEDIUM) fix: semantic search rate limiter. The previous
// search endpoint had no rate limit despite being the most
// expensive endpoint in the system (embedding compute + vector
// search + DB queries + cache writes). 30/min per identity is
// generous for a search UI but blocks scripted abuse. Use the
// existing `ipKeyGenerator` for consistent keying with the rest
// of the rateLimit module.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many search requests. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public search ──────────────────────────────────────────────────────────
router.get('/trending', programScope({ required: false }), getTrending);
router.get('/suggest',  suggestLimiter, getSuggest);

// ── Semantic search (public — no auth required) ─────────────────────────────
// M4-1: rate-limited (see above).
// M4-2 (MEDIUM) fix: previously `req.body` was read raw inside
// `semanticSearch` with no Zod validation — `query` was unbounded
// length. Add `validateBody(searchSchema)` to bound `q` (1..200
// chars per the schema in validation.ts) and `limit` (1..50).
router.post(
  '/',
  programScope({ required: false }),
  searchLimiter,
  validateBody(searchSchema),
  semanticSearch
);

// ── Unresolved feedback ─────────────────────────────────────────────────────
// POST: capture "not resolved" search feedback (auth optional — uses token if present)
// M4-4 (MEDIUM) fix: previously the submitUnresolved controller read
// `req.body` raw with no Zod validation. The audit's M4-4 notes
// the schema `submitUnresolvedSchema` exists in validation.ts
// but was never wired. Add `validateBody(submitUnresolvedSchema)`
// so the request body is actually checked (input length, required
// `query` field, etc.). The `feedback` field that the controller
// reads is a string; the schema accepts `feedback: z.string().max(2000).optional()`.
router.post('/unresolved', validateBody(submitUnresolvedSchema), submitUnresolved);

// ── Admin: unresolved search management ────────────────────────────────────
// M4-3 (cross-cutting Pattern A) fix: validate `:id` in all
// ObjectId-bearing paths. Previously `getUnresolvedSearches` /
// `resolveUnresolved` / `deleteUnresolved` relied on the
// controller's `findById(req.params.id)` which throws a CastError
// → 500 on malformed ids. With `validateObjectId('id')` mounted
// before the controller, malformed ids return 400 cleanly.
router.get('/unresolved-list',         adminOnly, getUnresolvedSearches);
router.patch('/unresolved/:id/resolve', adminOnly, validateObjectId('id'), resolveUnresolved);
router.delete('/unresolved/:id',         adminOnly, validateObjectId('id'), deleteUnresolved);
router.post('/unresolved/bulk-delete',    adminOnly, bulkDeleteUnresolved);
router.get('/unresolved-stats',          adminOnly, getUnresolvedStats);

export default router;