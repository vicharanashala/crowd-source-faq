import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';

interface StreakData {
  userId: string;
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: string;
  activityHistory: string[];
}

export default function StreakChip(): React.ReactElement | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!userId) {
      setStreak(null);
      return;
    }
    const controller = new AbortController();
    api
      .get<StreakData>('/streak', { signal: controller.signal })
      .then((res) => setStreak(res.data))
      .catch((err) => {
        if (axios.isCancel(err)) return;
        setStreak(null); // fail soft
      });
    return () => controller.abort();
  }, [userId]);

  if (!userId || !streak) return null;

  // Generate last 7 days in YYYY-MM-DD and day labels
  const getLast7Days = () => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'narrow' }); // e.g. M, T, W
      days.push({ dateStr, dayLabel, dayNum: d.getDate() });
    }
    return days;
  };

  const last7Days = getLast7Days();

  // Progress towards next badge reward
  let nextThreshold = 3;
  if (streak.currentStreak >= 30) {
    nextThreshold = 30;
  } else if (streak.currentStreak >= 7) {
    nextThreshold = 30;
  } else if (streak.currentStreak >= 3) {
    nextThreshold = 7;
  }
  const prevThreshold = nextThreshold === 3 ? 0 : nextThreshold === 7 ? 3 : 7;
  const range = nextThreshold - prevThreshold;
  const progressPercent = Math.min(100, Math.max(0, ((streak.currentStreak - prevThreshold) / range) * 100));

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-semibold cursor-pointer transition-colors hover:bg-orange-500/20"
        aria-label={`Learning streak: ${streak.currentStreak} days`}
      >
        <span className="text-base" role="img" aria-label="streak fire">🔥</span>
        <span className="tabular-nums font-bold">{streak.currentStreak}</span>
        <span className="opacity-80">Days</span>
      </div>

      {showTooltip && (
        <div className="absolute right-0 top-8 w-64 p-4 rounded-2xl bg-card border border-border shadow-xl backdrop-blur-md z-50 animate-fade-in text-ink">
          <h4 className="font-bold text-sm mb-1 text-center">Learning Streak</h4>
          <div className="text-center text-xs text-ink-soft mb-3">
            Current: <span className="font-bold text-orange-500">{streak.currentStreak} days</span> | Best: <span className="font-semibold">{streak.bestStreak} days</span>
          </div>

          {/* Progress to Next Badge */}
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-ink-soft mb-1">
              <span>Badge Progress</span>
              <span>{streak.currentStreak} / {nextThreshold} days</span>
            </div>
            <div className="w-full h-1.5 bg-mist rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Weekly activity grid */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-2 text-center">Last 7 Days</p>
            <div className="flex justify-between items-center gap-1">
              {last7Days.map(({ dateStr, dayLabel, dayNum }) => {
                const isActive = streak.activityHistory.includes(dateStr);
                return (
                  <div key={dateStr} className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] text-ink-soft">{dayLabel}</span>
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                        isActive
                          ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm font-extrabold'
                          : 'bg-mist text-ink-soft'
                      }`}
                      title={isActive ? 'Active' : 'Inactive'}
                    >
                      {dayNum}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
