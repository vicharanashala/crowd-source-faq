import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackUserActivity } from '../services/streakService.js';
import Streak from '../models/Streak.js';
import User from '../models/User.js';
import Badge from '../models/Badge.js';

// Use vi.hoisted to ensure these variables are defined before vi.mock calls are hoisted.
const { mockStreakSave, mockStreakFindOne } = vi.hoisted(() => ({
  mockStreakSave: vi.fn(),
  mockStreakFindOne: vi.fn(),
}));

vi.mock('../models/Streak.js', () => {
  class MockStreakModel {
    userId: any;
    currentStreak: any;
    bestStreak: any;
    lastActiveDate: any;
    activityHistory: any;

    constructor(data: any) {
      Object.assign(this, data);
    }

    save = mockStreakSave.mockReturnThis();
    static findOne = mockStreakFindOne;
  }
  return { default: MockStreakModel };
});

vi.mock('../models/User.js', () => {
  return {
    default: {
      findById: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
  };
});

vi.mock('../models/Badge.js', () => {
  return {
    default: {
      findOne: vi.fn(),
    },
  };
});

describe('Streak Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new streak document if one does not exist', async () => {
    const mockUser = { _id: 'user123', name: 'John Doe' };
    vi.mocked(User.findById).mockResolvedValue(mockUser as any);
    mockStreakFindOne.mockResolvedValue(null);
    mockStreakSave.mockResolvedValue({});

    await trackUserActivity('user123', 'login');

    expect(User.findById).toHaveBeenCalledWith('user123');
    expect(mockStreakFindOne).toHaveBeenCalledWith({ userId: 'user123' });
    expect(mockStreakSave).toHaveBeenCalled();
  });

  it('updates streak correctly for consecutive days', async () => {
    const mockUser = { _id: 'user123', name: 'John Doe' };
    vi.mocked(User.findById).mockResolvedValue(mockUser as any);

    // Yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const mockStreak = {
      userId: 'user123',
      currentStreak: 2,
      bestStreak: 2,
      lastActiveDate: yesterday,
      activityHistory: [yesterdayStr],
      save: mockStreakSave.mockReturnThis(),
    };
    mockStreakFindOne.mockResolvedValue(mockStreak);

    await trackUserActivity('user123', 'login');

    expect(mockStreak.currentStreak).toBe(3);
    expect(mockStreak.bestStreak).toBe(3);
    expect(mockStreakSave).toHaveBeenCalled();
  });

  it('resets streak if there is a gap of more than one day', async () => {
    const mockUser = { _id: 'user123', name: 'John Doe' };
    vi.mocked(User.findById).mockResolvedValue(mockUser as any);

    // 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

    const mockStreak = {
      userId: 'user123',
      currentStreak: 5,
      bestStreak: 5,
      lastActiveDate: threeDaysAgo,
      activityHistory: [threeDaysAgoStr],
      save: mockStreakSave.mockReturnThis(),
    };
    mockStreakFindOne.mockResolvedValue(mockStreak);

    await trackUserActivity('user123', 'login');

    expect(mockStreak.currentStreak).toBe(1);
    expect(mockStreak.bestStreak).toBe(5); // best stays 5
    expect(mockStreakSave).toHaveBeenCalled();
  });
});
