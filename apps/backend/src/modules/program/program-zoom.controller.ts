/**
 * v1.69 — Phase 5: per-program Zoom admin controller.
 *
 * Manages the per-program Zoom OAuth credentials stored in
 * `ProgramConfig.zoom`. Each program can carry its own client
 * ID / client secret / webhook secret / OAuth tokens. The
 * runtime resolver (`getProgramZoomConfig` in
 * utils/zoom/zoomOAuth.ts) falls back to the env-var global app
 * when a program has nothing configured.
 *
 * Per-program Zoom S2S OAuth is a heavier lift — each program
 * needs its own Zoom Marketplace app registration. This file
 * gives the admin the storage + connect/disconnect flow; the
 * full runtime switchover (per-meeting credential resolution)
 * is Phase 5+.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import ProgramConfig from './program-config.model.js';
import Batch from './batch.model.js';
import { exchangeCodeForTokens } from '../../integrations/zoom/zoomOAuth.js';
import { encrypt } from '../../utils/auth/crypto.js';
import { httpLog } from '../../utils/http/logger.js';

const connectBody = z.object({
  clientId: z.string().min(8).max(200),
  clientSecret: z.string().min(8).max(500),
  redirectUri: z.string().url().optional(),
  webhookSecretToken: z.string().min(8).max(500).optional(),
  // Optional: if the admin already completed the OAuth flow on
  // Zoom's side and has the auth code, pass it here and we'll
  // exchange + store the tokens immediately.
  authCode: z.string().min(8).max(500).optional(),
});

const batchIdParam = (req: Request): string | null => {
  const raw = req.params.batchId ?? req.params.id;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
};

function asObjectIdOr400(res: Response, raw: string | null): Types.ObjectId | null {
  if (!raw) {
    res.status(400).json({ message: 'batchId is required.' });
    return null;
  }
  if (!Types.ObjectId.isValid(raw)) {
    res.status(400).json({ message: 'Invalid batchId.' });
    return null;
  }
  return new Types.ObjectId(raw);
}

// ─── GET /api/admin/programs/:id/zoom ────────────────────────────────────────

export async function getProgramZoomConfigRoute(req: Request, res: Response): Promise<void> {
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  try {
    const doc = await ProgramConfig.findOne({ batchId })
      .select('+zoom.clientSecret +zoom.webhookSecretToken')
      .lean();
    if (!doc) {
      res.json({
        connected: false,
        source: 'env',
        message: 'No per-program Zoom config yet. Falling back to env-var global app.',
      });
      return;
    }
    // Public view: redact the secrets but indicate whether they're set.
    res.json({
      connected: !!doc.zoom?.connected,
      clientId: doc.zoom?.clientId ?? null,
      hasClientSecret: !!doc.zoom?.clientSecret,
      hasWebhookSecretToken: !!doc.zoom?.webhookSecretToken,
      redirectUri: doc.zoom?.redirectUri ?? null,
      tokenExpiry: doc.zoom?.tokenExpiry ?? null,
      connectedAt: doc.zoom?.connectedAt ?? null,
      source: 'program',
    });
  } catch (err) {
    httpLog.error(`[programZoom] getProgramZoomConfigRoute failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load per-program Zoom config.' });
  }
}

// ─── PUT /api/admin/programs/:id/zoom ────────────────────────────────────────

/**
 * v1.69 — Phase 5: store per-program OAuth credentials. The
 * admin provides the client ID + secret (from their Zoom
 * Marketplace app registration for this program). The secret
 * is AES-encrypted at rest. An optional authCode triggers an
 * immediate exchange for access/refresh tokens.
 */
export async function upsertProgramZoomConfig(req: Request, res: Response): Promise<void> {
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  const parsed = connectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  // Verify the batch exists.
  const batch = await Batch.exists({ _id: batchId, isActive: true });
  if (!batch) {
    res.status(404).json({ message: 'Program not found or archived.' });
    return;
  }

  const { clientId, clientSecret, redirectUri, webhookSecretToken, authCode } = parsed.data;
  const clientSecretCipher = encrypt(clientSecret);
  const webhookCipher = webhookSecretToken ? encrypt(webhookSecretToken) : undefined;

  // If an authCode is supplied, exchange it for tokens now and
  // store the cipher. Otherwise the admin can run the OAuth
  // flow later (Phase 5+ runtime switchover uses the per-program
  // client credentials to mint tokens on demand).
  let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>> | null = null;
  if (authCode) {
    try {
      tokens = await exchangeCodeForTokens(authCode);
    } catch (err) {
      res.status(400).json({ message: `Zoom OAuth exchange failed: ${(err as Error).message}` });
      return;
    }
  }

  try {
    const update: Record<string, unknown> = {
      'zoom.clientId': clientId,
      'zoom.clientSecret': clientSecretCipher,
      'zoom.connected': !!tokens,
      'zoom.connectedAt': tokens ? new Date() : null,
    };
    if (redirectUri) update['zoom.redirectUri'] = redirectUri;
    if (webhookCipher) update['zoom.webhookSecretToken'] = webhookCipher;
    if (tokens) {
      update['zoom.accessToken'] = encrypt(tokens.access_token);
      update['zoom.refreshToken'] = encrypt(tokens.refresh_token);
      update['zoom.tokenExpiry'] = new Date(Date.now() + tokens.expires_in * 1000);
    }

    const doc = await ProgramConfig.findOneAndUpdate(
      { batchId },
      { $set: update, $setOnInsert: { batchId, zoom: { ...update, connected: !!tokens } } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({
      ok: true,
      connected: !!tokens,
      source: 'program',
      batchId,
    });
    void doc;
  } catch (err) {
    httpLog.error(`[programZoom] upsertProgramZoomConfig failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to save per-program Zoom config.' });
  }
}

// ─── POST /api/admin/programs/:id/zoom/disconnect ───────────────────────────

/**
 * v1.69 — Phase 5: clear per-program tokens. Keeps the client
 * ID/secret (the admin might want to reconnect with a fresh
 * code) but nulls out the access/refresh tokens and the
 * `connected` flag.
 */
export async function disconnectProgramZoom(req: Request, res: Response): Promise<void> {
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  try {
    await ProgramConfig.findOneAndUpdate(
      { batchId },
      {
        $set: {
          'zoom.connected': false,
          'zoom.connectedAt': null,
          'zoom.accessToken': null,
          'zoom.refreshToken': null,
          'zoom.tokenExpiry': null,
        },
      },
      { new: true }
    );
    res.json({ ok: true, connected: false });
  } catch (err) {
    httpLog.error(`[programZoom] disconnectProgramZoom failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to disconnect per-program Zoom.' });
  }
}
