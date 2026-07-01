import { type Request, type Response, type NextFunction } from 'express';
import { Types } from 'mongoose';
import { verifyAndLoadUser, authorize, type AuthedRequest } from './authShared.js';
import { checkInternalApiKey } from './internalApiKey.js';

// Re-export the legacy `authorize` factory so callers that import it from
// './middleware/auth.js' keep working.
export { authorize };

/**
 * Sentinel user attached to the request when the caller authenticates
 * with the internal API key (X-Internal-Api-Key) instead of a JWT.
 *
 * It's a fixed ObjectId so any downstream code that does
 * `req.user._id.toString()` doesn't NPE. `isInternalBot: true` lets
 * controllers tell bot traffic apart from real admin users — useful
 * for audit logs (e.g. "ticket resolved by discord-bot" vs the
 * actual admin's name).
 *
 * The role is 'admin' so any `authorize('admin', 'moderator', ...)`
 * middleware that runs downstream still passes.
 */
const INTERNAL_BOT_SENTINEL_USER = {
  _id: new Types.ObjectId('000000000000000000000001'),
  id: '000000000000000000000001',
  role: 'admin' as const,
  isInternalBot: true,
  email: 'discord-bot@internal',
  name: 'Discord Bot',
};

// `protect` — verify JWT, check blocklist, attach user, then call next().
// On failure verifyAndLoadUser writes the 401 response and returns null;
// we short-circuit so next() doesn't run.
//
// v1.69 — Phase 0 (discord capabilities): `protect` also accepts the
// internal API key. When the key is valid, we skip the JWT and attach
// the sentinel bot user. This lets the Discord bot call any
// `protect`-guarded route (e.g. /api/support/requests, /api/moderation/ban)
// without us having to fork every route into a bot-only variant. The
// checkInternalApiKey() helper does a constant-time compare against
// the INTERNAL_API_KEY env var; if it's not set, the helper returns
// false and protect falls through to the normal JWT path.
export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (checkInternalApiKey(req)) {
    (req as AuthedRequest).user = INTERNAL_BOT_SENTINEL_USER as unknown as AuthedRequest['user'];
    next();
    return;
  }
  const user = await verifyAndLoadUser(req as AuthedRequest, res);
  if (!user) return;
  next();
};
