/**
 * registrationGate.ts — server-side gate for /api/auth/register.
 *
 * Two exports:
 *   - `checkRegistrationAllowed(token)`: pure helper that returns a
 *     discriminated-union decision. Used by `registrationGate` below
 *     and exposed for callers that want the decision without
 *     terminating the request (e.g. tests).
 *   - `registrationGate`: Express middleware that runs `checkRegistrationAllowed`,
 *     terminates with 403 on failure, otherwise calls next().
 *
 * Enforces the v1.70 controlled-registration spec:
 *   - registrationEnabled must be true (admin toggle)
 *   - either the caller supplies the current inviteToken, OR the
 *     admin has flipped the `openForAll` flag (anyone can register)
 *
 * Token comparison uses `crypto.timingSafeEqual` against the stored
 * plaintext token. The plaintext storage is intentional — see the
 * doc-comment on `models/RegistrationConfig.ts`.
 */
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import RegistrationConfig from '../../modules/program/registration-config.model.js';
import { authLog } from '../http/logger.js';

export type RegistrationDecision =
  | { ok: true }
  | { ok: false; reason: 'disabled' | 'missing_token' | 'invalid_token' | 'unauthorized_domain' };

/**
 * Constant-time string comparison. Returns false if lengths differ
 * (but still runs a comparison against a zero buffer of the same
 * length to keep wall-clock time independent of the mismatch cause).
 */
function safeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, Buffer.alloc(ab.length));
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Decide whether a /api/auth/register call may proceed.
 *
 * Reads the RegistrationConfig singleton on every call so an admin
 * toggle change takes effect immediately (no cache lag, per spec).
 * The query is a single `findById('singleton').lean()` — small
 * enough that even at 1k registrations/day the overhead is
 * negligible.
 */
export async function checkRegistrationAllowed(
  providedToken: string | undefined,
  email: string | undefined,
): Promise<RegistrationDecision> {
  // Defensive: if the singleton was never created (e.g. seed skipped),
  // deny rather than allow by default.
  const config = await RegistrationConfig.findById('singleton')
    .select('registrationEnabled openForAll inviteToken allowedDomains')
    .lean();
  if (!config) {
    return { ok: false, reason: 'disabled' };
  }
  if (!config.registrationEnabled) {
    return { ok: false, reason: 'disabled' };
  }

  // Check email domain restriction if configured
  if (config.allowedDomains && config.allowedDomains.length > 0) {
    if (!email) {
      return { ok: false, reason: 'unauthorized_domain' };
    }
    const domain = email.split('@').pop()?.trim().toLowerCase();
    if (!domain || !config.allowedDomains.includes(domain)) {
      return { ok: false, reason: 'unauthorized_domain' };
    }
  }

  // v1.7x — "Open for all" mode. When the admin has flipped this on,
  // anyone with a valid email + password may register without an
  // `?token=...` invite link. The stored inviteToken is left alone so
  // the admin can flip the mode back without regenerating.
  if (config.openForAll) {
    return { ok: true };
  }
  if (!providedToken) {
    return { ok: false, reason: 'missing_token' };
  }
  if (!safeStringEqual(providedToken, config.inviteToken)) {
    return { ok: false, reason: 'invalid_token' };
  }
  return { ok: true };
}

/**
 * Express middleware that enforces the registration gate. Mounted
 * BEFORE `validateBody` on the /api/auth/register route so it 403s
 * on closed/invalid-token requests before the Zod schema runs —
 * saves a validator pass on doomed requests and keeps the public
 * error surface tight (a 400 with field errors leaks the schema's
 * existence; a 403 doesn't).
 *
 * Token arrives as `?token=...` in the query string. We read it
 * from req.query so the gate works even when the body is malformed.
 *
 * On success, attaches nothing to req — the controller still owns
 * its own request shape. On failure, terminates with a 403 + JSON
 * `{ message }` shaped exactly like the controller would have produced.
 */
export async function registrationGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : undefined;
    const email = typeof req.body.email === 'string' ? req.body.email : undefined;
    const decision = await checkRegistrationAllowed(token, email);
    if (!decision.ok) {
      const messages: Record<typeof decision.reason, string> = {
        disabled: 'New user registration is currently disabled.',
        missing_token: 'Registration requires a valid invite link.',
        invalid_token: 'This invite link is invalid or has been revoked.',
        unauthorized_domain: 'Registration is restricted to authorized email domains.',
      };
      authLog.warn('register blocked', {
        reason: decision.reason,
        email: (req.body as { email?: string } | undefined)?.email,
        ip: req.ip,
      });
      res.status(403).json({ message: messages[decision.reason] });
      return;
    }
    next();
  } catch (err) {
    // Fail closed: if the gate can't decide (e.g. DB blip), don't
    // allow registration through. Log and 503 so operators see it.
    authLog.error('register gate error', { error: (err as Error).message });
    res.status(503).json({ message: 'Registration is temporarily unavailable. Try again shortly.' });
  }
}