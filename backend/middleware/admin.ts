import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';
import User, { type UserRole } from '../models/User.js';

/**
 * Admin-only middleware — allows both 'admin' and 'moderator' roles.
 * Uses UserRole enum instead of hardcoded strings for consistency.
 */
export const adminOnly = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let token: string | undefined;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    const allowed: UserRole[] = ['admin', 'moderator', 'ai_moderator'];
    if (!allowed.includes(user.role)) {
      res.status(403).json({ message: 'Access denied. Admin role required.' });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Not authorized. Invalid token.' });
  }
};
