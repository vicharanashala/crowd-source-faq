import { Request, Response } from 'express';
import InternshipProgress from './internship.model.js';
import User from '../auth/user.model.js';
import AdminLog from '../admin/admin-log.model.js';

const VALID_PHASES = ['GENERAL', 'PHASE_1', 'PHASE_2', 'PHASE_3', 'COMPLETED'];

// GET /api/admin/internship — every student with their current internship phase
export const listInternshipProgress = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({ role: 'user' }, 'name email').sort({ createdAt: -1 }).lean();
    const progresses = await InternshipProgress.find({}).lean();
    const byUserId = new Map(progresses.map((p) => [p.userId.toString(), p.currentPhase]));

    const result = users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      currentPhase: byUserId.get(u._id.toString()) ?? 'GENERAL',
    }));
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching internship progress' });
  }
};

// PUT /api/admin/internship/:userId — set a student's current internship phase
export const updateInternshipPhase = async (req: Request<{ userId: string }>, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { currentPhase } = req.body as { currentPhase?: string };
    const adminId = req.user?._id;

    if (!currentPhase || !VALID_PHASES.includes(currentPhase)) {
      res.status(400).json({ message: `currentPhase must be one of ${VALID_PHASES.join(', ')}` });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const previous = await InternshipProgress.findOne({ userId });
    const progress = await InternshipProgress.findOneAndUpdate(
      { userId },
      { $set: { currentPhase } },
      { new: true, upsert: true },
    );

    if (adminId) {
      await AdminLog.create({
        adminId,
        action: 'internship_phase_override',
        targetId: user._id,
        targetType: 'user',
        details: `Set internship phase for ${user.name} to ${currentPhase}`,
        changes: [{ field: 'currentPhase', oldValue: previous?.currentPhase ?? 'GENERAL', newValue: currentPhase }],
      });
    }

    res.status(200).json(progress);
  } catch (error) {
    res.status(500).json({ message: 'Error updating internship phase' });
  }
};
