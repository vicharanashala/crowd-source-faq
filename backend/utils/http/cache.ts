/**
 * Redis Semantic Cache — Upstash Redis (serverless-compatible)
 *
 * Caches search query embeddings and results to avoid recomputing on repeat queries.
 * FAQ systems typically see 80-95% cache hit rates on queries.
 *
 * Also provides generic key-value caching for hot endpoints:
 *   faq:all          -- GET /api/faq (grouped, 5 min TTL)
 *   faq:recent:*     -- GET /api/faq/recent (2 min TTL per param set)
 *   faq:id:*         -- GET /api/faq/:id (10 min TTL per FAQ)
 *   stats:admin      -- GET /api/admin/stats (30 sec TTL)
 *   trending:*       -- GET /api/search/trending (5 min TTL)
 *
 * Setup: Create a free Upstash Redis database at https://upstash.com
 * Then set REDIS_URL and REDIS_TOKEN in your .env
 */

import { Redis } from '@upstash/redis';
import { logger } from './logger.js';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL || !process.env.REDIS_TOKEN) return null;
  if (!redis) {
    redis = new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN });
  }
  return redis;
}

function hashQuery(text: string): string {
  let hash = 0;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  return `sc:${hash.toString(36)}`;
}

const RESULT_TTL = 15 * 60; // 15 minutes TTL to prevent Redis memory bloat on 1000+ concurrent users

export async function getCachedResults(query: string): Promise<{ results: unknown[] } | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const key = `result:${hashQuery(query)}`;
    const cached = await client.get<{ results: unknown[] }>(key);
    if (cached) logger.info(`[cache HIT] "${query.slice(0, 40)}"`);
    return cached ?? null;
  } catch (err) {
    logger.warn(`[cache] get failed: ${(err as Error).message}`);
    return null;
  }
}

export async function setCachedResults(query: string, results: unknown[]): Promise<void> {
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

export async function invalidateCache(): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    let cursor = 0;
    let totalDeleted = 0;
    do {
      const [nextCursor, keys] = await client.scan<Record<string, unknown>>(cursor, { match: 'result:*', count: 100 });
      cursor = Number(nextCursor);
      if (keys.length > 0) { await client.del(...keys); totalDeleted += keys.length; }
    } while (cursor !== 0);
    if (totalDeleted > 0) logger.info(`[cache] invalidated ${totalDeleted} entries`);
  } catch (err) {
    logger.warn(`[cache] invalidate failed: ${(err as Error).message}`);
  }
}

export const cacheAvailable = (): boolean => getRedis() !== null;

// ---- Generic key-value cache helpers ----------------------------------------

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const val = await client.get<T>(key);
    if (val !== null && val !== undefined) logger.info(`[cache HIT] ${key}`);
    return val ?? null;
  } catch (err) {
    logger.warn(`[cache] cacheGet(${key}) failed: ${(err as Error).message}`);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, value, { ex: ttlSeconds });
    logger.info(`[cache SET] ${key} (TTL ${ttlSeconds}s)`);
  } catch (err) {
    logger.warn(`[cache] cacheSet(${key}) failed: ${(err as Error).message}`);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getRedis();
  if (!client || keys.length === 0) return;
  try {
    await client.del(...keys);
    logger.info(`[cache DEL] ${keys.join(', ')}`);
  } catch (err) {
    logger.warn(`[cache] cacheDel failed: ${(err as Error).message}`);
  }
}

export async function invalidateByPattern(pattern: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    let cursor = 0;
    let total = 0;
    do {
      const [nextCursor, keys] = await client.scan<Record<string, unknown>>(cursor, { match: pattern, count: 100 });
      cursor = Number(nextCursor);
      if (keys.length > 0) { await client.del(...keys); total += keys.length; }
    } while (cursor !== 0);
    if (total > 0) logger.info(`[cache] invalidated ${total} keys matching "${pattern}"`);
  } catch (err) {
    logger.warn(`[cache] invalidateByPattern(${pattern}) failed: ${(err as Error).message}`);
  }
}
