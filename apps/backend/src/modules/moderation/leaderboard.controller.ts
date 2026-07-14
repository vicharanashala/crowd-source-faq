import { Request, Response } from 'express';
import User from '../auth/user.model.js';
import ReputationLog from './reputation-log.model.js';

export const getAllTimeLeaderboard = async (req: Request, res: Response) => {
  const results = await User.find({ points: { $gt: 0 } })
    .sort({ points: -1 })
    .limit(20)
    .select('name points');
  res.json(results);
};

export const getWeeklyLeaderboard = async (req: Request, res: Response) => {
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const results = await ReputationLog.aggregate([
    { $match: { createdAt: { $gte: startOfWeek } } },
    { $group: { _id: '$userId', total: { $sum: '$delta' } } },
    { $sort: { total: -1 } },
    { $limit: 20 },
    {
      $lookup: {
        from: 'yaksha_faq_users',
        localField: '_id',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1 } }],
        as: 'user',
      },
    },
  ]);
  res.json(results);
};