/**
 * protectOptional.ts — Sign My Tee
 *
 * Auth middleware variant: a request may carry a valid JWT, in
 * which case `req.user` is set exactly like `protect`, OR no JWT
 * (anonymous/guest), in which case the request continues with
 * `req.user === undefined`. The controller decides what an
 * anonymous request is allowed to do.
 *
 * Why this exists: the public share page can be opened by anyone
 * to *view* the tee, but a logged-in signer should be attributed
 * by their user id while a guest signer should be attributed by
 * their typed `signerName` alone. The same endpoint handles both
 * paths, so this middleware is the cleanest place to thread the
 * difference.
 *
 * We reimplement the JWT decode + blocklist + user load steps
 * from `verifyAndLoadUser` inline because that helper writes a
 * 401 when no token is present — wrong shape here. We want to
 * silently fall through to the controller in the no-token case
 * and only 401 if a token IS present but invalid (because
 * presenting an invalid token is the "I tried, the server
 * rejected me" case, distinct from "I never tried").
 *
 * v1.87 — additive; does not touch `protect`.
 */
import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import User, { type IUser } from '../modules/auth/user.model.js';
import RevokedToken from '../modules/auth/revoked-token.model.js';
import { securityLog } from '../utils/http/logger.js';

interface VerifiedToken {
  id: string;
  jti?: string;
  exp?: number;
  kind?: string;
  role?: string;
}

function requireJwtSecret(): string {
  const v = process.env.JWT_SECRET;
  if (!v) throw new Error('JWT_SECRET is required (set in backend/.env)');
  return v;
}

export const protectOptional = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = (req.headers.authorization ?? '').startsWith('Bearer ')
    ? (req.headers.authorization as string).split(' ')[1]
    : undefined;

  // No token: this is a guest request, and that's fine. We
  // call next() without touching req.user so downstream
  // controllers can branch on `req.user`.
  if (!token) {
    next();
    return;
  }

  // Token was presented. We must verify it — silently dropping an
  // invalid token would mask session tampering. 401 here is fine.
  let decoded: VerifiedToken;
  try {
    decoded = jwt.verify(token, requireJwtSecret()) as VerifiedToken;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: 'Session expired. Please log in again.' });
    } else {
      res.status(401).json({ message: 'Not authorized. Token invalid.' });
    }
    return;
  }

  if (decoded.jti) {
    const revoked = await RevokedToken.exists({ jti: decoded.jti });
    if (revoked) {
      res.status(401).json({ message: 'Session has been revoked. Please log in again.' });
      return;
    }
  }

  const user = await User.findById(decoded.id).select('-password');
  if (!user) {
    res.status(401).json({ message: 'Not authorized. User not found.' });
    return;
  }

  // Ban / suspension are still hard floors even in optional-auth
  // mode — a banned user trying to sign is a security event.
  if (user.isBanned) {
    securityLog.alert('banned user blocked at protectOptional middleware', {
      userId: user._id.toString(),
      email: user.email,
    });
    res.status(403).json({ message: 'Account is banned.' });
    return;
  }
  if (user.isDeleted) {
    res.status(403).json({ message: 'Account has been deleted.' });
    return;
  }
  if (user.suspendedUntil && user.suspendedUntil > new Date()) {
    res.status(403).json({
      message: `Account is suspended until ${user.suspendedUntil.toISOString()}.`,
    });
    return;
  }

  (req as Request & { user?: IUser; auth?: VerifiedToken }).user = user as IUser;
  (req as Request & { auth?: VerifiedToken }).auth = decoded;
  next();
};
