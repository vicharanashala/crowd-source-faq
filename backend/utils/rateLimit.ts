/**
 * Advanced rate limiting utilities.
 *
 * Provides per-identity (userId or IP) rate limiters that are stricter than
 * the global IP-based limiter in server.ts. Supports:
 *  - Brute-force login protection (per-email lockout)
 *  - Per-user privileged action limits
 *  - Per-IP stricter limits for sensitive unauthenticated routes
 *
 * Uses in-memory Map — valid for single-instance deployments.
 * For serverless/multi-instance, replace with Redis-backed store.
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { type Request, type Response } from 'express';

// ─── Shared key extractors ────────────────────────────────────────────────────

/** Extract user ID from JWT in Authorization header, fall back to client IP. */
function userOrIp(req: Request): string {
  const auth = req.headers.authorization;

  if (auth?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { id: string };
      return `uid:${decoded.id}`;
    } catch {
      /* fall through to IP */
    }
  }

  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

/** Always use client IP — for unauthenticated routes. */
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

export function createIdentityLimiter(config: LimiterConfig) {
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
  });
}

// ─── Pre-built limiters ────────────────────────────────────────────────────────

/**
 * Login brute-force protection:
 * - 10 attempts per email/IP per 15 minutes
 * - Keyed by email + IP so a single attacking IP can't lock out a victim
 */
export const loginLimiter = createIdentityLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'rl_login',
  keyFn: (req: Request) => {
    const email = (req.body as { email?: string })?.email ?? '';
    return `login:${email.toLowerCase()}:${ipKeyGenerator(req.ip ?? 'unknown')}`;
  },
  message: 'Too many login attempts for this account. Please try again in 15 minutes.',
});

/**
 * Registration spam protection:
 * - 5 registrations per IP per hour
 */
export const registerLimiter = createIdentityLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl_reg',
  keyFn: ipOnly,
  message: 'Too many registration attempts from this IP. Please try again in an hour.',
});

/**
 * Password change brute-force protection:
 * - 5 attempts per user per 15 minutes
 */
export const passwordChangeLimiter = createIdentityLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl_pw',
  message: 'Too many password change attempts. Please try again in 15 minutes.',
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
 * - Catches authenticated abuse that slips past the 300 req/15m IP limit
 */
export const userBurstLimiter = createIdentityLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: 'rl_user_burst',
  message: 'Request rate limit exceeded. Please wait a moment.',
});