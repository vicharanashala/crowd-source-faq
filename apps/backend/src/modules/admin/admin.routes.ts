import { Router } from 'express';
import { adminOnly } from '../../middleware/admin.js';
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
} from './admin.controller.js';
import {
  getCommunityPendingFAQs,
  promoteFAQ,
  objectToFAQ,
  getPromotionQueue,
} from '../program/promotion.service.js';
import {
  triggerAIReview,
  triggerAIReviewBatch,
} from '../ai/ai-promotion.controller.js';
import {
  get2FAStatus,
  setup2FA,
  enable2FA,
  disable2FA,
  verify2FA,
} from '../auth/admin-2fa.controller.js';
import {
  getUnresolvedSearches,
  resolveUnresolved,
  getUnresolvedStats,
} from '../search/unresolved-search.controller.js';
import {
  getEscalated,
  verifyEscalatedFAQ,
  dismissEscalatedFAQ,
} from '../faq/freshness.controller.js';
import {
  getEscalatedPosts,
  resolveEscalatedPost,
  dismissEscalatedPost,
  getEscalationHistory,
} from '../community/escalation.controller.js';
import {
  listGoldenTickets,
  resolveGoldenTicket,
  rejectGoldenTicket,
  banAndRejectGoldenTicket,
} from '../support/golden-ticket-admin.controller.js';
import {
  getAiConfig,
  updateAiConfig,
  resetAiUsage,
  getAiProviders,
  testProvider,
  revealApiKey,
} from '../ai/ai-config.controller.js';

import adminProjectsRoutes from './admin-projects.routes.js';
import { getQueueStats, getQueueJob } from './queue.controller.js';

const router = Router();

router.use(adminOnly);

router.use('/projects', adminProjectsRoutes);

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

// 2FA / TOTP management
router.get('/2fa/status',  get2FAStatus);
router.post('/2fa/setup',  setup2FA);
router.post('/2fa/enable', enable2FA);
router.post('/2fa/disable', disable2FA);
router.post('/2fa/verify', verify2FA);

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

// MongoDB-backed queue stats and per-job status (replaces BullMQ admin endpoints)
router.get('/queue/stats', getQueueStats);
router.get('/queue/jobs/:id', getQueueJob);

export default router;