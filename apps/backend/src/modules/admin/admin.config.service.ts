/**
 * admin.config.service.ts — write side of the runtime config system.
 *
 * Responsibilities:
 *   - Validate inputs (key shape, value type, scope)
 *   - Encrypt critical values, store plaintext otherwise
 *   - Upsert AdminConfig (per-program if scope=program, else global)
 *   - Append AdminAuditLog entry (always, even on failure)
 *   - Invalidate the runtimeConfig cache
 *
 * The service is source-agnostic: callers (REST controller, Discord
 * bot handler, one-shot migration script) supply the audit metadata
 * (adminId, username, source, IP, userAgent, sessionId) and the
 * service does the rest. This keeps the audit format uniform across
 * interfaces.
 */
import type { Types } from 'mongoose';
import AdminConfig from '../../models/AdminConfig.js';
import AdminAuditLog, { type AdminAction, type AdminSource } from '../../models/AdminAuditLog.js';
import { categorize } from '../../config/adminCategorize.js';
import {
  invalidateConfigCache,
  stringifyForStore,
} from '../../config/runtimeConfig.js';
import { encrypt as aesEncrypt } from '../../utils/auth/crypto.js';

// ── Errors ───────────────────────────────────────────────────────────────────

export class AdminConfigError extends Error {
  constructor(message: string, public readonly code: string) {
    // Include the code in the message so callers that only have access
    // to .message (most catch blocks) can pattern-match on it.
    super(`${code}: ${message}`);
    this.name = 'AdminConfigError';
  }
}

// ── Public input shape ───────────────────────────────────────────────────────

export interface SetConfigInput {
  /** Config key (dotted notation, e.g. 'jwt.secret' or 'program.<id>.ai.threshold'). */
  key: string;
  /** Value to write. Strings stay strings, objects/arrays serialised as JSON. */
  value: unknown;
  /** Human-readable note ('rotated after breach', 'tested OK'). */
  note?: string;
  /** For per-program overrides; null/undefined = global. */
  programId?: Types.ObjectId | string | null;
  // ── Audit metadata (required) ────────────────────────────────────────────
  /** Source interface that issued the write. */
  source: AdminSource;
  /** Stable id of the admin (Discord user id, Mongo user _id, etc). */
  adminId: string;
  /** Human-readable username for the audit reader. */
  adminUsername: string;
  /** For REST: IP. */
  ipAddress?: string | null;
  /** For REST: User-Agent. */
  userAgent?: string | null;
  /** Active session (Phase 2). Null until sessions exist. */
  sessionId?: Types.ObjectId | string | null;
}

export interface DeleteConfigInput extends Omit<SetConfigInput, 'value' | 'note'> {
  note?: string;
}

export interface SetConfigResult {
  ok: boolean;
  /** Set on success. */
  mongoId?: string;
  /** Set on failure (validation, etc). */
  error?: string;
}

// ── Key validation ───────────────────────────────────────────────────────────

// Allow segments to start with either letter OR digit so per-program keys
// like `program.65feabc123abc.jwt.secret` (where the program id is a
// 24-char hex Mongo ObjectId starting with a digit) are accepted.
const KEY_PATTERN = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/;
const MAX_KEY_LEN = 200;
const MAX_VALUE_LEN = 100_000; // 100 KB — plenty for any reasonable config

function validateKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new AdminConfigError('key must be a non-empty string', 'INVALID_KEY');
  }
  if (key.length > MAX_KEY_LEN) {
    throw new AdminConfigError(`key exceeds ${MAX_KEY_LEN} chars`, 'INVALID_KEY');
  }
  if (!KEY_PATTERN.test(key)) {
    throw new AdminConfigError(
      'key must be dotted-notation identifiers (letters, digits, underscores, dots)',
      'INVALID_KEY'
    );
  }
}

function normaliseProgramId(programId: Types.ObjectId | string | null | undefined): string | null {
  if (programId == null) return null;
  if (typeof programId === 'string') return programId;
  return programId.toString();
}

// Re-export so unit tests can call them directly. Production code should
// always go through setConfig / deleteConfig, which apply audit + encryption.
export { validateKey, normaliseProgramId };

// ── setConfig ────────────────────────────────────────────────────────────────

