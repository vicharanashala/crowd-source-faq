/**
 * Advanced rate limiting utilities.
 *
 * Provides per-identity (userId or IP) rate limiters that are stricter than
 * the global IP-based limiter in server.ts. Supports:
 *  - Brute-force login protection (per-email lockout)
 *  - Per-user privileged action limits
 *  - Per-IP stricter limits for sensitive unauthenticated routes
 *
 * v1.70 — Redis-backed via rate-limit-redis when REDIS_TCP_URL is set
 * (see `rateLimitRedis.ts`). When unset, falls back to express-rate-limit's
 * in-memory Map — fine for single-instance dev/test, but bypassable when
 * the backend runs on multiple replicas (each replica has its own Map).
 * Fixes issue #6.
 */

import rateLimit, { ipKeyGenerator, type Store } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { type Request, type Response } from 'express';
import { logger } from '../http/logger.js';
import { getRedisRateLimitStore } from './rateLimitRedis.js';

// ─── Shared key extractors ────────────────────────────────────────────────────

/**
 * Choose a rate-limit key for requests.
 * - If a Bearer JWT is present and verifies, we key by the user id.
 * - If not (missing/invalid token), we key by the client IP instead.
 */
function userOrIp(req: Request): string {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { id: string };
      return `uid:${decoded.id}`;
    } catch (err) {
      logger.warn(`[rateLimit] JWT verification failed for rate limiting key: ${(err as Error).message}`);
      /* fall through to IP */
    }
  }
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

/**
 * Rate-limit key that is always the client IP.
 * Used for endpoints where there is no reliable logged-in identity.
 */
function ipOnly(req: Request): string {
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

// ─── Generic per-identity limiter factory ─────────────────────────────────────

interface LimiterConfig {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  /** Receives (req, res) — second param is required by express-rate-limit's interface */
  keyFn?: (req: Request, res: Response) => string;
  message?: string;
}

/**
 * Factory: builds a configured express-rate-limit middleware.
 *
 * It limits “how many requests are allowed per unique key” inside a
 * time window (windowMs). When REDIS_TCP_URL is set, the store is
 * the Redis-backed RedisStore returned by getRedisRateLimitStore()
 * — limits are shared across all replicas hitting the same Redis.
 * Otherwise express-rate-limit uses its in-memory Map.
 */
export function createIdentityLimiter(config: LimiterConfig) {
  // Resolve the store once per limiter. To prevent sharing a single
  // RedisStore instance across multiple rate limiters (which throws
  // ERR_ERL_STORE_REUSE), we pass the unique keyPrefix to create
  // a dedicated RedisStore instance per limiter using the shared Redis client.
  const prefix = config.keyPrefix || 'default';
  const store: Store | undefined = getRedisRateLimitStore(prefix);
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    keyGenerator: (req: Request, _res: Response): string => {
      const k = config.keyFn ? config.keyFn(req, _res) : userOrIp(req);
      return k ?? 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: config.message ?? 'Too many requests, please try again later.',
    // When the Redis store is available, attach it so express-rate-limit
    // uses it. When undefined, express-rate-limit uses its default
    // MemoryStore (correct fallback).
    store: store,
  });
}

// ─── Pre-built limiters ────────────────────────────────────────────────────────

/**
 * Login brute-force protection:
 * - 10 attempts per email/IP per 2 minutes
 * - Keyed by email + IP so a single attacking IP can't lock out a victim
 */
export const loginLimiter = createIdentityLimiter({
  windowMs: 2 * 60 * 1000,
  max: 10,
  keyPrefix: 'rl_login',
  keyFn: (req: Request) => {
    const email = (req.body as { email?: string })?.email ?? '';
    return `login:${email.toLowerCase()}:${ipKeyGenerator(req.ip ?? 'unknown')}`;
  },
  message: 'Too many login attempts for this account. Please try again in 2 minutes.',
});

/**
 * Registration spam protection:
 * - 5 registrations per IP per 15 minutes
 */
export const registerLimiter = createIdentityLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl_reg',
  keyFn: ipOnly,
  message: 'Too many registration attempts from this IP. Please try again in 15 minutes.',
});

/**
 * Password change brute-force protection:
 * - 5 attempts per user per 2 minutes
 */
export const passwordChangeLimiter = createIdentityLimiter({
  windowMs: 2 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl_pw',
  message: 'Too many password change attempts. Please try again in 2 minutes.',
});

/**
 * Admin write action limiter (strict):
 * - 30 actions per user per minute (create, update, delete, moderation)
 */
export const adminWriteLimiter = createIdentityLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'rl_admin_write',
  message: 'Too many admin actions. Please slow down.',
});

/**
 * 2FA action limiter (very strict):
 * - 10 attempts per user per minute
 * - Prevents brute-forcing TOTP codes
 */
export const twoFALimiter = createIdentityLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'rl_2fa',
  message: 'Too many 2FA attempts. Please try again in a minute.',
});

/**
 * Per-user API burst limiter:
 * - 60 requests per user per minute (in addition to global IP limit)
 * - Catches authenticated abuse that slips past the 300 req/2m IP limit
 */
export const userBurstLimiter = createIdentityLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: 'rl_user_burst',
  message: 'Request rate limit exceeded. Please wait a moment.',
});