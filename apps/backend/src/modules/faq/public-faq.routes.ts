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

// ─── Public routes (all unauthenticated) ────────────────────────────────────

router.get('/popular-faqs', readLimiter, getPopularFaqs);
router.get('/recent-faqs', readLimiter, getRecentFaqs);
router.get('/category-top-faqs', readLimiter, getCategoryTopFaqs);
router.get('/categories', readLimiter, getCategories);
router.get('/search', searchLimiter, searchPublicFaqs);
router.get('/faqs/:id', readLimiter, getPublicFaqById);

router.post('/track-view', trackLimiter, trackPublicView);
router.post('/track-reading', trackLimiter, trackPublicReading);

export default router;
