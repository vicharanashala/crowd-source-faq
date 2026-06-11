/**
 * banUtils — Golden Ticket "Ban User + Reject" enforcement helpers.
 *
 * v1.66 — When an admin rejects a Golden ticket and chooses the
 * "Ban User + Reject" action, the user's `goldenBannedUntil` is set
 * to `now + 72h`. While set, the user CAN still:
 *   - log in
 *   - browse the platform
 *   - view pages, FAQs, community posts
 *
 * But they CANNOT:
 *   - raise support tickets (POST /support/requests)
 *   - raise Golden tickets (admin conversion, but user-side tickets)
 *   - post community questions/answers/comments
 *   - upload knowledge documents
 *
 * The auth middleware (authShared.ts) does NOT check `goldenBannedUntil`
 * — that field is intentionally weaker than `isBanned` / `suspendedUntil`
 * (both of which DO trigger a 403 at the auth layer). Content-creation
 * endpoints call `assertCanCreateContent(user, res)` as the first line
 * of their handler. This keeps "browse but not create" working.
 *
 * Auto-unban is implicit: the check is `goldenBannedUntil > now`, not
 * a derived `isGoldenBanned: true` flag. The `clearExpiredGoldenBans()`
 * function (run by the escalation scheduler) NULLs out the field once
 * it has passed, keeping the DB clean.
 */

import type { Response } from 'express';
import type { IUser } from '../models/User.js';

/**
 * Is this user currently restricted from creating content?
 * Returns true if banned. `now` is injectable for tests.
 */
export function isUserBannedFromCreating(user: Pick<IUser, 'goldenBannedUntil'>, now: Date = new Date()): boolean {
  if (!user.goldenBannedUntil) return false;
  return user.goldenBannedUntil > now;
}

/**
 * Express-style assertion. Writes a 403 with a friendly expiry
 * timestamp and returns false if banned; returns true if the user
 * is allowed to create. Use as the first line of any
 * content-creation handler.
 *
 *   const user = req.user as IUser;
 *   if (!assertCanCreateContent(user, res)) return;
 */
export function assertCanCreateContent(
  user: Pick<IUser, 'goldenBannedUntil'>,
  res: Response,
  now: Date = new Date(),
): boolean {
  if (isUserBannedFromCreating(user, now)) {
    res.status(403).json({
      message: `You are temporarily restricted from creating new content until ${user.goldenBannedUntil!.toISOString()}. You can still browse and read.`,
      code: 'GOLDEN_BAN_ACTIVE',
      bannedUntil: user.goldenBannedUntil!.toISOString(),
    });
    return false;
  }
  return true;
}

/**
 * Compute the new `goldenBannedUntil` value for a 72h ban.
 * Exported so admin endpoints stay consistent if we ever tune the
 * duration.
 */
export function computeGoldenBanExpiry(now: Date = new Date(), hours = 72): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/**
 * v1.66 — Penalty formula on Golden ticket reject / ban.
 *
 * Per the OOB spec clarification: "create a penalty formula 1.25x
 * (where x is number of SP spent)". The spCost was already debited
 * at conversion time (existing behavior, unchanged). On reject or
 * ban, an ADDITIONAL `1.25 * spCost` is debited as a penalty. The
 * user's net loss is `2.25 * spCost` on a rejected golden ticket.
 *
 * Returns an integer (SP is stored as int — `min: 0, integer`
 * implicit in the helpers). Math.ceil so we never undercharge on
 * a fractional penalty.
 */
export function computeGoldenRejectPenalty(spCost: number): number {
  if (!Number.isFinite(spCost) || spCost <= 0) return 0;
  return Math.ceil(spCost * 1.25);
}
