import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User, { IUser, UserRole } from './user.model.js';
import CommunityPost from '../community/community-post.model.js';
import Notification from '../notification/notification.model.js';
import RevokedToken from './revoked-token.model.js';
import RefreshToken from './refresh-token.model.js';
import { registerSchema, loginSchema, updateProfileSchema } from '../../utils/auth/validation.js';
import { sanitizeHtml } from '../../utils/http/sanitize.js';
import { authLog, securityLog } from '../../utils/http/logger.js';

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Helper: Generates a signed JWT using the user's ID, embedding a unique
// `jti` so the token can be server-side revoked via RevokedToken.
const generateToken = (id: string): { token: string; jti: string; expiresAt: Date } => {
  const secret = process.env.JWT_SECRET as string;
  // Access tokens are short-lived (e.g. 15 minutes)
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '15m') as string;
  const jti = uuidv4();
  const token = jwt.sign({ id, jti }, secret, { expiresIn } as jwt.SignOptions);
  const expiresAt = decodeExpiry(token);
  return { token, jti, expiresAt };
};

const generateRefreshToken = (id: string): { token: string; jti: string; expiresAt: Date } => {
  const secret = (process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET) as string;
  const expiresIn = '7d';
  const jti = uuidv4();
  const token = jwt.sign({ id, jti }, secret, { expiresIn } as jwt.SignOptions);
  const expiresAt = decodeExpiry(token);
  return { token, jti, expiresAt };
};

// Decode only the `exp` claim without verifying the signature. Used purely
// to compute the revocation TTL — signature verification still happens in
// the protect middleware.
function decodeExpiry(token: string): Date {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8')) as { exp?: number };
    return new Date((payload.exp ?? Math.floor(Date.now() / 1000) + 7 * 86400) * 1000);
  } catch (err) {
    authLog.warn(`[auth] Failed to decode token expiry, using fallback (7 days): ${(err as Error).message}`);
    // Fallback: 7 days from now, matches the default expiresIn.
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
}

// Response user shape (excludes password)
interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: { url: string; publicId: string };
  welcomePackageOnboarded?: boolean;
  orientationCompleted?: boolean;
  projectAssigned?: string;
  mentorAssigned?: string;
  projectAssignedAt?: Date;
  projectSelectionLocked?: boolean;
  guidedTourCompleted?: boolean;
  // v1.87 — Sign My Tee: mandatory internship end date.
  // Sent on /auth/me and /auth/profile responses so the FE
  // gate provider can re-evaluate without an extra round-trip.
  internshipEndDate?: Date | null;
}

