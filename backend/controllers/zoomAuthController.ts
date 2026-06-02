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
import User from '../models/User.js';
import { buildZoomAuthUrl, exchangeCodeForTokens, getZoomUserId } from '../utils/zoomOAuth.js';
import { encrypt } from '../utils/crypto.js';
import { zoomOAuthCircuit, CircuitOpenError } from '../utils/circuitBreaker.js';
import { sanitizeBase64, sanitizeText } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';

// ─── Connect ────────────────────────────────────────────────────────────────────

/**
 * GET /api/zoom/auth/connect
 * Returns the Zoom OAuth authorization URL for the frontend to redirect to.
 */
export function connectZoom(req: Request, res: Response): void {
  const userId = req.user!._id.toString();
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const authUrl = buildZoomAuthUrl(userId);
  logger.info(`[Zoom OAuth] User ${userId} initiated Zoom connect`);
  res.json({ authUrl });
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
    logger.warn(`[Zoom OAuth] User denied or error: ${error}`);
    // Redirect back to frontend with error
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code || !state) {
    res.status(400).json({ message: 'Missing code or state' });
    return;
  }

  // Sanitize and decode the user's internal ID from the state param
  let userId: string;
  try {
    const safeState = sanitizeBase64(state);
    userId = Buffer.from(safeState, 'base64').toString('utf8');
  } catch {
    res.status(400).json({ message: 'Invalid state parameter' });
    return;
  }

  if (!userId) {
    res.status(400).json({ message: 'Invalid state parameter' });
    return;
  }

  try {
    // Verify user role
    const user = await User.findById(userId);
    if (!user || user.role !== 'admin') {
      logger.warn(`[Zoom OAuth] Non-admin user ${userId} attempted Zoom callback`);
      res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_error=${encodeURIComponent('Access denied. Only admins can connect Zoom.')}`);
      return;
    }

    // Exchange authorization code for tokens (protected by circuit breaker)
    let tokens: { access_token: string; refresh_token: string; expires_in: number };
    try {
      tokens = await exchangeCodeForTokens(code);
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        logger.warn(`[Zoom OAuth] Circuit breaker open for token exchange`);
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
      logger.warn(`[Zoom OAuth] Could not fetch Zoom user ID — will be resolved on first webhook: ${userErr instanceof Error ? userErr.message : userErr}`);
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

    logger.info(`[Zoom OAuth] User ${userId} connected — updated doc: zoomConnected=${updated?.zoomConnected}, zoomUserId=${updated?.zoomUserId}`);

    // Redirect back to frontend success page
    res.redirect(`${process.env.CLIENT_URL ?? 'http://localhost:5173'}/account?zoom_connected=1`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth callback failed';
    logger.error(`[Zoom OAuth] Callback error for user ${userId}: ${msg}`);
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

  logger.info(`[Zoom OAuth] User ${userId} disconnected Zoom`);
  res.json({ message: 'Zoom account disconnected' });
}

// ─── Status ────────────────────────────────────────────────────────────────────

/**
 * GET /api/zoom/auth/status
 * Returns whether the authenticated user has connected their Zoom account.
 * Does NOT expose encrypted token values.
 */
export async function zoomStatus(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const user = await User.findById(userId).select('zoomConnected zoomConnectedAt zoomUserId zoomAccessToken');
  logger.info(`[Zoom OAuth] zoomStatus for userId=${userId}: zoomConnected=${user?.zoomConnected}, hasEncryptedToken=${!!user?.zoomAccessToken}`);
  res.json({
    connected:   user?.zoomConnected ?? false,
    connectedAt: user?.zoomConnectedAt,
    zoomUserId:  user?.zoomUserId,
  });
}
