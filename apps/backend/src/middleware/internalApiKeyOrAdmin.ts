import { type Request, type Response, type NextFunction } from 'express';
import { checkInternalApiKey } from './internalApiKey.js';
import { adminOnly } from './admin.js';

/**
 * internalApiKeyOrAdmin — accepts EITHER:
 *   - X-Internal-Api-Key header (the bot / same-process callers), or
 *   - A valid admin JWT (the web admin, via Bearer token)
 *
 * Use this on admin routes that the bot AND the web admin both call,
 * so we don't have to duplicate the route or write a separate
 * /api/bot/admin/... surface just for the bot.
 *
 * The bot check is tried first because:
 *   - It's cheaper (no JWT verify + DB user load)
 *   - It works for routes the bot hits even when the user is unauth'd
 *
 * If both fail, adminOnly writes 401/403 and we return.
 */
export const internalApiKeyOrAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (checkInternalApiKey(req)) {
    (req as Request & { internalBot?: boolean }).internalBot = true;
    next();
    return;
  }
  // Fall through to adminOnly (JWT). It writes 401/403 if it fails.
  await adminOnly(req, res, next);
};
