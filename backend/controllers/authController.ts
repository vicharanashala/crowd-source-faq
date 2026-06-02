import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import User, { IUser, UserRole } from '../models/User.js';
import CommunityPost from '../models/CommunityPost.js';
import Notification from '../models/Notification.js';
import { registerSchema, loginSchema, changePasswordSchema } from '../utils/validation.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';

// Helper: Generates a signed JWT using the user's ID
const generateToken = (id: string): string => {
  const secret = process.env.JWT_SECRET as string;
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as string;
  return jwt.sign({ id }, secret, { expiresIn } as jwt.SignOptions);
};

// Response user shape (excludes password)
interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

// POST /api/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const { name, email, password } = parsed.data;

    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400).json({ message: 'User with this email already exists.' });
      return;
    }

    const user = await User.create({ name, email, password });
    const token = generateToken(user._id.toString());

    const userResponse: UserResponse = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    res.status(201).json({ token, user: userResponse });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
      return;
    }
    const { email, password } = parsed.data;

    const user = await User.findOne({ email }).select('+password') as IUser | null;
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const token = generateToken(user._id.toString());

    const userResponse: UserResponse = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    res.json({ token, user: userResponse });
  } catch (error) {
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

    const { name, email } = req.body as { name?: string; email?: string };

    if (!name && !email) {
      res.status(400).json({ message: 'At least one of name or email is required.' });
      return;
    }

    const updates: Partial<{ name: string; email: string }> = {};
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
    await User.findByIdAndDelete(req.params.id);
    logger.audit?.('user_deleted', {
      adminId: req.user._id.toString(),
      targetId: req.params.id,
      requestId: (req as Request & { id: string }).id,
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
      CommunityPost.find({ author: userId }).sort({ createdAt: -1 }).limit(500).lean(),
      Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(200).lean(),
      Notification.countDocuments({ recipient: userId }),
    ]);

    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    logger.audit?.('data_export', { userId, requestId });

    const u = user as any;
    const exportData = {
      exportedAt: new Date().toISOString(),
      schemaVersion: '1.0',
      user: {
        id: u._id?.toString(),
        name: sanitizeHtml(u.name),
        email: u.email,
        role: u.role,
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
    logger.error('Data export failed', { /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ }, requestId);
    res.status(500).json({ message: 'Export failed. Please try again.' });
  }
};
