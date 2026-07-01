/**
 * loader.ts - v1.71 REDIS_URL fallback test.
 * Covers: REDIS_URL set + REDIS_TCP_URL set (tcpUrl wins),
 *         REDIS_URL set + REDIS_TCP_URL unset (fallback to REDIS_URL),
 *         neither set (tcpUrl empty default).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('loader - REDIS_URL fallback to tcpUrl (v1.71)', () => {
  let originalRedisUrl: string | undefined;
  let originalRedisTcpUrl: string | undefined;
  let originalRedisToken: string | undefined;

  beforeEach(() => {
    originalRedisUrl = process.env.REDIS_URL;
    originalRedisTcpUrl = process.env.REDIS_TCP_URL;
    originalRedisToken = process.env.REDIS_TOKEN;
  });

  afterEach(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    if (originalRedisTcpUrl === undefined) delete process.env.REDIS_TCP_URL;
    else process.env.REDIS_TCP_URL = originalRedisTcpUrl;
    if (originalRedisToken === undefined) delete process.env.REDIS_TOKEN;
    else process.env.REDIS_TOKEN = originalRedisToken;
    // Reset module cache so loadConfig() re-reads env next test.
    vi.resetModules();
  });

  it('REDIS_TCP_URL wins over REDIS_URL when both are set', async () => {
    process.env.REDIS_TCP_URL = 'rediss://default:real-tcp-token@tcp-host:6379';
    process.env.REDIS_URL = 'rediss://default:rest-token@rest-host:6379';
    process.env.REDIS_TOKEN = 'rest-token';

    const { loadConfig } = await import('../loader.js');
    const cfg = loadConfig(true);
    expect(cfg.redis.tcpUrl).toBe('rediss://default:real-tcp-token@tcp-host:6379');
    expect(cfg.redis.url).toBe('rediss://default:rest-token@rest-host:6379');
  });

  it('falls back to REDIS_URL as tcpUrl when REDIS_TCP_URL is unset', async () => {
    process.env.REDIS_URL = 'rediss://default:rest-token@discrete-tuna-132602.upstash.io:6379';
    process.env.REDIS_TOKEN = 'rest-token';
    delete process.env.REDIS_TCP_URL;

    const { loadConfig } = await import('../loader.js');
    const cfg = loadConfig(true);
    expect(cfg.redis.tcpUrl).toBe('rediss://default:rest-token@discrete-tuna-132602.upstash.io:6379');
    expect(cfg.redis.url).toBe('rediss://default:rest-token@discrete-tuna-132602.upstash.io:6379');
  });

  it('leaves tcpUrl empty when neither env var is set', async () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_TCP_URL;
    delete process.env.REDIS_TOKEN;

    const { loadConfig } = await import('../loader.js');
    const cfg = loadConfig(true);
    expect(cfg.redis.tcpUrl).toBe('');
    expect(cfg.redis.url).toBe('');
  });
});
