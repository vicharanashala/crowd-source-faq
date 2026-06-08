/**
 * Admin 2FA / TOTP controller.
 * Setup, enable, disable, and verify TOTP second factors for admin accounts.
 * TOTP secrets are AES-256-GCM encrypted at rest using the same scheme as Zoom tokens.
 */
import { type Request, type Response } from 'express';
import crypto from 'crypto';
import User, { type IUser } from '../models/User.js';




import { encrypt, decrypt } from '../utils/crypto.js';


// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a base32-compatible random secret (16 bytes = 26 base32 chars). */
function generateTOTPSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const buf = Buffer.alloc(16);
  // Use Node.js stronger random source just for TOTP
  const rng = crypto.randomBytes(16);

  for (let i = 0; i < 16; i++) buf[i] = rng[i];
  return Array.from(buf)
    .map((b: number) => chars[b % chars.length])
    .join('');

}

/**
 * Derive the current TOTP code from a base32 secret.
 * Uses HMAC-SHA1 (RFC 6238 standard) with 30-second window.
 * Pure-JS implementation — no external package required.
 * @param secret   Base32-encoded secret
 * @param offset   Time step offset relative to current time (default 0)
 */
function computeTOTP(secret: string, offset: number = 0): string {


  // Pad or trim secret to 32 chars (base32 standard)
  const padded = secret.toUpperCase().padEnd(32, 'A');

  // Decode base32 to raw 20-byte key
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const keyBytes: number[] = [];
  let bits = 0;
  let buffer = 0;
  for (const char of padded) {
    const val = base32Chars.indexOf(char);
    if (val < 0) continue;
    buffer = (buffer << 5) | val;
    bits += 5;
    if (bits >= 8) {
      keyBytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  const key = Buffer.from(keyBytes);

  // TOTP: T = floor((now - epoch) / 30)
  const timeStep = Math.floor(Date.now() / 30000) + offset;
  const msg = Buffer.alloc(8);
  msg.writeBigInt64BE(BigInt(timeStep), 0);

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(msg);
  const hash = hmac.digest();

  const offsetByte = hash[hash.length - 1] & 0x0f;
  const code =
    ((hash[offsetByte] & 0x7f) << 24) |
    ((hash[offsetByte + 1] & 0xff) << 16) |
    ((hash[offsetByte + 2] & 0xff) << 8) |
    (hash[offsetByte + 3] & 0xff);

  const otp = (code % 1_000_000).toString().padStart(6, '0');
  return otp;
}

/** Encrypt a TOTP secret for database storage. Returns hex string. */
function encryptSecret(plain: string): string {
  return encrypt(plain);
}

/** Decrypt a TOTP secret from database storage. */
function decryptSecret(cipher: string): string {
  return decrypt(cipher);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/2fa/status
 * Returns whether the currently-authenticated admin has 2FA enabled.
 * Used by the frontend to decide which login flow to show.
 */
export const get2FAStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!._id).select('totpEnabled');
    res.json({ totpEnabled: user?.totpEnabled ?? false });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

/**
 * POST /api/admin/2fa/setup
 * Generate and store a new TOTP secret for the admin account.
 * Returns the base32 secret + otpauth URI so the frontend can render a QR code.
 * Requires the current TOTP code to verify before saving (prevents lockout).
 */
export const setup2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentCode } = req.body as { currentCode?: string };

    const user = (await User.findById(req.user!._id).select('+totpSecret')) as IUser;

    // If 2FA is already active, verify current code before changing secret
    if (user.totpEnabled && user.totpSecret) {
      if (!currentCode) {
        res.status(400).json({ message: 'currentCode is required to update 2FA while enabled.' });
        return;
      }
      const decrypted = decryptSecret(user.totpSecret);
      if (computeTOTP(decrypted) !== currentCode) {
        res.status(401).json({ message: 'Invalid verification code.' });
        return;
      }
    }

    // Generate fresh secret and encrypt for storage
    const freshSecret = generateTOTPSecret();
    const encrypted = encryptSecret(freshSecret);

    user.totpSecret = encrypted;
    // totpEnabled stays false until the user verifies their first code with enable2FA
    await user.save();

    // Build otpauth URI (Google Authenticator compatible)
    const issuer = 'YakshaFAQ';
    const account = user.email.split('@')[0];
    const otpauth = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${freshSecret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

    res.json({
      message: 'TOTP secret generated. Verify a code to enable 2FA.',
      secret: freshSecret,          // Plaintext for QR code — only returned here
      otpauth,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

/**
 * POST /api/admin/2fa/enable
 * Verify a TOTP code and activate 2FA for the admin account.
 * The secret must already be stored (via setup2FA).
 */
export const enable2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body as { code?: string };
    if (!code) {
      res.status(400).json({ message: 'code is required.' });
      return;
    }

    const user = (await User.findById(req.user!._id).select('+totpSecret')) as IUser;
    if (!user.totpSecret) {
      res.status(400).json({ message: 'No TOTP secret found. Call setup2FA first.' });
      return;
    }
    if (user.totpEnabled) {
      res.status(400).json({ message: '2FA is already enabled.' });
      return;
    }

    const decrypted = decryptSecret(user.totpSecret);
    const expected = computeTOTP(decrypted);

    // Allow ±1 time step tolerance (clock drift)
    const prevCode = computeTOTP(decrypted, -1);
    const nextCode = computeTOTP(decrypted, 1);
    if (![expected, prevCode, nextCode].includes(code)) {
      res.status(401).json({ message: 'Invalid verification code.' });
      return;
    }

    user.totpEnabled = true;
    await user.save();

    res.json({ message: '2FA enabled successfully.', totpEnabled: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

/**
 * POST /api/admin/2fa/disable
 * Disable 2FA. Requires current password + valid TOTP code.
 * This always requires a TOTP code (cannot disable with password alone).
 */
export const disable2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password, code } = req.body as { password?: string; code?: string };

    if (!password || !code) {
      res.status(400).json({ message: 'password and code are required.' });
      return;
    }

    const user = (await User.findById(req.user!._id).select('+password +totpSecret')) as IUser;
    if (!user.totpSecret || !user.totpEnabled) {
      res.status(400).json({ message: '2FA is not enabled.' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid password.' });
      return;
    }

    const decrypted = decryptSecret(user.totpSecret);
    const expected = computeTOTP(decrypted);
    const prevCode = computeTOTP(decrypted, -1);
    const nextCode = computeTOTP(decrypted, 1);
    if (![expected, prevCode, nextCode].includes(code)) {
      res.status(401).json({ message: 'Invalid verification code.' });
      return;
    }

    user.totpEnabled = false;
    user.totpSecret = undefined;
    await user.save();

    res.json({ message: '2FA disabled.', totpEnabled: false });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

/**
 * POST /api/admin/2fa/verify
 * Verify a TOTP code (used to challenge admin users on sensitive operations).
 * Returns { valid: true } if the code is correct.
 */
export const verify2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body as { code?: string };
    if (!code) {
      res.status(400).json({ message: 'code is required.' });
      return;
    }

    const user = (await User.findById(req.user!._id).select('+totpSecret')) as IUser;
    if (!user.totpSecret || !user.totpEnabled) {
      res.status(400).json({ message: '2FA is not enabled for this account.' });
      return;
    }

    const decrypted = decryptSecret(user.totpSecret);
    const expected = computeTOTP(decrypted);
    const prevCode = computeTOTP(decrypted, -1);
    const nextCode = computeTOTP(decrypted, 1);
    const valid = [expected, prevCode, nextCode].includes(code);

    res.json({ valid });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};