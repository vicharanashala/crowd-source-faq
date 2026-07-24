import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getProgramBySlug, getActiveProgram } from './program.controller.js';

const router = Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests.' },
});

// GET /api/programs/active — the "current" program (audit fix 2026-07-02).
// Returns the most-recent Batch with isActive: true. Registered before
// the :slug route so "active" isn't parsed as a slug.
router.get('/active', publicLimiter, getActiveProgram);

// v1.69 — public program page. Returns the program data + the
// ProgramSettings (or defaults) so the page renders fully on one
// round-trip.
router.get('/:slug', publicLimiter, getProgramBySlug);

export default router;
