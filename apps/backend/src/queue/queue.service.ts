/**
 * Queue Service — MongoDB-backed job queue.
 *
 * Replaces BullMQ. The application code calls these methods instead
 * of touching BullMQ's Queue/Worker/QueueEvents directly.
 *
 * Atomic claim:
 *   `findOneAndUpdate` with a filter that requires `status: 'queued'`,
 *   `runAfter <= now`, and an expired/missing lease. MongoDB serializes
 *   this write at the document level, so exactly one worker wins per
 *   matching document.
 *
 * Lease / heartbeat:
 *   Each claim sets `lockedUntil = now + leaseDuration`. A worker that
 *   crashes without releasing the lease will have its job claimed by
 *   another worker once `lockedUntil` expires. Long jobs call
 *   `renewLease` to push the deadline out.
 *
 * Retry policy:
 *   On failure, if `attempts < maxAttempts` we set `runAfter = now + backoff`
 *   and `status = 'queued'`. Otherwise we mark `failed` and stop.
 */

import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import Job, { type IJob, type JobType, type JobStatus } from './job.model.js';
import { logger } from '../utils/http/logger.js';

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_LEASE_MS = 5 * 60 * 1000;        // 5 minutes — matches BullMQ
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = [60_000, 120_000, 240_000, 480_000, 960_000]; // 1m,2m,4m,8m,16m

// ─── Enqueue options ─────────────────────────────────────────────────────────