// POST /api/auth/register
// v1.70 — The controlled-registration gate is enforced by the
// `registrationGate` middleware mounted in routes/auth.ts, BEFORE
// validateBody. By the time this handler runs, the request has
// either been 403'd (closed/no-token/bad-token) or it's a real
// registration attempt. We just validate + create.
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      authLog.warn('register validation failed', { errors: parsed.error.issues.length });
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const { name, email, password } = parsed.data;

    const userExists = await User.findOne({ email });
    if (userExists) {
      authLog.warn('register duplicate email', { email });
      res.status(400).json({ message: 'User with this email already exists.' });
      return;
    }

    const user = await User.create({ name, email, password });
    const { token, jti } = generateToken(user._id.toString());
    const { token: refreshToken, jti: refreshJti, expiresAt: refreshExpiresAt } = generateRefreshToken(user._id.toString());

    // Save refresh token to DB
    await RefreshToken.create({
      tokenHash: hashToken(refreshToken),
      userId: user._id,
      jti: refreshJti,
      expiresAt: refreshExpiresAt,
      revoked: false,
    });

    authLog.info('register ok', { userId: user._id.toString(), email });

    const userResponse: UserResponse = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      welcomePackageOnboarded: user.welcomePackageOnboarded,
      orientationCompleted: user.orientationCompleted,
      projectAssigned: user.projectAssigned,
      mentorAssigned: user.mentorAssigned,
      projectAssignedAt: user.projectAssignedAt,
      projectSelectionLocked: user.projectSelectionLocked,
      guidedTourCompleted: user.guidedTourCompleted,
    };

    res.status(201).json({ token, refreshToken, user: userResponse });
  } catch (error) {
    authLog.error('register failed', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      authLog.warn('login validation failed', { errors: parsed.error.issues.length });
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const { email, password } = parsed.data;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip;

    const user = await User.findOne({ email }).select('+password') as IUser | null;
    if (!user) {
      // Don't reveal whether the email exists. Log at WARN so
      // brute-force attempts surface in the scrollback.
      authLog.warn('login failed (no user)', { email, ip });
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      authLog.warn('login failed (bad password)', { email, userId: user._id.toString(), ip });
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    // v1.67 — Banned / suspended / soft-banned users can't log in.
    // securityLog.alert() forwards to Discord.
    if (user.isBanned) {
      securityLog.alert('banned login attempt', { userId: user._id.toString(), email, ip });
      res.status(403).json({ message: 'Account is banned.' });
      return;
    }
    if (user.goldenBannedUntil && user.goldenBannedUntil > new Date()) {
      authLog.warn('login while golden-banned (allowed — can still browse)', {
        userId: user._id.toString(),
        email,
        ip,
        bannedUntil: user.goldenBannedUntil.toISOString(),
      });
      // Note: golden ban is a soft ban (browse-allowed, create-blocked).
      // We let them log in; the per-endpoint ban gate stops them from
      // creating content until goldenBannedUntil passes.
    }

    const { token, jti } = generateToken(user._id.toString());
    const { token: refreshToken, jti: refreshJti, expiresAt: refreshExpiresAt } = generateRefreshToken(user._id.toString());

    // Save refresh token to DB
    await RefreshToken.create({
      tokenHash: hashToken(refreshToken),
      userId: user._id,
      jti: refreshJti,
      expiresAt: refreshExpiresAt,
      revoked: false,
    });

    authLog.info('login ok', { userId: user._id.toString(), email, ip });

    const userResponse: UserResponse = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      welcomePackageOnboarded: user.welcomePackageOnboarded,
      orientationCompleted: user.orientationCompleted,
      projectAssigned: user.projectAssigned,
      mentorAssigned: user.mentorAssigned,
      projectAssignedAt: user.projectAssignedAt,
      projectSelectionLocked: user.projectSelectionLocked,
      guidedTourCompleted: user.guidedTourCompleted,
    };

    res.json({ token, refreshToken, user: userResponse });
  } catch (error) {
    // v1.87.4 — log the full stack, not just the message. The earlier
    // `authLog.error('login failed', { error: (error as Error).message })`
    // dropped the stack, which made 5xx root-cause hunting impossible —
    // a developer had nothing to grep for beyond the bare message.
    // Now: stack goes to the meta so console + Discord + Sentry all
    // get a usable trace.
    const err = error as Error;
    authLog.error('login failed', {
      error: err?.message,
      stack: err?.stack,
      name: err?.name,
    });
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? err?.message : undefined */ });
  }
};

// GET /api/auth/me
export const getMe = async (req: Request, res: Response): Promise<void> => {
  // Returns the current user's data. 
  // Note: This relies on a protected route middleware that verifies the JWT and attaches the user to `req.user` beforehand.
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }

  const userResponse: UserResponse = {
    id: req.user._id.toString(),
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    avatar: req.user.avatar,
    welcomePackageOnboarded: (req.user as any).welcomePackageOnboarded,
    orientationCompleted: (req.user as any).orientationCompleted,
    projectAssigned: (req.user as any).projectAssigned,
    mentorAssigned: (req.user as any).mentorAssigned,
    projectAssignedAt: (req.user as any).projectAssignedAt,
    projectSelectionLocked: (req.user as any).projectSelectionLocked,
    guidedTourCompleted: (req.user as any).guidedTourCompleted,
    // v1.87 — Sign My Tee: surface on every /auth/me response so
    // the FE gate provider can pick it up.
    internshipEndDate: (req.user as any).internshipEndDate ?? null,
  };

  res.json({ user: userResponse });
};

