/**
 * admin-schedule.controller.ts — read-only + trigger + management endpoints
 * for the admin Schedule tab.
 *
 *   GET    /api/admin/schedule                  — list every process with stats
 *   GET    /api/admin/schedule/:id             — single process detail + override
 *   POST   /api/admin/schedule/:id/trigger     — fire once on demand
 *   PATCH  /api/admin/schedule/:id             — apply override (enabled/interval/note)
 *   DELETE /api/admin/schedule/:id/override    — reset to registered defaults
 *   GET    /api/admin/schedule/:id/history     — last N run records (default 50)
 *   DELETE /api/admin/schedule/:id/history     — wipe history for one job
 */

import type { Request, Response } from 'express';
import { cronManager } from '../../core/scheduler/cronManager.js';
import { processRegistry, PROCESS_METADATA, type ScheduledProcess } from '../../core/scheduler/processRegistry.js';
import CronJobRun from './cron-job-run.model.js';

/** Coerce req.params.id (which is string | string[]) into a clean string. */
function paramId(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? v[0]! : v;
}

/** Coerce req.query.X (which is string | string[] | ParsedQs | ParsedQs[] | undefined). */
function queryNum(req: Request, name: string, fallback: number): number {
  const v = req.query[name];
  const raw = Array.isArray(v) ? v[0] : v;
  const parsed = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Extract admin user id from the request (set by auth middleware). */
function adminIdFromReq(req: Request): string {
  const user = (req as Request & { user?: { id?: string; email?: string } }).user;
  return user?.id ?? user?.email ?? 'unknown-admin';
}

/** GET /api/admin/schedule — list every process with stats. */
export async function listScheduledProcesses(_req: Request, res: Response): Promise<void> {
  const cronJobs = cronManager.listJobs();
  const processes = processRegistry.listAll(cronJobs, PROCESS_METADATA);
  // Augment with override info so the UI can show whether the schedule
  // is the registered default or a DB override.
  const overrides = await cronManager.getAllOverrides();
  const augmented = processes.map((p) => {
    const o = overrides.get(p.id);
    return {
      ...p,
      hasOverride: !!o,
      override: o ?? null,
    };
  });
  res.json({
    processes: augmented,
    summary: {
      total: augmented.length,
      cron: augmented.filter((p) => p.kind === 'cron').length,
      active: augmented.filter((p) => p.isActive).length,
      erroring: augmented.filter((p) => (p.errorCount ?? 0) > 0).length,
      overridden: augmented.filter((p) => p.hasOverride).length,
    },
  });
}

/** GET /api/admin/schedule/:id — single process detail (cronManager-aware). */
export async function getScheduledProcess(req: Request, res: Response): Promise<void> {
  const id = paramId(req, 'id');
  const cronJob = cronManager.getJob(id);
  if (!cronJob) {
    res.status(404).json({ message: `No process found with id "${id}"` });
    return;
  }
  const meta = PROCESS_METADATA.find((m) => m.id === id);
  const override = await cronManager.getOverride(id);
  const process: ScheduledProcess & { hasOverride: boolean; override: typeof override } = {
    id: cronJob.name,
    label: meta?.label ?? cronJob.name,
    description: meta?.description ?? '',
    kind: meta?.kind ?? 'cron',
    owner: meta?.owner ?? 'unknown',
    intervalMs: cronJob.intervalMs,
    isActive: cronJob.isScheduled,
    isRunning: cronJob.isRunning,
    lastRunAt: cronJob.lastRunAt,
    lastError: cronJob.lastError,
    lastErrorAt: cronJob.lastErrorAt,
    errorCount: cronJob.errorCount,
    skipCount: cronJob.skipCount,
    canTriggerManually: meta?.canTriggerManually ?? true,
    meta: meta?.meta,
    hasOverride: !!override,
    override: override ?? null,
  };
  res.json(process);
}

/** POST /api/admin/schedule/:id/trigger — fire once on demand. */
export async function triggerScheduledProcess(req: Request, res: Response): Promise<void> {
  const id = paramId(req, 'id');
  const cronJob = cronManager.getJob(id);
  if (!cronJob) {
    res.status(404).json({ message: `No process found with id "${id}"` });
    return;
  }
  const meta = PROCESS_METADATA.find((m) => m.id === id);
  if (meta && meta.canTriggerManually === false) {
    res.status(400).json({ message: `Process "${id}" cannot be triggered manually` });
    return;
  }
  const ok = cronManager.triggerOnce(id);
  if (!ok) {
    res.status(409).json({ message: `Process "${id}" is already running` });
    return;
  }
  res.json({ ok: true, message: `Triggered "${id}"` });
}

/**
 * PATCH /api/admin/schedule/:id
 * Body: { enabled?: boolean, intervalMs?: number, note?: string }
 *
 * Applies a schedule override. If the new intervalMs > 0 the timer is
 * recreated; if 0/undefined the default is used. If enabled is false
 * the timer is cleared (admin can still trigger manually).
 */
export async function patchScheduledProcess(req: Request, res: Response): Promise<void> {
  const id = paramId(req, 'id');
  const cronJob = cronManager.getJob(id);
  if (!cronJob) {
    res.status(404).json({ message: `No process found with id "${id}"` });
    return;
  }

  const body = (req.body ?? {}) as {
    enabled?: boolean;
    intervalMs?: number;
    note?: string;
  };

  // Validate
  if (body.intervalMs !== undefined) {
    if (typeof body.intervalMs !== 'number' || body.intervalMs < 0 || body.intervalMs > 7 * 24 * 60 * 60 * 1000) {
      res.status(400).json({
        message: 'intervalMs must be a number between 0 (use default) and 604800000 (7 days)',
      });
      return;
    }
  }
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    res.status(400).json({ message: 'enabled must be a boolean' });
    return;
  }

  try {
    await cronManager.applyOverride(id, {
      enabled: body.enabled,
      intervalMs: body.intervalMs,
      note: body.note,
      lastEditedBy: adminIdFromReq(req),
    });
    // Re-fetch the job state and return it inline (don't recurse to
    // getScheduledProcess which would double-send to res).
    const cronJob = cronManager.getJob(id);
    if (!cronJob) {
      res.status(404).json({ message: `Job "${id}" vanished after update` });
      return;
    }
    const meta = PROCESS_METADATA.find((m) => m.id === id);
    const override = await cronManager.getOverride(id);
    res.json({
      id: cronJob.name,
      label: meta?.label ?? cronJob.name,
      description: meta?.description ?? '',
      kind: meta?.kind ?? 'cron',
      owner: meta?.owner ?? 'unknown',
      intervalMs: cronJob.intervalMs,
      isActive: cronJob.isScheduled,
      isRunning: cronJob.isRunning,
      lastRunAt: cronJob.lastRunAt,
      lastError: cronJob.lastError,
      lastErrorAt: cronJob.lastErrorAt,
      errorCount: cronJob.errorCount,
      skipCount: cronJob.skipCount,
      successCount: cronJob.successCount,
      canTriggerManually: meta?.canTriggerManually ?? true,
      meta: meta?.meta,
      hasOverride: !!override,
      override: override ?? null,
    });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
}

/** DELETE /api/admin/schedule/:id/override — reset to registered defaults. */
export async function resetScheduledProcess(req: Request, res: Response): Promise<void> {
  const id = paramId(req, 'id');
  const cronJob = cronManager.getJob(id);
  if (!cronJob) {
    res.status(404).json({ message: `No process found with id "${id}"` });
    return;
  }
  try {
    await cronManager.resetOverride(id);
    res.json({ ok: true, message: `Reset override for "${id}"` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
}

/**
 * GET /api/admin/schedule/:id/history?limit=N
 * Returns the last N (default 50) CronJobRun records for this job,
 * newest first.
 */
export async function getProcessHistory(req: Request, res: Response): Promise<void> {
  const id = paramId(req, 'id');
  const cronJob = cronManager.getJob(id);
  if (!cronJob) {
    res.status(404).json({ message: `No process found with id "${id}"` });
    return;
  }
  const limit = Math.max(1, Math.min(queryNum(req, 'limit', 50), 200));
  const docs = await CronJobRun.find({ name: id })
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();
  res.json({ runs: docs, count: docs.length });
}

/** DELETE /api/admin/schedule/:id/history — wipe all history for one job. */
export async function clearProcessHistory(req: Request, res: Response): Promise<void> {
  const id = paramId(req, 'id');
  const cronJob = cronManager.getJob(id);
  if (!cronJob) {
    res.status(404).json({ message: `No process found with id "${id}"` });
    return;
  }
  const result = await CronJobRun.deleteMany({ name: id });
  res.json({ ok: true, message: `Cleared ${result.deletedCount ?? 0} runs for "${id}"` });
}