/**
 * adminAudit.ts — Admin routes for AI FAQ audit.
 *
 * GET  /admin/audit/stats     — aggregate audit stats
 * GET  /admin/audit/results   — paginated audit history
 * POST /admin/audit/faqs      — trigger audit (manual)
 */
import { Router } from 'express';
import { runFAQAudit, getAuditResults, getAuditStats } from '../faq/faq-audit.controller.js';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';

const router = Router();

router.use(protect);
router.use(authorize('admin', 'moderator'));

router.get('/audit/stats',    getAuditStats);
router.get('/audit/results',  getAuditResults);
router.post('/audit/faqs',    runFAQAudit);

export default router;