import { Router } from 'express';
import { getAllFAQs, getFAQById, getRecentFAQs, createFAQ, updateFAQ, deleteFAQ, checkFAQMatch, getPaginatedFAQs, submitFeedback, reportFAQ, getFAQHistory, createFAQSuggestion } from './faq.controller.js';
import { flagFAQ, voteReview } from './freshness.controller.js';
import { protect, authorize } from '../../middleware/auth.js';
import { validateBody, createFAQSchema, updateFAQSchema, flagFAQSchema, voteReviewSchema } from '../../utils/auth/validation.js';

const router = Router();

// Public read-only routes — anonymous users can browse FAQs freely.
// (Admin/moderator actions and user-specific actions like feedback/flag
//  remain protected below.)
router.get('/', getAllFAQs);
router.get('/paginated', getPaginatedFAQs);

// GET /api/faq/recent — Recent approved FAQs (public, used by HomePage)
// MUST be registered before /:id route so Express doesn't treat "recent" as an id
router.get('/recent', getRecentFAQs);

// POST /api/faq/check-match — Check if a question already exists in the FAQ (before posting on community)
router.post('/check-match', protect, checkFAQMatch);

// GET /api/faq/:id — Fetch a single FAQ by ID (public)
router.get('/:id', getFAQById);

// GET /api/faq/:id/history — View verification/flag history of an FAQ (public)
router.get('/:id/history', getFAQHistory);

// POST /api/faq — Create a new FAQ (Admin/Moderator only)
router.post('/', protect, authorize('admin', 'moderator'), validateBody(createFAQSchema), createFAQ);

// PUT /api/faq/:id — Update an existing FAQ (Admin/Moderator only)
router.put('/:id', protect, authorize('admin', 'moderator'), validateBody(updateFAQSchema), updateFAQ);

// DELETE /api/faq/:id — Delete an FAQ (Admin/Moderator only)
router.delete('/:id', protect, authorize('admin', 'moderator'), deleteFAQ);

// PATCH /api/faq/:id/feedback — Vote on FAQ helpfulness (any logged-in user)
router.patch('/:id/feedback', protect, submitFeedback);

// POST /api/faq/:id/report — Report an FAQ as inaccurate/outdated (any logged-in user)
router.post('/:id/report', protect, reportFAQ);

// PATCH /api/faq/:id/flag — Manually flag an FAQ as outdated (any logged-in user)
router.patch('/:id/flag', protect, validateBody(flagFAQSchema), flagFAQ);

// POST /api/faq/:id/vote-review — Peer vote on a flagged FAQ (any logged-in user)
router.post('/:id/vote-review', protect, validateBody(voteReviewSchema), voteReview);

// POST /api/faq/:id/suggest — Submit a better answer suggestion for an FAQ (any logged-in user)
router.post('/:id/suggest', protect, createFAQSuggestion);

export default router;