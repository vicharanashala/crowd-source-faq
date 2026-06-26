/**
 * Redis Semantic Cache — Upstash Redis (serverless-compatible)
 *
 * Caches search query embeddings and results to avoid recomputing on repeat queries.
 * FAQ systems typically see 80-95% cache hit rates on queries.
 *
 * Setup: Create a free Upstash Redis database at https://upstash.com
 * Then set REDIS_URL and REDIS_TOKEN in your .env
 */

import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';
import { logger } from './logger.js';
import { loadConfig } from '../../config/loader.js';

// Unified Cache Client Interface
interface CacheClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, options?: { ex: number }): Promise<void>;
  scan<T = any>(cursor: number, options: { match: string; count: number }): Promise<[number, string[]]>;
  del(...keys: string[]): Promise<void>;
}

let redisClient: CacheClient | null = null;
let useLocalFallback = false;

function getRedis(): CacheClient | null {
  if (redisClient) return redisClient;

  // 1. Try Upstash REST Client first if configured and fallback is not active
  const config = loadConfig();
  const upstashUrl = config.redis.url;
  const upstashToken = config.redis.token;
  
  if (!useLocalFallback && upstashUrl && upstashUrl.startsWith('http') && upstashToken && upstashToken !== '#') {
    try {
      const client = new UpstashRedis({
        url: upstashUrl,
        token: upstashToken,
      });
      // Wrap Upstash client
      redisClient = {
        async get<T>(key: string): Promise<T | null> {
          try {
            return await client.get<T>(key);
          } catch (err) {
            handleClientError(err);
            throw err;
          }
        },
        async set(key: string, value: any, options?: { ex: number }): Promise<void> {
          try {
            await client.set(key, value, options);
          } catch (err) {
            handleClientError(err);
            throw err;
          }
        },
        async scan(cursor: number, options: { match: string; count: number }): Promise<[number, string[]]> {
          try {
            const [nextCursor, keys] = await client.scan(cursor, options);
            return [Number(nextCursor), keys];
          } catch (err) {
            handleClientError(err);
            throw err;
          }
        },
        async del(...keys: string[]): Promise<void> {
          try {
            await client.del(...keys);
          } catch (err) {
            handleClientError(err);
            throw err;
          }
        }
      };
      return redisClient;
    } catch (err) {
      logger.warn(`[cache] Failed to initialize Upstash Redis REST client: ${(err as Error).message}`);
    }
  }

  // 2. Fall back to local TCP Redis using ioredis
  return getLocalRedisClient();
}

function getLocalRedisClient(): CacheClient | null {
  // v1.71 — guard against the "prod has no Redis container" footgun.
  // Before this, prod would silently attempt redis://127.0.0.1:6379 on
  // every cache miss (Upstash REST errors switch us to local fallback).
  // Each attempt stalls the request for ~10s on ECONNREFUSED, which
  // manifests as 502 from nginx via proxy_read_timeout. Now: only attempt
  // the local fallback in dev, or when the operator has explicitly set
  // REDIS_LOCAL_URL. In prod without that var we return null and the
  // cache becomes a no-op — slower, but the site stays up.
  const isDev = process.env.NODE_ENV === 'development';
  const localUrlExplicit = !!process.env.REDIS_LOCAL_URL;
  if (!isDev && !localUrlExplicit) {
    logger.warn('[cache] Skipping local Redis fallback (NODE_ENV=production and REDIS_LOCAL_URL not set). Cache will be a no-op.');
    return null;
  }
  try {
    const localUrl = process.env.REDIS_LOCAL_URL || 'redis://127.0.0.1:6379';
    const localIo = new IORedis(localUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    localIo.on('error', (err) => {
      // Suppress local connection errors to prevent crashes
    });
    
    redisClient = {
      async get<T>(key: string): Promise<T | null> {
        const val = await localIo.get(key);
        return val ? JSON.parse(val) as T : null;
      },
      async set(key: string, value: any, options?: { ex: number }): Promise<void> {
        const stringVal = JSON.stringify(value);
        if (options?.ex) {
          await localIo.set(key, stringVal, 'EX', options.ex);
        } else {
          await localIo.set(key, stringVal);
        }
      },
      async scan(cursor: number, options: { match: string; count: number }): Promise<[number, string[]]> {
        const [nextCursor, keys] = await localIo.scan(cursor, 'MATCH', options.match, 'COUNT', options.count);
        return [Number(nextCursor), keys];
      },
      async del(...keys: string[]): Promise<void> {
        if (keys.length > 0) {
          await localIo.del(...keys);
        }
      }
    };
    logger.info(`[cache] Initialized local fallback IORedis client pointing to ${localUrl}`);
    return redisClient;
  } catch (err) {
    logger.warn(`[cache] Failed to initialize local fallback IORedis: ${(err as Error).message}`);
    return null;
  }
}

function handleClientError(err: any) {
  const msg = (err as Error).message || '';
  const lowerMsg = msg.toLowerCase();
  if (
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('limit exceeded') ||
    lowerMsg.includes('max requests')
  ) {
    if (!useLocalFallback) {
      logger.warn(`[cache] Upstash Redis error detected: ${msg}. Switching to local Redis fallback.`);
      useLocalFallback = true;
      redisClient = null; // Clear client to force rebuild with local
    }
  }
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
