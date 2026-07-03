/**
 * queue.service.test — MongoDB-backed queue unit tests.
 *
 * Uses mongodb-memory-server for an isolated database. Covers:
 *   - enqueue → claim → complete happy path
 *   - retries on failure with exponential backoff
 *   - permanent failure after maxAttempts
 *   - stale-lease recovery (simulates a crashed worker)
 *   - atomic claim prevents double-processing under concurrency
 *   - cancel removes a queued job
 *
 * Run: pnpm test queue.service
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  // Reset the jobs collection between tests
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  await db.collection('yaksha_faq_jobs').deleteMany({});
  vi.useRealTimers();
});

// Import AFTER mongoose connects so the model uses the in-memory server.
const { enqueue, claimNextJob, complete, fail, cancel, recoverStaleLeases, getStats } = await import(
  '../../queue/queue.service.js'
);

describe('queue.service — happy path', () => {
  it('enqueues, claims, and completes a job', async () => {
    const id = await enqueue('document-processing', { foo: 'bar' });
    expect(id).toBeTruthy();

    const claimed = await claimNextJob('document-processing', 'worker-1');
    expect(claimed).toBeTruthy();
    expect(claimed!.payload).toEqual({ foo: 'bar' });
    expect(claimed!.status).toBe('processing');
    expect(claimed!.attempts).toBe(1);
    expect(claimed!.workerId).toBe('worker-1');

    await complete(String(claimed!._id));
    const final = await mongoose.connection.db!.collection('yaksha_faq_jobs').findOne({ _id: claimed!._id });
    expect(final?.status).toBe('completed');
    expect(final?.completedAt).toBeTruthy();
  });
});

describe('queue.service — retries', () => {
  it('re-queues a failed job until maxAttempts is hit', async () => {
    const id = await enqueue('document-processing', { ok: false }, { maxAttempts: 2 });
    // First claim + fail → re-queued with backoff
    const first = await claimNextJob('document-processing', 'worker-a');
    expect(first!.attempts).toBe(1);
    const willRetry1 = await fail(String(first!._id), 'transient error', true);
    expect(willRetry1).toBe(true);

    // Force runAfter into the past so the claim doesn't wait
    await mongoose.connection.db!.collection('yaksha_faq_jobs').updateOne(
      { _id: first!._id },
      { $set: { runAfter: new Date(Date.now() - 1000) } },
    );

    const second = await claimNextJob('document-processing', 'worker-b');
    expect(second).toBeTruthy();
    expect(String(second!._id)).toBe(id);
    expect(second!.attempts).toBe(2);

    const willRetry2 = await fail(String(second!._id), 'still broken', true);
    expect(willRetry2).toBe(false); // attempts === maxAttempts
    const final = await mongoose.connection.db!.collection('yaksha_faq_jobs').findOne({ _id: first!._id });
    expect(final?.status).toBe('failed');
    expect(final?.error).toBe('still broken');
  });
});

describe('queue.service — stale lease recovery', () => {
  it('recovers jobs whose lease expired while the worker was wedged', async () => {
    await enqueue('document-processing', { doc: 1 });

    // Claim, then push the lock into the past to simulate a crashed worker.
    const claimed = await claimNextJob('document-processing', 'wedged-worker');
    expect(claimed).toBeTruthy();
    await mongoose.connection.db!.collection('yaksha_faq_jobs').updateOne(
      { _id: claimed!._id },
      { $set: { lockedUntil: new Date(Date.now() - 60_000) } },
    );

    // A new worker cannot claim until recoverStaleLeases has run.
    const blocked = await claimNextJob('document-processing', 'fresh-worker');
    expect(blocked).toBeNull();

    const recovered = await recoverStaleLeases();
    expect(recovered).toBe(1);

    const nowClaimable = await claimNextJob('document-processing', 'fresh-worker');
    expect(nowClaimable).toBeTruthy();
    expect(String(nowClaimable!._id)).toBe(String(claimed!._id));
    expect(nowClaimable!.attempts).toBe(2);
  });
});

describe('queue.service — concurrency safety', () => {
  it('only one of N concurrent claims wins each job', async () => {
    await enqueue('document-processing', { contested: true });

    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, i) => claimNextJob('document-processing', `worker-${i}`)),
    );
    const winners = claims.filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.attempts).toBe(1);
  });
});

describe('queue.service — cancel', () => {
  it('cancels a queued job and refuses to claim it later', async () => {
    const id = await enqueue('document-processing', { willCancel: true });
    const cancelled = await cancel(id);
    expect(cancelled).toBe(true);
    const claim = await claimNextJob('document-processing', 'w');
    expect(claim).toBeNull();
  });

  it('refuses to cancel an already-processing job', async () => {
    await enqueue('document-processing', { inProgress: true });
    const claimed = await claimNextJob('document-processing', 'w');
    expect(claimed).toBeTruthy();
    const ok = await cancel(String(claimed!._id));
    expect(ok).toBe(false);
  });
});

describe('queue.service — stats', () => {
  it('returns per-status counts', async () => {
    await enqueue('document-processing', { a: 1 });
    await enqueue('document-processing', { b: 2 });
    const c = await claimNextJob('document-processing', 'w');
    await complete(String(c!._id));

    const stats = await getStats('document-processing');
    expect(stats.completed).toBe(1);
    expect(stats.queued).toBe(1);
    expect(stats.processing).toBe(0);
    expect(stats.failed).toBe(0);
  });
});