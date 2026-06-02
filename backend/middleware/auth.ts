import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';
import User, { type IUser, type UserRole } from '../models/User.js';

// Express middleware to protect routes requiring authentication
export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let token: string | undefined;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized. Token missing.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      res.status(401).json({ message: 'Not authorized. User not found.' });
      return;
    }

    req.user = user as IUser;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: 'Session expired. Please log in again.' });
    } else {
      res.status(401).json({ message: 'Not authorized. Token invalid.' });
    }
  }
};

export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = (req.user as IUser)?.role as UserRole | undefined;
    if (!role || !allowedRoles.includes(role)) {
      next(new Error('Insufficient permissions.'));
      return;
    }
    next();
  };
};
