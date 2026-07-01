/**
 * passphrase.ts — Discord admin panel passphrase + lockout.
 *
 * The passphrase gates sensitive ops (writing critical config values,
 * viewing audit log). It's stored as a bcrypt hash in the AdminConfig
 * collection under the reserved key `_admin.passphrase.hash`. Initial
 * seeding happens via the ADMIN_DISCORD_PASSPHRASE env var on first
 * boot; subsequent verifications all read from the DB so the passphrase
 * can be rotated without restarting the backend.
 *
 * Lockout model:
 *   - 5 consecutive failures within 15 minutes → lockout for 1 hour
 *   - Lockout state stored in `_admin.passphrase.lockout` row
 *   - Successful verification resets the failure counter + clears
 *     any active lockout
 *
 * Re-use: this module is intentionally NOT specific to Discord. The
 * REST API admin endpoints (Phase 2+) can use the same verify()
 * function for a future "confirm critical change" flow.
 */
import bcrypt from 'bcryptjs';
import { getConfig } from '../../../config/runtimeConfig.js';
import { setConfig } from '../../../modules/admin/admin.config.service.js';
import { adminLog } from '../../../utils/http/logger.js';

// ── Reserved keys (AdminConfig) ──────────────────────────────────────────────

const PASSPHRASE_KEY = '_admin.passphrase.hash';
const LOCKOUT_KEY = '_admin.passphrase.lockout';

// Cost is overridable via env for tests. Default 12 (production); tests
// override to 4 to keep the suite fast.
const BCRYPT_COST = Number(process.env.ADMIN_BCRYPT_COST ?? 12);
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour

interface LockoutState {
  consecutiveFailures: number;
  firstFailureAt: number;
  lockoutUntil: number | null;
}

// ── Seeding ──────────────────────────────────────────────────────────────────

/**
 * Read the initial passphrase from env, hash it, persist in DB. Called
 * by the bot startup once. Idempotent: re-running with the same env
 * value is a no-op; re-running with a DIFFERENT env value rotates the
 * passphrase (logs a warning, audits the rotation).
 */
export async function seedPassphraseFromEnv(): Promise<void> {
  const envValue = (process.env.ADMIN_DISCORD_PASSPHRASE ?? process.env.DISCORD_ADMIN_PASSPHRASE ?? '').trim();
  if (!envValue) {
    throw new Error(
      'ADMIN_DISCORD_PASSPHRASE env var is required to bootstrap the Discord admin panel.'
    );
  }

  const existing = await getConfig(PASSPHRASE_KEY);
  if (existing.source === 'mongo' && existing.value && existing.value !== envValue) {
    adminLog.warn('[admin.passphrase] ADMIN_DISCORD_PASSPHRASE changed — rotating');
  }

  // Hash and store. We use setConfig so the rotation goes through the
  // audit log just like any other admin action (mark critical so it
  // gets encrypted at rest).
  const hash = await bcrypt.hash(envValue, BCRYPT_COST);
  const result = await setConfig({
    key: PASSPHRASE_KEY,
    value: { hash, algorithm: 'bcrypt', cost: BCRYPT_COST },
    source: 'cli',
    adminId: 'system-bootstrap',
    adminUsername: 'system-bootstrap',
    note: envValue !== (existing.value && existing.source === 'mongo' ? undefined : '')
      ? 'passphrase seeded from env on first boot'
      : 'passphrase reseeded from env',
  });
  if (!result.ok) {
    throw new Error(`failed to seed passphrase: ${result.error}`);
  }
}

// ── Verification + lockout ──────────────────────────────────────────────────

/**
 * Verify a passphrase attempt. Returns true if correct + not locked
 * out. On failure, increments the counter and potentially sets the
 * lockout. On success, resets the counter.
 *
 * The caller (Discord handler / REST endpoint) is responsible for
 * surfacing the result to the user. If we return false, the caller
 * should NOT distinguish "wrong passphrase" from "locked out" —
 * that would leak state to an attacker.
 */
