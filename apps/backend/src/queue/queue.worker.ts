/**
 * Queue Worker — long-running loop that pulls jobs from MongoDB and
 * runs their processors. Replaces BullMQ's `Worker` class.
 *
 * Usage:
 *   - Register a processor per JobType with `registerProcessor`.
 *   - Call `startWorker({ types, concurrency })` from startup.ts.
 *   - Call `stopWorker()` from the SIGTERM handler.
 *
 * Concurrency model:
 *   - Concurrency N spawns N async loops, each polling the queue.
 *   - MongoDB's atomic `findOneAndUpdate` ensures each job goes to
 *     exactly one loop. No double-processing.
 *   - Heartbeat renews the lease every `heartbeatMs` for long jobs.
 *
 * Graceful shutdown:
 *   - On `stopWorker()`, the loops stop accepting new jobs.
 *   - In-flight jobs are allowed to finish; their leases naturally expire
 *     after 5 minutes if the process is killed without grace.
 */

import { logger } from '../utils/http/logger.js';
import {
  claimNextJob,
  complete,
  fail,
  renewLease,
  getWorkerId,
  recoverStaleLeases,
} from './queue.service.js';
import type { JobType } from './job.model.js';
import { runWithContext } from '../utils/http/requestContext.js';

// ─── Processor registry ─────────────────────────────────────────────────────

type JobProcessor = (payload: unknown, helpers: {
  jobId: string;
  updateProgress: (pct: number) => Promise<void>;
}) => Promise<unknown>;

const processors = new Map<JobType, JobProcessor>();

/**
 * Register a function that handles jobs of the given type. Calling twice
 * for the same type overwrites the previous handler.
 */
export function registerProcessor(type: JobType, handler: JobProcessor): void {
  processors.set(type, handler);
}

// ─── Worker state ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 750;
const HEARTBEAT_MS = 30_000;
const LEASE_MS = 5 * 60 * 1000;

interface WorkerHandle {
  types: JobType[];
  concurrency: number;
  loops: Promise<void>[];
  running: boolean;
}

let _handle: WorkerHandle | null = null;

/**
 * Start a worker that processes jobs of the given types. Idempotent —
 * calling twice without `stopWorker()` in between is a no-op.
 */
export function startWorker(opts: {
  types: JobType[];
  concurrency?: number;
}): boolean {
  if (_handle?.running) return true;

  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const workerId = getWorkerId();

  const loops: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    const loopId = `${workerId}#${i}`;
    loops.push(runLoop(loopId, opts.types));
  }

  _handle = { types: opts.types, concurrency, loops, running: true };
  logger.info(`[queueWorker] started (workerId=${workerId}, concurrency=${concurrency}, types=${opts.types.join(',')})`);
  return true;
}

/**
 * Stop accepting new jobs. Waits for in-flight jobs to finish (best-effort
 * with a timeout). The leases on in-flight jobs naturally expire after
 * `LEASE_MS` if the process dies ungracefully.
 */
export async function stopWorker(timeoutMs: number = 10_000): Promise<void> {
  if (!_handle?.running) return;
  _handle.running = false;
  logger.info('[queueWorker] stop requested — draining…');

  const drain = Promise.allSettled(_handle.loops);
  const result = await Promise.race([
    drain,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
  ]);
  if (result === 'timeout') {
    logger.warn(`[queueWorker] drain timed out after ${timeoutMs}ms — in-flight jobs will be retried via lease expiry`);
  } else {
    logger.info('[queueWorker] all worker loops exited cleanly');
  }
  _handle = null;
}

/**
 * True if the worker is currently polling for jobs.
 */
export function isWorkerRunning(): boolean {
  return _handle?.running ?? false;
}

// ─── Loop ───────────────────────────────────────────────────────────────────

async function runLoop(loopId: string, types: JobType[]): Promise<void> {
  while (_handle?.running) {
    let claimedJob: Awaited<ReturnType<typeof claimNextJob>> = null;
    try {
      // Try each type in order — usually there's just one.
      for (const t of types) {
        claimedJob = await claimNextJob(t, loopId, LEASE_MS);
        if (claimedJob) break;
      }
    } catch (err) {
      logger.error(`[queueWorker] ${loopId} claim failed: ${(err as Error).message}`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (!claimedJob) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const jobId = String(claimedJob._id);
    logger.info(`[queueWorker] ${loopId} claimed job ${jobId} (type=${claimedJob.type}, attempt ${claimedJob.attempts}/${claimedJob.maxAttempts})`);

    const processor = processors.get(claimedJob.type);
    if (!processor) {
      await fail(jobId, `no processor registered for type '${claimedJob.type}'`, false);
      continue;
    }

    // Heartbeat — renew the lease every HEARTBEAT_MS so a long OCR
    // job doesn't lose its lock. The interval is cleared on completion.
    const heartbeat = setInterval(() => {
      void renewLease(jobId, LEASE_MS).catch((err) =>
        logger.warn(`[queueWorker] ${loopId} heartbeat failed for ${jobId}: ${(err as Error).message}`),
      );
    }, HEARTBEAT_MS);

    try {
      const payloadBatchId = (claimedJob.payload as { batchId?: string })?.batchId;
      const executeProcessor = async () => {
        await processor(claimedJob.payload, {
          jobId,
          updateProgress: (pct: number) => updateProgressSafe(jobId, pct),
        });
      };
      if (payloadBatchId) {
        await runWithContext({ requestId: `job-${jobId}`, batchId: payloadBatchId }, executeProcessor);
      } else {
        await executeProcessor();
      }
      await complete(jobId);
      logger.info(`[queueWorker] ${loopId} completed job ${jobId}`);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const willRetry = await fail(jobId, message, true);
      if (willRetry) {
        logger.warn(`[queueWorker] ${loopId} job ${jobId} will retry: ${message}`);
      } else {
        logger.error(`[queueWorker] ${loopId} job ${jobId} failed permanently: ${message}`);
      }
    } finally {
      clearInterval(heartbeat);
    }
  }
  logger.info(`[queueWorker] loop ${loopId} exiting`);
}

async function updateProgressSafe(jobId: string, pct: number): Promise<void> {
  try {
    const { updateProgress } = await import('./queue.service.js');
    await updateProgress(jobId, pct);
  } catch {
    /* progress is best-effort */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Stale-lease sweeper ─────────────────────────────────────────────────────

let _sweeper: NodeJS.Timeout | null = null;

/**
 * Start a periodic stale-lease sweeper. Runs every 60s, resets any
 * `processing` job whose lease has expired so another worker can claim
 * it. Belt-and-suspenders alongside the per-job heartbeat — handles
 * the case where a worker process died hard (no chance to fail/complete).
 */
export function startStaleLeaseSweeper(intervalMs: number = 60_000): void {
  if (_sweeper) return;
  _sweeper = setInterval(() => {
    void recoverStaleLeases().catch((err) =>
      logger.warn(`[queueWorker] stale-lease sweeper error: ${(err as Error).message}`),
    );
  }, intervalMs);
  // Allow the process to exit even with this timer active.
  _sweeper.unref?.();
  logger.info(`[queueWorker] stale-lease sweeper started (every ${intervalMs / 1000}s)`);
}

export function stopStaleLeaseSweeper(): void {
  if (_sweeper) {
    clearInterval(_sweeper);
    _sweeper = null;
  }
}