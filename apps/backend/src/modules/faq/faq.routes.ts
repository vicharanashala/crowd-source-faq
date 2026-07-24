import { Router } from 'express';
import { getAllFAQs, getFAQById, getRecentFAQs, createFAQ, updateFAQ, deleteFAQ, checkFAQMatch, getPaginatedFAQs, submitFeedback, reportFAQ, getFAQHistory, createFAQSuggestion, getFAQCategories } from './faq.controller.js';
import { flagFAQ, voteReview } from './freshness.controller.js';
import { protect, authorize } from '../../middleware/auth.js';
import { validateObjectId } from '../../middleware/validateObjectId.js';
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

// GET /api/faq/categories — list distinct categories for approved FAQs
// Audit fix (2026-07-02): added so `/csfaq/api/faq/categories` returns 200.
router.get('/categories', getFAQCategories);

// POST /api/faq/check-match — Check if a question already exists in the FAQ (before posting on community)
router.post('/check-match', protect, checkFAQMatch);

// M4-3 (cross-cutting Pattern A) fix: validate `:id` on every route
// that takes an FAQ id. The previous controllers used `FAQ.findById`
// raw — malformed ids threw CastError → 500. With
// `validateObjectId('id')` mounted before each handler, malformed
// ids return a clean 400.
router.get('/:id', validateObjectId('id'), getFAQById);
router.get('/:id/history', validateObjectId('id'), getFAQHistory);

router.post('/', protect, authorize('admin', 'moderator'), validateBody(createFAQSchema), createFAQ);
router.put('/:id', protect, authorize('admin', 'moderator'), validateObjectId('id'), validateBody(updateFAQSchema), updateFAQ);
router.delete('/:id', protect, authorize('admin', 'moderator'), validateObjectId('id'), deleteFAQ);
router.patch('/:id/feedback', protect, validateObjectId('id'), submitFeedback);
router.post('/:id/report', protect, validateObjectId('id'), reportFAQ);
router.patch('/:id/flag', protect, validateObjectId('id'), validateBody(flagFAQSchema), flagFAQ);
router.post('/:id/vote-review', protect, validateObjectId('id'), validateBody(voteReviewSchema), voteReview);
router.post('/:id/suggest', protect, validateObjectId('id'), createFAQSuggestion);

export default router;