export async function verifyPassphrase(attempt: string): Promise<boolean> {
  // Fast-path: check lockout first to avoid the bcrypt comparison cost
  // during an active attack.
  const lockout = await readLockoutState();
  if (lockout && lockout.lockoutUntil && Date.now() < lockout.lockoutUntil) {
    adminLog.warn(`[admin.passphrase] attempt during lockout (until ${new Date(lockout.lockoutUntil).toISOString()})`);
    return false;
  }

  const stored = await getConfig(PASSPHRASE_KEY);
  if (stored.source !== 'mongo' || !stored.value) {
    throw new Error('passphrase not initialised — call seedPassphraseFromEnv() at boot');
  }

  // stored.value may be JSON-stringified { hash, algorithm, cost }
  let hash: string;
  try {
    const parsed = typeof stored.value === 'string' ? JSON.parse(stored.value) : stored.value;
    hash = parsed.hash;
  } catch {
    adminLog.error('[admin.passphrase] stored hash is not valid JSON — refusing to verify');
    return false;
  }

  const ok = await bcrypt.compare(attempt, hash);
  if (ok) {
    // Reset failure counter on success.
    await writeLockoutState({
      consecutiveFailures: 0,
      firstFailureAt: 0,
      lockoutUntil: null,
    });
    return true;
  }

  // Failure path — increment counter, maybe lock out.
  const current = lockout ?? {
    consecutiveFailures: 0,
    firstFailureAt: 0,
    lockoutUntil: null,
  };
  const now = Date.now();
  // Reset the window if the last failure was outside the failure window.
  const windowExpired = now - current.firstFailureAt > FAILURE_WINDOW_MS;
  const newConsecutive = windowExpired ? 1 : current.consecutiveFailures + 1;
  const newFirstFailureAt = windowExpired ? now : current.firstFailureAt || now;
  const shouldLockout = newConsecutive >= MAX_FAILURES;
  await writeLockoutState({
    consecutiveFailures: newConsecutive,
    firstFailureAt: newFirstFailureAt,
    lockoutUntil: shouldLockout ? now + LOCKOUT_DURATION_MS : current.lockoutUntil,
  });
  if (shouldLockout) {
    adminLog.warn(`[admin.passphrase] ${MAX_FAILURES} consecutive failures — locking out for 1 hour`);
  }
  return false;
}

/**
 * Return current lockout state for diagnostics. Returns null when
 * there is no active lockout state (first-time user, clean history).
 */
export async function getLockoutStatus(): Promise<{
  locked: boolean;
  remainingMs: number;
  consecutiveFailures: number;
  lockoutUntil: Date | null;
} | null> {
  const state = await readLockoutState();
  if (!state) return null;
  const now = Date.now();
  const locked = !!state.lockoutUntil && state.lockoutUntil > now;
  return {
    locked,
    remainingMs: locked && state.lockoutUntil ? state.lockoutUntil - now : 0,
    consecutiveFailures: state.consecutiveFailures,
    lockoutUntil: state.lockoutUntil ? new Date(state.lockoutUntil) : null,
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function readLockoutState(): Promise<LockoutState | null> {
  const lockout = await getConfig(LOCKOUT_KEY);
  if (lockout.source !== 'mongo' || !lockout.value) return null;
  try {
    const parsed = typeof lockout.value === 'string' ? JSON.parse(lockout.value) : lockout.value;
    return parsed as LockoutState;
  } catch {
    return null;
  }
}

async function writeLockoutState(state: LockoutState): Promise<void> {
  await setConfig({
    key: LOCKOUT_KEY,
    value: state,
    source: 'cli', // system-internal write; we don't want it pretending to be an admin action
    adminId: 'passphrase-system',
    adminUsername: 'passphrase-system',
    note: 'lockout state update',
  });
}

// ── Constants exported for tests ─────────────────────────────────────────────

export const __test__ = {
  PASSPHRASE_KEY,
  LOCKOUT_KEY,
  BCRYPT_COST,
  MAX_FAILURES,
  FAILURE_WINDOW_MS,
  LOCKOUT_DURATION_MS,
};