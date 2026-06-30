/**
 * Redis Semantic Cache — Upstash Redis (serverless-compatible)
 *
 * Caches search query embeddings and results to avoid recomputing on repeat queries.
 * FAQ systems typically see 80-95% cache hit rates on queries.
 *
 * Setup: Create a free Upstash Redis database at https://upstash.com
 * Then set REDIS_URL and REDIS_TOKEN in your .env
 */

import { Redis } from '@upstash/redis';
import { logger } from './logger.js';

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return (
    trimmed === '' ||
    trimmed.startsWith('<') ||
    trimmed.includes('YOUR_') ||
    trimmed.includes('your-') ||
    trimmed.includes('placeholder')
  );
}
let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  const token = process.env.REDIS_TOKEN;
  if (isPlaceholder(url) || isPlaceholder(token)) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.REDIS_URL,
      token: process.env.REDIS_TOKEN,
    });
  }
  return redis;
}

/** Simple hash for cache keys — deterministic, short */
function hashQuery(text: string): string {
  let hash = 0;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0; // int32
  }
  return `sc:${hash.toString(36)}`;
}

// TTL in seconds — 1 hour for search results is fine (FAQ data doesn't change often)
const RESULT_TTL = 60 * 60;

/**
 * Try to get cached search results for a query.
 * Returns null on cache miss (including when Redis is not configured).
 */
export async function getCachedResults(
  query: string
): Promise<{ results: unknown[] } | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const key = `result:${hashQuery(query)}`;
    const cached = await client.get<{ results: unknown[] }>(key);
    if (cached) {
      logger.info(`[cache HIT] "${query.slice(0, 40)}"`);
    }
    return cached ?? null;
  } catch (err) {
    logger.warn(`[cache] get failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Store search results in cache. Silently fails if Redis is unavailable.
 */
export async function setCachedResults(
  query: string,
  results: unknown[]
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    const key = `result:${hashQuery(query)}`;
    await client.set(key, { results }, { ex: RESULT_TTL });
    logger.info(`[cache SET] "${query.slice(0, 40)}"`);
  } catch (err) {
    logger.warn(`[cache] set failed: ${(err as Error).message}`);
  }
}

/**
 * Invalidate all cached search results. Call this when FAQ data changes significantly.
 * Uses SCAN iterator (O(1) per call) instead of KEYS (O(n) and blocking).
 */
export async function invalidateCache(): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    let cursor = 0;
    let totalDeleted = 0;
    do {
      // SCAN returns [nextCursor, keys[]] in the Upstash Redis SDK
      const [nextCursor, keys] = await client.scan<Record<string, unknown>>(cursor, {
        match: 'result:*',
        count: 100,
      });
      cursor = Number(nextCursor);
      if (keys.length > 0) {
        await client.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== 0);

    if (totalDeleted > 0) {
      logger.info(`[cache] invalidated ${totalDeleted} entries`);
    }
  } catch (err) {
    logger.warn(`[cache] invalidate failed: ${(err as Error).message}`);
  }
}

export const cacheAvailable = (): boolean => getRedis() !== null;
