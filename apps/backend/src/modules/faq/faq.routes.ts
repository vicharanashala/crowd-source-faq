import { Router } from 'express';
import { synthesizeFaqFromTranscript } from './synthesis.controller.js';
import { generateQuiz, logQuizCompletion } from './quiz.controller.js';
import { generateWeeklyDigest } from './digest.controller.js';
import { translateFaq } from './translation.controller.js';
import { getFaqTts } from './tts.controller.js';

import { getAllFAQs, getFAQById, getRecentFAQs, createFAQ, updateFAQ, deleteFAQ, checkFAQMatch, getPaginatedFAQs, submitFeedback, reportFAQ, getFAQHistory, createFAQSuggestion, getFAQCategories, bulkImportFAQs } from './faq.controller.js';
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

// GET /api/faq/categories — list distinct categories for approved FAQs
// Audit fix (2026-07-02): added so `/csfaq/api/faq/categories` returns 200.
router.get('/categories', getFAQCategories);

// POST /api/faq/check-match — Check if a question already exists in the FAQ (before posting on community)
router.post('/check-match', protect, checkFAQMatch);

// POST /api/faq/bulk-import — Bulk import FAQs (Admin/Moderator only)
router.post('/bulk-import', protect, authorize('admin', 'moderator'), bulkImportFAQs);

// Quiz endpoints (public)
router.get('/quiz', generateQuiz);
router.post('/quiz/log', logQuizCompletion);

// GET /api/faq/:id — Fetch a single FAQ by ID (public)
router.get('/:id', getFAQById);

// POST /api/faq/:id/translate — Translate FAQ (any logged-in user)
router.post('/:id/translate', protect, translateFaq);

// GET /api/faq/:id/tts — Stream synthesized audio of the FAQ (any logged-in user)
router.get('/:id/tts', protect, getFaqTts);


// GET /api/faq/:id/history — View verification/flag history of an FAQ (public)
router.get('/:id/history', getFAQHistory);

// POST /api/faq — Create a new FAQ (Admin/Moderator only)
router.post('/', protect, authorize('admin', 'moderator'), validateBody(createFAQSchema), createFAQ);
router.post('/synthesize', protect, authorize('admin', 'moderator'), synthesizeFaqFromTranscript);
router.get('/digest', protect, authorize('admin', 'moderator'), generateWeeklyDigest);

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