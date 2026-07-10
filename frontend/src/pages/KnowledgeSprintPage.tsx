import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

interface Challenge {
  id: number;
  title: string;
  detail: string;
  points: number;
  category: string;
  completed: boolean;
  actionable: boolean;
  actionUrl: string;
}

interface DailyProgress {
  user: { points: number; tier: string; badges: number; rank: number };
  challenges: Challenge[];
  progress: {
    completedChallenges: number;
    totalChallenges: number;
    pointsEarnedToday: number;
    streakDays: number;
    nextTier: string;
    pointsToNextTier: number;
  };
  activity: {
    unreadNotifications: number;
    recentFaqCount: number;
    recentCommunityPosts: number;
    todaysActions: number;
  };
}

export default function KnowledgeSprintPage() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<DailyProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get('/user/daily-progress');
        if (!cancelled) setData(res.data);
      } catch (err) {
        console.error('Failed to load daily progress:', err);
        if (!cancelled) setError('Failed to load your sprint progress.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-bg text-ink flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold text-ink">Knowledge Sprint</h1>
        <p className="text-sm text-ink-faint max-w-md">Sign in to see your personal daily challenges, streak, and progress toward your next tier.</p>
        <Link to="/" className="text-sm font-medium text-accent hover:underline">← Back home</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-ink flex items-center justify-center">
        <p className="text-sm text-ink-faint">Loading your sprint…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg text-ink flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-500">{error || 'Something went wrong.'}</p>
        <Link to="/" className="text-sm text-accent hover:underline">← Back home</Link>
      </div>
    );
  }

  const { challenges, progress, activity } = data;
  const progressPercent = progress.totalChallenges
    ? Math.round((progress.completedChallenges / progress.totalChallenges) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-4 pt-20 sm:pt-24 pb-10 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Gamified learning</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink">Knowledge Sprint</h1>
            <p className="text-sm text-ink-faint mt-1">
              Real challenges built from your own activity — not a script. Complete them by actually doing the thing.
            </p>
          </div>
          <Link to="/" className="text-sm text-ink-faint hover:text-ink transition-colors">
            ← Back home
          </Link>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Today's challenges</h2>
                <p className="text-sm text-ink-faint mt-1">Generated from your recent activity — refreshes as you act.</p>
              </div>
              <div className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                +{progress.pointsEarnedToday} pts today
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {challenges.map((challenge) => (
                <div key={challenge.id} className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{challenge.title}</p>
                      <p className="mt-1 text-sm text-ink-faint">{challenge.detail}</p>
                    </div>
                    <span className="rounded-full bg-border/70 px-2.5 py-1 text-[11px] font-semibold text-ink-faint whitespace-nowrap">
                      {challenge.category}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-accent">
                      {challenge.points > 0 ? `+${challenge.points} pts` : 'Done'}
                    </span>
                    {challenge.completed ? (
                      <span className="rounded-full px-3 py-1.5 text-sm font-medium bg-emerald-500/10 text-emerald-600">
                        Completed
                      </span>
                    ) : challenge.actionable ? (
                      <Link
                        to={challenge.actionUrl}
                        className="rounded-full px-3 py-1.5 text-sm font-medium border border-border bg-card text-ink hover:bg-accent/10 transition-colors"
                      >
                        Do it now →
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-faint">In progress</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-ink">Sprint status</h2>
              <p className="text-sm text-ink-faint mt-1">Based on real activity — points, streak, and tier from your account.</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Progress</span>
                <span className="text-sm font-semibold text-accent">{progress.completedChallenges} of {progress.totalChallenges} completed</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-border/70">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="mt-3 text-sm text-ink-faint">You are {progressPercent}% through today's sprint.</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
              <h3 className="text-sm font-semibold text-ink">Active streak</h3>
              <p className="mt-2 text-2xl font-semibold text-ink">{progress.streakDays} <span className="text-sm font-normal text-ink-faint">day{progress.streakDays === 1 ? '' : 's'} active this week</span></p>
              {progress.nextTier && progress.pointsToNextTier > 0 && (
                <p className="mt-2 text-sm text-ink-faint">{progress.pointsToNextTier} points to {progress.nextTier} tier.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
              <h3 className="text-sm font-semibold text-ink">This week</h3>
              <ul className="mt-3 space-y-2 text-sm text-ink-faint">
                <li>• {activity.recentFaqCount} FAQ contribution{activity.recentFaqCount === 1 ? '' : 's'}</li>
                <li>• {activity.recentCommunityPosts} community post{activity.recentCommunityPosts === 1 ? '' : 's'}</li>
                <li>• {activity.unreadNotifications} unread notification{activity.unreadNotifications === 1 ? '' : 's'}</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
