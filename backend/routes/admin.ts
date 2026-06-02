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
} from '../controllers/adminController';
import {
  getCommunityPendingFAQs,
  promoteFAQ,
  objectToFAQ,
} from '../services/promotionService.js';
import {
  get2FAStatus,
  setup2FA,
  enable2FA,
  disable2FA,
  verify2FA,
} from '../controllers/admin2faController';
import {
  getUnresolvedSearches,
  resolveUnresolved,
  getUnresolvedStats,
} from '../controllers/unresolvedSearchController';
import {
  getEscalated,
  verifyEscalatedFAQ,
  dismissEscalatedFAQ,
} from '../controllers/freshnessController';
import {
  getEscalatedPosts,
  resolveEscalatedPost,
  dismissEscalatedPost,
  getEscalationHistory,
} from '../controllers/escalationController.js';
import {
  getAiConfig,
  updateAiConfig,
  resetAiUsage,
  getAiProviders,
  testProvider,
} from '../controllers/aiController.js';

const router = Router();

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

// AI configuration management
router.get('/ai/config',       getAiConfig);
router.patch('/ai/config',    updateAiConfig);
router.post('/ai/config/reset-usage', resetAiUsage);
router.get('/ai/providers',   getAiProviders);
router.get('/ai/providers/test', testProvider);

router.post('/faq', createFAQ);
router.post('/faq/approve', approveFAQ);
router.post('/faq/reject', rejectFAQ);
router.put('/faq/:id', updateFAQ);
router.delete('/faq/:id', deleteFAQ);
router.delete('/community/:id', deleteCommunityPost);

// FAQ promotion management (trust levels)
router.get('/faqs/community-pending', getCommunityPendingFAQs);
router.post('/faqs/:id/promote', promoteFAQ);
router.post('/faqs/:id/object', objectToFAQ);

export default router;