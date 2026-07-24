/**
 * cronManager.ts — central registry for periodic jobs.
 *
* v1.71 — added introspection (listJobs / getJob / triggerOnce).
 * v1.71+ — added override-aware scheduling + persistent run history.
 *
 * Override semantics:
 *   - On register(), the job's registered intervalMs is the default.
 *   - On startAll(), cronManager reads CronScheduleOverride from the
 *     DB for each job. If an override exists:
 *       - enabled:false → the job's timer is NOT created. Ticks are
 *         skipped (and recorded as 'skipped' runs for visibility).
 *       - intervalMs > 0 → the timer uses the override interval.
 *   - Admin changes via Schedule tab call applyOverride(name, ...)
 *     which updates the DB AND, if the interval changed, recreates
 *     the timer with the new interval (no restart needed).
 *
 * Run history:
 *   - Every execution (cron tick, admin trigger) writes a CronJobRun
 *     document. After each write we prune to the last 50 per job
 *     (configurable via CRON_RUN_HISTORY_LIMIT env var).
 *
 * Concurrency lock:
 *   - Every handler invocation is wrapped in runWithLock(); if a
 *     job is already running the next tick is dropped with a warning
 *     instead of stacking a parallel run. (Same atomic-write lesson
 *     as commit 60c1af0 — findOneAndUpdate over a shared `running`
 *     Set.) Public API (register / startAll / stopAll) unchanged.
 */
import { logger } from '../../utils/http/logger.js';
import CronScheduleOverride from '../../modules/admin/cron-schedule-override.model.js';
import CronJobRun from '../../modules/admin/cron-job-run.model.js';

export interface CronJob {
  name: string;
  handler: () => Promise<unknown>;
  intervalMs: number;
  runOnStartup?: boolean;
  startupDelayMs?: number;
}

export interface CronJobStats {
  name: string;
  intervalMs: number;        // effective interval (override OR default)
  defaultIntervalMs: number; // registered default, always the original
  enabled: boolean;          // effective enabled state
  runOnStartup: boolean;
  startupDelayMs?: number;
  isScheduled: boolean;
  isRunning: boolean;
  lastRunAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  skipCount: number;
  errorCount: number;
  successCount: number;
}

interface JobStatsInternal extends CronJobStats {
  handler: () => Promise<unknown>;
}

export interface OverridePatch {
  enabled?: boolean;
  intervalMs?: number;     // 0 = reset to default
  lastEditedBy: string;
  note?: string;
}

const DEFAULT_HISTORY_LIMIT = 50;

export class CronManager {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private jobs: CronJob[] = [];
  private running: Set<string> = new Set();
  private stats: Map<string, JobStatsInternal> = new Map();

  /** Resolve the override, returning null if no override is stored. */
  private async loadOverride(name: string): Promise<{ enabled: boolean; intervalMs: number } | null> {
    try {
      const doc = await CronScheduleOverride.findOne({ name }).lean();
      if (!doc) return null;
      return { enabled: doc.enabled, intervalMs: doc.intervalMs };
    } catch (err) {
      logger.warn(`[cronManager] failed to load override for "${name}": ${(err as Error).message}`);
      return null;
    }
  }

  /** Effective interval for a job — override value if set, else registered. */
  private effectiveInterval(job: CronJob, override: { intervalMs: number } | null): number {
    if (override && override.intervalMs > 0) return override.intervalMs;
    return job.intervalMs;
  }

  /** Effective enabled for a job — override false disables, else true. */
  private effectiveEnabled(override: { enabled: boolean } | null): boolean {
    return override ? override.enabled : true;
  }

  register(job: CronJob): void {
    this.jobs.push(job);
    this.stats.set(job.name, {
      name: job.name,
      intervalMs: job.intervalMs,
      defaultIntervalMs: job.intervalMs,
      enabled: true,
      runOnStartup: job.runOnStartup ?? false,
      startupDelayMs: job.startupDelayMs,
      isScheduled: false,
      isRunning: false,
      lastRunAt: null,
      lastError: null,
      lastErrorAt: null,
      skipCount: 0,
      errorCount: 0,
      successCount: 0,
      handler: job.handler,
    });
  }

  /** Recreate the timer for a job with the given intervalMs. */
  private setTimer(name: string, intervalMs: number): void {
    // Clear any existing timer first
    const existing = this.intervals.get(name);
    if (existing) {
      clearInterval(existing);
    }
    const job = this.jobs.find((j) => j.name === name);
    if (!job) return;
    const interval = setInterval(() => {
      void this.runWithLock(job, 'cron');
    }, intervalMs);
    this.intervals.set(name, interval);
    const s = this.stats.get(name);
    if (s) {
      s.intervalMs = intervalMs;
      s.isScheduled = true;
    }
  }

