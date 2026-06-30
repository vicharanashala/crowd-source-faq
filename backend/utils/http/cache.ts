import { Redis as UpstashRedis } from '@upstash/redis';
import IoRedis from 'ioredis';
import { logger } from './logger.js';

interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ex?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  scan(cursor: number, match: string, count: number): Promise<[number, string[]]>;
}

let activeAdapter: CacheAdapter | null = null;

const upstashAdapter = (client: UpstashRedis): CacheAdapter => ({
  async get<T>(key: string) {
    return await client.get<T>(key);
  },
  async set(key: string, value: unknown, ex?: number) {
    if (ex) {
      await client.set(key, value, { ex });
    } else {
      await client.set(key, value);
    }
  },
  async del(...keys: string[]) {
    if (keys.length > 0) {
      await client.del(...keys);
    }
  },
  async scan(cursor: number, match: string, count: number) {
    const [nextCursor, keys] = await client.scan(cursor, { match, count });
    return [Number(nextCursor), keys];
  }
});

const tcpAdapter = (client: IoRedis): CacheAdapter => ({
  async get<T>(key: string) {
    const data = await client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  },
  async set(key: string, value: unknown, ex?: number) {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (ex) {
      await client.set(key, data, 'EX', ex);
    } else {
      await client.set(key, data);
    }
  },
  async del(...keys: string[]) {
    if (keys.length > 0) {
      await client.del(keys);
    }
  },
  async scan(cursor: number, match: string, count: number) {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', match, 'COUNT', count);
    return [Number(nextCursor), keys];
  }
});

function getCache(): CacheAdapter | null {
  if (activeAdapter) return activeAdapter;

  const tcpUrl = process.env.REDIS_TCP_URL;
  if (tcpUrl) {
    try {
      const IoRedisClass = (IoRedis as any).default || IoRedis;
      const client = new IoRedisClass(tcpUrl);
      client.on('error', (err: any) => {
        logger.warn(`[cache] TCP Redis client error: ${err.message}`);
      });
      activeAdapter = tcpAdapter(client);
      logger.info(`[cache] Connected to local TCP Redis: ${tcpUrl.split('@').pop()}`);
      return activeAdapter;
    } catch (err: any) {
      logger.warn(`[cache] Failed to initialize local TCP Redis client: ${err.message}`);
    }
  }

  const upstashUrl = process.env.REDIS_URL;
  const upstashToken = process.env.REDIS_TOKEN;
  if (upstashUrl && upstashToken) {
    try {
      const client = new UpstashRedis({ url: upstashUrl, token: upstashToken });
      activeAdapter = upstashAdapter(client);
      logger.info(`[cache] Connected to Upstash Redis: ${upstashUrl}`);
      return activeAdapter;
    } catch (err: any) {
      logger.warn(`[cache] Failed to initialize Upstash Redis client: ${err.message}`);
    }
  }

  return null;
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
  const client = getCache();
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
  const client = getCache();
  if (!client) return;
  try {
    const key = `result:${hashQuery(query)}`;
    await client.set(key, { results }, RESULT_TTL);
    logger.info(`[cache SET] "${query.slice(0, 40)}"`);
  } catch (err) {
    logger.warn(`[cache] set failed: ${(err as Error).message}`);
  }
}

export async function invalidateCache(): Promise<void> {
  const client = getCache();
  if (!client) return;
  try {
    let cursor = 0;
    let totalDeleted = 0;
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'result:*', 100);
      cursor = nextCursor;
      if (keys.length > 0) { await client.del(...keys); totalDeleted += keys.length; }
    } while (cursor !== 0);
    if (totalDeleted > 0) logger.info(`[cache] invalidated ${totalDeleted} entries`);
  } catch (err) {
    logger.warn(`[cache] invalidate failed: ${(err as Error).message}`);
  }
}

export const cacheAvailable = (): boolean => getCache() !== null;

// ---- Generic key-value cache helpers ----------------------------------------

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getCache();
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
  const client = getCache();
  if (!client) return;
  try {
    await client.set(key, value, ttlSeconds);
    logger.info(`[cache SET] ${key} (TTL ${ttlSeconds}s)`);
  } catch (err) {
    logger.warn(`[cache] cacheSet(${key}) failed: ${(err as Error).message}`);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getCache();
  if (!client || keys.length === 0) return;
  try {
    await client.del(...keys);
    logger.info(`[cache DEL] ${keys.join(', ')}`);
  } catch (err) {
    logger.warn(`[cache] cacheDel failed: ${(err as Error).message}`);
  }
}

export async function invalidateByPattern(pattern: string): Promise<void> {
  const client = getCache();
  if (!client) return;
  try {
    let cursor = 0;
    let total = 0;
    do {
      const [nextCursor, keys] = await client.scan(cursor, pattern, 100);
      cursor = nextCursor;
      if (keys.length > 0) { await client.del(...keys); total += keys.length; }
    } while (cursor !== 0);
    if (total > 0) logger.info(`[cache] invalidated ${total} keys matching "${pattern}"`);
  } catch (err) {
    logger.warn(`[cache] invalidateByPattern(${pattern}) failed: ${(err as Error).message}`);
  }
}
