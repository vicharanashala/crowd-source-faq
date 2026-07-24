/**
 * admin-schedule.routes.ts — admin Schedule tab endpoints.
 *
 *   GET    /api/admin/schedule                  — list all processes
 *   GET    /api/admin/schedule/:id             — single process detail
 *   POST   /api/admin/schedule/:id/trigger     — fire once on demand
 *   PATCH  /api/admin/schedule/:id             — apply override
 *   DELETE /api/admin/schedule/:id/override    — reset to defaults
 *   GET    /api/admin/schedule/:id/history     — run history
 *   DELETE /api/admin/schedule/:id/history     — wipe history
 */
import { Router } from 'express';
import {
  listScheduledProcesses,
  getScheduledProcess,
  triggerScheduledProcess,
  patchScheduledProcess,
  resetScheduledProcess,
  getProcessHistory,
  clearProcessHistory,
} from './admin-schedule.controller.js';

const router = Router();

router.get('/', listScheduledProcesses);
router.get('/:id', getScheduledProcess);
router.post('/:id/trigger', triggerScheduledProcess);
router.patch('/:id', patchScheduledProcess);
router.delete('/:id/override', resetScheduledProcess);
router.get('/:id/history', getProcessHistory);
router.delete('/:id/history', clearProcessHistory);

export default router;