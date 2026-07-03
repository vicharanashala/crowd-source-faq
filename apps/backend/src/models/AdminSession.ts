/**
 * AdminSession — tracks active admin sessions (Discord + REST).
 *
 * Used by Phase 2 (Discord bot) and the REST API admin endpoints to
 * verify a passphrase was recently provided and the admin is still
 * within their 1-hour window. Tokens are stored HASHED (Argon2id) so a
 * DB dump doesn't leak live sessions.
 *
 * For REST API: a `bearerToken` is issued at login, returned to the
 * client, hashed before storage. Subsequent requests send it back as
 * `Authorization: Bearer <token>`; the server hashes the incoming token
 * and looks it up.
 *
 * For Discord: the passphrase is verified once when the admin clicks
 * "Unlock", a JWT is minted, the JWT hash is stored here. Ephemeral
 * modals carry the JWT in their custom_id.
 *
 * The Phase 1 REST API doesn't yet require this — admin role + JWT is
 * sufficient. This model exists so Phase 2 (Discord + passphrase) has
 * the storage ready without a schema migration.
 */
import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

export interface IAdminSession extends Document {
  /** Argon2id hash of the bearer token. NEVER store plaintext. */
  tokenHash: string;
  /** Discord user id (string) OR Mongo User _id (ObjectId) — matches audit log adminId. */
  adminId: string;
  /** Denormalised for query speed. */
  adminUsername: string;
  /** discord | rest — which interface issued this session. */
  source: 'discord' | 'rest';
  /** Issued at. */
  createdAt: Date;
  /** When this token stops working. */
  expiresAt: Date;
  /** Last time we saw this token (refreshes the sliding window). */
  lastUsedAt: Date;
  /** IP for REST sessions, null for Discord. */
  ipAddress: string | null;
  /** User agent for REST sessions. */
  userAgent: string | null;
  /** When this session was explicitly invalidated (logout / lockout). Null = still active. */
  revokedAt: Date | null;
  /** Why it was revoked. */
  revokedReason: 'logout' | 'lockout' | 'manual' | null;
  /** For lockouts: set when lockout expires and the admin can try again. */
  lockoutUntil: Date | null;
  /** Number of consecutive failed passphrase attempts since last success. */
  consecutiveFailures: number;
}

const adminSessionSchema = new MongooseSchema<IAdminSession>(
  {
    tokenHash: { type: String, required: true, index: true, unique: true },
    adminId: { type: String, required: true, index: true },
    adminUsername: { type: String, required: true },
    source: { type: String, enum: ['discord', 'rest'], required: true },
    createdAt: { type: Date, default: Date.now },
    // Index defined explicitly below (schema.index({ expiresAt: 1 })) — do not
    // also set `index: true` here or Mongoose logs a duplicate-index warning.
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: ['logout', 'lockout', 'manual', null] as Array<'logout' | 'lockout' | 'manual' | null>,
      default: null,
    },
    lockoutUntil: { type: Date, default: null },
    consecutiveFailures: { type: Number, default: 0 },
  },
  // We manage createdAt manually (single field, indexed); don't let Mongoose
  // overwrite it with `timestamps: true`.
  { timestamps: false }
);

// Fast lookup: "is this token valid right now?"
adminSessionSchema.index({ tokenHash: 1, revokedAt: 1, expiresAt: 1 });

// Cleanup query: "delete expired sessions older than X"
adminSessionSchema.index({ expiresAt: 1 });

export default mongoose.model<IAdminSession>('AdminSession', adminSessionSchema, 'yaksha_faq_admin_sessions');