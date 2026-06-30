import { Request, Response } from 'express';
import Streak from '../models/Streak.js';

export const getStreak = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const userId = (req.user as any).id;
    let streak = await Streak.findOne({ userId });

    if (!streak) {
      res.json({
        userId,
        currentStreak: 0,
        bestStreak: 0,
        activityHistory: [],
      });
      return;
    }

    res.json(streak);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
