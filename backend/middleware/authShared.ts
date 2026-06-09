import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';
import User, { type IUser, type UserRole } from '../models/User.js';
import RevokedToken from '../models/RevokedToken.js';

interface VerifiedToken {
  id: string;
  jti?: string;
  exp?: number;
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
    decoded = jwt.verify(token, process.env.JWT_SECRET!) as VerifiedToken;
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

  const user = await User.findById(decoded.id).select('-password');
  if (!user) {
    res.status(401).json({ message: 'Not authorized. User not found.' });
    return null;
  }

  if (user.isBanned) {
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
