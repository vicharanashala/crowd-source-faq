import { Router } from 'express';
import { getAllFAQs, getFAQById, getRecentFAQs, createFAQ, updateFAQ, deleteFAQ, checkFAQMatch, getPaginatedFAQs, submitFeedback, reportFAQ, getFAQHistory, createFAQSuggestion } from '../controllers/faqController.js';
import { flagFAQ, voteReview } from '../controllers/freshnessController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

// GET /api/faq — Fetch all FAQs (neatly grouped by category)
// Optional: ?page=1&limit=20&category=X returns flat paginated list instead
router.get('/', protect, getAllFAQs);

// GET /api/faq/paginated — Flat paginated list of FAQs (for large category views)
router.get('/paginated', protect, getPaginatedFAQs);

// GET /api/faq/recent — Recent approved FAQs (public, used by HomePage)
// MUST be registered before /:id route so Express doesn't treat "recent" as an id
router.get('/recent', getRecentFAQs);

// POST /api/faq/check-match — Check if a question already exists in the FAQ (before posting on community)
router.post('/check-match', protect, checkFAQMatch);

// GET /api/faq/:id — Fetch a single FAQ by ID
router.get('/:id', protect, getFAQById);

// POST /api/faq — Create a new FAQ (Admin/Moderator only)
router.post('/', protect, authorize('admin', 'moderator'), createFAQ);

// PUT /api/faq/:id — Update an existing FAQ (Admin/Moderator only)
router.put('/:id', protect, authorize('admin', 'moderator'), updateFAQ);

// DELETE /api/faq/:id — Delete an FAQ (Admin/Moderator only)
router.delete('/:id', protect, authorize('admin', 'moderator'), deleteFAQ);

// PATCH /api/faq/:id/feedback — Vote on FAQ helpfulness (any logged-in user)
router.patch('/:id/feedback', protect, submitFeedback);

// POST /api/faq/:id/report — Report an FAQ as inaccurate/outdated (any logged-in user)
router.post('/:id/report', protect, reportFAQ);

// PATCH /api/faq/:id/flag — Manually flag an FAQ as outdated (any logged-in user)
router.patch('/:id/flag', protect, flagFAQ);

// POST /api/faq/:id/vote-review — Peer vote on a flagged FAQ (any logged-in user)
router.post('/:id/vote-review', protect, voteReview);

// GET /api/faq/:id/history — Get verification/flag history of an FAQ (any logged-in user)
router.get('/:id/history', protect, getFAQHistory);

// POST /api/faq/:id/suggest — Submit a better answer suggestion for an FAQ (any logged-in user)
router.post('/:id/suggest', protect, createFAQSuggestion);

export default router;