import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockScan = vi.fn();

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      get = mockGet;
      set = mockSet;
      del = mockDel;
      scan = mockScan;
    }
  };
});

import { cacheGet, cacheSet, cacheDel, invalidateByPattern } from '../utils/http/cache.js';

describe('Redis Cache Helper Integration', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...oldEnv,
      REDIS_URL: 'https://test-redis.upstash.io',
      REDIS_TOKEN: 'test-token',
    };
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  it('cacheGet: returns null when not found in cache', async () => {
    mockGet.mockResolvedValueOnce(null);
    const result = await cacheGet('test-key');
    expect(result).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('test-key');
  });

  it('cacheGet: returns cached value when found', async () => {
    const cachedData = { foo: 'bar' };
    mockGet.mockResolvedValueOnce(cachedData);
    const result = await cacheGet('test-key');
    expect(result).toEqual(cachedData);
    expect(mockGet).toHaveBeenCalledWith('test-key');
  });

  it('cacheSet: sets the value in redis with the correct key and TTL option', async () => {
    mockSet.mockResolvedValueOnce('OK');
    await cacheSet('test-key', { data: 123 }, 60);
    expect(mockSet).toHaveBeenCalledWith('test-key', { data: 123 }, { ex: 60 });
  });

  it('cacheDel: calls client.del with the keys', async () => {
    mockDel.mockResolvedValueOnce(1);
    await cacheDel('key1', 'key2');
    expect(mockDel).toHaveBeenCalledWith('key1', 'key2');
  });

  it('invalidateByPattern: scans and deletes matching keys', async () => {
    mockScan.mockResolvedValueOnce(['0', ['key1', 'key2']]);
    mockDel.mockResolvedValueOnce(2);

    await invalidateByPattern('faq:*');

    expect(mockScan).toHaveBeenCalledWith(0, { match: 'faq:*', count: 100 });
    expect(mockDel).toHaveBeenCalledWith('key1', 'key2');
  });
});
