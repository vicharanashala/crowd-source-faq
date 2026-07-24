import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { type Request, type Response, type NextFunction } from 'express';
import User, { type IUser, type UserRole } from '../modules/auth/user.model.js';
import RevokedToken from '../modules/auth/revoked-token.model.js';
import { securityLog } from '../utils/http/logger.js';

interface VerifiedToken {
  id: string;
  jti?: string;
  exp?: number;
  // v1.70 — service-role JWT marker. Tokens minted by
  // `integrations/discord/admin/serviceJwt.ts` set `kind: 'service'`
  // so the bot can hit /api/admin/* without a real user row.
  // Real-user tokens do NOT have this field (default = undefined).
  kind?: string;
  role?: string;
}

export interface AuthedRequest extends Request {
  user?: IUser;
  auth?: VerifiedToken;
}

/**
 * Verify a Bearer token, check the server-side blocklist, and load the user.
 * Shared by `protect` and `adminOnly` so every auth path enforces the same
 * revocation rules. Returns the user on success; on failure writes the 401
 * response and returns null.
 */
// v1.68 — L4: defensive throw if JWT_SECRET is missing. The
// validateEnv() check at boot should have caught this, but
// if something bypasses that (e.g. a test or a config
// override), the jwt.verify call below would surface a
// cryptic 'secretOrPrivateKey must have a value' error.
// Throw a clear one instead.
function requireJwtSecret(): string {
  const v = process.env.JWT_SECRET;
  if (!v) throw new Error('JWT_SECRET is required (set in backend/.env)');
  return v;
}

export async function verifyAndLoadUser(
  req: AuthedRequest,
  res: Response
): Promise<IUser | null> {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization!.split(' ')[1]
    : undefined;

  if (!token) {
    res.status(401).json({ message: 'Not authorized. Token missing.' });
    return null;
  }

  let decoded: VerifiedToken;
  try {
    decoded = jwt.verify(token, requireJwtSecret()) as VerifiedToken;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: 'Session expired. Please log in again.' });
    } else {
      res.status(401).json({ message: 'Not authorized. Token invalid.' });
    }
    return null;
  }

  if (decoded.jti) {
    const revoked = await RevokedToken.exists({ jti: decoded.jti });
    if (revoked) {
      res.status(401).json({ message: 'Session has been revoked. Please log in again.' });
      return null;
    }
  }

  // v1.70 — Service-role JWT bypass.
  // Tokens minted by `integrations/discord/admin/serviceJwt.ts`
  // carry `kind: 'service'`. The JWT is signed with the same
  // JWT_SECRET, so verifying it is equivalent to trusting whoever
  // owns that secret — there's no real user row to look up. We
  // synthesise a minimal admin user so downstream `authorize('admin')`
  // checks pass. `isServiceAccount: true` lets audit logs tell
  // these requests apart from real-user admin actions.
  if (decoded.kind === 'service') {
    const role: UserRole = (decoded.role as UserRole) || 'admin';
    const syntheticId = Types.ObjectId.isValid(decoded.id ?? '')
      ? new Types.ObjectId(decoded.id as string)
      : new Types.ObjectId();
    const syntheticUser = {
      _id: syntheticId,
      name: 'Service Account',
      email: 'service-account@internal',
      password: '',
      role,
      reputation: 0,
      points: 0,
      tier: 'knowledge_master' as const,
      sp: 0,
      positiveBadges: [],
      negativeBadges: [],
      isBanned: false,
      isDeleted: false,
      zoomConnected: false,
      totpEnabled: false,
      bookmarks: [],
      acceptedAnswers: 0,
      faqContributions: 0,
      welcomePackageOnboarded: false,
      zoomAssessmentPassed: false,
      seenAssessmentQuestions: [],
      orientationCompleted: false,
      projectSelectionLocked: false,
      onboardingAuditLog: [],
      lastGoldenTicketAt: null,
      lastGoldenRejectionAt: null,
      goldenBannedUntil: null,
      goldenBanReason: '',
      goldenBannedBy: null,
      goldenBannedAt: null,
      isServiceAccount: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IUser;
    req.user = syntheticUser;
    req.auth = decoded;
    return syntheticUser;
  }

  const user = await User.findById(decoded.id).select('-password');
  if (!user) {
    res.status(401).json({ message: 'Not authorized. User not found.' });
    return null;
  }

  if (user.isBanned) {
    // v1.67 — Banned users hitting protected endpoints is a
    // security event. ALERT-level so it hits Discord.
    securityLog.alert('banned user blocked at middleware', {
      userId: user._id.toString(),
      email: user.email,
    });
    res.status(403).json({ message: 'Account is banned.' });
    return null;
  }

  if (user.isDeleted) {
    res.status(403).json({ message: 'Account has been deleted.' });
    return null;
  }

  if (user.suspendedUntil && user.suspendedUntil > new Date()) {
    res.status(403).json({ message: `Account is suspended until ${user.suspendedUntil.toISOString()}.` });
    return null;
  }

  req.user = user as IUser;
  req.auth = decoded;
  return user as IUser;
}

/**
 * Standalone role guard used by `authorize(...roles)`.
 */
export function authorize(...allowedRoles: UserRole[]): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as AuthedRequest).user?.role as UserRole | undefined;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ message: 'Insufficient permissions.' });
      return;
    }
    next();
  };
}
