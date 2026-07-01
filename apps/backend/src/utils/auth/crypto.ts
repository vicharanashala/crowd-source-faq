/**
 * AES-256-GCM encryption utility.
 * Derives a 32-byte key from the encryption master secret using PBKDF2.
 * Used for encrypting sensitive data at rest (e.g., Zoom OAuth tokens).
 *
 * H1 fix (v1.68): the master key used to be JWT_SECRET — same secret
 * signed JWTs, derived the AES key, AND signed OAuth state. One
 * leak compromised all three subsystems and made key rotation
 * impossible (rotating JWT_SECRET invalidated OAuth state AND
 * every encrypted Zoom token in the DB).
 *
 * Now:
 *   ENCRYPTION_MASTER_KEY — for AES-GCM PBKDF2 (this file)
 *   OAUTH_STATE_SECRET     — for OAuth state HMAC (zoomOAuth.ts)
 *   JWT_SECRET             — for JWT signing/verification (only)
 *
 * crypto.getMasterKey() reads ENCRYPTION_MASTER_KEY first, with
 * a fallback to JWT_SECRET for backwards compatibility with
 * already-encrypted data. New encryptions always use the new
 * key; old data still decrypts via the legacy path. The fallback
 * can be removed once a re-encryption migration has run.
 */
import crypto from 'crypto';

/**
 * Lazily read the encryption master key. Prefers the new
 * ENCRYPTION_MASTER_KEY; falls back to the legacy JWT_SECRET so
 * data encrypted before v1.68 still decrypts.
 */
export function getMasterKey(): string {
  const newKey = process.env.ENCRYPTION_MASTER_KEY;
  if (newKey && newKey.length >= 8) return newKey;

  const legacy = process.env.JWT_SECRET;
  if (!legacy || legacy.length < 8) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY (or legacy JWT_SECRET, ≥8 chars) must be set ' +
      'to encrypt/decrypt tokens. Add it to backend/.env.local'
    );
  }
  return legacy;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV for GCM
const SALT_LENGTH = 16; // 128-bit random salt
const TAG_LENGTH = 16;  // 128-bit auth tag
const ITERATIONS = 100_000;

function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, ITERATIONS, 32, 'sha256');
}

/**
 * Encrypt a plaintext string. Returns base64-encoded string:
 *   SALT (16) || IV (12) || CIPHERTEXT || AUTH TAG (16)
 * Uses JWT_SECRET as the master key.
 */
export function encrypt(plaintext: string, masterSecret?: string): string {
  const secret = masterSecret ?? getMasterKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(secret, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Interleave: salt + iv + ciphertext + tag
  return Buffer.concat([salt, iv, encrypted, tag]).toString('base64');
}

/**
 * Decrypt a string produced by encrypt(). Returns original plaintext.
 * Throws if the tag doesn't verify.
 * Uses JWT_SECRET as the master key.
 */
export function decrypt(ciphertext: string, masterSecret?: string): string {
  const secret = masterSecret ?? getMasterKey();
  const buf = Buffer.from(ciphertext, 'base64');

  const salt  = buf.subarray(0, SALT_LENGTH);
  const iv    = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag   = buf.subarray(buf.length - TAG_LENGTH);
  const data  = buf.subarray(SALT_LENGTH + IV_LENGTH, buf.length - TAG_LENGTH);

  const key = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  return decipher.update(data) + decipher.final('utf8');
}