  /** Persist a CronJobRun document and prune old ones for the same name. */
  private async recordRun(args: {
    name: string;
    startedAt: Date;
    finishedAt: Date;
    status: 'success' | 'error' | 'skipped';
    durationMs: number;
    error: string | null;
    triggeredBy: 'cron' | 'admin';
  }): Promise<void> {
    try {
      await CronJobRun.create({
        name: args.name,
        startedAt: args.startedAt,
        finishedAt: args.finishedAt,
        status: args.status,
        durationMs: args.durationMs,
        error: args.error,
        triggeredBy: args.triggeredBy,
      });
      // Prune — keep last N
      const limit = Number(process.env.CRON_RUN_HISTORY_LIMIT ?? DEFAULT_HISTORY_LIMIT);
      const total = await CronJobRun.countDocuments({ name: args.name });
      if (total > limit) {
        const excess = total - limit;
        const oldest = await CronJobRun.find({ name: args.name })
          .sort({ startedAt: 1 })
          .limit(excess)
          .select('_id')
          .lean();
        if (oldest.length > 0) {
          await CronJobRun.deleteMany({ _id: { $in: oldest.map((d) => d._id) } });
        }
      }
    } catch (err) {
      logger.warn(`[cronManager] failed to record run for "${args.name}": ${(err as Error).message}`);
    }
  }

