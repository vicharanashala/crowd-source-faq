/**
 * Semantic cache — MongoDB-queue era (post-BullMQ migration).
 *
 * The cache used to be backed by Upstash Redis + ioredis. After the
 * Redis removal, the cache now uses an in-process LRU so we keep the
 * 80-95% hit-rate behavior on repeat queries without adding a new
 * dependency.
 *
 * Public API is preserved (`getCachedResults`, `setCachedResults`,
 * `invalidateCache`, `cacheAvailable`) so callers don't change.
 *
 * Trade-offs:
 *   - Cached entries are now per-process. Multi-instance deployments
 *     each have their own cache. Acceptable for a single-VPS deployment;
 *     for horizontal scaling, swap in Keyv + SQLite (shared) — the
 *     interface is identical.
 *   - `invalidateCache` clears the in-memory LRU. No cross-process
 *     invalidation (was never relied on).
 */

import { LRUCache } from 'lru-cache';
import { logger } from './logger.js';

// ─── In-process LRU ─────────────────────────────────────────────────────────

const cache = new LRUCache<string, { results: unknown[] }>({
  max: 500,                     // matches the previous Redis LRU
  ttl: 60 * 60 * 1000,          // 1 hour — matches old RESULT_TTL
});

/** True when the cache is usable. Always true now (in-memory LRU). */
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
  try {
    const key = `result:${hashQuery(query)}`;
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
  try {
    const key = `result:${hashQuery(query)}`;
    cache.set(key, { results });
    logger.info(`[cache SET] "${query.slice(0, 40)}"`);
  } catch (err) {
    logger.warn(`[cache] set failed: ${(err as Error).message}`);
  }
}

/**
 * Invalidate all cached search results. With an in-memory LRU we can
 * iterate and delete entries that match the `result:` prefix.
 */
export async function invalidateCache(): Promise<void> {
  let totalDeleted = 0;
  for (const key of cache.keys()) {
    if (key.startsWith('result:')) {
      cache.delete(key);
      totalDeleted++;
    }
  }
  if (totalDeleted > 0) {
    logger.info(`[cache] invalidated ${totalDeleted} entries`);
  }
}