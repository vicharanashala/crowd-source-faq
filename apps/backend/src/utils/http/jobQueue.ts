/**
 * jobQueue.ts
 *
 * A lightweight, async-friendly in-memory job queue for the Yaksha FAQ backend.
 *
 * Features:
 * - Jobs are functions that return a Promise (any async work).
 * - AsyncLocalStorage context is propagated to each job so getContext() works
 *   inside job handlers even though they run asynchronously.
 * - drain() waits for all in-flight jobs to complete before returning.
 * - flush() drains and also rejects new enqueue() calls.
 * - No external dependencies — uses only Node.js built-ins.
 *
 * Usage:
 *   import { jobQueue } from './jobQueue.js';
 *
 *   // Enqueue (non-blocking):
 *   jobQueue.enqueue(async () => {
 *     await sendEmail({ to: user.email, subject: 'FAQ approved' });
 *   });
 *
 *   // On shutdown:
 *   await jobQueue.drain();
 */

import { getContext, runWithContext } from './requestContext.js';
import { logger } from './logger.js';
import { jobQueueSize, jobQueueProcessed } from './metrics.js';

export interface Job {
  id: string;
  description: string;
  context: { requestId: string; userId?: string };
  fn: () => Promise<void>;
  enqueuedAt: Date;
}

// ─── JobCounter (for stable IDs across restarts) ──────────────────────────────
let jobCounter = 0;
function nextId(): string {
  return `job_${Date.now()}_${++jobCounter}`;
}

// ─── Queue State ───────────────────────────────────────────────────────────────
const pending: Job[] = [];
let isFlushing = false;
let drainResolve: (() => void) | null = null;

/** Number of jobs currently in the queue (in-flight, not yet started). */
export function queueSize(): number {
  return pending.length;
}

/** True if flush() has been called (no new jobs may be enqueued). */
export function isFlushingQueue(): boolean {
  return isFlushing;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Add a job to the queue.
 *
 * @param description  Human-readable label for the job (used in logs/errors)
 * @param fn           Async function to execute
 * @throws Error       If flush() has been called
 */
export function enqueue(description: string, fn: () => Promise<void>): void {
  if (isFlushing) {
    throw new Error(`jobQueue: cannot enqueue '${description}' — queue is flushing`);
  }

  const ctx = getContext();
  const job: Job = {
    id: nextId(),
    description,
    context: {
      requestId: ctx?.requestId ?? '-',
      userId: ctx?.userId,
    },
    fn,
    enqueuedAt: new Date(),
  };

  pending.push(job);
  jobQueueSize.set(pending.length);
}

/**
 * Attempt to run the next job in the queue.
 * Returns true if a job was executed, false if the queue is empty.
 * Errors are logged but never thrown (jobs are fire-and-forget with logging).
 */
async function processNextJob(): Promise<boolean> {
  const job = pending.shift();
  if (!job) return false;

  const requestId = job.context.requestId;

  try {
    await runWithContext(job.context, job.fn);
    logger.info(`[jobQueue] completed: ${job.description}`, {}, requestId);
    jobQueueProcessed.inc({ outcome: 'completed' });
  } catch (err) {
    logger.error(`[jobQueue] job failed: ${job.description}`, { error: err instanceof Error ? err.message : String(err) }, requestId);
    jobQueueProcessed.inc({ outcome: 'failed' });
  }

  // Update queue size gauge
  jobQueueSize.set(pending.length);

  return true;
}

/** Returns a promise that resolves when the queue is drained. */
function waitForDrain(): Promise<void> {
  return new Promise<void>((resolve) => {
    drainResolve = resolve;
  });
}

/**
 * Drain: wait for all jobs in the queue to complete (including currently
 * executing ones). After drain() resolves, the queue is empty and safe to exit.
 *
 * Safe to call multiple times — subsequent calls resolve immediately.
 *
 * @param timeoutMs  Optional timeout; if exceeded, resolve anyway with a warning.
 *                   Default: 30_000 ms.
 */
export async function drain(timeoutMs = 30_000): Promise<void> {
  // Fast path: already drained
  if (pending.length === 0 && drainResolve === null) return;

  const wait = waitForDrain();

  // Safety timeout — don't block shutdown forever
  const timeout = setTimeout(() => {
    logger.warn(`[jobQueue] drain timed out after ${timeoutMs}ms, ${pending.length} jobs remaining`);
    if (drainResolve) {
      drainResolve();
      drainResolve = null;
    }
  }, timeoutMs);

  await wait;
  clearTimeout(timeout);
  drainResolve = null;
}

/**
 * Flush: initiate graceful shutdown of the queue.
 * - Marks the queue as "flushing" — enqueue() will throw.
 * - Waits for all in-flight jobs to complete (same as drain()).
 * - After flush() resolves the queue is permanently closed.
 */
export async function flush(timeoutMs = 30_000): Promise<void> {
  isFlushing = true;
  logger.info(`[jobQueue] flushing — ${pending.length} jobs remaining`);
  await drain(timeoutMs);
  logger.info('[jobQueue] flush complete');
}

// ─── Background Worker ─────────────────────────────────────────────────────────
// A single worker keeps the queue moving without blocking request handlers.
// Uses setImmediate to yield to the event loop between jobs.

function scheduleNext(): void {
  setImmediate(async () => {
    const didWork = await processNextJob();
    if (didWork || pending.length > 0) {
      scheduleNext();
    } else {
      // Queue is empty — notify any waiting drain()
      if (drainResolve) {
        drainResolve();
        drainResolve = null;
      }
    }
  });
}

// Start the worker
scheduleNext();

/** Singleton queue object for convenience. */
export const jobQueue = { enqueue, drain, flush, queueSize, isFlushingQueue };