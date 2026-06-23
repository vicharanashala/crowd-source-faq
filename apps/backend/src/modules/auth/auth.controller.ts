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
import { registerSchema, loginSchema, changePasswordSchema } from '../../utils/auth/validation.js';
import { sanitizeHtml } from '../../utils/http/sanitize.js';
import { logger, authLog, securityLog } from '../../utils/http/logger.js';

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
  const secret = (process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET) as string;
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
    };

    res.json({ token, refreshToken, user: userResponse });
  } catch (error) {
    authLog.error('login failed', { error: (error as Error).message });
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
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
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized.' });
      return;
    }

    const { name, email, avatar } = req.body as {
      name?: string;
      email?: string;
      avatar?: { url?: string; publicId?: string } | null;
    };

    if (!name && !email && avatar === undefined) {
      res.status(400).json({ message: 'Provide at least one of: name, email, avatar.' });
      return;
    }

    const updates: Partial<{ name: string; email: string; avatar: { url: string; publicId: string } | null }> = {};
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
      // `null` clears the avatar. An object updates it. We always validate
      // the URL is on our Cloudinary account so the client can't slip in
      // a URL pointing elsewhere.
      if (avatar === null) {
        updates.avatar = null;
      } else {
        if (!avatar.url || !avatar.publicId) {
          res.status(400).json({ message: 'avatar requires both url and publicId.' });
          return;
        }
        try {
          // Lazy import — only load cloudinary utils if we actually need to
          // validate an avatar. Keeps /api/auth/profile responsive when no
          // avatar is being changed.
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
      }
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

    const secret = (process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET) as string;
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
