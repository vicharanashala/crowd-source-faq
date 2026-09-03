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
 * There are two payload versions. The version is chosen by whether
 * `programSlug` is present, so both can be in flight during rollout.
 *
 *   v1 (no cohort):
 *     canonical = `${ts}.${email.toLowerCase()}.${displayName}`
 *
 *   v2 (with cohort) — body also carries programSlug + programRole:
 *     canonical = `${ts}.${email.toLowerCase()}.${displayName}.${programSlug}.${programRole}`
 *
 * programSlug and programRole are inside the signature on purpose. If
 * they sat outside it, anyone able to reach this endpoint could enrol
 * themselves into any cohort at any privilege level.
 *
 * On success, returns the standard auth payload plus, for v2, the
 * resolved program so samagama.in can deep-link straight into it:
 *   {
 *     token, refreshToken,
 *     user: { id, name, email, role, ... },
 *     program: { batchId, slug, name, programRole } | null
 *   }
 *
 * If the email doesn't exist locally, a new user is created with role
 * 'user' and a random unguessable password (the user can never log in
 * directly, only via the bridge). Display name is preserved from
 * samagama.in.
 *
 * After this call, samagama.in stores the JWT in the `yaksha_session`
 * cookie. On the next visit to /csfaq the frontend reads that cookie
 * (apps/frontend/src/auth/cookieBridge.ts) and mirrors it into
 * localStorage, so every later request uses the ordinary
 * `Authorization: Bearer` path. There is no backend cookie middleware
 * by design; see the note in bootstrap/app.ts.
 */

import type { Request, Response } from 'express';
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import User, { type IUser } from '../auth/user.model.js';
import { logger } from '../../utils/http/logger.js';
import type { ProgramRole } from '../program/program-enrollment.model.js';
import {
  BRIDGE_ASSIGNABLE_ROLES,
  resolveActiveBatchBySlug,
  syncBridgeEnrollment,
  type BridgeEnrollmentResult,
} from './bridge-enrollment.js';

const BRIDGE_TOKEN_TTL_SECONDS = 60;

interface BridgeRequest {
  email: string;
  displayName: string;
  /** v2 only. Derived slug of the Batch, e.g. "guruvaani". */
  programSlug: string;
  /** v2 only. One of BRIDGE_ASSIGNABLE_ROLES. */
  programRole: ProgramRole;
  ts: number;
  sig: string;
}

/**
 * Where the portal lives, for building the redirect we hand back to
 * samagama.in. Matches the existing convention in discordBot.ts:
 * PUBLIC_URL, then CLIENT_URL, then a dev fallback.
 *
 * Returned as an absolute URL so samagama.in can redirect to it
 * without knowing that the portal is mounted under /csfaq.
 */
function getPortalBaseUrl(): string {
  const raw = (process.env.PUBLIC_URL ?? process.env.CLIENT_URL ?? '').trim();
  const base = raw && raw !== '#' ? raw : 'http://localhost:5173';
  return base.replace(/\/+$/, '');
}

