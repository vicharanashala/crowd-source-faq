/**
 * admin.config.controller.ts — REST endpoints for the runtime config system.
 *
 * These endpoints back the Discord admin panel (Phase 2) AND a future
 * web admin dashboard. They share the same service layer with the
 * Discord bot, so changes made via Discord are immediately visible
 * here and vice versa.
 *
 * Auth: all endpoints require admin role (the existing `adminOnly`
 * middleware). Critical-key writes additionally require the
 * passphrase-challenge flow (Phase 2) — Phase 1 REST trusts the JWT +
 * admin role, on the assumption that anyone with a valid admin JWT
 * already has server-level access (and therefore already has the env
 * file). This matches the existing admin endpoints in the app.
 */
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { adminLog } from '../../utils/http/logger.js';
import { categorize } from '../../config/adminCategorize.js';
import {
  getConfig,
  listConfig as listConfigResolver,
  clearAllConfigCache,
} from '../../config/runtimeConfig.js';
import {
  setConfig as setConfigService,
  deleteConfig as deleteConfigService,
  getConfigAudited,
  AdminConfigError,
} from './admin.config.service.js';
import type { AuthedRequest } from '../../middleware/authShared.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAdminContext(req: Request) {
  const user = (req as AuthedRequest).user;
  if (!user) {
    // adminOnly middleware should have rejected this already; defensive throw.
    throw new Error('adminOnly middleware did not populate req.user');
  }
  return {
    adminId: String(user._id),
    adminUsername: user.name ?? user.email ?? String(user._id),
    ipAddress: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

function parseProgramId(raw: unknown): Types.ObjectId | string | null {
  if (typeof raw !== 'string' || raw === '' || raw === 'global') return null;
  // Validate ObjectId format if it looks like one; otherwise treat as opaque string.
  if (/^[a-f0-9]{24}$/i.test(raw)) return new Types.ObjectId(raw);
  return raw;
}

// ── GET /api/admin/config/list ───────────────────────────────────────────────

export const listConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const programId = parseProgramId(req.query.programId);
    const rows = await listConfigResolver({ programId });
    // For the list view, mask critical-key values. The Discord bot does
    // its own masking on display, but doing it here too prevents a stray
    // GET from leaking secrets into a browser console.
    const masked = rows.map((row) => ({
      ...row,
      value: row.isEncrypted ? '***REDACTED***' : row.value,
    }));
    res.json({ count: masked.length, items: masked });
  } catch (err) {
    adminLog.error(`[admin.config] list failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to list config.' });
  }
};

// ── GET /api/admin/config/categorize/:key ────────────────────────────────────
//
// Diagnostic endpoint: classify a key without reading its value. Useful
// for the Discord bot's "what does this do" preview before committing.

export const categorizeHandler = async (req: Request, res: Response): Promise<void> => {
  const key = String(req.params.key ?? '');
  if (!key) {
    res.status(400).json({ message: 'key is required.' });
    return;
  }
  res.json(categorize(key));
};

// ── GET /api/admin/config/:key ───────────────────────────────────────────────

export const getConfigHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = getAdminContext(req);
    const key = String(req.params.key ?? '');
    const programId = parseProgramId(req.query.programId);

    if (!key) {
      res.status(400).json({ message: 'key is required.' });
      return;
    }

    const result = await getConfigAudited({
      ...ctx,
      key,
      source: 'rest',
    });

    // For the response, mask encrypted values. The audit log entry
    // (above) already records the read; the response itself doesn't
    // expose the ciphertext.
    res.json({
      ...result,
      value: result.isEncrypted ? '***REDACTED***' : result.value,
      // programId from query param is reflected back so the Discord
      // bot can render "global vs program-scoped" without re-asking.
      scope: programId ? 'program' : 'global',
    });
  } catch (err) {
    adminLog.error(`[admin.config] get failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to read config.' });
  }
};

// ── PUT /api/admin/config ────────────────────────────────────────────────────

interface SetConfigBody {
  key: string;
  value: unknown;
  programId?: string;
  note?: string;
}

export const setConfigHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = getAdminContext(req);
    const body = (req.body ?? {}) as SetConfigBody;
    if (typeof body.key !== 'string' || !body.key) {
      res.status(400).json({ message: 'body.key is required.' });
      return;
    }
    if (body.value === undefined) {
      res.status(400).json({ message: 'body.value is required (use null to clear).' });
      return;
    }

    const programId = parseProgramId(body.programId);
    const result = await setConfigService({
      key: body.key,
      value: body.value,
      programId,
      note: body.note,
      source: 'rest',
      ...ctx,
    });

    if (!result.ok) {
      // AdminConfigError codes map to specific HTTP statuses so the
      // Discord bot (and a future web UI) can react appropriately.
      const status = result.error?.includes('INVALID_KEY') ? 400
        : result.error?.includes('NOT_FOUND') ? 404
        : result.error?.includes('VALUE_TOO_LARGE') ? 413
        : 400;
      res.status(status).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, mongoId: result.mongoId });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      const status = err.code === 'INVALID_KEY' ? 400 : 500;
      res.status(status).json({ ok: false, error: err.message });
      return;
    }
    adminLog.error(`[admin.config] set failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to set config.' });
  }
};

// ── DELETE /api/admin/config/:key ────────────────────────────────────────────

export const deleteConfigHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = getAdminContext(req);
    const key = String(req.params.key ?? '');
    const programId = parseProgramId(req.query.programId);

    if (!key) {
      res.status(400).json({ message: 'key is required.' });
      return;
    }

    const result = await deleteConfigService({
      key,
      programId,
      source: 'rest',
      ...ctx,
    });

    if (!result.ok) {
      const status = result.error?.includes('NOT_FOUND') ? 404 : 400;
      res.status(status).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    adminLog.error(`[admin.config] delete failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete config.' });
  }
};

// ── POST /api/admin/config/cache/clear ───────────────────────────────────────
//
// Diagnostic endpoint for the Discord bot — flush the in-memory
// runtimeConfig cache so the next read goes straight to Mongo. Useful
// when a bulk update just happened via the CLI migration script.

export const clearCacheHandler = async (_req: Request, res: Response): Promise<void> => {
  clearAllConfigCache();
  res.json({ ok: true });
};