export async function setConfig(input: SetConfigInput): Promise<SetConfigResult> {
  let success = false;
  let errorMessage: string | null = null;
  let mongoId: string | null = null;
  let oldValueRedacted = '***REDACTED***';
  let newValueRedacted = '***REDACTED***';
  let valueChanged = true;
  const programIdStr = normaliseProgramId(input.programId);
  // Defaults to 'true' — overwritten below if we learn the key is non-critical.
  let isValueCritical = true;

  try {
    validateKey(input.key);
    const cat = categorize(input.key);
    isValueCritical = cat.isCritical;

    const storedString = stringifyForStore(input.value);
    if (storedString.length > MAX_VALUE_LEN) {
      throw new AdminConfigError(`value exceeds ${MAX_VALUE_LEN} chars after serialisation`, 'VALUE_TOO_LARGE');
    }

    // Look up the current value for the audit log.
    const existing = await AdminConfig.findOne({ key: input.key, programId: programIdStr })
      .select('value encrypted')
      .lean();

    // Decide whether to encrypt.
    const encrypted = cat.isCritical;
    const valueToStore = encrypted ? aesEncrypt(storedString) : storedString;

    // Upsert.
    const filter = { key: input.key, programId: programIdStr };
    const update = {
      $set: {
        value: valueToStore,
        encrypted,
        isCritical: cat.isCritical,
        category: cat.category,
        scope: programIdStr ? 'program' : 'global',
        programId: programIdStr,
        updatedBy: input.adminId,
        note: input.note?.slice(0, 500) ?? '',
      },
    };
    const result = await AdminConfig.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    mongoId = String(result._id);

    // Compute valueChanged (compare plaintext if we can; for critical
    // values both are redacted, so we report "always true" which is the
    // honest conservative answer — we don't know if the encrypted value
    // actually differs).
    if (existing) {
      if (!existing.encrypted && !encrypted) {
        valueChanged = existing.value !== storedString;
        oldValueRedacted = existing.value;
        newValueRedacted = storedString;
      }
      // For critical-key round-trips, valueChanged stays true and the
      // redacted strings stay masked (we can't diff ciphertext deterministically).
    } else {
      // No prior row — if the new value is non-critical, log it; if critical, mask it.
      valueChanged = true;
      newValueRedacted = isValueCritical ? '***REDACTED***' : storedString;
    }

    invalidateConfigCache(input.key, programIdStr);
    success = true;
    return { ok: true, mongoId };
  } catch (err) {
    errorMessage = (err as Error).message;
    return { ok: false, error: errorMessage };
  } finally {
    // Audit log entry — ALWAYS append, success or failure.
    await appendAuditLog({
      adminId: input.adminId,
      adminUsername: input.adminUsername,
      source: input.source,
      action: 'config.set',
      key: input.key,
      wasCritical: isValueCritical,
      oldValue: oldValueRedacted,
      newValue: newValueRedacted,
      valueChanged,
      success,
      errorMessage,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      sessionId: input.sessionId ?? null,
      note: input.note ?? '',
    });
  }
}

// ── deleteConfig ─────────────────────────────────────────────────────────────

export async function deleteConfig(input: DeleteConfigInput): Promise<SetConfigResult> {
  let success = false;
  let errorMessage: string | null = null;
  const programIdStr = normaliseProgramId(input.programId);

  try {
    validateKey(input.key);
    const result = await AdminConfig.deleteOne({ key: input.key, programId: programIdStr });
    if (result.deletedCount === 0) {
      throw new AdminConfigError(`no override found for ${input.key} (programId=${programIdStr ?? 'global'})`, 'NOT_FOUND');
    }
    invalidateConfigCache(input.key, programIdStr);
    success = true;
    return { ok: true };
  } catch (err) {
    errorMessage = (err as Error).message;
    return { ok: false, error: errorMessage };
  } finally {
    await appendAuditLog({
      adminId: input.adminId,
      adminUsername: input.adminUsername,
      source: input.source,
      action: 'config.delete',
      key: input.key,
      wasCritical: categorize(input.key).isCritical,
      oldValue: '***REDACTED***',
      newValue: null,
      valueChanged: true,
      success,
      errorMessage,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      sessionId: input.sessionId ?? null,
      note: input.note ?? '',
    });
  }
}

// ── getConfig (with audit on critical reads) ─────────────────────────────────

export interface GetConfigAuditInput {
  adminId: string;
  adminUsername: string;
  source: AdminSource;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: Types.ObjectId | string | null;
  key: string;
}

/**
 * Wrap the runtimeConfig.getConfig() call so that reads of critical keys
 * leave a breadcrumb in the audit log. Non-critical reads don't audit
 * (would spam the log for high-frequency paths).
 */
export async function getConfigAudited(input: GetConfigAuditInput) {
  const { getConfig: readConfig } = await import('../../config/runtimeConfig.js');
  const result = await readConfig(input.key);
  if (result.isEncrypted) {
    await appendAuditLog({
      adminId: input.adminId,
      adminUsername: input.adminUsername,
      source: input.source,
      action: 'config.get',
      key: input.key,
      wasCritical: true,
      oldValue: null,
      newValue: '***READ***',
      valueChanged: false,
      success: true,
      errorMessage: null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      sessionId: input.sessionId ?? null,
      note: 'critical-key read',
    });
  }
  return result;
}

// ── audit append helper ──────────────────────────────────────────────────────

interface AppendAuditInput {
  adminId: string;
  adminUsername: string;
  source: AdminSource;
  action: AdminAction;
  key: string | null;
  wasCritical: boolean;
  oldValue: string | null;
  newValue: string | null;
  valueChanged: boolean;
  success: boolean;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: Types.ObjectId | string | null;
  note: string;
}

async function appendAuditLog(input: AppendAuditInput): Promise<void> {
  try {
    await AdminAuditLog.create({
      adminId: input.adminId,
      adminUsername: input.adminUsername,
      source: input.source,
      action: input.action,
      key: input.key,
      wasCritical: input.wasCritical,
      oldValue: input.oldValue,
      newValue: input.newValue,
      valueChanged: input.valueChanged,
      success: input.success,
      errorMessage: input.errorMessage,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      sessionId: normaliseProgramId(input.sessionId),
      note: input.note,
      timestamp: new Date(),
    });
  } catch (err) {
    // Audit-write failures should not break the primary operation. Log
    // and move on. (For production, this should also emit a Sentry
    // alert — out of scope for Phase 1.)
    // eslint-disable-next-line no-console
    console.error('[admin.config.service] audit log write failed:', (err as Error).message);
  }
}

// ── Public exports for tests ────────────────────────────────────────────────
//
// Internal helpers, exported only for unit-test access. Production code
// should never call these directly — they bypass audit + categorisation.
export const __test__ = { validateKey, normaliseProgramId };