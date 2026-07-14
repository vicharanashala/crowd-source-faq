/**
 * RegistrationConfig — singleton document controlling whether
 * public self-registration is allowed.
 *
 * Defaults to CLOSED. New users can only register when:
 *   (1) `registrationEnabled === true`, AND
 *   (2) The caller supplies the `inviteToken` from the admin's
 *       currently-active invite link. Tokens are compared using
 *       `crypto.timingSafeEqual` against this document's stored
 *       `inviteToken` field (plaintext — see security note below).
 *
 * Why plaintext: the admin dashboard needs to RENDER the current
 * invite link so they can copy it (per the v1.70 spec). Hashing
 * the token would force the admin to regenerate before every share,
 * which breaks the spec's "Display current invite link URL (copyable)"
 * requirement. The DB is the trust boundary; the token can be
 * regenerated atomically if it's ever leaked.
 *
 * Singleton pattern (mirrors AppSetting): a single document with
 * `_id: 'singleton'`. Use `ensureRegistrationConfig()` to read or
 * lazily-create on first access — call it from server boot so the
 * doc always exists.
 */

import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';
import crypto from 'node:crypto';

export interface IRegistrationConfig extends Document<string> {
  /** Always 'singleton' — one document, ever. */
  _id: 'singleton';
  /** When false, all `/api/auth/register` calls return 403. */
  registrationEnabled: boolean;
  /**
   * When true AND `registrationEnabled` is true, the gate allows
   * `/api/auth/register` calls without an `?token=` invite link —
   * i.e. "open for all" registration. Stored token is still kept
   * (so the admin can flip the mode back without regenerating),
   * but the gate does not consult it.
   */
  openForAll: boolean;
  /** Plaintext invite token. Compare with `crypto.timingSafeEqual`. */
  inviteToken: string;
  /** When the current `inviteToken` was last generated. */
  tokenGeneratedAt: Date;
  /** Last admin who toggled the flag or regenerated the token. */
  lastToggledBy: Types.ObjectId | null;
  /** When the toggle or token was last changed. */
  lastToggledAt: Date;
  /** Allowed email domains (e.g. ['gmail.com', 'flowkey.io']). Empty array means any domain. */
  allowedDomains: string[];
  createdAt: Date;
  updatedAt: Date;
}

const registrationConfigSchema = new MongooseSchema<IRegistrationConfig>(
  {
    _id: { type: String, default: 'singleton' },
    registrationEnabled: { type: Boolean, default: false },
    openForAll: { type: Boolean, default: false },
    inviteToken: { type: String, required: true },
    tokenGeneratedAt: { type: Date, required: true },
    lastToggledBy: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastToggledAt: { type: Date, default: () => new Date() },
    allowedDomains: { type: [String], default: [] },
  },
  { timestamps: true }
);

const RegistrationConfigModel = mongoose.model<IRegistrationConfig>(
  'RegistrationConfig',
  registrationConfigSchema,
  'yaksha_faq_registration_config'
);

export default RegistrationConfigModel;

/**
 * Generate a fresh invite token: 32 random bytes → base64url (~43 chars).
 * Exported so the controller and the seed script share one source of truth.
 */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Read the singleton, creating it with a fresh token if missing.
 * Returns the live document (not lean) so callers can $set on it.
 *
 * Safe to call repeatedly — only creates on the first call.
 * Logs the initial plaintext token to stderr so operators can copy
 * it on first deploy. Subsequent reads do NOT log the token.
 */
export async function ensureRegistrationConfig(): Promise<IRegistrationConfig> {
  let doc = await RegistrationConfigModel.findById('singleton');
  if (!doc) {
    const token = generateInviteToken();
    doc = await RegistrationConfigModel.create({
      _id: 'singleton',
      registrationEnabled: false,
      openForAll: false,
      inviteToken: token,
      tokenGeneratedAt: new Date(),
      lastToggledBy: null,
      lastToggledAt: new Date(),
      allowedDomains: [],
    });
    // eslint-disable-next-line no-console
    console.warn(
      `\n[registrationConfig] First-time init — invite token (copy now, won't be shown again):\n${token}\n`
    );
  }
  return doc;
}