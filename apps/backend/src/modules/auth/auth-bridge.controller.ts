/**
 * auth-bridge.controller.ts — samagama.in SSO bridge.
 *
 * POST /api/auth/bridge/exchange
 *   Called by samagama.in's backend at login time. Body shape:
 *     {
 *       email: string,
 *       displayName: string,
 *       ts: number (unix seconds — for replay protection),
 *       sig: string (hex HMAC-SHA256)
 *     }
 *   Headers:
 *     X-Bridge-Secret-Index: number (0 = primary secret, 1+ = rotated secrets)
 *
 * The HMAC is computed over the canonical string:
 *   `${ts}.${email.toLowerCase()}.${displayName}`
 *
 * On success, returns the standard auth payload:
 *   { token, refreshToken, user: { id, name, email, role, ... } }
 *
 * If the email doesn't exist locally, a new user is created with role
 * 'user' and a random unguessable password (the user can never log in
 * directly — only via the bridge). Display name is preserved from
 * samagama.in.
 *
 * Subsequent visits to /csfaq are authenticated by bridgeCookieAuth
 * middleware (reads the yaksha_session cookie that samagama.in's team
 * stores the JWT in) so this endpoint is only called once per
 * samagama.in login.
 */

import type { Request, Response } from 'express';
import * as crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import User, { type IUser } from '../auth/user.model.js';
import { logger } from '../../utils/http/logger.js';

const BRIDGE_TOKEN_TTL_SECONDS = 60;

interface BridgeRequest {
  email: string;
  displayName: string;
  ts: number;
  sig: string;
}

function getBridgeSecrets(): string[] {
  const raw = (process.env.BRIDGE_SHARED_SECRET ?? '').trim();
  if (!raw) return [];
  // Support multiple comma-separated secrets for rotation. The first
  // entry is index 0 (primary); subsequent entries are fallbacks used
  // only for tokens signed before the rotation.
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function canonicalString(ts: number, email: string, displayName: string): string {
  return `${ts}.${email.toLowerCase().trim()}.${displayName.trim()}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a bridge signature. Returns true if any of the configured
 * secrets validates the signature within the time window.
 *
 * Indices:
 *   - Primary secret (index 0) is tried first.
 *   - Rotated secrets (index 1+) are tried as fallback for tokens
 *     signed before the rotation kicked in. Once the rotation is
 *     complete (no tokens for index 1 seen for >7d), drop it.
 */
function verifyBridgeSignature(ts: number, email: string, displayName: string, sig: string, secretIndex: number): boolean {
  const secrets = getBridgeSecrets();
  if (secretIndex < 0 || secretIndex >= secrets.length) return false;
  const secret = secrets[secretIndex];
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(canonicalString(ts, email, displayName)).digest('hex');
  return timingSafeEqual(expected, sig.toLowerCase());
}

/**
 * POST /api/auth/bridge/exchange
 *
 * Idempotent: same (email, displayName) on subsequent calls just
 * refreshes the JWT and returns the same user.
 */
export async function exchangeBridgeToken(req: Request, res: Response): Promise<void> {
  // Feature flag — never crash on missing config; just disable.
  if (process.env.BRIDGE_ENABLED !== 'true') {
    res.status(503).json({ message: 'Bridge is disabled' });
    return;
  }
  const secrets = getBridgeSecrets();
  if (secrets.length === 0) {
    res.status(503).json({ message: 'Bridge is not configured (BRIDGE_SHARED_SECRET unset)' });
    return;
  }

  const body = (req.body ?? {}) as Partial<BridgeRequest>;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const ts = typeof body.ts === 'number' ? body.ts : 0;
  const sig = typeof body.sig === 'string' ? body.sig.trim() : '';

  // Header says which secret to use. We try the requested index first,
  // then fall back to primary (index 0) for resilience.
  const headerIdxHeader = req.headers['x-bridge-secret-index'];
  const headerIdx = Number(Array.isArray(headerIdxHeader) ? headerIdxHeader[0] : headerIdxHeader);
  const tried = new Set<number>();
  const tryIndex = (i: number): boolean => {
    if (i < 0 || i >= secrets.length) return false;
    if (tried.has(i)) return false;
    tried.add(i);
    return verifyBridgeSignature(ts, email, displayName, sig, i);
  };

  let valid = false;
  if (Number.isFinite(headerIdx) && !Number.isNaN(headerIdx)) {
    valid = tryIndex(headerIdx) || tryIndex(0);
  } else {
    valid = tryIndex(0);
  }
  if (!valid) {
    logger.warn(`[auth-bridge] signature mismatch for email=${email.slice(0, 20)}…`);
    res.status(401).json({ message: 'Invalid bridge signature' });
    return;
  }

  // Replay protection — ts must be within the last 60 seconds.
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > BRIDGE_TOKEN_TTL_SECONDS) {
    res.status(401).json({ message: 'Bridge token expired (timestamp outside 60s window)' });
    return;
  }

  // Validate inputs.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ message: 'email must be a valid email address' });
    return;
  }
  if (!displayName || displayName.length > 100) {
    res.status(400).json({ message: 'displayName must be 1-100 chars' });
    return;
  }

  try {
    // Find-or-create user by email (case-insensitive).
    const lowerEmail = email.toLowerCase();
    let user: IUser | null = await User.findOne({ email: lowerEmail });
    if (!user) {
      // Bridge-created user: random unguessable password (never used —
      // login only via the bridge). Role defaults to 'user'.
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = await User.create({
        name: displayName,
        email: lowerEmail,
        password: randomPassword,
        role: 'user',
      });
      logger.info(`[auth-bridge] created new user ${lowerEmail} via samagama.in bridge`);
    } else if (user.name !== displayName) {
      // Update name if samagama.in has a fresher one. Don't overwrite
      // role — that's managed by admins on our side.
      user.name = displayName;
      await user.save();
    }

    // Issue JWT pair (matches the auth.controller.ts signing pattern).
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      process.env.JWT_SECRET!,
      {
        expiresIn: '7d',
        issuer: process.env.JWT_ISSUER || 'csfaq',
        audience: process.env.JWT_AUDIENCE || 'csfaq-api',
      },
    );
    const refreshToken = jwt.sign(
      { userId: user._id.toString(), type: 'refresh' },
      process.env.JWT_SECRET!,
      {
        expiresIn: '7d',
        issuer: process.env.JWT_ISSUER || 'csfaq',
        audience: process.env.JWT_AUDIENCE || 'csfaq-api',
      },
    );

    res.json({
      token,
      refreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        welcomePackageOnboarded: user.welcomePackageOnboarded,
        orientationCompleted: user.orientationCompleted,
        projectAssigned: user.projectAssigned,
        mentorAssigned: user.mentorAssigned,
        projectAssignedAt: user.projectAssignedAt,
        projectSelectionLocked: user.projectSelectionLocked,
      },
    });
  } catch (err) {
    logger.error(`[auth-bridge] exchange failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Bridge exchange failed' });
  }
}