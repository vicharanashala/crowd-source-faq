import { Request, Response } from 'express';
import { Types } from 'mongoose';
import User from '../models/User.js';
import ModerationLog from '../models/ModerationLog.js';
import { logAction } from './adminController.js';

function requireAdmin(req: Request, res: Response): string | null {
  const role = (req as any).user?.role as string | undefined;
  if (!req.user || !role) {
    res.status(401).json({ message: 'Not authorized' });
    return null;
  }
  if (role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return null;
  }
  return (req as any).user.id as string;
}

function msFromDuration(duration: string): number {
  const match = duration.match(/^(\d+)(h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const val = parseInt(match[1]);
  return match[2] === 'h' ? val * 3600000 : val * 86400000;
}

const adminIdAsObjId = (id: string): Types.ObjectId => new Types.ObjectId(id);

// ─── Ban User ────────────────────────────────────────────────────────────
export const banUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId || !reason) { res.status(400).json({ message: 'userId and reason required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (user.role === 'admin') { res.status(403).json({ message: 'Cannot ban an admin' }); return; }

    const prevState = user.isBanned ? 'banned' : 'active';
    user.isBanned = true;
    user.banReason = reason;
    user.bannedAt = new Date();
    user.bannedBy = adminIdAsObjId(adminId);
    await user.save();

    await ModerationLog.create({
      moderatorId: adminIdAsObjId(adminId), action: 'ban',
      targetId: userId, targetType: 'user',
      reason, newState: 'banned', previousState: prevState,
    });
    await logAction(adminId, 'ban_user', userId, 'user', reason);

    res.json({ userId, isBanned: true, banReason: reason, bannedAt: user.bannedAt });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Unban User ────────────────────────────────────────────────────────
export const unbanUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId) { res.status(400).json({ message: 'userId required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const prevState = user.isBanned ? 'banned' : 'active';
    user.isBanned = false;
    user.banReason = undefined;
    user.bannedAt = undefined;
    user.bannedBy = undefined;
    await user.save();

    await ModerationLog.create({
      moderatorId: adminIdAsObjId(adminId), action: 'unban',
      targetId: userId, targetType: 'user',
      reason: reason || 'User unbanned', newState: 'active', previousState: prevState,
    });
    await logAction(adminId, 'unban_user', userId, 'user', reason || 'User unbanned');

    res.json({ userId, isBanned: false });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Suspend User ───────────────────────────────────────────────────────
export const suspendUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  try {
    const { userId, reason, duration } = req.body as { userId?: string; reason?: string; duration?: string };
    if (!userId || !reason || !duration) { res.status(400).json({ message: 'userId, reason, and duration required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (user.role === 'admin') { res.status(403).json({ message: 'Cannot suspend an admin' }); return; }

    const until = new Date(Date.now() + msFromDuration(duration));
    const prevState = user.suspendedUntil ? `suspended_until_${user.suspendedUntil.toISOString()}` : 'active';
    user.suspendedUntil = until;
    await user.save();

    await ModerationLog.create({
      moderatorId: adminIdAsObjId(adminId), action: 'suspend',
      targetId: userId, targetType: 'user',
      reason, duration, newState: `suspended_until_${until.toISOString()}`, previousState: prevState,
    });
    await logAction(adminId, 'suspend_user', userId, 'user', `${reason} until ${until.toISOString()}`);

    res.json({ userId, suspendedUntil: until });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Unsuspend User ─────────────────────────────────────────────────────
export const unsuspendUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId) { res.status(400).json({ message: 'userId required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const prevState = user.suspendedUntil ? 'suspended' : 'active';
    user.suspendedUntil = undefined;
    await user.save();

    await ModerationLog.create({
      moderatorId: adminIdAsObjId(adminId), action: 'unsuspend',
      targetId: userId, targetType: 'user',
      reason: reason || 'Suspension lifted', newState: 'active', previousState: prevState,
    });

    res.json({ userId, suspendedUntil: null });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Warn User ─────────────────────────────────────────────────────────
export const warnUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId || !reason) { res.status(400).json({ message: 'userId and reason required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    await ModerationLog.create({
      moderatorId: adminIdAsObjId(adminId), action: 'warn',
      targetId: userId, targetType: 'user',
      reason, newState: 'warned', previousState: 'active',
    });
    await logAction(adminId, 'warn_user', userId, 'user', reason);

    res.json({ userId, warned: true, reason });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Soft Delete User ───────────────────────────────────────────────────
export const softDeleteUser = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  try {
    const { userId, reason } = req.body as { userId?: string; reason?: string };
    if (!userId) { res.status(400).json({ message: 'userId required' }); return; }

    const user = await User.findById(userId);
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (user.role === 'admin') { res.status(403).json({ message: 'Cannot delete an admin' }); return; }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.email = `[deleted_${userId}]_${user.email}`;
    await user.save();

    await ModerationLog.create({
      moderatorId: adminIdAsObjId(adminId), action: 'soft_delete',
      targetId: userId, targetType: 'user',
      reason: reason || 'Soft deleted', newState: 'deleted', previousState: 'active',
    });
    await logAction(adminId, 'soft_delete_user', userId, 'user', reason);

    res.json({ userId, isDeleted: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Get Moderation Logs ───────────────────────────────────────────────
export const getModerationLogs = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')));
    const limit = Math.min(50, parseInt(String(req.query.limit ?? '20')));
    const skip = (page - 1) * limit;
    const targetId = req.query.targetId as string | undefined;
    const targetType = req.query.targetType as string | undefined;

    const filter: Record<string, unknown> = {};
    if (targetId) filter.targetId = targetId;
    if (targetType) filter.targetType = targetType;

    const [logs, total] = await Promise.all([
      ModerationLog.find(filter)
        .populate('moderatorId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ModerationLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};

// ─── Get Moderation Queue ───────────────────────────────────────────────
export const getModerationQueue = async (req: Request, res: Response): Promise<void> => {
  const adminId = requireAdmin(req, res);
  if (!adminId) return;
  try {
    const [banned, suspended] = await Promise.all([
      User.find({ isBanned: true, isDeleted: false })
        .select('name email banReason bannedAt tier points')
        .sort({ bannedAt: -1 }),
      User.find({ suspendedUntil: { $gt: new Date() }, isDeleted: false })
        .select('name email suspendedUntil tier points')
        .sort({ suspendedUntil: 1 }),
    ]);
    res.json({ banned, suspended });
  } catch (error) {
    res.status(500).json({ message: 'Server error', /* error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined */ });
  }
};