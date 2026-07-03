/**
 * provisioning.service — bootstrap a new program into a usable workspace.
 *
 * Lifecycle: `createBatch` writes the Batch row, then calls
 * `bootstrapProgram(batchId)` synchronously before returning. If the
 * bootstrap throws, the controller rolls back the Batch so we never
 * leave a half-provisioned program behind. See `batch.controller.ts`.
 *
 * What gets created:
 *   - `ProgramConfig` — per-program ops config (Zoom/Discord/AI/golden
 *     ticket tunables). Always created so the admin can configure Zoom
 *     or Discord from the detail view without first creating the doc.
 *   - `ProgramSettings` — per-program theme + hero copy + section
 *     toggles. Drives the public portal render. Always created using
 *     the batch's name + description as the hero defaults.
 *   - `FeatureFlag` per-program overrides — for each global default
 *     flag, mirror it into a per-program override row so admins can
 *     toggle the flag per-program without losing the global default.
 *     Skipped if the global default doesn't exist yet (we never block
 *     on this — the admin can still set per-program flags later).
 *
 * Idempotency: every step is `findOne + create-if-missing`, so calling
 * this twice in a row is safe. We deliberately use upserts rather than
 * `deleteMany + insertMany` so admin-edited values are not clobbered
 * if bootstrap is re-run (e.g. by a retry or a future migration).
 *
 * Future-friendly: new modules that need to be bootstrapped per
 * program should add a step here. The interface contract is "given a
 * batchId, ensure this collection has the per-program scaffolding
 * rows it needs; never throw on already-exists".
 */

import { Types } from 'mongoose';
import Batch from './batch.model.js';
import ProgramConfig from './program-config.model.js';
import ProgramSettings, { defaultSettings } from './program-settings.model.js';
import FeatureFlag from './feature-flag.model.js';
import { logger } from '../../utils/http/logger.js';

export interface BootstrapResult {
  batchId: string;
  created: {
    programConfig: boolean;
    programSettings: boolean;
    featureFlags: number;
  };
  errors: string[];
}

/**
 * Bootstrap a new program's per-program scaffolding. Safe to call
 * multiple times. Returns what was created in this call (so callers
 * can report it to admins in an audit log).
 *
 * @throws only when the Batch itself is missing — every other
 *         failure is logged and captured in `errors[]`.
 */
export async function bootstrapProgram(batchId: string | Types.ObjectId): Promise<BootstrapResult> {
  const id = typeof batchId === 'string' ? new Types.ObjectId(batchId) : batchId;
  const result: BootstrapResult = {
    batchId: id.toString(),
    created: { programConfig: false, programSettings: false, featureFlags: 0 },
    errors: [],
  };

  const batch = await Batch.findById(id).select('_id name description').lean();
  if (!batch) {
    throw new Error(`bootstrapProgram: Batch ${id.toString()} not found`);
  }

  // ── 1. ProgramConfig ────────────────────────────────────────────────
  try {
    const existing = await ProgramConfig.findOne({ batchId: id }).select('_id').lean();
    if (!existing) {
      await ProgramConfig.create({ batchId: id });
      result.created.programConfig = true;
    }
  } catch (err) {
    const msg = `ProgramConfig bootstrap failed: ${(err as Error).message}`;
    logger.error(`[provisioning] ${msg}`);
    result.errors.push(msg);
  }

  // ── 2. ProgramSettings ──────────────────────────────────────────────
  try {
    const existing = await ProgramSettings.findOne({ batchId: id }).select('_id').lean();
    if (!existing) {
      const seed = defaultSettings(id, batch.name ?? 'New program', batch.description ?? '');
      await ProgramSettings.create(seed);
      result.created.programSettings = true;
    }
  } catch (err) {
    const msg = `ProgramSettings bootstrap failed: ${(err as Error).message}`;
    logger.error(`[provisioning] ${msg}`);
    result.errors.push(msg);
  }

  // ── 3. Per-program FeatureFlag overrides ────────────────────────────
  // For every global default (batchId: null) that exists, mirror it
  // into a per-program override row. The override starts with the
  // same enabled value, so behavior matches the global default until
  // the admin changes it. We do this so the admin sees a per-program
  // toggle for every feature, even ones they haven't touched yet.
  try {
    const globals = await FeatureFlag.find({ batchId: null })
      .select('key enabled label description')
      .lean();
    for (const g of globals) {
      const existing = await FeatureFlag.findOne({ key: g.key, batchId: id })
        .select('_id')
        .lean();
      if (existing) continue;
      await FeatureFlag.create({
        key: g.key,
        batchId: id,
        enabled: g.enabled,
        label: g.label,
        description: g.description,
        updatedBy: null,
      });
      result.created.featureFlags += 1;
    }
  } catch (err) {
    const msg = `FeatureFlag bootstrap failed: ${(err as Error).message}`;
    logger.error(`[provisioning] ${msg}`);
    result.errors.push(msg);
  }

  return result;
}