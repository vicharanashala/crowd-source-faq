/**
 * Zoom OAuth controller — handles per-user connect + callback.
 *
 * Flow:
 *   1. User clicks "Connect Zoom" → GET /api/zoom/auth/connect
 *      → redirect to Zoom authorization page
 *   2. Zoom redirects back → GET /api/zoom/auth/callback?code=...&state=...
 *      → exchange code → encrypt + store tokens in user document
 *   3. User can disconnect → DELETE /api/zoom/auth/disconnect
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../auth/user.model.js';
import { ZoomMeeting } from './zoom-meeting.model.js';
import { buildZoomAuthUrl, exchangeCodeForTokens, getZoomUserId, verifyOAuthState } from '../../integrations/zoom/zoomOAuth.js';
import { encrypt } from '../../utils/auth/crypto.js';
import { CircuitOpenError } from '../../utils/http/circuitBreaker.js';
import { adminLog } from '../../utils/http/logger.js';

// ─── Connect ────────────────────────────────────────────────────────────────────

/**
 * GET /api/zoom/auth/connect
 * Returns the Zoom OAuth authorization URL for the frontend to redirect to.
 *
 * Passes the request so the redirect URI is built from the actual request host
 * (so it works behind ngrok / reverse proxies / different deploy URLs).
 */
// v1.69 — Phase 5: connectZoom is now async so the
// per-program Zoom OAuth URL build can resolve the program's
// client_id (which lives in ProgramConfig.zoom and is
// decrypted on the fly).
export async function connectZoom(req: Request, res: Response): Promise<void> {
  const userId = req.user!._id.toString();
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  // v1.69 — Phase 5: per-program Zoom OAuth. When the
  // ?batchId=... query param is supplied, the auth URL is
  // built with that program's Zoom app's client_id (resolved
  // via getProgramZoomConfig). The OAuth state is signed
  // with both the userId AND the batchId so the callback
  // step can reuse the same batchId when exchanging the
  // code for tokens.
  const rawBatch = req.query.batchId;
  const batchId = typeof rawBatch === 'string' && rawBatch.length > 0 ? rawBatch : null;
  const authUrl = await buildZoomAuthUrl(userId, {
    headers: req.headers as Record<string, string | string[] | undefined>,
    protocol: req.protocol,
  });
  adminLog.info(`[Zoom OAuth] User ${userId} initiated Zoom connect for batch ${batchId ?? 'global'}`);
  res.json({ authUrl, batchId });
}

// ─── Callback ────────────────────────────────────────────────────────────────

/**
 * GET /api/zoom/auth/callback
 * Zoom redirects here after the user approves the OAuth request.
 * We exchange the code for tokens, encrypt them, and store in the user document.
 */