  private async runWithLock(job: CronJob, triggeredBy: 'cron' | 'admin'): Promise<boolean> {
    // Honor disable flag (DB-backed override)
    const override = await this.loadOverride(job.name);
    if (!this.effectiveEnabled(override)) {
      // Job disabled — skip + record
      const s = this.stats.get(job.name);
      if (s) s.skipCount++;
      void this.recordRun({
        name: job.name,
        startedAt: new Date(),
        finishedAt: new Date(),
        status: 'skipped',
        durationMs: 0,
        error: null,
        triggeredBy,
      });
      return false;
    }

    if (this.running.has(job.name)) {
      logger.warn(`[cronManager] job "${job.name}" still running, skipping tick`);
      const s = this.stats.get(job.name);
      if (s) s.skipCount++;
      return false;
    }

    this.running.add(job.name);
    const s = this.stats.get(job.name);
    if (s) s.isRunning = true;
    const startedAt = new Date();
    let result: 'success' | 'error' = 'success';
    let errorMsg: string | null = null;
    try {
      await job.handler();
      if (s) s.lastRunAt = new Date();
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      logger.error(`[cronManager] Job "${job.name}" failed: ${msg}`);
      if (s) {
        s.lastError = msg;
        s.lastErrorAt = new Date();
        s.errorCount++;
      }
      result = 'error';
      errorMsg = msg;
    } finally {
      this.running.delete(job.name);
      if (s) s.isRunning = false;
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    if (s && result === 'success') s.successCount++;
    void this.recordRun({
      name: job.name,
      startedAt,
      finishedAt,
      status: result,
      durationMs,
      error: errorMsg,
      triggeredBy,
    });
    return result === 'success';
  }

  async startAll(): Promise<void> {
    // Load all overrides once at startup
    const overrides = new Map<string, { enabled: boolean; intervalMs: number }>();
    try {
      const docs = await CronScheduleOverride.find({}).lean();
      for (const doc of docs) overrides.set(doc.name, { enabled: doc.enabled, intervalMs: doc.intervalMs });
    } catch (err) {
      logger.warn(`[cronManager] failed to load overrides at startup: ${(err as Error).message}`);
    }

    for (const job of this.jobs) {
      const override = overrides.get(job.name) ?? null;
      const s = this.stats.get(job.name);
      const enabled = this.effectiveEnabled(override);
      const interval = this.effectiveInterval(job, override);
      if (s) {
        s.enabled = enabled;
        s.intervalMs = interval;
      }

      if (!enabled) {
        // Don't create a timer for disabled jobs. They can still be
        // triggered manually via triggerOnce() — that path also checks
        // enabled via runWithLock.
        logger.info(`[cronManager] job "${job.name}" disabled by override — not scheduling`);
        continue;
      }

      const intervalHandle = setInterval(() => {
        void this.runWithLock(job, 'cron');
      }, interval);
      this.intervals.set(job.name, intervalHandle);
      if (s) s.isScheduled = true;

      if (job.runOnStartup) {
        if (job.startupDelayMs) {
          setTimeout(() => {
            void this.runWithLock(job, 'cron');
          }, job.startupDelayMs);
        } else {
          void this.runWithLock(job, 'cron');
        }
      }
    }
  }

  stopAll(): void {
    for (const [name, interval] of this.intervals.entries()) {
      clearInterval(interval);
      const s = this.stats.get(name);
      if (s) s.isScheduled = false;
    }
    this.intervals.clear();
    logger.info('[cronManager] All cron intervals cleared.');
  }

  // ─── Introspection ────────────────────────────────────────────────────

  listJobs(): CronJobStats[] {
    return Array.from(this.stats.values()).map((s) => {
      const { handler: _handler, ...publicStats } = s;
      void _handler;
      return publicStats;
    });
  }

  getJob(name: string): CronJobStats | null {
    const s = this.stats.get(name);
    if (!s) return null;
    const { handler: _handler, ...publicStats } = s;
    void _handler;
    return publicStats;
  }

  /** Returns true if started, false if name unknown OR already running. */
  triggerOnce(name: string): boolean {
    const job = this.jobs.find((j) => j.name === name);
    if (!job) return false;
    if (this.running.has(name)) {
      logger.warn(`[cronManager] triggerOnce("${name}") skipped — job already running`);
      return false;
    }
    void this.runWithLock(job, 'admin');
    return true;
  }

  // ─── Override application (called from /admin/schedule route) ────────

  /**
   * Apply an override change. Persists to the DB and, if the effective
   * interval changed, recreates the timer with the new cadence.
   *
   * If the job becomes disabled, the timer is cleared (admin can still
   * trigger manually — runWithLock will honor the override).
   *
   * If the job becomes enabled after being disabled, the timer is
   * re-created at the override-or-default interval.
   */
  async applyOverride(name: string, patch: OverridePatch): Promise<void> {
    const job = this.jobs.find((j) => j.name === name);
    if (!job) throw new Error(`Unknown job: ${name}`);
    const s = this.stats.get(name);
    if (!s) throw new Error(`Unknown job: ${name}`);

    // Compute the previous effective state
    const previousOverride = await this.loadOverride(name);
    const previousEnabled = this.effectiveEnabled(previousOverride);
    const previousInterval = this.effectiveInterval(job, previousOverride);

    // Persist
    const set: Record<string, unknown> = {
      name,
      lastEditedBy: patch.lastEditedBy,
      lastEditedAt: new Date(),
    };
    if (patch.enabled !== undefined) set.enabled = patch.enabled;
    if (patch.intervalMs !== undefined) set.intervalMs = patch.intervalMs;
    if (patch.note !== undefined) set.note = patch.note;
    await CronScheduleOverride.findOneAndUpdate(
      { name },
      { $set: set },
      { upsert: true, new: true },
    );

    // Reload to get final values
    const newOverride = await this.loadOverride(name);
    const newEnabled = this.effectiveEnabled(newOverride);
    const newInterval = this.effectiveInterval(job, newOverride);

    // Update stats
    s.enabled = newEnabled;
    s.intervalMs = newInterval;

    // Adjust timer if needed
    if (previousEnabled !== newEnabled) {
      if (newEnabled) {
        this.setTimer(name, newInterval);
        logger.info(`[cronManager] job "${name}" enabled (interval=${newInterval}ms)`);
      } else {
        const existing = this.intervals.get(name);
        if (existing) clearInterval(existing);
        this.intervals.delete(name);
        s.isScheduled = false;
        logger.info(`[cronManager] job "${name}" disabled (timer cleared)`);
      }
    } else if (newEnabled && previousInterval !== newInterval) {
      // Same enabled state, different interval — recreate timer
      this.setTimer(name, newInterval);
      logger.info(`[cronManager] job "${name}" interval changed: ${previousInterval}ms → ${newInterval}ms`);
    }
  }

  /**
   * Reset an override back to defaults (delete the override doc).
   * Timer is recreated with the registered interval if the job is
   * currently enabled.
   */
  async resetOverride(name: string): Promise<void> {
    const job = this.jobs.find((j) => j.name === name);
    if (!job) throw new Error(`Unknown job: ${name}`);
    const s = this.stats.get(name);
    if (!s) throw new Error(`Unknown job: ${name}`);

    await CronScheduleOverride.deleteOne({ name });
    s.enabled = true;
    s.intervalMs = job.intervalMs;

    // Recreate timer at default cadence
    if (this.intervals.has(name)) {
      this.setTimer(name, job.intervalMs);
    } else {
      // Was previously disabled — re-enable timer
      this.setTimer(name, job.intervalMs);
    }
    logger.info(`[cronManager] job "${name}" override reset to defaults (${job.intervalMs}ms)`);
  }

  /** Return the persisted override for one job (or null). */
  async getOverride(name: string): Promise<{ enabled: boolean; intervalMs: number; lastEditedBy: string; lastEditedAt: Date; note?: string } | null> {
    const doc = await CronScheduleOverride.findOne({ name }).lean();
    if (!doc) return null;
    return {
      enabled: doc.enabled,
      intervalMs: doc.intervalMs,
      lastEditedBy: doc.lastEditedBy,
      lastEditedAt: doc.lastEditedAt,
      note: doc.note,
    };
  }

  /** Return overrides for ALL jobs (so the UI can show defaults + current overrides). */
  async getAllOverrides(): Promise<Map<string, { enabled: boolean; intervalMs: number; lastEditedBy: string; lastEditedAt: Date; note?: string }>> {
    const out = new Map<string, { enabled: boolean; intervalMs: number; lastEditedBy: string; lastEditedAt: Date; note?: string }>();
    const docs = await CronScheduleOverride.find({}).lean();
    for (const doc of docs) {
      out.set(doc.name, {
        enabled: doc.enabled,
        intervalMs: doc.intervalMs,
        lastEditedBy: doc.lastEditedBy,
        lastEditedAt: doc.lastEditedAt,
        note: doc.note,
      });
    }
    return out;
  }
}

export const cronManager = new CronManager();