export interface EnqueueOptions {
  /** Override default 3 attempts. */
  maxAttempts?: number;
  /** Higher = taken first. Default 0. */
  priority?: number;
  /** Don't run before this time. Default = now. */
  runAfter?: Date;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Enqueue a new job. Returns the job id.
 */
export async function enqueue(
  type: JobType,
  payload: unknown,
  opts: EnqueueOptions = {},
): Promise<string> {
  const job = await Job.create({
    type,
    payload,
    priority: opts.priority ?? 0,
    maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    runAfter: opts.runAfter ?? new Date(),
    status: 'queued',
    attempts: 0,
    progress: 0,
  });
  return String(job._id);
}

/**
 * Atomically claim the next eligible job of the given type for `workerId`.
 *
 * Filter:
 *   - type matches
 *   - status = 'queued'
 *   - runAfter <= now
 *   - lockedUntil missing OR <= now (stale lease)
 *
 * Returns the claimed job, or null if nothing was available.
 */
export async function claimNextJob(
  type: JobType,
  workerId: string,
  leaseDurationMs: number = DEFAULT_LEASE_MS,
): Promise<IJob | null> {
  const now = new Date();
  const leaseExpiry = new Date(now.getTime() + leaseDurationMs);

  // MongoDB serializes this findOneAndUpdate at the document level — only
  // one worker can transition a given document from queued→processing.
  // We sort by priority desc, runAfter asc so high-priority + older jobs win.
  const claimed = await Job.findOneAndUpdate(
    {
      type,
      status: 'queued',
      runAfter: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    {
      $set: {
        status: 'processing',
        workerId,
        lockedUntil: leaseExpiry,
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    {
      sort: { priority: -1, runAfter: 1 },
      new: true,
    },
  );

  return claimed;
}

/**
 * Mark a job as successfully completed. Called by the worker after
 * `process()` returns normally.
 */
export async function complete(jobId: string): Promise<void> {
  await Job.updateOne(
    { _id: jobId, status: 'processing' },
    {
      $set: {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        lockedUntil: null,
        updatedAt: new Date(),
        error: null,
      },
    },
  );
}

/**
 * Mark a job as failed. If `retry` is true (and attempts < maxAttempts),
 * the job is re-queued with exponential backoff instead of going terminal.
 *
 * Returns true if the job will be retried, false if it's terminal.
 */
export async function fail(jobId: string, error: string, retry: boolean = true): Promise<boolean> {
  const job = await Job.findById(jobId);
  if (!job) return false;

  const truncatedError = error.length > 1900 ? `${error.slice(0, 1900)}…` : error;

  if (retry && job.attempts < job.maxAttempts) {
    const backoffMs = DEFAULT_BACKOFF_MS[Math.min(job.attempts - 1, DEFAULT_BACKOFF_MS.length - 1)];
    const runAfter = new Date(Date.now() + backoffMs);
    await Job.updateOne(
      { _id: jobId, status: 'processing' },
      {
        $set: {
          status: 'queued',
          lockedUntil: null,
          workerId: null,
          runAfter,
          error: truncatedError,
          updatedAt: new Date(),
        },
      },
    );
    logger.info(`[queue] job ${jobId} retry scheduled (attempt ${job.attempts}/${job.maxAttempts}) in ${backoffMs}ms: ${truncatedError}`);
    return true;
  }

  await Job.updateOne(
    { _id: jobId, status: 'processing' },
    {
      $set: {
        status: 'failed',
        completedAt: new Date(),
        lockedUntil: null,
        workerId: null,
        error: truncatedError,
        updatedAt: new Date(),
      },
    },
  );
  logger.warn(`[queue] job ${jobId} failed permanently after ${job.attempts} attempts: ${truncatedError}`);
  return false;
}

/**
 * Cancel a queued job. Jobs already processing cannot be cancelled
 * through this path — the worker must finish or fail them naturally.
 * Returns true if the job was cancelled, false otherwise.
 */
export async function cancel(jobId: string): Promise<boolean> {
  const res = await Job.updateOne(
    { _id: jobId, status: 'queued' },
    {
      $set: {
        status: 'cancelled',
        lockedUntil: null,
        workerId: null,
        updatedAt: new Date(),
      },
    },
  );
  return res.modifiedCount > 0;
}

/**
 * Update a job's progress percentage (0..100). Cheap, fire-and-forget.
 */
export async function updateProgress(jobId: string, progress: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.floor(progress)));
  await Job.updateOne(
    { _id: jobId, status: 'processing' },
    { $set: { progress: clamped, updatedAt: new Date() } },
  );
}

/**
 * Renew the lease on a currently-processing job. Workers handling
 * long jobs (e.g. 50-page PDF OCR > 5 minutes) call this periodically
 * to prevent another worker from claiming the same job mid-flight.
 */
export async function renewLease(
  jobId: string,
  leaseDurationMs: number = DEFAULT_LEASE_MS,
): Promise<boolean> {
  const newExpiry = new Date(Date.now() + leaseDurationMs);
  const res = await Job.updateOne(
    { _id: jobId, status: 'processing' },
    { $set: { lockedUntil: newExpiry, updatedAt: new Date() } },
  );
  return res.modifiedCount > 0;
}

/**
 * Fetch a job by id. Used by the GET /queue/jobs/:id endpoint and
 * by callers that need to look up status without claiming.
 */
export async function getJob(jobId: string): Promise<IJob | null> {
  if (!mongoose.isValidObjectId(jobId)) return null;
  return Job.findById(jobId);
}

/**
 * Aggregate counts for the admin /queue/stats endpoint.
 */
export async function getStats(type?: JobType): Promise<{
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  activeWorkers: number;
  averageProcessingMs: number;
}> {
  const match: Record<string, unknown> = {};
  if (type) match.type = type;

  const [rows, activeWorkers, avgAgg] = await Promise.all([
    Job.aggregate<{ _id: JobStatus; count: number }>([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Job.distinct('workerId', { ...match, status: 'processing' }),
    Job.aggregate<{ _id: null; avg: number }>([
      { $match: { ...match, status: 'completed', completedAt: { $ne: null } } },
      {
        $project: {
          ms: { $subtract: ['$completedAt', '$createdAt'] },
        },
      },
      { $group: { _id: null, avg: { $avg: '$ms' } } },
    ]),
  ]);

  const byStatus: Record<JobStatus, number> = {
    queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0,
  };
  for (const r of rows) byStatus[r._id] = r.count;

  return {
    ...byStatus,
    activeWorkers: activeWorkers.filter(Boolean).length,
    averageProcessingMs: avgAgg[0]?.avg ? Math.round(avgAgg[0].avg) : 0,
  };
}

/**
 * Recover jobs whose lease expired while a worker was alive but wedged.
 * Returns the number of jobs that were reset to queued. Safe to call
 * periodically (e.g. every minute from a setInterval).
 */
export async function recoverStaleLeases(): Promise<number> {
  const now = new Date();
  const res = await Job.updateMany(
    { status: 'processing', lockedUntil: { $lte: now } },
    {
      $set: {
        status: 'queued',
        workerId: null,
        updatedAt: now,
        runAfter: now, // immediately re-claimable
      },
    },
  );
  if (res.modifiedCount > 0) {
    logger.warn(`[queue] recovered ${res.modifiedCount} stale-lease job(s)`);
  }
  return res.modifiedCount;
}

/**
 * Generate a stable worker id for the current process. Memoized so the
 * id is reused across claimNextJob calls within the same Node process.
 */
let _workerId: string | null = null;
export function getWorkerId(): string {
  if (!_workerId) _workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  return _workerId;
}