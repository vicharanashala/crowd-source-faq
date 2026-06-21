/**
 * Shared Redis client + rate-limit store factory.
 *
 * v1.70 — addresses issue #6 (in-memory rate limiter bypassable in
 * multi-instance deployments). The pre-built limiters in
 * `rateLimit.ts` (loginLimiter, registerLimiter, etc.) each call
 * `createRedisRateLimitStore(prefix)` to obtain a fresh
 * `rate-limit-redis` RedisStore bound to the shared IORedis client.
 *
 * Each limiter MUST own its own RedisStore instance — express-rate-limit
 * v8 throws ERR_ERL_STORE_REUSE if the same Store is attached to more
 * than one limiter (it tracks stores by identity and assumes sole
 * ownership of each one). Distinct Redis key prefixes per limiter also
 * keep counters isolated in Redis, which makes `KEYS rl:login:*`-style
 * debugging work and prevents two limiters from clobbering each other
 * if they ever share a request-key namespace.
 *
 * When REDIS_TCP_URL is unset, `createRedisRateLimitStore` returns
 * `undefined` and express-rate-limit falls back to its default
 * in-memory Map — which keeps dev / test environments working without
 * Redis.
 *
 * Connection handling mirrors `utils/jobs/documentQueue.ts`:
 *  - URL parsing handles rediss:// (Upstash) → enable TLS
 *  - Uses REDIS_TCP_URL env var (consistent with BullMQ usage)
 *  - maxRetriesPerRequest: null (required by rate-limit-redis)
 *
 * The IORedis client is memoized so the process opens at most one
 * connection regardless of how many limiters exist.
 */

import IORedis from 'ioredis';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { Store } from 'express-rate-limit';
import { logger } from '../http/logger.js';

// `undefined` → not yet initialised; `null` → tried, no REDIS_TCP_URL.
let _client: IORedis | null | undefined;
let _loggedMode = false;

function buildRedisClient(): IORedis | null {
  const url = process.env.REDIS_TCP_URL;
  if (!url) {
    logger.info('[rateLimitRedis] REDIS_TCP_URL not set — using in-memory rate limiter store (single-instance only)');
    return null;
  }
  try {
    const u = new URL(url);
    return new IORedis({
      host: u.hostname,
      port: Number(u.port) || 6379,
      password: u.password || undefined,
      username: u.username || undefined,
      maxRetriesPerRequest: null as unknown as number,
      // Upstash requires TLS on the TCP endpoint
      ...(url.startsWith('rediss://') ? { tls: {} as Record<string, unknown> } : {}),
      // Don't block process startup if Redis is briefly unreachable —
      // the connection retries in the background.
      lazyConnect: true,
    });
  } catch (err) {
    logger.warn(`[rateLimitRedis] Failed to build IORedis client: ${(err as Error).message}`);
    return null;
  }
}

function getRedisClient(): IORedis | null {
  if (_client === undefined) {
    _client = buildRedisClient();
  }
  return _client;
}

/**
 * Build a fresh rate-limit-redis RedisStore bound to the shared IORedis
 * client, namespaced under `prefix` so each limiter's counters live in
 * their own slice of Redis keyspace.
 *
 * Returns `undefined` when REDIS_TCP_URL is unset, signalling
 * express-rate-limit to fall back to its default in-memory Map.
 *
 * @param prefix Short identifier for the limiter (e.g. `'login'`,
 *   `'reg'`, `'admin_write'`). Prepended to every Redis key the store
 *   writes, becoming `rl:<prefix>:...`. The underlying IORedis client
 *   is shared, so this does NOT open a new connection per call.
 */
export function createRedisRateLimitStore(prefix: string): Store | undefined {
  const client = getRedisClient();
  if (!client) return undefined;
  try {
    if (!_loggedMode) {
      logger.info('[rateLimitRedis] Using Redis-backed rate limiter store');
      _loggedMode = true;
    }
    return new RedisStore({
      // sendCommand is the bridge rate-limit-redis uses to talk to
      // any Redis-compatible client. The signature expects
      // Promise<RedisReply>; cast the ioredis return value through unknown.
      sendCommand: (...args: string[]): Promise<RedisReply> =>
        client.call(...(args as [string, ...string[]])) as unknown as Promise<RedisReply>,
      // Scope keys per limiter so login/register/etc. counters stay
      // isolated and Redis introspection (e.g. `KEYS rl:login:*`) works.
      prefix: `rl:${prefix}:`,
    });
  } catch (err) {
    logger.warn(`[rateLimitRedis] Failed to construct RedisStore, falling back to in-memory: ${(err as Error).message}`);
    return undefined;
  }
}
