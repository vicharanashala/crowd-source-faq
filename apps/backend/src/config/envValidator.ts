import { logger } from '../utils/http/logger.js';
import { getGcsConfig } from '../integrations/gcs/gcs.js';

// ─────────────────────────────────────────────────────────────────────────
// Fix for #232 — by Aswini Kumar Dhar
//
// WHAT CHANGED: validateEnv() used to call process.exit(1) directly when
// a required env var was missing/invalid. Now it throws this typed error
// instead, and lets the caller decide what to do with it.
//
// WHY: process.exit(1) kills the entire process the instant it's called —
// including the Vitest test runner, if a test tries to call validateEnv()
// with a deliberately broken environment to check that it would fail.
// There was no way to write a unit test for "does validateEnv() correctly
// detect a missing MONGODB_URI" without the whole test suite dying along
// with it. Throwing an error instead makes the failure catchable — tests
// can assert on it normally with expect(...).toThrow(), and the real
// server (server.ts) can still catch it and exit exactly as before.
//
// `errors` carries every individual problem found (e.g. both a missing
// MONGODB_URI AND a too-short JWT_SECRET at once), so whoever catches this
// can log each line separately, matching the old multi-line log output.
// ─────────────────────────────────────────────────────────────────────────
export class EnvValidationError extends Error {
  public readonly errors: string[];
  constructor(errors: string[]) {
    super(`Environment validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    this.name = 'EnvValidationError';
    this.errors = errors;
  }
}

export function validateEnv(): void {
  const errors: string[] = [];

  // Required: MONGODB_URI
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    errors.push('MONGODB_URI is required');
  } else if (!/^mongodb(\+srv)?:\/\/.+/.test(mongoUri)) {
    errors.push('MONGODB_URI must be a mongodb:// or mongodb+srv:// URL');
  }

  // Required: JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required');
  } else if (jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  // Recommendation warning logs
  if (!process.env.ENCRYPTION_MASTER_KEY) {
    logger.warn('[validateEnv] ENCRYPTION_MASTER_KEY not set — falling back to JWT_SECRET for AES. Add a dedicated key to enable independent rotation.');
  }
  if (!process.env.OAUTH_STATE_SECRET) {
    logger.warn('[validateEnv] OAUTH_STATE_SECRET not set — falling back to JWT_SECRET for OAuth state HMAC. Add a dedicated key to enable independent rotation.');
  }
  if (!process.env.DISCORD_ADMIN_PASSPHRASE) {
    if (process.env.NODE_ENV === 'production') {
      // v1.71 — downgraded from hard error to warning. The Discord admin
      // command gate re-checks per request (see integrations/discord/), so a
      // missing secret only disables the Discord admin surface, not the whole
      // site. Hard-exiting here used to 502 the entire app when Infisical
      // was missing a single optional secret.
      logger.error('[validateEnv] DISCORD_ADMIN_PASSPHRASE not set — Discord admin commands will reject all requests until configured.');
    } else {
      logger.warn('[validateEnv] DISCORD_ADMIN_PASSPHRASE not set — falling back to "adminpassphrase" as default.');
    }
  }

  // Optional: PORT
  const port = process.env.PORT;
  if (port !== undefined && !/^\d+$/.test(port)) {
    errors.push('PORT must be numeric');
  }

  const isValidConfigValue = (val: string | undefined): val is string => {
    return val !== undefined && val.trim() !== '' && val !== '###' && !val.startsWith('#');
  };

  // Optional: CLIENT_URL
  const clientUrl = process.env.CLIENT_URL;
  if (isValidConfigValue(clientUrl) && !/^https?:\/\/.+/.test(clientUrl)) {
    errors.push('CLIENT_URL must be a valid http:// or https:// URL');
  }

  // Optional: REDIS_URL
  const redisUrl = process.env.REDIS_URL;
  if (isValidConfigValue(redisUrl)) {
    if (!/^https?:\/\/.+/.test(redisUrl)) {
      logger.warn('[validateEnv] REDIS_URL is not a valid HTTP/HTTPS URL. Redis-backed rate limiting will fall back to in-memory.');
    } else {
      const redisToken = process.env.REDIS_TOKEN;
      if (!isValidConfigValue(redisToken)) {
        logger.warn('[validateEnv] REDIS_TOKEN is missing. Redis-backed rate limiting will fall back to in-memory.');
      }
    }
  }

  // Optional: Zoom OAuth
  const zoomClientId = process.env.ZOOM_CLIENT_ID;
  const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;
  const hasZoomClientId = isValidConfigValue(zoomClientId);
  const hasZoomClientSecret = isValidConfigValue(zoomClientSecret);
  if (hasZoomClientId && !hasZoomClientSecret) {
    errors.push('ZOOM_CLIENT_SECRET is required when ZOOM_CLIENT_ID is provided');
  }
  if (hasZoomClientSecret && !hasZoomClientId) {
    errors.push('ZOOM_CLIENT_ID is required when ZOOM_CLIENT_SECRET is provided');
  }
  const redirectUri = process.env.ZOOM_REDIRECT_URI;
  if (isValidConfigValue(redirectUri) && !/^https?:\/\/.+/.test(redirectUri)) {
    errors.push('ZOOM_REDIRECT_URI must be a valid URL');
  }

  if (process.env.NODE_ENV !== 'development' && !process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
    // v1.71 — downgraded from hard error to warning. The Zoom webhook
    // handler verifies the signature per-request (zoom.webhook.verifySignature
    // in config); with no secret it will simply reject every Zoom callback,
    // which is fail-closed behaviour. Hard-exiting the whole backend when
    // Zoom isn't configured caused 502s on every page load.
    logger.error('[validateEnv] ZOOM_WEBHOOK_SECRET_TOKEN not set — Zoom webhooks will be rejected until configured.');
  }

  // v1.71 — GCS image storage. Soft-check during the Cloudinary→GCS
  // migration: log a warning if missing but don't block boot, because
  // uploads signed before the cutover still hit Cloudinary. After Phase 4
  // (Cloudinary decommissioned) we'll convert this to a hard error.
  try {
    getGcsConfig();
  } catch (e) {
    const msg = (e as Error).message;
    if (process.env.NODE_ENV === 'production') {
      errors.push(msg);
    } else {
      logger.warn(`[validateEnv] ${msg} — image uploads will 503 until configured.`);
    }
  }

  // #232 — was: log every error here, then process.exit(1) right on the
  // spot. 
  // Now: just throw, and let server.ts (the actual process boot boundary)
  // decide to log + exit. Same information either way — just
  // handed off instead of acted on immediately.
  if (errors.length > 0) {
    // logger.error('Environment validation failed:');
    // errors.forEach(e => logger.error(`  - ${e}`));
    // process.exit(1);
    throw new EnvValidationError(errors);
  }

  // v1.71 — Soft warning when no Redis TCP URL is configured in prod.
  // The BullMQ document queue reads from config.redis.tcpUrl (sourced
  // from REDIS_TCP_URL or, with the v1.71 fallback, REDIS_URL). If
  // neither is set, the queue uses redis://127.0.0.1:6379, which doesn't
  // exist on the prod VPS — produces ECONNREFUSED every ~2s, which
  // spams Discord even with the throttle. Warn loudly so the next
  // deploy logs the missing config immediately.
  if (process.env.NODE_ENV === 'production'
      && !process.env.REDIS_TCP_URL
      && !process.env.REDIS_URL) {
    logger.warn('[validateEnv] No REDIS_TCP_URL or REDIS_URL configured — document queue will use local Redis fallback (redis://127.0.0.1:6379), which is not running on prod. Expect document upload 503s.');
  }

  // v1.71 — Fingerprint log on successful validation. Makes "did the
  // backend even start" instantly answerable from deploy logs without
  // needing to grep for individual env var names. Counts only, never
  // values, so safe to leave in prod logs.
  logger.info(`[validateEnv] OK env=${process.env.NODE_ENV ?? 'development'} required_keys_present=${['MONGODB_URI','JWT_SECRET'].filter(k => process.env[k]).length}/2`);
}