function getBridgeSecrets(): string[] {
  const raw = (process.env.BRIDGE_SHARED_SECRET ?? '').trim();
  if (!raw) return [];
  // Support multiple comma-separated secrets for rotation. The first
  // entry is index 0 (primary); subsequent entries are fallbacks used
  // only for tokens signed before the rotation.
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Build the string the HMAC is computed over.
 *
 * v1 when `programSlug` is empty, v2 when it is set. Keeping the v1
 * shape byte-identical means samagama.in can migrate to v2 without a
 * coordinated cut-over: this endpoint accepts both until v1 traffic
 * stops.
 */
function canonicalString(
  ts: number,
  email: string,
  displayName: string,
  programSlug = '',
  programRole = '',
): string {
  const base = `${ts}.${email.toLowerCase().trim()}.${displayName.trim()}`;
  if (!programSlug) return base;
  return `${base}.${programSlug.trim().toLowerCase()}.${programRole.trim()}`;
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
function verifyBridgeSignature(
  ts: number,
  email: string,
  displayName: string,
  sig: string,
  secretIndex: number,
  programSlug = '',
  programRole = '',
): boolean {
  const secrets = getBridgeSecrets();
  if (secretIndex < 0 || secretIndex >= secrets.length) return false;
  const secret = secrets[secretIndex];
  if (!secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(canonicalString(ts, email, displayName, programSlug, programRole))
    .digest('hex');
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

  // v2 fields. Presence of programSlug is what selects the v2
  // canonical string, so an empty slug means "this is a v1 call".
  const programSlug =
    typeof body.programSlug === 'string' ? body.programSlug.trim().toLowerCase() : '';
  const programRole = typeof body.programRole === 'string' ? body.programRole.trim() : '';
  const isV2 = programSlug.length > 0;

  // Validate the role before signature checking so a bad role gives a
  // clear 400 rather than an opaque signature mismatch.
  if (isV2 && !BRIDGE_ASSIGNABLE_ROLES.includes(programRole as ProgramRole)) {
    res.status(400).json({
      message: `programRole must be one of: ${BRIDGE_ASSIGNABLE_ROLES.join(', ')}`,
    });
    return;
  }

  // Header says which secret to use. We try the requested index first,
  // then fall back to primary (index 0) for resilience.
  const headerIdxHeader = req.headers['x-bridge-secret-index'];
  const headerIdx = Number(Array.isArray(headerIdxHeader) ? headerIdxHeader[0] : headerIdxHeader);
  const tried = new Set<number>();
  const tryIndex = (i: number): boolean => {
    if (i < 0 || i >= secrets.length) return false;
    if (tried.has(i)) return false;
    tried.add(i);
    return verifyBridgeSignature(ts, email, displayName, sig, i, programSlug, programRole);
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
    // Resolve the cohort BEFORE touching the user record. If the slug
    // is wrong we want to fail without having created an account that
    // then sits there with no enrollment.
    let batch: Awaited<ReturnType<typeof resolveActiveBatchBySlug>> = null;
    if (isV2) {
      batch = await resolveActiveBatchBySlug(programSlug);
      if (!batch) {
        logger.warn(`[auth-bridge] unknown or inactive programSlug="${programSlug}"`);
        res.status(404).json({
          message: `No active program matches slug "${programSlug}"`,
        });
        return;
      }
    }

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

    // Enrol into the cohort samagama.in asserted. Idempotent, and it
    // will not downgrade a role we granted locally.
    let enrollment: BridgeEnrollmentResult | null = null;
    if (batch) {
      enrollment = await syncBridgeEnrollment(
        user._id as typeof user._id,
        batch,
        programRole as ProgramRole,
      );
    }

    // Issue the JWT pair.
    //
    // The claim MUST be `id`, not `userId`. `authShared.ts` reads
    // `decoded.id` (see VerifiedToken), and auth.controller.ts signs
    // `{ id, jti }`. Signing `userId` here meant every bridge token
    // resolved to `User.findById(undefined)` and every authenticated
    // request came back "Not authorized. User not found." — the bridge
    // issued tokens that could not actually be used.
    //
    // `jti` is included so that logout and the revocation list work
    // for bridged sessions the same way they do for password logins.
    const userIdStr = user._id.toString();
    const token = jwt.sign(
      { id: userIdStr, jti: randomUUID() },
      process.env.JWT_SECRET!,
      {
        expiresIn: '7d',
        issuer: process.env.JWT_ISSUER || 'csfaq',
        audience: process.env.JWT_AUDIENCE || 'csfaq-api',
      },
    );
    const refreshToken = jwt.sign(
      { id: userIdStr, jti: randomUUID(), type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!,
      {
        expiresIn: '7d',
        issuer: process.env.JWT_ISSUER || 'csfaq',
        audience: process.env.JWT_AUDIENCE || 'csfaq-api',
      },
    );

    res.json({
      token,
      refreshToken,
      // v2 only. samagama.in uses batchId to deep-link the user
      // straight into their cohort: /csfaq/?batch=<batchId>. The
      // frontend's ProgramContext treats a ?batch= param as the
      // highest-priority choice, above any stored preference.
      program: enrollment
        ? {
            batchId: enrollment.batchId.toString(),
            slug: enrollment.batchSlug,
            name: enrollment.batchName,
            programRole: enrollment.programRole,
          }
        : null,
      // Where to send the user. samagama.in's "Need support?" button
      // can 302 straight to this without knowing that the portal is
      // mounted under /csfaq or how cohort selection is expressed.
      // The token is NOT in this URL on purpose: query strings end up
      // in server logs, browser history and Referer headers.
      redirectUrl: enrollment
        ? `${getPortalBaseUrl()}/csfaq/?batch=${enrollment.batchId.toString()}`
        : `${getPortalBaseUrl()}/csfaq/`,
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