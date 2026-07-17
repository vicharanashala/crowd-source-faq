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
import { buildZoomAuthUrl, exchangeCodeForTokens, getProgramZoomConfig, getZoomUserId, verifyOAuthState } from '../../integrations/zoom/zoomOAuth.js';
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
  try {
    const built = await buildZoomAuthUrl(userId, {
      headers: req.headers as Record<string, string | string[] | undefined>,
      protocol: req.protocol,
    });
    // PKCE — the codeVerifier is embedded in the signed state (returned
    // here for parity with the older single-return-value callers; the
    // auth URL alone is what the frontend needs to redirect).
    const authUrl = built.url;
    void built.codeVerifier;
    adminLog.info(`[Zoom OAuth] User ${userId} initiated Zoom connect for batch ${batchId ?? 'global'}`);
    res.json({ authUrl, batchId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Zoom connect failed';
    adminLog.warn(`[Zoom OAuth] connect failed for user ${userId} (batch=${batchId ?? 'global'}): ${msg}`);
    // v1.85 — distinguish between "this is a config issue the
    // operator must fix" (env vars missing, decryption failed) and
    // a genuine server bug. The former returns 503 + a structured
    // `errorCode` so the admin page can surface a useful message
    // instead of a generic "Server error". `Missing ZOOM_CLIENT_ID
    // env var` and `Missing ZOOM_CLIENT_SECRET env var` come from
    // `getProgramZoomConfig` when neither the per-program doc nor
    // the env-var fallback is configured.
    const lower = msg.toLowerCase();
    const isConfigIssue =
      lower.includes('missing zoom_client_id') ||
      lower.includes('missing zoom_client_secret') ||
      lower.includes('failed to decrypt') ||
      // The state HMAC throws one of:
      //   'OAUTH_STATE_SECRET (or legacy JWT_SECRET) required to sign OAuth state'
      //   'Missing OAUTH_STATE_SECRET...' (any casing). Match the
      // substrings rather than the exact phrase so we catch both.
      lower.includes('oauth_state_secret') ||
      lower.includes('jwt_secret');
    if (isConfigIssue) {
      let errorCode: string;
      let remediation: string;
      if (lower.includes('decrypt')) {
        errorCode = 'decryption_failed';
        remediation =
          'A per-program Zoom credential is encrypted with a key the runtime can\'t decrypt. ' +
          'Either re-save the per-program Zoom credentials in Admin → Programs → Zoom Settings, ' +
          'or restore the JWT_SECRET (or crypto key) that originally encrypted them.';
      } else if (lower.includes('oauth_state_secret') || lower.includes('jwt_secret')) {
        errorCode = 'oauth_state_secret_missing';
        remediation =
          'Set OAUTH_STATE_SECRET (or the legacy JWT_SECRET) on the backend. ' +
          'Without it, the OAuth state HMAC cannot be signed. ' +
          'If you use Infisical/Vault/etc., add the var to the secret store and redeploy.';
      } else {
        errorCode = 'zoom_credentials_missing';
        remediation =
          'Either set ZOOM_CLIENT_ID + ZOOM_CLIENT_SECRET env vars on the backend, ' +
          'or store per-program Zoom credentials via Admin → Programs → Zoom Settings.';
      }
      res.status(503).json({
        message: 'zoom connect failed — server not configured',
        error: msg,
        errorCode,
        remediation,
      });
      return;
    }
    res.status(500).json({ message: 'zoom connect failed', error: msg });
  }
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
  // PKCE — the state also carries the code_verifier that the connect
  // step generated; we recover it here and forward it to the token
  // exchange so Zoom can verify it matches the challenge sent in the
  // authorize URL.
  const statePayload = verifyOAuthState(state);
  if (!statePayload) {
    adminLog.warn(`[Zoom OAuth] Invalid or expired state from callback (state=${state.slice(0, 20)}...)`);
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent('Invalid or expired authentication state. Please try again.')}`);
    return;
  }
  const { userId, codeVerifier } = statePayload;

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
      tokens = await exchangeCodeForTokens(code, batchId, codeVerifier);
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

// ─── Zoom Diagnostics (admin) ────────────────────────────────────────────────

interface ZoomEnvVarSnapshot {
  /** Stable identifier used by the admin UI to render the row. */
  name: string;
  /** Whether the variable is set (non-empty) in process.env. */
  present: boolean;
  /** True when the variable is the one the runtime will actually
   *  read for its purpose (e.g. OAUTH_STATE_SECRET wins over
   *  JWT_SECRET for the state HMAC). */
  used: boolean;
  /** Length, for diagnostics. Never includes the value. */
  length?: number;
  /** Short human-readable description. */
  purpose: string;
  /** When present and !used, explains why this env var is
   *  present but not the active one (e.g. "OAUTH_STATE_SECRET is
   *  set so this is ignored"). */
  note?: string;
}

interface PerProgramZoomOverride {
  batchId: string;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasWebhookToken: boolean;
  /** True when the doc round-trip (findOne + select+cipher) was
   *  successful — false when the doc existed but decrypt threw. */
  decryptOk: boolean;
  decryptError?: string;
}

interface ZoomResolutionProbe {
  /** The result of running getProgramZoomConfig(null) — i.e. the
   *  global env-var fallback path. */
  global: { ok: true; clientId: string; source: 'env' } | { ok: false; error: string } | null;
  /** A sample per-program lookup (if any program has overrides). */
  sampleProgram: { batchId: string; clientId: string; source: 'program' } | { batchId: string; error: string } | null;
  /** The effective redirect URI the runtime will use. */
  effectiveRedirectUri: string;
}

interface ZoomDiagnosticsResponse {
  ok: boolean;
  /** Aggregate config health — true when every required env var
   *  is present and the global resolution probe succeeds. The
   *  admin UI uses this to flip the "Zoom configured" pill
   *  green/red without re-deriving from each row. */
  envVars: ZoomEnvVarSnapshot[];
  perProgram: PerProgramZoomOverride[];
  resolution: ZoomResolutionProbe;
  /** Plain-English summary for the admin UI status bar. */
  summary: string;
}

/**
 * GET /api/zoom/auth/diagnostics
 *
 * Reports the live state of every Zoom-related env var + the
 * per-program override rows + a resolution probe. The point of
 * this endpoint is to give the admin UI a single, structured,
 * never-500 snapshot so the operator can see "which env var is
 * missing on prod" without grepping server logs.
 *
 * Auth: admin-only (the existing `protect + authorize('admin')`
 * middleware gates the route in zoom.routes.ts).
 *
 * Security: this endpoint never exposes env values, only
 * presence + length. A future "reveal" endpoint (gated by an
 * audit log) would be needed to inspect a value. The decrypt
 * probe on per-program rows is allowed because it's already
 * attempted by the runtime on every connect — exposing that
 * a decrypt failed doesn't leak anything the runtime
 * doesn't already know.
 */
export async function getZoomDiagnostics(_req: Request, res: Response): Promise<void> {
  const envVars: ZoomEnvVarSnapshot[] = [];

  // ── 1. Required for any Zoom flow ───────────────────────────────────
  const zoomClientId = (process.env.ZOOM_CLIENT_ID ?? '').trim();
  const zoomClientSecret = (process.env.ZOOM_CLIENT_SECRET ?? '').trim();
  envVars.push(
    {
      name: 'ZOOM_CLIENT_ID',
      present: !!zoomClientId,
      used: true,
      length: zoomClientId.length || undefined,
      purpose: 'Global Zoom app client ID (used when no per-program override is set).',
    },
    {
      name: 'ZOOM_CLIENT_SECRET',
      present: !!zoomClientSecret,
      used: true,
      length: zoomClientSecret.length || undefined,
      purpose: 'Global Zoom app client secret. Pair with ZOOM_CLIENT_ID.',
    },
  );

  // ── 2. Optional, with dynamic default ──────────────────────────────
  const zoomRedirect = (process.env.ZOOM_REDIRECT_URI ?? '').trim();
  envVars.push({
    name: 'ZOOM_REDIRECT_URI',
    present: !!zoomRedirect,
    used: !!zoomRedirect,
    length: zoomRedirect.length || undefined,
    purpose:
      'Override the OAuth redirect URI. If unset, the runtime builds it dynamically from the incoming request host.',
  });

  // ── 3. Webhook signature verification ─────────────────────────────
  const webhookToken = (process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? '').trim();
  envVars.push({
    name: 'ZOOM_WEBHOOK_SECRET_TOKEN',
    present: !!webhookToken,
    used: true,
    length: webhookToken.length || undefined,
    purpose:
      'Used to verify Zoom webhook signatures. Required in production (NODE_ENV != "development").',
  });

  // ── 4. OAuth state HMAC secret ─────────────────────────────────────
  const oauthStateSecret = (process.env.OAUTH_STATE_SECRET ?? '').trim();
  const jwtSecret = (process.env.JWT_SECRET ?? '').trim();
  const usingOAuthState = !!oauthStateSecret;
  envVars.push(
    {
      name: 'OAUTH_STATE_SECRET',
      present: !!oauthStateSecret,
      used: usingOAuthState,
      length: oauthStateSecret.length || undefined,
      purpose:
        'Dedicated HMAC secret for OAuth state tokens. Recommended. Falls back to JWT_SECRET if unset.',
    },
    {
      name: 'JWT_SECRET',
      present: !!jwtSecret,
      // JWT_SECRET is "used" for the state HMAC only when the
      // dedicated OAUTH_STATE_SECRET is missing. It's always used
      // for auth (we just don't surface that here — not relevant
      // to Zoom config).
      used: !!jwtSecret && !usingOAuthState,
      length: jwtSecret.length || undefined,
      purpose:
        'Auth + state-HMAC fallback. The runtime uses JWT_SECRET for the state HMAC only when OAUTH_STATE_SECRET is unset.',
      note: !usingOAuthState && !!jwtSecret
        ? 'Currently used as the state HMAC secret because OAUTH_STATE_SECRET is unset. Set OAUTH_STATE_SECRET to rotate independently of JWT signing.'
        : undefined,
    },
  );

  // ── 5. Per-program overrides ──────────────────────────────────────
  const perProgram: PerProgramZoomOverride[] = [];
  try {
    const { default: ProgramConfig } = await import('../program/program-config.model.js');
    // Only fetch the rows that have a zoom clientId — the rest
    // are not using per-program credentials. The decrypt probe
    // is run inline so we can surface "decrypt failed" without
    // crashing the diagnostic response.
    const docs = await ProgramConfig.find({
      'zoom.clientId': { $exists: true, $ne: '' },
    })
      .select('batchId +zoom.clientSecret +zoom.webhookSecretToken')
      .lean();
    for (const doc of docs) {
      const batchId = String(doc.batchId);
      const entry: PerProgramZoomOverride = {
        batchId,
        hasClientId: !!doc.zoom?.clientId,
        hasClientSecret: !!doc.zoom?.clientSecret,
        hasWebhookToken: !!doc.zoom?.webhookSecretToken,
        decryptOk: true,
      };
      if (doc.zoom?.clientSecret) {
        try {
          const { decrypt } = await import('../../utils/auth/crypto.js');
          decrypt(doc.zoom.clientSecret);
        } catch (err) {
          entry.decryptOk = false;
          entry.decryptError = (err as Error).message.slice(0, 200);
        }
      }
      perProgram.push(entry);
    }
  } catch (err) {
    adminLog.warn(`[zoom-diagnostics] per-program probe failed: ${(err as Error).message}`);
  }

  // ── 6. Resolution probe — does the runtime work? ──────────────────
  const resolution: ZoomResolutionProbe = {
    global: null,
    sampleProgram: null,
    effectiveRedirectUri: '',
  };
  try {
    const globalCfg = await getProgramZoomConfig(null);
    resolution.global = { ok: true, clientId: globalCfg.clientId, source: 'env' };
  } catch (err) {
    resolution.global = { ok: false, error: (err as Error).message.slice(0, 200) };
  }
  // Try the first per-program row to confirm the decryption path
  // works end-to-end. Skip if there are no per-program rows.
  if (perProgram.length > 0 && perProgram[0].decryptOk) {
    try {
      const cfg = await getProgramZoomConfig(perProgram[0].batchId);
      resolution.sampleProgram = {
        batchId: perProgram[0].batchId,
        clientId: cfg.clientId,
        source: 'program',
      };
    } catch (err) {
      resolution.sampleProgram = { batchId: perProgram[0].batchId, error: (err as Error).message.slice(0, 200) };
    }
  }
  resolution.effectiveRedirectUri =
    process.env.ZOOM_REDIRECT_URI ?? 'http://localhost:6767/csfaq/api/zoom/auth/callback';

  // ── 7. Aggregate summary ──────────────────────────────────────────
  const missingRequired = envVars
    .filter((v) => v.purpose.startsWith('Global Zoom app') && !v.present)
    .map((v) => v.name);
  const globalOk = resolution.global && 'ok' in resolution.global && resolution.global.ok;
  const ok = missingRequired.length === 0 && !!globalOk;
  const summary = ok
    ? 'Zoom is fully configured.'
    : missingRequired.length > 0
      ? `Missing required env vars: ${missingRequired.join(', ')}.`
      : !globalOk
        ? `Global resolution failed: ${resolution.global && 'error' in resolution.global ? resolution.global.error : 'unknown'}`
        : 'Partial config — see rows below.';

  const response: ZoomDiagnosticsResponse = {
    ok,
    envVars,
    perProgram,
    resolution,
    summary,
  };
  res.json(response);
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
