import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/auth.js';
import {
  connectZoom,
  callbackZoom,
  disconnectZoom,
  zoomStatus,
  adminBackfill,
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
  convertInsightToFAQ,
  uploadTranscript,
  getMeetingProgress,
  listDeadLetterMeetings,
  retryMeeting,
} from '../controllers/zoomController.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
});

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
router.post('/auth/backfill',  protect, authorize('admin'), adminBackfill);

// ── Webhook (no auth — Zoom calls this) ───────────────────────────────────────
router.get('/webhook',  handleZoomChallenge);
router.post('/webhook', handleZoomWebhook);

// ── Admin-only CRUD ────────────────────────────────────────────────────────────
router.use(protect, authorize('admin'));

router.get('/meetings', listMeetings);
router.get('/meetings/:id', getMeeting);
router.get('/meetings/:id/progress', getMeetingProgress);
router.post('/meetings/:id/retry', retryMeeting);
router.get('/insights', listInsights);
router.put('/insights/:id', updateInsight);
router.post('/insights/:id/convert-to-faq', convertInsightToFAQ);
router.post('/upload-transcript', upload.single('file'), uploadTranscript);
router.get('/health', getZoomHealthStatus);
router.get('/dead-letter', listDeadLetterMeetings);

export default router;
