/**
 * AdminAuditLog — append-only audit trail for admin config changes.
 *
 * Every write to AdminConfig (via REST API or the future Discord bot)
 * appends one entry here. There is no UPDATE or DELETE endpoint exposed,
 * so a compromised admin session can't scrub its tracks.
 *
 * Sensitive values (`oldValue` / `newValue`) are stored REDACTED
 * (`***REDACTED***`); the discriminator `valueChanged` boolean tells the
 * reader whether something actually changed without revealing what.
 * For full forensic recovery, the underlying AdminConfig row is the
 * source of truth (you can replay writes from this log).
 *
 * Retention: 90 days hot + GCS archive. Configurable via env later.
 */
import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AdminAction =
  | 'config.get'         // read a config value (logged when key is critical)
  | 'config.set'         // write/update a config value
  | 'config.delete'      // remove a config override (fall back to env)
  | 'session.start'      // admin authenticated via Discord / REST passphrase
  | 'session.expire'     // session JWT expired
  | 'session.lockout'    // 5 failed passphrase attempts → admin locked
  | 'admin.diagnostic';  // pinged AI provider / DB / etc.

export type AdminSource = 'discord' | 'rest' | 'cli';

export interface IAdminAuditLog extends Document {
  timestamp: Date;
  /** Discord user id (string) OR Mongo User _id (ObjectId) depending on source. */
  adminId: string;
  /** Human-readable username for the audit reader (denormalised for query speed). */
  adminUsername: string;
  /** Which interface issued the action. */
  source: AdminSource;
  action: AdminAction;
  /** Config key affected (for config.* actions). */
  key: string | null;
  /** True when the value was classified as critical at write time. */
  wasCritical: boolean;
  /** Always redacted to '***REDACTED***' when the value was sensitive. */
  oldValue: string | null;
  newValue: string | null;
  /** True when oldValue and newValue differ. Always true for set/delete actions. */
  valueChanged: boolean;
  /** Optional human note (e.g. "rotated after security review"). */
  note: string;
  /** Whether the action succeeded. */
  success: boolean;
  /** On failure, what went wrong. Never includes secrets. */
  errorMessage: string | null;
  /** IP for REST actions, null for Discord (Discord has its own). */
  ipAddress: string | null;
  /** User agent for REST actions. */
  userAgent: string | null;
  /** Session that initiated the action. Lets you trace one login → many writes. */
  sessionId: Types.ObjectId | null;
}

const adminAuditLogSchema = new MongooseSchema<IAdminAuditLog>(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    adminId: { type: String, required: true, maxlength: 100 },
    adminUsername: { type: String, required: true, maxlength: 100 },
    source: { type: String, enum: ['discord', 'rest', 'cli'] as AdminSource[], required: true, index: true },
    action: { type: String, enum: [
      'config.get', 'config.set', 'config.delete',
      'session.start', 'session.expire', 'session.lockout',
      'admin.diagnostic',
    ] as AdminAction[], required: true, index: true },
    key: { type: String, default: null, maxlength: 200 },
    wasCritical: { type: Boolean, default: false },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    valueChanged: { type: Boolean, default: true },
    note: { type: String, default: '', maxlength: 500 },
    success: { type: Boolean, default: true },
    errorMessage: { type: String, default: null, maxlength: 1000 },
    ipAddress: { type: String, default: null, maxlength: 64 },
    userAgent: { type: String, default: null, maxlength: 500 },
    sessionId: { type: MongooseSchema.Types.ObjectId, ref: 'AdminSession', default: null, index: true },
  },
  // No `timestamps: true` — we manage timestamp ourselves (single field, indexed).
);

// Common query patterns:
// "all actions by user X in the last 24h"
adminAuditLogSchema.index({ adminId: 1, timestamp: -1 });
// "all writes to a particular key"
adminAuditLogSchema.index({ key: 1, timestamp: -1 });
// "all failed actions in the last hour" (security alerts)
adminAuditLogSchema.index({ success: 1, timestamp: -1 });

export default mongoose.model<IAdminAuditLog>('AdminAuditLog', adminAuditLogSchema, 'yaksha_faq_admin_audit_log');