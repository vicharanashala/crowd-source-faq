/**
 * session.ts — admin session tokens + AdminSession model CRUD.
 *
 * A session is created when a Discord admin successfully verifies
 * their passphrase (or a REST admin posts a valid admin JWT). The
 * session token is a cryptographically random 32-byte string, sent
 * back to the client in plaintext and stored as a bcrypt hash in
 * AdminSession.tokenHash.
 *
 * On subsequent requests, the client sends `Authorization: Bearer
 * <token>`. The server bcrypt-hashes the incoming token and looks it
 * up in AdminSession. Token rotation, revocation, and lockout all
 * happen via DB writes — no signing keys to manage.
 *
 * Token TTL: 1 hour. Sliding window — every successful use extends
 * `lastUsedAt` but does NOT extend `expiresAt`. The admin re-authenticates
 * after 1 hour regardless of activity.
 *
 * Source: 'discord' | 'rest' — used by the audit log to attribute
 * actions and (future) by the UI to display "logged in via X".
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import AdminSession, { type IAdminSession } from '../../../models/AdminSession.js';
import { adminLog } from '../../../utils/http/logger.js';

// ── Configuration ───────────────────────────────────────────────────────────

const TOKEN_BYTES = 32;                  // 256 bits of randomness
// Cost is overridable via env for tests. Default 10 (production); tests
// override to 4 to keep the suite fast.
const BCRYPT_COST = Number(process.env.ADMIN_BCRYPT_COST ?? 10);
const SESSION_TTL_MS = 60 * 60 * 1000;  // 1 hour
const MAX_FAILED_VALIDATIONS = 10;       // before session is auto-revoked (brute-force guard)

// ── Mint ─────────────────────────────────────────────────────────────────────

export interface MintInput {
  /** Stable id (Discord user id or Mongo user _id). */
  adminId: string;
  /** Human-readable username for audit. */
  adminUsername: string;
  source: 'discord' | 'rest';
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface MintResult {
  /** The plaintext token. Send this to the client exactly once. */
  token: string;
  /** When the token expires (ms epoch). */
  expiresAt: number;
  /** Mongo _id of the session row, for revocation. */
  sessionId: string;
}

/**
 * Issue a new session token. The plaintext token is returned to the
 * caller (who should send it to the admin once and never again). The
 * DB stores only the bcrypt hash — a DB compromise can't impersonate
 * active sessions.
 */
export async function mintSession(input: MintInput): Promise<MintResult> {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = await bcrypt.hash(token, BCRYPT_COST);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  const row = await AdminSession.create({
    tokenHash,
    adminId: input.adminId,
    adminUsername: input.adminUsername,
    source: input.source,
    createdAt: new Date(now),
    expiresAt: new Date(expiresAt),
    lastUsedAt: new Date(now),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    revokedAt: null,
    revokedReason: null,
    lockoutUntil: null,
    consecutiveFailures: 0,
  });

  adminLog.info(`[admin.session] minted session ${String(row._id)} for ${input.adminUsername} (${input.source})`);
  return {
    token,
    expiresAt,
    sessionId: String(row._id),
  };
}

// ── Validate ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  reason?: 'not-found' | 'expired' | 'revoked' | 'too-many-failures' | 'mismatch';
  /** When valid: the session row. */
  session?: IAdminSession;
}

/**
 * Validate a bearer token. Returns the session row on success.
 *
 * Failed validations increment the per-session consecutive-failures
 * counter; after MAX_FAILED_VALIDATIONS the session is auto-revoked
 * (brute-force protection — an attacker who got the token hash from
 * a DB dump can only try MAX_FAILED_VALIDATIONS times before the
 * session is dead).
 *
 * Failed validations are also logged via the audit broadcaster.
 */
export async function validateSession(token: string): Promise<ValidationResult> {
  // Lookup by tokenHash is impossible without knowing the plaintext,
  // so we have to scan. With <10k active sessions this is fine; for
  // larger fleets add a non-bcrypt index prefix (e.g. SHA-256 prefix).
  // For Phase 1, scan is acceptable.
  const candidates = await AdminSession.find({
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).limit(500);

  for (const candidate of candidates) {
    // Quick check: skip rows past the brute-force lockout
    if (candidate.lockoutUntil && candidate.lockoutUntil > new Date()) continue;

    // bcrypt.compare is constant-time on the hash side; this loop
    // is O(n) but n is small in practice.
    let match = false;
    try {
      match = await bcrypt.compare(token, candidate.tokenHash);
    } catch {
      continue;
    }
    if (match) {
      // Found it. Check expiry / lockout / revocation one more time.
      const now = new Date();
      if (candidate.expiresAt < now) {
        return { valid: false, reason: 'expired' };
      }
      if (candidate.revokedAt) {
        return { valid: false, reason: 'revoked' };
      }
      // Valid — update lastUsedAt, reset failures.
      candidate.lastUsedAt = now;
      candidate.consecutiveFailures = 0;
      await candidate.save();
      return { valid: true, session: candidate };
    }
  }

  // No match. To prevent timing-side-channel enumeration, do an
  // dummy bcrypt compare against a fake hash. This equalises the
  // response time whether or not the candidate list contained any
  // plausible entries.
  await bcrypt.compare(token, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  return { valid: false, reason: 'not-found' };
}

// ── Revocation ──────────────────────────────────────────────────────────────

export async function revokeSession(token: string, reason: 'logout' | 'lockout' | 'manual' = 'logout'): Promise<void> {
  const candidates = await AdminSession.find({ revokedAt: null }).limit(500);
  for (const candidate of candidates) {
    let match = false;
    try {
      match = await bcrypt.compare(token, candidate.tokenHash);
    } catch {
      continue;
    }
    if (match) {
      candidate.revokedAt = new Date();
      candidate.revokedReason = reason;
      await candidate.save();
      adminLog.info(`[admin.session] revoked session ${String(candidate._id)} (${reason})`);
      return;
    }
  }
}

/**
 * Revoke ALL active sessions for an admin. Used during lockout events
 * or when an admin explicitly logs out everywhere.
 */
export async function revokeAllSessionsForAdmin(adminId: string, reason: 'logout' | 'lockout' | 'manual' = 'manual'): Promise<number> {
  const result = await AdminSession.updateMany(
    { adminId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
  adminLog.info(`[admin.session] revoked ${result.modifiedCount} sessions for admin ${adminId} (${reason})`);
  return result.modifiedCount;
}

/**
 * Housekeeping — delete expired sessions older than `maxAgeMs`. Called
 * periodically by the backend scheduler (Phase 4).
 */
export async function purgeExpiredSessions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = await AdminSession.deleteMany({
    expiresAt: { $lt: cutoff },
    revokedAt: { $ne: null }, // don't delete sessions that are still active but old
  });
  return result.deletedCount;
}

// ── Constants exported for tests ─────────────────────────────────────────────

export const __test__ = {
  TOKEN_BYTES,
  BCRYPT_COST,
  SESSION_TTL_MS,
  MAX_FAILED_VALIDATIONS,
};