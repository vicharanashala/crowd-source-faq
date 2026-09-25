import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getPopularFaqs,
  getRecentFaqs,
  getCategoryTopFaqs,
  getCategories,
  getPublicFaqById,
  searchPublicFaqs,
  trackPublicView,
  trackPublicReading,
} from './public-faq.controller.js';
import { optionalAuth } from '../../middleware/auth.js';
import { programScope, enforceProgramMembership } from '../../middleware/programScope.js';

const router = Router();

// ─── Rate limiters ──────────────────────────────────────────────────────────

// Read endpoints: 200 req / 15 min per IP. Generous — the public page is
// expected to be the most-trafficked surface on the site. Soft cap, not a
// hard ceiling.
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});

// Tracking endpoints: 120 req / min per IP. High enough for one open tab
// sending periodic read events, low enough to keep analytics amplification
// from being a DDoS vector.
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many tracking events. Please slow down.' },
});

// Search has a tighter limit — full-table regex scan per request.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many search requests. Please slow down.' },
});

// ─── Public routes (unauthenticated visitors stay unauthenticated) ─────────
//
// Security fix (2026-09-25): also used from inside the logged-in app
// (HomePage) with a `?batchId=` from the program switcher. optionalAuth
// + enforceProgramMembership recognize a signed-in caller and 403 them
// if they request a batch they're not enrolled in; true anonymous
// visitors are untouched since there's no `req.user` to check.
const scopeToOwnProgram = [optionalAuth, programScope(), enforceProgramMembership()];

router.get('/popular-faqs', readLimiter, ...scopeToOwnProgram, getPopularFaqs);
router.get('/recent-faqs', readLimiter, ...scopeToOwnProgram, getRecentFaqs);
router.get('/category-top-faqs', readLimiter, ...scopeToOwnProgram, getCategoryTopFaqs);
router.get('/categories', readLimiter, ...scopeToOwnProgram, getCategories);
router.get('/search', searchLimiter, ...scopeToOwnProgram, searchPublicFaqs);
router.get('/faqs/:id', readLimiter, getPublicFaqById);

router.post('/track-view', trackLimiter, trackPublicView);
router.post('/track-reading', trackLimiter, trackPublicReading);

export default router;
