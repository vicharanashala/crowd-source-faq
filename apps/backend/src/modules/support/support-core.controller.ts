/**
 * supportCore.ts — Shared helpers, guards, and notification fan-out for
 * the Session Support ticket feature.
 *
 * All other support sub-controllers import from here. Nothing in this
 * file is a route handler — it is pure utilities.
 *
 * Modules that import this:
 *   - supportRequestsController    (troubleshoot + request CRUD)
 *   - supportFollowUpController    (follow-ups + status update)
 *   - supportGuidanceController    (AttendanceGuidance CRUD)
 *   - supportAnalyticsController   (admin analytics)
 *   - supportCategoriesController  (category + field CRUD)
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import type { IContextField } from './support-category.model.js';
import type { SupportStatus } from './support-request.model.js';
import Notification from '../notification/notification.model.js';
import AdminLog from '../admin/admin-log.model.js';
import { supportLog } from '../../utils/http/logger.js';
import { isFeatureEnabled } from '../program/feature-flag.controller.js';

// ─── Valid statuses (mirrors the model enum) ────────────────────────────────

// v1.65: extended with 'open' and 'closed' (Golden Ticket lifecycle).
// Controllers filter with this list before applying admin status updates;
// existing four values are unchanged so pre-v1.65 admin inbox filters
// (e.g. status='Pending') keep matching. The two new values are only
// written by the convert-to-golden / Golden status endpoints.
export const VALID_STATUSES: SupportStatus[] = [
  'Pending',
  'In Review',
  'Resolved',
  'Rejected',
  'open',
  'closed',
];

// ─── Golden Ticket helpers (v1.65, additive) ───────────────────────────────

/**
 * Coerce any value (incl. `undefined` from legacy docs missing the
 * `isGolden` field) to a stable boolean. The admin inbox and the user
 * "my tickets" list both rely on this so we don't accidentally treat
 * missing-field as "not Golden" in one view and "Golden" in another.
 */
export function isGoldenTicket(
  ticket: { isGolden?: boolean } | null | undefined
): boolean {
  return Boolean(ticket?.isGolden);
}

/**
 * `true` while a Golden ticket's rejection cooldown is still in effect.
 * Cooldown is stamped by the admin rejection flow (`goldenRejectionEndsAt`)
 * and lifted naturally by time. NULL endsAt = no cooldown.
 */
export function goldenRejectionActive(
  ticket: { goldenRejectionEndsAt?: Date | null } | null | undefined,
  now: Date = new Date()
): boolean {
  const endsAt = ticket?.goldenRejectionEndsAt;
  if (!endsAt) return false;
  const t = endsAt instanceof Date ? endsAt : new Date(endsAt);
  if (isNaN(t.getTime())) return false;
  return t.getTime() > now.getTime();
}

// ─── Auth helpers ──────────────────────────────────────────────────────────

export function getAuthedUserId(req: Request): Types.ObjectId | null {
  const id = (req as Request & { user?: { _id?: Types.ObjectId | string } }).user?._id;
  if (!id) return null;
  return typeof id === 'string' ? new Types.ObjectId(id) : (id as Types.ObjectId);
}

export type UserRole = 'user' | 'moderator' | 'admin' | 'expert' | 'ai_moderator';

export function getAuthedUserRole(req: Request): UserRole | undefined {
  return (req as Request & { user?: { role?: UserRole } }).user?.role;
}

export function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Context field helpers ────────────────────────────────────────────────

/** Coerce a raw user-submitted value to the canonical type for the
 *  field. Returns `{ ok: true, value }` on success; `{ ok: false, error }`
 *  on a type-mismatch. The empty string is treated as null (lets users
 *  leave optional fields blank). */
