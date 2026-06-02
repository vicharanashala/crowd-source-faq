import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/auth.js';
import {
  connectZoom,
  callbackZoom,
  disconnectZoom,
  zoomStatus,
} from '../controllers/zoomAuthController.js';
import {
  handleZoomChallenge,
  handleZoomWebhook,
  listMeetings,
  getMeeting,
  listInsights,
  updateInsight,
  getZoomHealthStatus,
  getZoomPublicStats,
} from '../controllers/zoomController.js';

const router = Router();

// ── Public stats (no auth) — used by HomePage to show "X meetings processed" ──
// MUST be registered before any protect middleware
router.get('/public-stats', getZoomPublicStats);

// ── OAuth (per-user) ──────────────────────────────────────────────────────────
// GET /api/zoom/auth/connect   — redirect to Zoom OAuth
// GET /api/zoom/auth/callback — Zoom OAuth redirect URI
// DELETE /api/zoom/auth/disconnect — unlink Zoom account
// GET    /api/zoom/auth/status   — check connection status
router.get('/auth/connect',    protect, authorize('admin'), connectZoom);
router.get('/auth/callback',   callbackZoom);
router.delete('/auth/disconnect', protect, authorize('admin'), disconnectZoom);
router.get('/auth/status',     protect, authorize('admin'), zoomStatus);

// ── Webhook (no auth — Zoom calls this) ───────────────────────────────────────
router.get('/webhook',  handleZoomChallenge);
router.post('/webhook', handleZoomWebhook);

// ── Admin-only CRUD ────────────────────────────────────────────────────────────
router.use(protect, authorize('admin'));

router.get('/meetings', listMeetings);
router.get('/meetings/:id', getMeeting);
router.get('/insights', listInsights);
router.put('/insights/:id', updateInsight);
router.get('/health', getZoomHealthStatus);

export default router;