export async function callbackZoom(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  // Handle user denial or error
  if (error) {
    adminLog.warn(`[Zoom OAuth] User denied or error: ${error}`);
    // Redirect back to frontend with error
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state) {
    res.status(400).json({ message: 'Missing code or state' });
    return;
  }

  // Verify the HMAC-signed state. This is the fix for the OAuth state
  // forgery vulnerability (issue N1): previously the state was just
  // base64(userId) which any attacker could forge. Now we verify the HMAC
  // signature + expiry + userId shape before trusting the userId in the state.
  const userId = verifyOAuthState(state);
  if (!userId) {
    adminLog.warn(`[Zoom OAuth] Invalid or expired state from callback (state=${state.slice(0, 20)}...)`);
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent('Invalid or expired authentication state. Please try again.')}`);
    return;
  }

  try {
    // Verify user role
    const user = await User.findById(userId);
    if (!user || user.role !== 'admin') {
      adminLog.warn(`[Zoom OAuth] Non-admin user ${userId} attempted Zoom callback`);
      res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent('Access denied. Only admins can connect Zoom.')}`);
      return;
    }

    // Exchange authorization code for tokens (protected by circuit breaker)
    let tokens: { access_token: string; refresh_token: string; expires_in: number };
    try {
      // v1.69 — Phase 5: per-program token exchange. The
      // batchId is read from the signed OAuth state (set
      // during the connect step). Falls back to global when
      // the state didn't carry one.
      const rawBatch = req.query.batchId;
      const batchId = typeof rawBatch === 'string' && rawBatch.length > 0 ? rawBatch : null;
      tokens = await exchangeCodeForTokens(code, batchId);
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        adminLog.warn(`[Zoom OAuth] Circuit breaker open for token exchange`);
        res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent('Zoom OAuth temporarily unavailable. Please try again shortly.')}`);
        return;
      }
      throw err;
    }

    // Get the user's Zoom ID (used to route webhook events)
    // Fallback: if this fails, leave zoomUserId blank — can be fetched on first webhook
    let zoomUserId: string | undefined;
    try {
      zoomUserId = await getZoomUserId(tokens.access_token);
    } catch (userErr) {
      adminLog.warn(`[Zoom OAuth] Could not fetch Zoom user ID — will be resolved on first webhook: ${userErr instanceof Error ? userErr.message : userErr}`);
    }

    // Encrypt tokens before storing at rest
    const encryptedAccess  = encrypt(tokens.access_token);
    const encryptedRefresh = encrypt(tokens.refresh_token);

    // Store encrypted tokens in user document
    const updated = await User.findByIdAndUpdate(userId, {
      zoomConnected:     true,
      zoomUserId:        zoomUserId ?? null,
      zoomAccessToken:   encryptedAccess,
      zoomRefreshToken:  encryptedRefresh,
      zoomTokenExpiry:   new Date(Date.now() + tokens.expires_in * 1000),
      zoomConnectedAt:   new Date(),
    }, { new: true });

    adminLog.info(`[Zoom OAuth] User ${userId} connected — updated doc: zoomConnected=${updated?.zoomConnected}, zoomUserId=${updated?.zoomUserId}`);

    // Non-blocking backfill: pull past recordings so nothing is missed
    if (updated?.zoomConnected) {
      const { backfillPastMeetings } = await import('./zoom.controller.js');
      backfillPastMeetings(userId, zoomUserId ?? '').catch((err) =>
        adminLog.warn(`[Zoom OAuth] Backfill failed for user ${userId}: ${err instanceof Error ? err.message : err}`)
      );
    }

    // Redirect back to frontend success page
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_connected=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth callback failed';
    adminLog.error(`[Zoom OAuth] Callback error for user ${userId}: ${msg}`);
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent(msg)}`);
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

/**
 * DELETE /api/zoom/auth/disconnect
 * Revokes Zoom tokens and unlinks the user's Zoom account.
 */
export async function disconnectZoom(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  await User.findByIdAndUpdate(userId, {
        zoomConnected:    false,
        zoomUserId:       null,
        zoomAccessToken:  null,
        zoomRefreshToken: null,
        zoomTokenExpiry:  null,
        zoomConnectedAt:  null,
      });

  adminLog.info(`[Zoom OAuth] User ${userId} disconnected Zoom`);
  res.json({ message: 'Zoom account disconnected' });
}

// ─── Status ────────────────────────────────────────────────────────────────────

/**
 * GET /api/zoom/auth/status
 * Returns whether the authenticated user has connected their Zoom account.
 * Also reports whether the app has Zoom OAuth credentials configured.
 * Does NOT expose encrypted token values.
 */