export function coerceContextFieldValue(
  field: IContextField,
  raw: unknown,
): { ok: true; value: string | number | boolean | null } | { ok: false; error: string } {
  // Empty / undefined → null
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: null };
  }

  switch (field.type) {
    case 'text':
    case 'textarea': {
      if (typeof raw !== 'string') return { ok: false, error: 'must be text' };
      const trimmed = raw.trim();
      if (field.type === 'text' && trimmed.length > 200) return { ok: false, error: 'too long (max 200)' };
      if (field.type === 'textarea' && trimmed.length > 2000) return { ok: false, error: 'too long (max 2000)' };
      return { ok: true, value: trimmed };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: 'must be a number' };
      return { ok: true, value: n };
    }
    case 'date': {
      if (typeof raw !== 'string') return { ok: false, error: 'must be a date string' };
      const d = new Date(raw);
      if (isNaN(d.getTime())) return { ok: false, error: 'invalid date' };
      return { ok: true, value: d.toISOString().slice(0, 10) };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      if (raw === 'true') return { ok: true, value: true };
      if (raw === 'false') return { ok: true, value: false };
      return { ok: false, error: 'must be true or false' };
    }
    case 'dropdown': {
      if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
      const valid = field.options.some((o) => o.value === raw);
      if (!valid) return { ok: false, error: 'value not in dropdown options' };
      return { ok: true, value: raw };
    }
  }
}

export function isEmptyContextValue(v: string | number | boolean | null): boolean {
  return v === null || v === '';
}

/** Strip admin-only fields when sending a ticket to a non-admin. */
export function stripAdminOnlyFields<T extends object>(ticket: T, isAdmin: boolean): T {
  if (isAdmin) return ticket;
  const copy = { ...ticket } as T & Record<string, unknown>;
  delete (copy as Record<string, unknown>).internalNotes;
  return copy as T;
}

// ─── Notification fan-out ────────────────────────────────────────────────

export async function fanOutToAdmins(
  payload: { title: string; message: string; link: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    // We don't import the User model here directly to avoid a circular
    // dependency in test setups; the AdminLog import already pulls it
    // transitively. Look up admin user ids inline.
    const { default: User } = await import('../auth/user.model.js');
    const admins = await User.find({ role: { $in: ['admin', 'moderator'] } }).select('_id').lean();
    if (!admins.length) return;
    await Notification.insertMany(
      admins.map((a) => ({
        recipient: a._id,
        type: 'support' as const,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        metadata: payload.metadata,
      })),
    );
  } catch (err) {
    supportLog.warn(`[support] fanOutToAdmins failed: ${(err as Error).message}`);
  }
}

export async function notifyUser(
  userId: Types.ObjectId,
  payload: { title: string; message: string; link: string; metadata: Record<string, unknown> },
): Promise<void> {
  try {
    await Notification.create({
      recipient: userId,
      type: 'support',
      title: payload.title,
      message: payload.message,
      link: payload.link,
      metadata: payload.metadata,
    });
  } catch (err) {
    supportLog.warn(`[support] notifyUser failed: ${(err as Error).message}`);
  }
}

export async function logAdminAction(
  adminId: Types.ObjectId,
  adminName: string,
  action: string,
  requestId: Types.ObjectId,
  details: string,
): Promise<void> {
  try {
    await AdminLog.create({
      adminId,
      action,
      targetId: requestId,
      targetType: 'support_request',
      details,
    });
  } catch (err) {
    supportLog.warn(`[support] logAdminAction failed: ${(err as Error).message}`);
  }
}

// ─── Guards ──────────────────────────────────────────────────────────────

/** For user-facing routes — return 404 when feature is off.
 *  Default key is 'sessionSupport' for backward compatibility with
 *  the existing routes that call `requireFeatureOn(req, res)` with
 *  no argument. v1.65.1 — extended to accept any FeatureFlagKey so
 *  the new `goldenTicket` flag (and any future ones) can reuse the
 *  same gate without duplicating the boilerplate. */
export async function requireFeatureOn(req: Request, res: Response, key: 'sessionSupport' | 'goldenTicket' = 'sessionSupport'): Promise<boolean> {
  if (!(await isFeatureEnabled(key))) {
    res.status(404).json({ message: 'This feature is not available.' });
    return false;
  }
  return true;
}
