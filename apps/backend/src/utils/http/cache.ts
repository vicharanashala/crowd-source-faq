/**
 * Semantic cache — adaptive backend (Redis or in-process LRU).
 *
 * The cache used to be backed by Upstash Redis + ioredis. After the
 * Redis removal it ran on an in-process LRU only — fine for a single
 * VPS, but on multi-instance / serverless deployments each process has
 * its own cache and the hit rate collapses toward zero.
 *
 * This restores an optional shared Redis backend behind the same API:
 *   - `REDIS_TCP_URL` set   → ioredis-backed shared cache
 *                             (e.g. redis://127.0.0.1:6379 for local
 *                             Docker, or a managed rediss:// URL).
 *   - `REDIS_TCP_URL` unset → in-process LRU, identical to the
 *                             post-Redis-removal behavior.
 *
 * Public API is preserved (`getCachedResults`, `setCachedResults`,
 * `invalidateCache`, `cacheAvailable`, `cacheGet`, `cacheSet`,
 * `invalidateByPattern`) so callers don't change.
 *
 * Redis failures degrade gracefully: every operation catches and logs,
 * returning a miss / no-op rather than failing the request.
 */

import { LRUCache } from 'lru-cache';
import IoRedis from 'ioredis';
import { logger } from './logger.js';

// ─── Optional shared Redis backend ──────────────────────────────────────────

let redis: IoRedis | null = null;
let redisInitialized = false;

function getRedis(): IoRedis | null {
  if (redisInitialized) return redis;
  redisInitialized = true;

  const tcpUrl = process.env.REDIS_TCP_URL;
  if (!tcpUrl) return null;

  try {
    redis = new IoRedis(tcpUrl, {
      // Fail fast instead of queueing commands forever when Redis is down —
      // callers treat errors as cache misses, so requests never hang on it.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redis.on('error', (err) => {
      logger.warn(`[cache] Redis client error: ${err.message}`);
    });
    redis.on('ready', () => {
      logger.info(`[cache] Connected to Redis: ${tcpUrl.split('@').pop()}`);
    });
    return redis;
  } catch (err) {
    logger.warn(`[cache] Failed to initialize Redis client: ${(err as Error).message}`);
    redis = null;
    return null;
  }
}

async function redisGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  const data = await client.get(key);
  if (data === null) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return data as unknown as T;
  }
}

async function redisSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (!client) return;
  const data = typeof value === 'string' ? value : JSON.stringify(value);
  await client.set(key, data, 'EX', ttlSeconds);
}

/** SCAN + DEL every key matching a Redis glob pattern (e.g. `result:*`). */
async function redisDeleteByPattern(pattern: string): Promise<number> {
  const client = getRedis();
  if (!client) return 0;
  let cursor = '0';
  let total = 0;
  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await client.del(...keys);
      total += keys.length;
    }
  } while (cursor !== '0');
  return total;
}

const usingRedis = (): boolean => getRedis() !== null;

// ─── In-process LRU (fallback backend) ──────────────────────────────────────

const cache = new LRUCache<string, { results: unknown[] }>({
  max: 500,                     // matches the previous Redis LRU
  ttl: 60 * 60 * 1000,          // 1 hour — matches old RESULT_TTL
});

const RESULT_TTL_SECONDS = 15 * 60; // Redis TTL — prevents memory bloat on shared instances

/** True when the cache is usable. Always true (Redis or in-memory LRU). */
export function cacheAvailable(): boolean {
  return true;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hashQuery(text: string): string {
  let hash = 0;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0; // int32
  }
  return `sc:${hash.toString(36)}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getCachedResults(query: string): Promise<{ results: unknown[] } | null> {
  const key = `result:${hashQuery(query)}`;
  try {
    if (usingRedis()) {
      const hit = await redisGet<{ results: unknown[] }>(key);
      if (hit) logger.info(`[cache HIT] "${query.slice(0, 40)}"`);
      return hit;
    }
    const hit = cache.get(key);
    if (hit) {
      logger.info(`[cache HIT] "${query.slice(0, 40)}"`);
      return hit;
    }
    return null;
  } catch (err) {
    logger.warn(`[cache] get failed: ${(err as Error).message}`);
    return null;
  }
}

export async function setCachedResults(query: string, results: unknown[]): Promise<void> {
  const key = `result:${hashQuery(query)}`;
  try {
    if (usingRedis()) {
      await redisSet(key, { results }, RESULT_TTL_SECONDS);
    } else {
      cache.set(key, { results });
    }
    logger.info(`[cache SET] "${query.slice(0, 40)}"`);
  } catch (err) {
    logger.warn(`[cache] set failed: ${(err as Error).message}`);
  }
}

/**
 * Invalidate all cached search results (`result:*`), on whichever
 * backend is active.
 */
export async function invalidateCache(): Promise<void> {
  try {
    let totalDeleted = 0;
    if (usingRedis()) {
      totalDeleted = await redisDeleteByPattern('result:*');
    } else {
      for (const key of cache.keys()) {
        if (key.startsWith('result:')) {
          cache.delete(key);
          totalDeleted++;
        }
      }
    }
    if (totalDeleted > 0) {
      logger.info(`[cache] invalidated ${totalDeleted} entries`);
    }
  } catch (err) {
    logger.warn(`[cache] invalidate failed: ${(err as Error).message}`);
  }
}

// ─── General-purpose keyed cache ──────────────────────────────────────────────
//
// Callers cache arbitrary keyed payloads (`faq:*`, `stats:*`, `trending:*`,
// per-request cache keys). Same adaptive strategy: shared Redis when
// configured, in-process LRU otherwise.

const kvCache = new LRUCache<string, NonNullable<unknown>>({
  max: 1000,
  ttl: 60 * 60 * 1000, // 1 hour default; per-entry TTL overrides on set
});

/** Get an arbitrary cached value by key. Returns null on miss. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (usingRedis()) {
      const val = await redisGet<T>(key);
      if (val !== null) logger.info(`[cache HIT] ${key}`);
      return val;
    }
    const val = kvCache.get(key);
    if (val !== undefined && val !== null) {
      logger.info(`[cache HIT] ${key}`);
      return val as T;
    }
    return null;
  } catch (err) {
    logger.warn(`[cache] cacheGet(${key}) failed: ${(err as Error).message}`);
    return null;
  }
}

/** Set an arbitrary cached value with a per-entry TTL (seconds). */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    if (usingRedis()) {
      await redisSet(key, value, ttlSeconds);
    } else {
      kvCache.set(key, value as NonNullable<unknown>, { ttl: ttlSeconds * 1000 });
    }
    logger.info(`[cache SET] ${key} (TTL ${ttlSeconds}s)`);
  } catch (err) {
    logger.warn(`[cache] cacheSet(${key}) failed: ${(err as Error).message}`);
  }
}

/**
 * Invalidate all keyed entries matching a glob pattern (e.g. `faq:*`).
 * Only `*` is treated as a wildcard; all other characters match literally.
 */
export async function invalidateByPattern(pattern: string): Promise<void> {
  try {
    let total = 0;
    if (usingRedis()) {
      total = await redisDeleteByPattern(pattern);
    } else {
      const regex = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '*' ? '.*' : '\\' + m)) + '$');
      for (const key of kvCache.keys()) {
        if (regex.test(key)) {
          kvCache.delete(key);
          total++;
        }
      }
    }
    if (total > 0) logger.info(`[cache] invalidated ${total} keys matching "${pattern}"`);
  } catch (err) {
    logger.warn(`[cache] invalidateByPattern(${pattern}) failed: ${(err as Error).message}`);
  }
}
