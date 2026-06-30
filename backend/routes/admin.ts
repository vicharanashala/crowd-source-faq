import { Router } from 'express';
import { adminOnly } from '../middleware/admin.js';
import {
  getStats,
  getFaqGrowth,
  getTopCategories,
  getSearchInsights,
  getUsers,
  getAdminFAQs,
  approveFAQ,
  rejectFAQ,
  updateFAQ,
  deleteFAQ,
  createFAQ,
  getReports,
  getActivityFeed,
  getUserActivityChart,
  getCommunityPosts,
  deleteCommunityPost,
} from '../controllers/adminController.js';
import {
  getCommunityPendingFAQs,
  promoteFAQ,
  objectToFAQ,
  getPromotionQueue,
} from '../services/promotionService.js';
import {
  triggerAIReview,
  triggerAIReviewBatch,
} from '../controllers/aiPromotionController.js';

import {
  getUnresolvedSearches,
  resolveUnresolved,
  getUnresolvedStats,
} from '../controllers/unresolvedSearchController.js';
import {
  getEscalated,
  verifyEscalatedFAQ,
  dismissEscalatedFAQ,
} from '../controllers/freshnessController.js';
import {
  getEscalatedPosts,
  resolveEscalatedPost,
  dismissEscalatedPost,
  getEscalationHistory,
} from '../controllers/escalationController.js';
import {
  listGoldenTickets,
  resolveGoldenTicket,
  rejectGoldenTicket,
  banAndRejectGoldenTicket,
} from '../controllers/goldenTicketAdminController.js';
import {
  getAiConfig,
  updateAiConfig,
  resetAiUsage,
  getAiProviders,
  testProvider,
  revealApiKey,
} from '../controllers/aiConfigController.js';

import adminProjectsRoutes from './adminProjects.js';

const router = Router();

router.use('/projects', adminProjectsRoutes);

router.use(adminOnly);

router.get('/stats', getStats);
router.get('/faq-growth', getFaqGrowth);
router.get('/top-categories', getTopCategories);
router.get('/search-insights', getSearchInsights);
router.get('/users', getUsers);
router.get('/faqs', getAdminFAQs);
router.get('/reports', getReports);
router.get('/activity-feed', getActivityFeed);
router.get('/user-activity-chart', getUserActivityChart);
router.get('/community/posts', getCommunityPosts);


// Unresolved search management
router.get('/search/unresolved-list',         getUnresolvedSearches);
router.get('/search/unresolved-stats',        getUnresolvedStats);
router.patch('/search/unresolved/:id/resolve', resolveUnresolved);

// Escalated FAQ management (freshness system)
router.get('/escalated',                       getEscalated);
router.post('/escalated/:id/verify',           verifyEscalatedFAQ);
router.post('/escalated/:id/dismiss',          dismissEscalatedFAQ);

// Escalated community post management
router.get('/community/escalated-posts',        getEscalatedPosts);
router.post('/community/escalated-posts/:id/resolve',  resolveEscalatedPost);
router.post('/community/escalated-posts/:id/dismiss',  dismissEscalatedPost);
router.get('/community/escalation-history',     getEscalationHistory);

// Golden Ticket admin workflow (v1.66) — separate from the
// /api/support/requests inbox (which now hides isGolden=true by
// default). Sort: by user's Spurti Points desc (priority triage).
router.get('/golden-tickets',                      listGoldenTickets);
router.post('/golden-tickets/:id/resolve',         resolveGoldenTicket);
router.post('/golden-tickets/:id/reject',          rejectGoldenTicket);
router.post('/golden-tickets/:id/ban',             banAndRejectGoldenTicket);

// AI configuration management
router.get('/ai/config',       getAiConfig);
router.patch('/ai/config',    updateAiConfig);
router.post('/ai/config/reset-usage', resetAiUsage);
router.get('/ai/providers',   getAiProviders);
router.get('/ai/providers/test', testProvider);
router.get('/ai/config/api-key/:provider', revealApiKey);

router.post('/faq', createFAQ);
router.post('/faq/approve', approveFAQ);
router.post('/faq/reject', rejectFAQ);
router.put('/faq/:id', updateFAQ);
router.patch('/faq/:id', updateFAQ);
router.patch('/faqs/:id', updateFAQ);
router.delete('/faq/:id', deleteFAQ);
router.delete('/community/:id', deleteCommunityPost);

// FAQ promotion management (trust levels) — from promotionService
router.get('/faqs/community-pending', getCommunityPendingFAQs);
router.post('/faqs/:id/promote', promoteFAQ);
router.post('/faqs/:id/object', objectToFAQ);
// AI review — from aiController
router.post('/community-promotions/:id/ai-review', triggerAIReview);
router.post('/community-promotions/ai-review-batch', triggerAIReviewBatch);
// Promotion queue — new endpoint showing posts with AI output
router.get('/community-promotions/queue', getPromotionQueue);

export default router;