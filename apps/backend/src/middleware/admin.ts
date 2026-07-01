import { type Request, type Response, type NextFunction } from 'express';
import { type UserRole } from '../modules/auth/user.model.js';
import { verifyAndLoadUser, type AuthedRequest } from './authShared.js';

/**
 * Admin-only middleware — allows admin / moderator / ai_moderator roles.
 * Uses the shared `verifyAndLoadUser` so the same JWT + revocation rules
 * apply as on `protect`. Keeps the original 401/403 message shape for
 * backwards compat with existing admin route consumers.
 */
export const adminOnly = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const user = await verifyAndLoadUser(req as AuthedRequest, res);
  if (!user) return;

  const allowed: UserRole[] = ['admin', 'moderator', 'ai_moderator'];
  if (!allowed.includes(user.role)) {
    res.status(403).json({ message: 'Access denied. Admin role required.' });
    return;
  }
  next();
};
