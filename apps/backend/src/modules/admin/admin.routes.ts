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
import { triggerAIReview, triggerAIReviewBatch } from '../ai/ai-promotion.controller.js';
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
  reResolveGoldenTicket,
  getGoldenTicketLogs,
  reopenGoldenTicket,
  deleteGoldenResolution,
} from '../support/golden-ticket-admin.controller.js';
import {
  getAiConfig,
  updateAiConfig,
  resetAiUsage,
  getAiProviders,
  testProvider,
  testFeature,
  revealApiKey,
  listProviderModels,
  getProviderKeys,
  putProviderKeys,
  deleteProviderKeys,
} from '../ai/ai-config.controller.js';
import {
  listAiApiLogs,
  getAiApiLogStats,
  getAiApiLogById,
  exportAiApiLogs,
  previewAiApiLogCleanup,
  cleanupAiApiLogs,
} from '../ai/ai-api-call.controller.js';

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
router.get('/2fa/status', get2FAStatus);
router.post('/2fa/setup', setup2FA);
router.post('/2fa/enable', enable2FA);
router.post('/2fa/disable', disable2FA);
router.post('/2fa/verify', verify2FA);

// Unresolved search management
router.get('/search/unresolved-list', getUnresolvedSearches);
router.get('/search/unresolved-stats', getUnresolvedStats);
router.patch('/search/unresolved/:id/resolve', resolveUnresolved);

// Escalated FAQ management (freshness system)
router.get('/escalated', getEscalated);
router.post('/escalated/:id/verify', verifyEscalatedFAQ);
router.post('/escalated/:id/dismiss', dismissEscalatedFAQ);

// Escalated community post management
router.get('/community/escalated-posts', getEscalatedPosts);
router.post('/community/escalated-posts/:id/resolve', resolveEscalatedPost);
router.post('/community/escalated-posts/:id/dismiss', dismissEscalatedPost);
router.get('/community/escalation-history', getEscalationHistory);

// Golden Ticket admin workflow (v1.66) — separate from the
// /api/support/requests inbox (which now hides isGolden=true by
// default). Sort: by user's Spurti Points desc (priority triage).
router.get('/golden-tickets', listGoldenTickets);
router.get('/golden-tickets/:id/logs', getGoldenTicketLogs);
router.post('/golden-tickets/:id/resolve', resolveGoldenTicket);
router.post('/golden-tickets/:id/reject', rejectGoldenTicket);
router.post('/golden-tickets/:id/ban', banAndRejectGoldenTicket);
// v1.70 — append an additional answer to an already-Resolved
// ticket. SP is never charged again. In-app bell only.
router.post('/golden-tickets/:id/re-resolve', reResolveGoldenTicket);
// v1.72 — reopen a Resolved ticket. Status flips back to
// Pending, history preserved, no SP movement, no user notification.
router.post('/golden-tickets/:id/reopen', reopenGoldenTicket);
// v1.72 — remove a single prior resolution (admin cleanup
// before posting a fresh answer).
router.delete('/golden-tickets/:id/resolutions/:resIdx', deleteGoldenResolution);

// AI configuration management
router.get('/ai/config', getAiConfig);
router.patch('/ai/config', updateAiConfig);
router.post('/ai/config/reset-usage', resetAiUsage);
router.get('/ai/providers', getAiProviders);
router.get('/ai/providers/test', testProvider);
router.get('/ai/providers/models', listProviderModels);
router.post('/ai/test-feature', testFeature);

// AI API call audit log (per-call observability for the model browser + every
// chat/embedding request). Admin-only; surfaces as "AI API Logs" page.
router.get('/ai/api-logs', listAiApiLogs);
router.get('/ai/api-logs/stats', getAiApiLogStats);
router.get('/ai/api-logs/:id', getAiApiLogById);
router.get('/ai/api-logs/export', exportAiApiLogs);
router.post('/ai/api-logs/cleanup/preview', previewAiApiLogCleanup);
router.post('/ai/api-logs/cleanup', cleanupAiApiLogs);
router.get('/ai/config/api-key/:provider', revealApiKey);

// v1.83 — Multi-API-key rotation endpoints. Scoped per-provider so the
// frontend can refetch / replace / clear without re-sending the full
// provider config alongside.
router.get('/ai/provider-keys/:provider', getProviderKeys);
router.put('/ai/provider-keys/:provider', putProviderKeys);
router.delete('/ai/provider-keys/:provider', deleteProviderKeys);

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
