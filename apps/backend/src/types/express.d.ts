import type { Request } from 'express';
import type { IUser } from '../modules/auth/user.model.js';

/**
 * Consolidated Express Request augmentation.
 * All middleware should import req.user from here — never redeclare globally.
 */
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export type {};
