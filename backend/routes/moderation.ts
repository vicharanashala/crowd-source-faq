import { Router } from 'express';
import { adminOnly } from '../middleware/admin.js';
import { banUser, unbanUser, suspendUser, unsuspendUser, warnUser, softDeleteUser, getModerationLogs, getModerationQueue } from '../controllers/moderationController.js';
import { validateBody, banUserSchema, suspendUserSchema, warnUserSchema, softDeleteSchema } from '../utils/validation.js';

const router = Router();
router.use(adminOnly);

router.get('/queue', getModerationQueue);
router.get('/logs', getModerationLogs);
router.post('/ban', validateBody(banUserSchema), banUser);
router.post('/unban', validateBody(banUserSchema), unbanUser);
router.post('/suspend', validateBody(suspendUserSchema), suspendUser);
router.post('/unsuspend', validateBody(softDeleteSchema), unsuspendUser);
router.post('/warn', validateBody(warnUserSchema), warnUser);
router.post('/soft-delete', validateBody(softDeleteSchema), softDeleteUser);

export default router;