// GET /api/auth/users (Admin only)
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || (req.user as any).role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/auth/profile (Protected)
//
// v1.87 — IMPORTANT: `validateBody(updateProfileSchema)` is the FIRST
// middleware on this route and has already (a) parsed `req.body`
// against the schema and (b) replaced `req.body` with the parsed
// value (including `.transform()` results — so the
// `internshipEndDate` field is now a JS Date, not a string).
//
// Historically this controller ALSO called
// `updateProfileSchema.safeParse(req.body)` to handle its own
// validation. That's wrong now: the second pass sees the
// *transformed* body where `internshipEndDate` is already a Date
// object — so Zod reports "expected string, received Date". We
// keep the safeParse call for legacy routes where the validator
// isn't mounted, but when `req.body` already came through
// `validateBody`, we trust it and read fields directly.
//
// The branching preserves the existing route shape; newer routes
// in this codebase (e.g. the tee module) use only the middleware.
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized.' });
      return;
    }

    // Read fields directly off `req.body` — validation already ran
    // upstream via `validateBody(updateProfileSchema)`. The
    // `.transform()` on `internshipEndDate` has converted the string
    // into a Date, which is what we want to persist.
    const name = typeof req.body.name === 'string' ? (req.body.name as string).trim() : undefined;
    const email = typeof req.body.email === 'string' ? (req.body.email as string).trim().toLowerCase() : undefined;
    const avatar = req.body.avatar as
      | { url: string; publicId?: string; gcsUri?: string; objectPath?: string }
      | null
      | undefined;
    const guidedTourCompleted = typeof req.body.guidedTourCompleted === 'boolean'
      ? (req.body.guidedTourCompleted as boolean)
      : undefined;
    const internshipEndDateRaw = req.body.internshipEndDate;
    const internshipEndDate: Date | null | undefined =
      internshipEndDateRaw instanceof Date
        ? internshipEndDateRaw
        : internshipEndDateRaw === null
        ? null
        : undefined;

    if (
      !name &&
      !email &&
      avatar === undefined &&
      guidedTourCompleted === undefined &&
      internshipEndDate === undefined
    ) {
      res.status(400).json({ message: 'Provide at least one of: name, email, avatar, guidedTourCompleted, internshipEndDate.' });
      return;
    }

    const updates: Partial<{
      name: string;
      email: string;
      avatar: { url: string; publicId?: string; gcsUri?: string; objectPath?: string } | null;
      guidedTourCompleted: boolean;
      internshipEndDate: Date | null;
    }> = {};
    if (name) updates.name = name;
    if (email) {
      // Check if email is already taken by another user
      const existing = await User.findOne({ email, _id: { $ne: req.user._id } });
      if (existing) {
        res.status(400).json({ message: 'Email is already in use.' });
        return;
      }
      updates.email = email;
    }
    if (avatar !== undefined) {
      // `null` clears the avatar. An object updates it. We validate the
      // URL against whichever storage backend it points at:
      //   - Cloudinary URLs (res.cloudinary.com/...) — old shape, requires publicId
      //   - GCS URLs (media.mydomain.com/...) — new shape, requires gcsUri + objectPath
      if (avatar === null) {
        updates.avatar = null;
      } else {
        let avatarUrl: URL;
        try {
          avatarUrl = new URL(avatar.url);
        } catch {
          res.status(400).json({ message: 'avatar.url must be a valid URL.' });
          return;
        }

        const isCloudinaryHost = avatarUrl.hostname === 'res.cloudinary.com';
        if (isCloudinaryHost && avatarUrl.protocol !== 'https:') {
          res.status(400).json({ message: 'avatar.url must use HTTPS.' });
          return;
        }

        if (isCloudinaryHost) {
          if (!avatar.publicId) {
            res.status(400).json({ message: 'avatar requires publicId for Cloudinary URLs.' });
            return;
          }
          try {
            const { isOurCloudinaryAsset, getCloudinaryConfig } = await import('../../integrations/cloudinary/cloudinary.js');
            const cfg = getCloudinaryConfig();
            if (!isOurCloudinaryAsset(avatar.url, cfg.cloudName)) {
              res.status(400).json({ message: 'avatar.url must be a valid Cloudinary URL for this account.' });
              return;
            }
          } catch (e) {
            res.status(503).json({ message: (e as Error).message });
            return;
          }
          updates.avatar = { url: avatar.url, publicId: avatar.publicId };
        } else {
          // GCS branch — new default for all fresh uploads.
          if (!avatar.gcsUri || !avatar.objectPath) {
            res.status(400).json({ message: 'avatar requires gcsUri and objectPath for GCS URLs.' });
            return;
          }
          try {
            const { isOurGcsAsset } = await import('../../integrations/gcs/gcs.js');
            if (!isOurGcsAsset(avatar.url)) {
              res.status(400).json({ message: 'avatar.url must be a valid GCS asset URL.' });
              return;
            }
          } catch (e) {
            res.status(503).json({ message: (e as Error).message });
            return;
          }
          updates.avatar = {
            url: avatar.url,
            gcsUri: avatar.gcsUri,
            objectPath: avatar.objectPath,
          };
        }
      }
    }

    if (guidedTourCompleted !== undefined) {
      updates.guidedTourCompleted = guidedTourCompleted;
    }

    // v1.87 — Sign My Tee: persist the mandatory internship end
    // date and append an audit entry. We touch the audit log on
    // this one because it's a compliance-relevant field that admins
    // may need to retracing later ("who set this user's date?").
    if (internshipEndDate !== undefined) {
      const previous = (await User.findById(req.user._id).select('internshipEndDate').lean()) as
        | { internshipEndDate?: Date | null }
        | null;
      updates.internshipEndDate = internshipEndDate ?? null;
      const auditEntry = {
        changedBy: req.user._id.toString(),
        changedAt: new Date(),
        oldValue: previous?.internshipEndDate
          ? new Date(previous.internshipEndDate).toISOString()
          : null,
        newValue: internshipEndDate ? internshipEndDate.toISOString() : null,
      };
      await User.updateOne(
        { _id: req.user._id },
        { $push: { onboardingAuditLog: auditEntry } },
      );
    }

    const updated = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    if (!updated) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const userResponse: UserResponse = {
      id: updated._id.toString(),
      name: updated.name,
      email: updated.email,
      role: updated.role,
      avatar: updated.avatar,
      welcomePackageOnboarded: (updated as any).welcomePackageOnboarded,
      orientationCompleted: (updated as any).orientationCompleted,
      projectAssigned: (updated as any).projectAssigned,
      mentorAssigned: (updated as any).mentorAssigned,
      projectAssignedAt: (updated as any).projectAssignedAt,
      projectSelectionLocked: (updated as any).projectSelectionLocked,
      guidedTourCompleted: (updated as any).guidedTourCompleted,
      // v1.87 — Sign My Tee: propagate so the FE's gate
      // provider can re-evaluate eligibility without a second
      // `/auth/me` round-trip.
      internshipEndDate: (updated as any).internshipEndDate ?? null,
    };

    res.json({ message: 'Profile updated.', user: userResponse });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PUT /api/auth/password (Protected)
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized.' });
      return;
    }

    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'Current password and new password are required.' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ message: 'New password must be at least 6 characters.' });
      return;
    }

    const user = await User.findById(req.user._id).select('+password') as IUser | null;
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      res.status(401).json({ message: 'Current password is incorrect.' });
      return;
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PATCH /api/auth/users/:id/role (Admin only)
export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || (req.user as any).role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  try {
    const { role } = req.body as { role?: string };
    const validRoles: UserRole[] = ['user', 'moderator', 'admin', 'ai_moderator'];

    if (!role || !validRoles.includes(role as UserRole)) {
      res.status(400).json({ message: 'Invalid or missing role.' });
      return;
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    targetUser.role = role as UserRole;
    await targetUser.save();

    res.json({ message: 'User role updated successfully.', user: targetUser });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// PUT /api/auth/users/:id/password (Admin only)
// v1.85 — admin-initiated password reset for any non-admin user.
// Body: { newPassword: string } (validated by adminResetPasswordSchema
// upstream). We:
//   1. Look up the target user (404 if not found).
//   2. Reject if target is an admin — admins can never have
//      their password reset by another admin. This is a hard
//      floor: the codebase has no super-admin role, so there is
//      no path that lets an admin reset another admin. If you
//      need a co-admin recovery flow, the only safe option is
//      direct DB surgery — the operator runs a one-off script.
//   3. Set the new password. The pre-save hook on the User
//      schema re-hashes with bcryptjs (12 rounds). We do NOT
//      call comparePassword — the admin doesn't know the old
//      password by design.
//   4. Revoke all active refresh tokens for the target user so
//      any logged-in sessions stop working the next time they
//      try to refresh. Access tokens self-expire in 15 min, so
//      the user is forced to log in fresh within that window.
//   5. Append an entry to the user's onboardingAuditLog so the
//      change is visible in the user's own profile history (and
//      visible to other admins if they ever audit).
//   6. Emit authLog.audit?.() so the security alert log + Discord
//      (when configured) record the action with adminId + targetId.
export const adminResetUserPassword = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || (req.user as any).role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    // Hard floor: admins cannot be reset by other admins. The
    // codebase has no super-admin role, so this is unconditional.
    // See top-of-file comment.
    if (targetUser.role === 'admin') {
      authLog.audit?.('admin_password_reset_blocked', {
        adminId: req.user._id.toString(),
        targetId: req.params.id,
        reason: 'target_is_admin',
        requestId: (req as Request & { id: string }).id,
      });
      res.status(403).json({
        message: 'Admin passwords cannot be reset by another admin. Use a direct DB update or a one-off script for co-admin recovery.',
      });
      return;
    }
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword) {
      res.status(400).json({ message: 'newPassword is required.' });
      return;
    }
    // Set + save. The pre-save hook re-hashes via bcryptjs.
    targetUser.password = newPassword;
    // Append to the same onboardingAuditLog array the other
    // admin actions use (golden ban, project assign, etc.). Old
    // + new value are redacted — the password itself is never
    // written to the audit row. The schema doesn't carry a
    // `field` discriminator, so we use the same shape as the
    // other entries. Convention going forward (in this entry
    // only — older rows predate it): the Mongoose Mixed types
    // for oldValue/newValue let us store the field name as
    // structured data; for v1.85 we keep the existing literal
    // shape and leave a marker in newValue so the audit reader
    // can disambiguate.
    targetUser.onboardingAuditLog = [
      ...(targetUser.onboardingAuditLog ?? []),
      {
        changedBy: req.user._id.toString(),
        changedAt: new Date(),
        oldValue: '[REDACTED:password]',
        newValue: '[REDACTED:password]',
      },
    ];
    await targetUser.save();
    // Force the target to re-authenticate. Refresh tokens are
    // the only persistent session artifact (access tokens are
    // short-lived JWTs that self-expire). Revoking them is
    // enough — any active tab that's still mid-15min window
    // gets bounced on the next refresh.
    await RefreshToken.deleteMany({ userId: targetUser._id });
    authLog.audit?.('admin_password_reset', {
      adminId: req.user._id.toString(),
      targetId: req.params.id,
      targetEmail: targetUser.email,
      requestId: (req as Request & { id: string }).id,
    });
    res.json({
      message: 'Password reset successfully. The user must log in again on their next request.',
      userId: req.params.id,
      mustReLogin: true,
    });
  } catch (error) {
    authLog.error('admin password reset failed', {
      error: (error as Error).message,
      adminId: req.user._id.toString(),
      targetId: req.params.id,
    });
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/auth/users/:id (Admin only)
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  if (!req.user || (req.user as any).role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    // Soft delete & anonymize to prevent orphaned data crashes
    target.isDeleted = true;
    target.deletedAt = new Date();
    target.name = 'Deleted User';
    target.email = `deleted-${target._id}@yaksha.invalid`;
    target.password = uuidv4(); // Re-randomize password to break login
    target.avatar = undefined;
    target.zoomConnected = false;
    target.zoomAccessToken = undefined;
    target.zoomRefreshToken = undefined;
    target.totpEnabled = false;
    target.totpSecret = undefined;

    await target.save();

    // Clean up private data that shouldn't persist
    await Notification.deleteMany({ recipient: target._id });

    authLog.audit?.('user_deleted', {
      adminId: req.user._id.toString(),
      targetId: req.params.id,
      requestId: (req as Request & { id: string }).id,
      mode: 'soft_anonymize'
    });
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// GET /api/auth/export — Export authenticated user's data as JSON
export const exportUserData = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }

  const userId = req.user._id.toString();
  const requestId = (req as Request & { id: string }).id;

  try {
    const [user, posts, notifications, notificationsCount] = await Promise.all([
      User.findById(userId).select('-password').lean(),
      CommunityPost.find({ author: userId }).sort({ createdAt: -1 }).limit(500).select('-embedding').lean(),
      Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(200).lean(),
      Notification.countDocuments({ recipient: userId }),
    ]);

    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    authLog.audit?.('data_export', { userId, requestId });

    const u = user as any;
    const exportData = {
      exportedAt: new Date().toISOString(),
      schemaVersion: '1.0',
      user: {
        id: u._id?.toString(),
        name: sanitizeHtml(u.name),
        email: u.email,
        role: u.role,
        avatar: u.avatar ?? null,
        reputation: u.reputation,
        points: u.points,
        tier: u.tier,
        createdAt: u.createdAt,
        twoFactorEnabled: u.totpEnabled ?? false,
      },
      content: {
        communityPosts: posts.map((p: any) => ({
          id: p._id.toString(),
          title: sanitizeHtml(p.title),
          body: sanitizeHtml(p.body ?? ''),
          status: p.status,
          upvoteCount: p.upvotes?.length ?? 0,
          answer: p.answer ? sanitizeHtml(p.answer) : null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        totalPosts: posts.length,
      },
      notifications: {
        records: notifications.map((n: any) => ({
          id: n._id.toString(),
          type: n.type,
          title: sanitizeHtml(n.title),
          message: sanitizeHtml(n.message),
          link: n.link,
          read: n.read,
          createdAt: n.createdAt,
        })),
        totalNotifications: notificationsCount,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="yaksha-export-${userId.slice(-8)}.json"`);
    res.json(exportData);
  } catch (error) {
    authLog.error('Data export failed', { error: process.env.NODE_ENV === 'development' ? (error as Error).message : 'export failed' });
    res.status(500).json({ message: 'Export failed. Please try again.' });
  }
};

// POST /api/auth/logout — Revoke the JWT carried by the request so it can no
// longer be used. The client's other live tokens are unaffected (this is a
// per-token soft blocklist, not a global session kill).
export const logout = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized.' });
    return;
  }

  try {
    // The protect middleware has already verified the token and attached
    // its decoded payload to req.auth. We just need the jti + exp from there.
    const auth = (req as Request & { auth?: { jti?: string; exp?: number } }).auth;
    if (!auth?.jti || !auth?.exp) {
      authLog.warn('logout: token has no jti', { userId: req.user._id.toString() });
      res.status(400).json({ message: 'Token has no jti — was it issued before the revocation system was added?' });
      return;
    }

    const expiresAt = new Date(auth.exp * 1000);
    // Upsert: idempotent if the same token is logged-out twice.
    await RevokedToken.updateOne(
      { jti: auth.jti },
      { $setOnInsert: { jti: auth.jti, userId: req.user._id, expiresAt, revokedAt: new Date() } },
      { upsert: true }
    );

    // Also revoke the refresh token if provided
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      const hashed = hashToken(refreshToken);
      await RefreshToken.updateOne({ tokenHash: hashed }, { $set: { revoked: true } });
    }

    authLog.info('logout ok', { userId: req.user._id.toString() });
    res.json({ message: 'Logged out.' });
  } catch (error) {
    authLog.error('logout failed', { userId: req.user._id.toString(), error: (error as Error).message });
    res.status(500).json({ message: 'Logout failed.' });
  }
};

// POST /api/auth/refresh
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ message: 'Refresh token is required.' });
      return;
    }

    const secret = (process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET) as string;
    let decoded: { id: string; jti: string };
    try {
      decoded = jwt.verify(refreshToken, secret) as { id: string; jti: string };
    } catch (err) {
      authLog.warn(`[auth] Refresh token verification failed: ${(err as Error).message}`);
      res.status(401).json({ message: 'Invalid or expired refresh token.' });
      return;
    }

    const hashed = hashToken(refreshToken);
    const tokenRecord = await RefreshToken.findOne({ tokenHash: hashed });

    if (!tokenRecord) {
      res.status(401).json({ message: 'Invalid refresh token.' });
      return;
    }

    if (tokenRecord.revoked) {
      // BREACH DETECTION: The token was already used (revoked) but presented again.
      // Invalidate all tokens for this user to mitigate compromise.
      securityLog.alert('Refresh token reuse detected (breach)! Revoking all user sessions.', {
        userId: decoded.id,
        jti: decoded.jti,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip,
      });

      await RefreshToken.deleteMany({ userId: new mongoose.Types.ObjectId(decoded.id) });
      res.status(403).json({ message: 'Session breach detected. Please log in again.' });
      return;
    }

    // Rotate refresh token: mark current as revoked
    tokenRecord.revoked = true;
    await tokenRecord.save();

    // Generate new pair
    const { token: newAccessToken } = generateToken(decoded.id);
    const { token: newRefreshToken, jti: newRefreshJti, expiresAt: newRefreshExpiresAt } = generateRefreshToken(decoded.id);

    await RefreshToken.create({
      tokenHash: hashToken(newRefreshToken),
      userId: tokenRecord.userId,
      jti: newRefreshJti,
      expiresAt: newRefreshExpiresAt,
      revoked: false,
    });

    authLog.info('Refresh token rotated', { userId: decoded.id });
    res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    authLog.error('refresh token rotation failed', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error' });
  }
};