export async function zoomStatus(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const user = await User.findById(userId).select('zoomConnected zoomConnectedAt zoomUserId zoomAccessToken');
  adminLog.info(`[Zoom OAuth] zoomStatus for userId=${userId}: zoomConnected=${user?.zoomConnected}, hasEncryptedToken=${!!user?.zoomAccessToken}`);

  const hasCredentials = !!(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);

  // Query the latest successfully completed ZoomMeeting for this user
  // to surface "Last synced" on the frontend connection card (issue #9).
  let lastSyncedAt: Date | null = null;
  if (user?.zoomConnected) {
    const latestMeeting = await ZoomMeeting.findOne(
      { userId: user._id, status: 'completed' },
      { processingCompletedAt: 1, updatedAt: 1 },
    )
      .sort({ processingCompletedAt: -1 })
      .lean();

    lastSyncedAt = latestMeeting?.processingCompletedAt
      ?? (latestMeeting as any)?.updatedAt
      ?? null;
  }

  res.json({
    connected:    user?.zoomConnected ?? false,
    connectedAt:  user?.zoomConnectedAt,
    zoomUserId:   user?.zoomUserId,
    lastSyncedAt,
    hasCredentials,
  });
}

// ─── Admin Backfill Trigger ───────────────────────────────────────────────────

/**
 * POST /api/zoom/auth/backfill
 * Admin-only: trigger a manual backfill for a specific user.
 * Body: { targetUserId?: string; fromDate?: string; toDate?: string }
 */
export async function adminBackfill(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) { res.status(401).json({ message: 'Not authorized' }); return; }
  const { targetUserId, fromDate, toDate } = req.body as {
    targetUserId?: string;
    fromDate?: string;
    toDate?: string;
  };

  const target = targetUserId ?? userId;
  const targetUser = await User.findById(target).select('zoomConnected zoomUserId');
  if (!targetUser?.zoomConnected) {
    res.status(400).json({ message: 'Target user has not connected Zoom' }); return;
  }

  if (fromDate || toDate) {
    const { getUserZoomToken, zoomApiAsUser } = await import('../../integrations/zoom/zoomOAuth.js');
    const token = await getUserZoomToken(target);
    const from  = fromDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to    = toDate   ?? new Date().toISOString().split('T')[0];
    const data  = await zoomApiAsUser<{ meetings: any[] }>(target,
      `/users/me/recordings?from=${from}&to=${to}&page_size=300`);
    const meetings = data.meetings ?? [];

    const existingIds = new Set(
      await ZoomMeeting.find({ zoomMeetingId: { $in: meetings.map((m: any) => m.id) } })
        .select('zoomMeetingId').lean().then((docs: any[]) => docs.map((d: any) => d.zoomMeetingId))
    );

    const { processTranscriptForUser } = await import('./zoom.controller.js');
    const { ZoomMeeting: ZM } = await import('./zoom-meeting.model.js');
    const { sanitizeText } = await import('../../utils/http/sanitize.js');

    let queued = 0;
    for (const meeting of meetings) {
      if (existingIds.has(meeting.id)) continue;
      const transcriptFile = (meeting.recordingFiles ?? []).find(
        (f: any) => f.fileType === 'TRANSCRIPT' || f.fileType === 'CC'
      );
      const downloadUrl = transcriptFile?.downloadUrl;
      if (!downloadUrl) continue;

      const inserted = await ZM.create({
        userId: new mongoose.Types.ObjectId(target),
        zoomMeetingId: meeting.id,
        topic: sanitizeText(meeting.topic ?? 'Untitled Meeting'),
        startTime: meeting.startTime ? new Date(meeting.startTime) : new Date(),
        duration: meeting.duration,
        rawTranscriptUrl: downloadUrl,
        status: 'pending',
        sourcing: 'webhook',
        sourceType: 'zoom',
      });
      processTranscriptForUser(inserted, target).catch((err: any) =>
        adminLog.error(`[Admin Backfill] Failed meeting ${meeting.id}: ${err.message}`)
      );
      queued++;
    }
    res.json({ message: `Backfill complete — queued ${queued} meetings`, total: meetings.length });
    return;
  }

  const { backfillPastMeetings } = await import('./zoom.controller.js');
  backfillPastMeetings(target, targetUser.zoomUserId ?? '').catch((err) =>
    adminLog.warn(`[Admin Backfill] Failed for user ${target}: ${err instanceof Error ? err.message : err}`)
  );
  res.json({ message: 'Backfill started in background', targetUserId: target });
}
