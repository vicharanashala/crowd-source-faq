/**
 * idempotency.ts — in-memory Idempotency-Key store.
 *
 * Lets POST endpoints safely accept the same request twice without
 * creating duplicates. The caller provides a `key` (typically a UUID
 * generated client-side per form-mount); the second request with the
 * same key returns the original response verbatim.
 *
 * Why this exists:
 *   - Frontend re-entry guard (`useRef` in CreatePostDialog) catches the
 *     React-render-lag double-click window, but doesn't help with
 *     network retries (mobile drop / VPN reconnect / explicit user retry).
 *   - A small but real chance of duplicate community posts was the
 *     user-reported symptom. Idempotency-Key is the standard fix.
 *
 * Scope:
 *   - Per-process Map. In a multi-instance deploy, each instance has
 *     its own cache — the protection is best-effort, not strict.
 *     For strict multi-instance protection, swap the Map for a Redis
 *     SETNX-with-TTL call. Not done here because the project doesn't
 *     run Redis (see memory).
 *   - TTL is short (60s default) — long enough to cover the typical
 *     retry window, short enough that the Map doesn't grow unbounded.
 *   - Lazy GC: entries are checked on every read, not swept in a
 *     background timer. Good enough for sub-thousand-RPS workloads.
 *
 * Usage from a controller:
 *   const idempotencyKey = req.header('Idempotency-Key');
 *   if (idempotencyKey) {
 *     const cached = await checkIdempotency(idempotencyKey, 'createPost', req.user!._id.toString());
 *     if (cached) { res.status(cached.status).json(cached.body); return; }
 *   }
 *   // ... do the real work ...
 *   if (idempotencyKey) {
 *     await storeIdempotency(idempotencyKey, 'createPost', req.user!._id.toString(), 201, body);
 *   }
 *
 * The endpoint name (second arg) namespaces the key so the same client
 * key on different endpoints doesn't collide.
 */
const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

interface IdempotencyRecord {
  status: number;
  body: unknown;
  expiresAt: number;
}

const store = new Map<string, IdempotencyRecord>();

function isExpired(record: IdempotencyRecord, now: number): boolean {
  return record.expiresAt <= now;
}

/** Returns the cached response if the key was seen within the TTL window. */
export function checkIdempotency(
  key: string,
  endpoint: string,
  userId: string,
): IdempotencyRecord | null {
  const composite = `${userId}:${endpoint}:${key}`;
  const record = store.get(composite);
  if (!record) return null;
  const now = Date.now();
  if (isExpired(record, now)) {
    store.delete(composite);
    return null;
  }
  return record;
}

/**
 * Store the response for a completed request. Called AFTER the real
 * work succeeds so the next call with the same key returns the same
 * response. Errors during the real work should NOT call this — failed
 * requests should be retried by the client, not silently replayed.
 */
export function storeIdempotency(
  key: string,
  endpoint: string,
  userId: string,
  status: number,
  body: unknown,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  // Bounded growth: if we exceed the cap, drop the oldest entry
  // (insertion-ordered Map iterates oldest-first).
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
  const composite = `${userId}:${endpoint}:${key}`;
  store.set(composite, {
    status,
    body,
    expiresAt: Date.now() + ttlMs,
  });
}

/** Test-only: clears the entire store. */
export function _resetIdempotencyForTests(): void {
  store.clear();
}