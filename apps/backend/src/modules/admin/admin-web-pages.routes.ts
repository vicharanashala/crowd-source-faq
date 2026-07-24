/**
 * admin-web-pages.routes — Phase 5, extended in Phase 8.
 *
 * Mounts under `/admin` so the final surface is:
 *   GET    /csfaq/api/admin/web-pages
 *   POST   /csfaq/api/admin/web-pages
 *   DELETE /csfaq/api/admin/web-pages/:id
 *   PATCH  /csfaq/api/admin/web-pages/:id/approve    (Phase 8)
 *   PATCH  /csfaq/api/admin/web-pages/:id/unapprove  (Phase 8)
 *
 * All routes require auth and the admin / ai_moderator / moderator role
 * — matching the other admin mount in this directory (auto-answer).
 */
import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authShared.js';
import {
  addWebPage,
  listWebPages,
  deleteWebPage,
  approveWebPage,
  unapproveWebPage,
} from './adminWebPages.controller.js';

const router = Router();
router.use(protect);
router.use(authorize('admin', 'ai_moderator', 'moderator'));
router.get('/web-pages', listWebPages);
router.post('/web-pages', addWebPage);
router.delete('/web-pages/:id', deleteWebPage);
router.patch('/web-pages/:id/approve', approveWebPage);
router.patch('/web-pages/:id/unapprove', unapproveWebPage);
export default router;
