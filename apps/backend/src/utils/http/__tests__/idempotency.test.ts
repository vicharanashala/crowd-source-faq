import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkIdempotency, storeIdempotency, _resetIdempotencyForTests } from '../idempotency.js';

describe('idempotency store', () => {
  beforeEach(() => {
    _resetIdempotencyForTests();
    vi.useRealTimers();
  });

  it('returns null for an unseen key', () => {
    expect(checkIdempotency('k1', 'createPost', 'u1')).toBeNull();
  });

  it('returns the stored response after storeIdempotency', () => {
    storeIdempotency('k1', 'createPost', 'u1', 201, { id: 'abc' });
    const cached = checkIdempotency('k1', 'createPost', 'u1');
    expect(cached).not.toBeNull();
    expect(cached?.status).toBe(201);
    expect(cached?.body).toEqual({ id: 'abc' });
  });

  it('returns null for an expired entry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    storeIdempotency('k1', 'createPost', 'u1', 201, { id: 'abc' }, /* ttlMs */ 1000);
    // Before the TTL expires — record present.
    expect(checkIdempotency('k1', 'createPost', 'u1')).not.toBeNull();
    // After the TTL expires — record gone, lazy GC.
    vi.setSystemTime(new Date('2026-01-01T00:00:02Z'));
    expect(checkIdempotency('k1', 'createPost', 'u1')).toBeNull();
  });

  it('namespaces keys by user so two users with the same key do not collide', () => {
    storeIdempotency('k1', 'createPost', 'u1', 201, { id: 'for-u1' });
    storeIdempotency('k1', 'createPost', 'u2', 201, { id: 'for-u2' });
    expect((checkIdempotency('k1', 'createPost', 'u1')?.body as { id: string }).id).toBe('for-u1');
    expect((checkIdempotency('k1', 'createPost', 'u2')?.body as { id: string }).id).toBe('for-u2');
  });

  it('namespaces keys by endpoint so two endpoints with the same key do not collide', () => {
    storeIdempotency('k1', 'createPost', 'u1', 201, { id: 'createPost' });
    storeIdempotency('k1', 'createComment', 'u1', 201, { id: 'createComment' });
    expect((checkIdempotency('k1', 'createPost', 'u1')?.body as { id: string }).id).toBe('createPost');
    expect((checkIdempotency('k1', 'createComment', 'u1')?.body as { id: string }).id).toBe('createComment');
  });
});