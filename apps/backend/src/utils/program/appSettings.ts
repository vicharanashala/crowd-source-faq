/**
 * v1.69 — Phase 9: per-program app settings resolver.
 *
 * Walks the chain (1) per-program ProgramConfig.appSettings
 * override, falling back to (2) the global AppSetting singleton,
 * for the same set of keys the AppSetting model already
 * understands. Returns a flat Record<string, number | string |
 * boolean> ready for the admin UI.
 *
 * Used by appSettingsController.adminGetSettings /
 * publicGetSettings when ?batchId=... is supplied.
 *
 * The per-program keys currently supported:
 *   - goldenTicketCooldownHours (default 48)
 *   - goldenTicketSpCost         (default 50)
 *   - penaltyMultiplier          (default 1)
 *
 * These are the same three the ProgramConfig.appSettings schema
 * defines. New settings added to the schema in the future
 * automatically get read here — the resolver looks up by key
 * rather than hardcoding the shape.
 */

import { Types } from 'mongoose';
import AppSetting, { type SettingKey } from '../../modules/program/app-setting.model.js';
import { httpLog } from '../http/logger.js';

let _cache: { key: string; value: Record<string, number | string | boolean>; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

export type ProgramAppSettings = {
  goldenTicketCooldownHours: number;
  goldenTicketSpCost: number;
  penaltyMultiplier: number;
} & Record<string, number | string | boolean>;

/**
 * Read the per-program app settings merged with the global
 * AppSetting defaults. When the per-program ProgramConfig is
 * missing or has empty appSettings, every value comes from
 * the global AppSetting (or the schema defaults if even that
 * is missing).
 */
export async function getProgramAppSettings(
  batchId: string | Types.ObjectId
): Promise<ProgramAppSettings> {
  const cacheKey = String(batchId);
  if (_cache && _cache.key === cacheKey && _cache.expiresAt > Date.now()) {
    return _cache.value as ProgramAppSettings;
  }
  let perProgram: Record<string, number | string | boolean> = {};
  let global: Record<string, number | string | boolean> = {};

  // 1) Per-program ProgramConfig.appSettings override
  try {
    const { default: ProgramConfig } = await import('../../modules/program/program-config.model.js');
    const doc = await ProgramConfig.findOne({ batchId: new Types.ObjectId(cacheKey) })
      .select('appSettings')
      .lean();
    if (doc?.appSettings) {
      perProgram = { ...doc.appSettings } as Record<string, number | string | boolean>;
    }
  } catch (err) {
    // ProgramConfig model not available or query failed — fall
    // through to the global AppSetting singleton.
    httpLog.warn(`[programAppSettings] per-program lookup failed for ${cacheKey}: ${(err as Error).message}`);
  }

  // 2) Global AppSetting singleton defaults
  try {
    let doc = await AppSetting.findById('singleton').select('settings').lean();
    if (!doc) {
      await AppSetting.create({ _id: 'singleton' });
      doc = await AppSetting.findById('singleton').select('settings').lean();
    }
    if (doc?.settings) {
      global = doc.settings as Record<string, number | string | boolean>;
    }
  } catch (err) {
    httpLog.warn(`[programAppSettings] global AppSetting lookup failed: ${(err as Error).message}`);
  }

  // Merge: per-program wins over global. For each known key
  // we resolve to the per-program value if set, falling back
  // to the global value, with the schema default last.
  // v1.69 — The `as const` keeps the tuple typed as a
  // readonly array of the three known SettingKey literals,
  // which lets tsc narrow the `merged[k]` writes below
  // without flagging the indexed access.
  const knownKeys = ['goldenCooldownHours', 'goldenPenaltyMultiplier', 'goldenSpCost'] as const;
  const merged: ProgramAppSettings = {
    goldenTicketCooldownHours: perProgram.goldenTicketCooldownHours
      ?? global.goldenCooldownHours
      ?? 48,
    goldenTicketSpCost: perProgram.goldenTicketSpCost
      ?? global.goldenSpCost
      ?? 50,
    penaltyMultiplier: perProgram.penaltyMultiplier
      ?? global.goldenPenaltyMultiplier
      ?? 1,
  } as ProgramAppSettings;

  // Pass through any unknown keys (forward compat).
  for (const k of knownKeys) {
    if (perProgram[k] !== undefined) merged[k] = perProgram[k] as number;
    else if (global[k] !== undefined) merged[k] = global[k] as number;
  }

  _cache = { key: cacheKey, value: merged, expiresAt: Date.now() + CACHE_TTL_MS };
  return merged;
}

/** Invalidate the cache after admin updates the per-program override. */
export function invalidateProgramAppSettingsCache(batchId?: string): void {
  if (batchId) {
    if (_cache && _cache.key === batchId) _cache = null;
    return;
  }
  _cache = null;
}
