import mongoose, { Document, Schema as MongooseSchema, Types } from 'mongoose';

/**
 * Revoked JWT registry — server-side blocklist for issued tokens.
 *
 * A token's `jti` is added here on `/api/auth/logout`. The TTL index on
 * `expiresAt` ensures revoked-but-already-expired entries are reaped
 * automatically (Mongo drops them ~60s after `expiresAt`).
 *
 * Important: this is a soft blocklist, not a global session kill. A logged-out
 * token can no longer be used, but the user's other live tokens (e.g. on
 * another device) are unaffected.
 */
export interface IRevokedToken extends Document {
  jti: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  revokedAt: Date;
}

const revokedTokenSchema = new MongooseSchema<IRevokedToken>(
  {
    // v1.68 — schema fix: `unique: true` already creates a unique
    // index, so the explicit `index: true` was redundant.
    jti: { type: String, required: true, unique: true },
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: {
      type: Date,
      required: true,
      // TTL index: Mongo auto-deletes the doc once `expiresAt` has passed.
      // 0s after expiry is the default and matches "block until token's own
      // JWT_EXPIRES_IN elapses, then clean up".
    },
    revokedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false }
);

// Mongo TTL monitor runs every 60s; setting expireAfterSeconds=0 means the
// doc is removed as soon as the wall clock passes `expiresAt`. Combined with
// the unique index on `jti`, this gives us O(1) lookups and zero ongoing
// storage cost for expired entries.
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRevokedToken>('RevokedToken', revokedTokenSchema, 'yaksha_faq_revoked_tokens');
