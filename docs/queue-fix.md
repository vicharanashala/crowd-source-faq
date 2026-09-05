# Queue Fix: Stale-Lease Recovery Bypassed `maxAttempts`

**File changed:** `apps/backend/src/queue/queue.service.ts`
**Also touched:** `apps/backend/src/queue/job.model.ts` (docs only), `apps/backend/src/queue/__tests__/queue.service.test.ts` (new regression test)
**Area:** Backend / Queue infra
**Type:** Bug fix

---

## The Problem

The queue's documented state machine (in `job.model.ts`) says a job can
only go from `processing` back to `queued` a bounded number of times —
`fail()` enforces this by checking `attempts < maxAttempts` before
requeueing, and marks the job `failed` once that cap is hit.

But `fail()` only runs when the worker **catches** an error. If a job's
payload crashes the worker outright — an uncaught exception, an OOM, the
process getting killed — `fail()` never executes. The only backstop for
that case is `recoverStaleLeases()`, a sweeper that runs every 60 seconds
and resets any `processing` job whose lease expired (meaning nobody is
still renewing it — the worker is gone).

That sweeper had no `maxAttempts` check at all:

```ts
export async function recoverStaleLeases(): Promise<number> {
  const now = new Date();
  const res = await Job.updateMany(
    { status: 'processing', lockedUntil: { $lte: now } },
    { $set: { status: 'queued', workerId: null, updatedAt: now, runAfter: now } },
  );
  ...
}
```

**Consequence:** a single "poison pill" job — one whose payload reliably
crashes whatever worker processes it — could crash a worker, get
reclaimed by the sweeper, get claimed by a fresh worker, crash it too,
and repeat **indefinitely**. The `maxAttempts` cap that's supposed to
stop retry storms was silently bypassed on this specific failure path.

---

## The Fix

`recoverStaleLeases()` now splits stale jobs into two groups using a
`$expr` comparison between `attempts` and `maxAttempts` (both fields on
the same document):

```ts
export async function recoverStaleLeases(): Promise<number> {
  const now = new Date();

  const exhausted = await Job.updateMany(
    {
      status: 'processing',
      lockedUntil: { $lte: now },
      $expr: { $gte: ['$attempts', '$maxAttempts'] },
    },
    {
      $set: {
        status: 'failed',
        completedAt: now,
        lockedUntil: null,
        workerId: null,
        error: 'lease expired after max attempts — worker likely crashed without a graceful failure',
        updatedAt: now,
      },
    },
  );

  const requeued = await Job.updateMany(
    {
      status: 'processing',
      lockedUntil: { $lte: now },
      $expr: { $lt: ['$attempts', '$maxAttempts'] },
    },
    { $set: { status: 'queued', workerId: null, updatedAt: now, runAfter: now } },
  );

  return exhausted.modifiedCount + requeued.modifiedCount;
}
```

- Jobs that still have attempts remaining behave exactly as before —
  requeued, immediately claimable.
- Jobs that already used their last attempt are now marked `failed`
  instead of going back to `queued`, with an error message explaining
  why (so it's distinguishable from a normal `fail()`-terminated job in
  logs/admin dashboard).

Also updated the state-machine comment in `job.model.ts` to document
the lease-expiry transition, which wasn't previously described at all.

---

## Why This Matters in Practice

- **Before:** a bad payload could put a worker into a crash loop
  forever, continuously consuming worker capacity and never surfacing
  as a clearly "failed" job — it would just keep cycling through
  `processing → (crash) → queued → processing → ...`.
- **After:** the same payload fails at most `maxAttempts` times total
  (matching the cap that already applies to every other failure path)
  and then sits in `failed` where it's visible in the admin queue
  dashboard (`GET /admin/queue/stats`, `GET /admin/queue/jobs/:id`) for
  investigation.

---

## Verification

- `tsc --noEmit` on the backend — clean, no new type errors.
- Traced the existing "stale lease recovery" test by hand: it uses
  default `maxAttempts: 3` with `attempts: 1` at time of lease expiry,
  which falls into the "requeue" branch — unaffected by the fix,
  `recovered === 1` still holds.
- **Added a new regression test** (`poison-pill regression`, in
  `queue.service.test.ts`) that enqueues a job with `maxAttempts: 1`,
  claims it (using its only attempt), simulates a crashed worker by
  expiring its lease, and asserts:
  - `recoverStaleLeases()` marks it `failed`, not `queued`
  - the error message mentions "max attempts"
  - no worker can claim it afterward

**Note:** I could not execute the test suite in this sandbox —
`mongodb-memory-server` needs to download a real MongoDB binary from
`fastdl.mongodb.org`, which isn't reachable from this environment. Please
run it yourself before merging:

```bash
cd apps/backend
npx vitest run src/queue/__tests__/queue.service.test.ts
```

All 7 existing test cases plus the 1 new one should pass. If anything
fails, share the output and we'll fix it before you commit.

---

## Scope

Three files touched, all inside the queue module:
- `apps/backend/src/queue/queue.service.ts` — the actual fix
- `apps/backend/src/queue/job.model.ts` — comment/documentation only, no behavior change
- `apps/backend/src/queue/__tests__/queue.service.test.ts` — one new test added, nothing removed or changed