import User from '../modules/auth/user.model.js';

export async function touchUserStreak(userId: string) {
  const user = await User.findById(userId);
  if (!user) return;

  const today = new Date().toISOString().slice(0, 10);
  const lastActive = user.lastActiveDate
    ? new Date(user.lastActiveDate).toISOString().slice(0, 10)
    : null;

  if (lastActive === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);

  user.currentStreak = lastActive === yStr ? user.currentStreak + 1 : 1;
  user.longestStreak = Math.max(user.longestStreak, user.currentStreak);
  user.lastActiveDate = new Date();
  await user.save();
}

export async function resetInactiveStreaks() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const result = await User.updateMany(
    { lastActiveDate: { $lt: yesterday }, currentStreak: { $gt: 0 } },
    { $set: { currentStreak: 0 } }
  );

  return result;
}