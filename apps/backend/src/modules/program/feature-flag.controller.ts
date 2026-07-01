import { Request, Response } from 'express';
import { Types } from 'mongoose';
import FeatureFlag from './feature-flag.model.js';
import { adminLog } from '../../utils/http/logger.js';
import { z } from 'zod';

// Known flag keys — the canonical list. Anything else posted to the
// PUT endpoint is rejected (closed allow-list). Adding a new flag
// means adding a key here + a one-line seed in ensureFlag().
export const FEATURE_FLAGS = {
  sessionSupport: {
    label: 'Session Support Tickets',
    description:
      "Lets students report issues that prevented them from attending a " +
      "session (internet outage, device failure, etc.) with a guided " +
      "troubleshooting checklist and proof upload. Admins get a unified " +
      "inbox to triage and reply. Experimental — toggle off if it's not " +
      "earning its keep.",
    defaultEnabled: false,
  },
  goldenTicket: {
    label: 'Golden Ticket (Spurti Points escalation)',
    description:
      "A premium escalation channel where students spend Spurti Points (SP) " +
      "to bump a time-sensitive query to the top of the admin queue. Higher " +
      "SP = higher leaderboard priority. Includes a 48h cooldown between " +
      "submissions (configurable from /admin/settings). No ban, no penalty " +
      "beyond the SP spend — admins resolve or reject, the user always " +
      "gets an answer. Experimental — toggle off to hide the /golden page " +
      "and gate the backend endpoints.",
    defaultEnabled: false,
  },
  documentPipeline: {
    label: 'Document Processing Pipeline',
    description:
      'Enables the Redis-backed background worker (BullMQ) for document insight processing and OCR. ' +
      'When disabled, document uploads are gated and the worker is stopped to free up resources.',
    defaultEnabled: true,
  },
  welcomePackage: {
    label: 'Welcome Package',
    description:
      'The student onboarding / orientation hub at /welcome (project discovery, ' +
      'getting-started checklist, etc.). When disabled, the nav link is hidden and ' +
      'the page shows the unavailable panel.',
    defaultEnabled: true,
  },
  askAiChatbot: {
    label: 'Ask AI Chatbot',
    description:
      'The floating AskAI assistant button shown on non-admin pages. When disabled, ' +
      'the button is hidden from the UI. Toggle on to re-enable the chatbot for users.',
    defaultEnabled: false,
  },
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/** Lazily seed known flags so admins see them in the UI even if no
 *  one has ever toggled them. Idempotent. */
export async function ensureFlag(key: FeatureFlagKey): Promise<void> {
  const cfg = FEATURE_FLAGS[key];
  if (!cfg) return;
  await FeatureFlag.updateOne(
    { key },
    {
      $setOnInsert: {
        key,
        label: cfg.label,
        description: cfg.description,
        enabled: cfg.defaultEnabled,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

export async function ensureAllFlags(): Promise<void> {
  await Promise.all(Object.keys(FEATURE_FLAGS).map((k) => ensureFlag(k as FeatureFlagKey)));
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/** GET /api/feature-flags?batchId=<id> — list flags resolved for a
 *  specific program (per-program override → global default). Without
 *  batchId the endpoint returns global defaults only — the previous
 *  behaviour of returning every flag across every program was a
 *  data-isolation regression. Admins managing across programs use
 *  the dedicated /api/admin/programs/:id/feature-flags endpoint. */
export async function listFeatureFlags(req: Request, res: Response): Promise<void> {
  try {
    await ensureAllFlags();
    const rawBatchId = typeof req.query.batchId === 'string' ? req.query.batchId : null;
    const hasBatchId = rawBatchId !== null && Types.ObjectId.isValid(rawBatchId);
    const programBatchId = hasBatchId ? new Types.ObjectId(rawBatchId!) : null;

    if (programBatchId) {
      // Resolve every known flag for THIS program (per-program
      // override → global default fallback) — same algorithm the
      // runtime uses, so the UI sees what users will see.
      const overrides = await FeatureFlag.find({ batchId: programBatchId })
        .select('key enabled updatedAt')
        .lean();
      const overrideByKey = new Map(overrides.map((o) => [o.key, o]));
      const flags = await Promise.all(
        (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).map(async (key) => {
          const override = overrideByKey.get(key);
          const enabled = override
            ? override.enabled
            : await isFeatureEnabled(key, null);
          return {
            key,
            label: FEATURE_FLAGS[key].label,
            description: FEATURE_FLAGS[key].description,
            enabled,
            overridden: !!override,
            updatedAt: override?.updatedAt ?? null,
          };
        })
      );
      res.json({ batchId: programBatchId.toString(), flags });
    } else {
      // No batchId — return global defaults only. The frontend
      // always passes batchId when currentProgram is set, so this
      // path is effectively admin-only / unscoped callers.
      const flags = await FeatureFlag.find({ batchId: null }).select('-__v').lean();
      res.json({ flags });
    }
  } catch (err) {
    adminLog.error(`[featureFlags] listFeatureFlags failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load feature flags.' });
  }
}

/** Helper used by the support router — synchronous-feel check that
 *  returns true if the named feature is currently on. Cached for 30
 *  seconds in-process to spare Mongo on a hot read path. */
const _cache = new Map<string, { enabled: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

export async function isFeatureEnabled(
  key: FeatureFlagKey,
  batchId: string | null = null
): Promise<boolean> {
  // v1.69 — Phase 8: per-program flag overrides. The lookup order
  // is (1) per-program override with `(key, batchId)`, falling back
  // to (2) the global default with `(key, batchId=null)`. A null
  // batchId is treated as the global scope and matches the
  // (batchId: null) doc directly.
  const cacheKey = batchId ? `${key}::${batchId}` : key;
  const cached = _cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;
  try {
    await ensureFlag(key);
    const flag = await FeatureFlag.findOne({
      key,
      $or: [
        ...(batchId ? [{ batchId: new Types.ObjectId(batchId) }] : []),
        { batchId: null },
      ],
    })
      // Per-program override wins over global default.
      .sort({ batchId: -1 })
      .select('enabled')
      .lean();
    const enabled = !!(flag && flag.enabled);
    _cache.set(cacheKey, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
    return enabled;
  } catch {
    return false; // fail closed
  }
}

/** Invalidate the in-process cache — call after a flag flips. */
export function invalidateFeatureFlagCache(key?: string): void {
  if (key) _cache.delete(key);
  else _cache.clear();
}

const updateSchema = z.object({
  enabled: z.boolean(),
  note: z.string().max(500).optional(),
});

/** PATCH /api/feature-flags/:key — admin-only toggle. */
export async function toggleFeatureFlag(req: Request, res: Response): Promise<void> {
  const rawKey = req.params.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key || !(key in FEATURE_FLAGS)) {
    res.status(404).json({ message: 'Unknown feature flag.' });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }

  const now = new Date();
  const isEnabling = parsed.data.enabled;
  const userId = (req as Request & { user?: { _id?: Types.ObjectId | string } }).user?._id;

  try {
    await ensureFlag(key as FeatureFlagKey);
    const updated = await FeatureFlag.findOneAndUpdate(
      { key },
      {
        $set: {
          enabled: isEnabling,
          updatedBy: userId ? new Types.ObjectId(String(userId)) : null,
          updatedAt: now,
          ...(isEnabling ? { firstEnabledAt: now } : { lastDisabledAt: now }),
        },
      },
      { new: true },
    ).lean();
    invalidateFeatureFlagCache(key);
    adminLog.info(`[featureFlags] ${key} → ${isEnabling ? 'enabled' : 'disabled'}`);
    if (key === 'documentPipeline') {
      const { setQueueDisabledByAdmin } = await import('../../utils/jobs/documentQueue.js');
      setQueueDisabledByAdmin(!isEnabling);
    }
    res.json({ flag: updated });
  } catch (err) {
    adminLog.error(`[featureFlags] toggleFeatureFlag failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update feature flag.' });
  }
}

// ─── Per-Program Overrides (Phase 8) ────────────────────────────────────────
//
// Each program can carry its own FeatureFlag override. The
// isFeatureEnabled() resolver walks the chain (per-program →
// global default) and the cache is keyed by program. The admin
// flips per-program overrides here, and the program-specific
// truth takes effect on the next call.

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

const perProgramOverrideSchema = z.object({
  enabled: z.boolean(),
});

/**
 * PUT /api/admin/programs/:id/feature-flags/:key
 * Upsert a per-program override. The override takes effect on
 * the next isFeatureEnabled(key, batchId) call.
 */
export async function setPerProgramFeatureFlagOverride(
  req: Request, res: Response
): Promise<void> {
  const rawKey = req.params.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key || !(key in FEATURE_FLAGS)) {
    res.status(404).json({ message: 'Unknown feature flag.' });
    return;
  }
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  const parsed = perProgramOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid input.', issues: parsed.error.issues });
    return;
  }
  const userId = (req as Request & { user?: { _id?: Types.ObjectId | string } }).user?._id;
  const now = new Date();
  try {
    const doc = await FeatureFlag.findOneAndUpdate(
      { key, batchId },
      {
        $set: {
          enabled: parsed.data.enabled,
          updatedBy: userId ? new Types.ObjectId(String(userId)) : null,
          updatedAt: now,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    invalidateFeatureFlagCache(key);
    adminLog.info(
      `[featureFlags] per-program override set — program=${String(batchId)} key=${key} → ${parsed.data.enabled ? 'enabled' : 'disabled'}`
    );
    res.json({ flag: doc });
  } catch (err) {
    adminLog.error(`[featureFlags] setPerProgramFeatureFlagOverride failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to set per-program feature flag override.' });
  }
}

/**
 * DELETE /api/admin/programs/:id/feature-flags/:key
 * Remove the per-program override (falls back to the global
 * default on the next isFeatureEnabled() call).
 */
export async function deletePerProgramFeatureFlagOverride(
  req: Request, res: Response
): Promise<void> {
  const rawKey = req.params.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key) {
    res.status(400).json({ message: 'key is required.' });
    return;
  }
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  try {
    const result = await FeatureFlag.deleteOne({ key, batchId });
    invalidateFeatureFlagCache(key);
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    adminLog.error(`[featureFlags] deletePerProgramFeatureFlagOverride failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to delete per-program feature flag override.' });
  }
}

/**
 * GET /api/admin/programs/:id/feature-flags
 * List every flag with its resolved value for this program
 * (per-program override → global default fallback) and an
 * `overridden` boolean so the admin UI can show which flags
 * have a per-program override set.
 */
export async function listPerProgramFeatureFlags(
  req: Request, res: Response
): Promise<void> {
  const batchId = asObjectIdOr400(res, batchIdParam(req));
  if (!batchId) return;
  try {
    // Fetch the per-program overrides for this program in one
    // round trip; we'll join with the global default below.
    const overrides = await FeatureFlag.find({ batchId })
      .select('key enabled updatedAt')
      .lean();
    const overrideByKey = new Map(overrides.map((o) => [o.key, o]));

    // Resolve each known flag with the same chain the runtime
    // uses (per-program → global default).
    const rows = await Promise.all(
      (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).map(async (key) => {
        const override = overrideByKey.get(key);
        if (override) {
          return {
            key,
            enabled: override.enabled,
            overridden: true,
            updatedAt: override.updatedAt,
            source: 'program' as const,
          };
        }
        const enabled = await isFeatureEnabled(key, null);
        return {
          key,
          enabled,
          overridden: false,
          updatedAt: null,
          source: 'env' as const,
        };
      })
    );
    res.json({ batchId, flags: rows });
  } catch (err) {
    adminLog.error(`[featureFlags] listPerProgramFeatureFlags failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to list per-program feature flags.' });
  }
}
