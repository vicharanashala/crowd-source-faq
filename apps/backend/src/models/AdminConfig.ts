/**
 * AdminConfig — runtime config overrides for the Discord admin panel
 * (and the parallel REST API).
 *
 * This is a SEPARATE system from `feature-flag.model.ts`. Feature flags
 * are boolean toggles tied to code paths; AdminConfig is a generic
 * key→value store for any env var that admins want to change without a
 * restart.
 *
 * Three-layer resolution (see runtimeConfig.ts):
 *   1. Code default from Zod schema
 *   2. process.env
 *   3. AdminConfig Mongo override (THIS collection, with encryption for
 *      critical values)
 *
 * Per-program scoping: when `programId` is set, the value applies only
 * within the named program; null = global default. Compound unique index
 * `(key, programId)` lets a single key have one global default AND one
 * per-program override without collision.
 *
 * Critical values (matched by adminCategorize.ts) are stored AES-256-GCM
 * encrypted at rest using ENCRYPTION_MASTER_KEY. The `value` field holds
 * either the plaintext (non-critical) or the base64 ciphertext (critical).
 * The `encrypted` boolean tells the reader which form it's in.
 */
import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ConfigScope = 'global' | 'program';

export interface IAdminConfig extends Document {
  /** Dotted key, e.g. 'jwt.secret', 'ai.duplicate.threshold', 'featureFlag.goldenTicket.enabled'. */
  key: string;
  /** Stored value — plaintext OR base64 ciphertext (see `encrypted`). */
  value: string;
  /** True when value is AES-256-GCM ciphertext; false when plaintext. */
  encrypted: boolean;
  /** Derived from key pattern at write time. Stable for the lifetime of the row. */
  isCritical: boolean;
  /** Category bucket for the admin UI (auth, ai, rate-limit, feature-flag, ...). */
  category: string;
  /** Global default vs per-program override. */
  scope: ConfigScope;
  /** Set when scope === 'program'. Index-friendly so we can scope reads efficiently. */
  programId: Types.ObjectId | null;
  /** Last admin to flip the value. */
  updatedBy: string | null;
  /** Last flip timestamp. */
  updatedAt: Date;
  /** When this row was first created (for audit). */
  createdAt: Date;
  /** Free-form note the admin can attach ("rotated after breach", etc.). */
  note: string;
}

const adminConfigSchema = new MongooseSchema<IAdminConfig>(
  {
    key: { type: String, required: true, trim: true, maxlength: 200 },
    value: { type: String, required: true },
    encrypted: { type: Boolean, default: false, index: true },
    isCritical: { type: Boolean, default: false, index: true },
    category: { type: String, required: true, maxlength: 50, index: true },
    scope: { type: String, enum: ['global', 'program'] as ConfigScope[], default: 'global', index: true },
    programId: {
      type: MongooseSchema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
    updatedBy: { type: String, default: null },
    note: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

// Compound unique index — one global default + one per-program override
// per key. Same pattern as the feature-flag index.
adminConfigSchema.index(
  { key: 1, programId: 1 },
  { unique: true, name: 'key_program_unique' }
);

// Common admin UI query: "show me all critical auth keys"
adminConfigSchema.index({ category: 1, isCritical: 1 });

export default mongoose.model<IAdminConfig>('AdminConfig', adminConfigSchema, 'yaksha_faq_admin_config');