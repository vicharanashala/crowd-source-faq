import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminOnly } from '../../middleware/admin.js';
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

const router = Router();

// Tight rate limiter for the unauthenticated suggest endpoint — prevents FAQ enumeration
const suggestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many suggest requests, please try again after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public search ──────────────────────────────────────────────────────────
router.get('/trending', programScope({ required: false }), getTrending);
router.get('/suggest',  suggestLimiter, getSuggest);

// ── Semantic search (public — no auth required) ─────────────────────────────
router.post('/', programScope({ required: false }), semanticSearch);

// ── Unresolved feedback ─────────────────────────────────────────────────────
// POST: capture "not resolved" search feedback (auth optional — uses token if present)
router.post('/unresolved', submitUnresolved);

// ── Admin: unresolved search management ────────────────────────────────────
router.get('/unresolved-list',         adminOnly, getUnresolvedSearches);
router.patch('/unresolved/:id/resolve', adminOnly, resolveUnresolved);
router.delete('/unresolved/:id',         adminOnly, deleteUnresolved);
router.post('/unresolved/bulk-delete',    adminOnly, bulkDeleteUnresolved);
router.get('/unresolved-stats',          adminOnly, getUnresolvedStats);

export default router;