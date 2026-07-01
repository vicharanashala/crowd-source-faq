import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ConfigSchema, type AppConfig } from './schema.js';

function isObject(item: unknown): item is Record<string, unknown> {
  return !!item && typeof item === 'object' && !Array.isArray(item);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

let cachedConfig: AppConfig | null = null;

export function loadConfig(forceReload = false): AppConfig {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  const env = process.env.NODE_ENV ?? 'development';
  // Config files are located at the root of the backend app folder.
  const configDir = process.cwd();

  const defaultPath = path.join(configDir, 'config.default.yaml');
  if (!fs.existsSync(defaultPath)) {
    throw new Error(`Default configuration file not found at: ${defaultPath}`);
  }

  // 1. Load defaults
  const defaults = yaml.load(fs.readFileSync(defaultPath, 'utf8')) as Record<string, unknown>;

  // 2. Load environment-specific override if it exists
  const envPath = path.join(configDir, `config.${env}.yaml`);
  const overrides = fs.existsSync(envPath)
    ? (yaml.load(fs.readFileSync(envPath, 'utf8')) as Record<string, unknown>)
    : {};

  // 3. Deep merge overrides into defaults
  const merged = deepMerge(defaults, overrides);

  // Bind process.env overrides dynamically for Redis settings
  if (!merged.redis) {
    merged.redis = {};
  }
  const mergedRedis = merged.redis as Record<string, unknown>;
  if (process.env.REDIS_URL !== undefined) {
    mergedRedis.url = process.env.REDIS_URL;
    // v1.71 — REDIS_URL is the Upstash REST URL. In some deploys
    // (notably the current prod setup) the operator sets REDIS_URL
    // + REDIS_TOKEN but forgets REDIS_TCP_URL — the env var the
    // BullMQ document queue actually reads. Without this fallback,
    // the queue silently uses redis://127.0.0.1:6379 (a non-existent
    // local Redis in prod), produces ECONNREFUSED every ~2s, and
    // spam-floods Discord even with the v1.71 throttle (one warn per
    // 30s per message — still noisy). Accept REDIS_URL as the TCP
    // source too: REDIS_TCP_URL wins if both are set.
    if (!process.env.REDIS_TCP_URL) {
      mergedRedis.tcpUrl = process.env.REDIS_URL;
    }
  }
  if (process.env.REDIS_TOKEN !== undefined) {
    mergedRedis.token = process.env.REDIS_TOKEN;
  }
  if (process.env.REDIS_TCP_URL !== undefined) {
    mergedRedis.tcpUrl = process.env.REDIS_TCP_URL;
  }

  // 4. Validate schema with Zod
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    console.error('❌ Configuration validation failed:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Configuration validation failed');
  }

  // 5. Freeze config object to make it immutable at runtime
  cachedConfig = Object.freeze(result.data);
  return cachedConfig;
}
