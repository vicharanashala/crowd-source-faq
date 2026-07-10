import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

interface Badge {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  type: string;
  awardedAt: string;
  reason?: string;
}

interface ReputationUser {
  name: string;
  email: string;
  points: number;
  reputation: number;
  tier: string;
  acceptedAnswers: number;
  faqContributions: number;
  positiveBadges: Badge[];
  negativeBadges: Badge[];
}

interface ReputationLog {
  _id: string;
  action: string;
  delta: number;
  reason: string;
  createdAt: string;
}

export default function AchievementsPage() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<ReputationUser | null>(null);
  const [logs, setLogs] = useState<ReputationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?._id) {
      setLoading(false);
      return;
}

    const fetchReputation = async () => {
      try {
        const res = await api.get('/auth/me/reputation');
        setProfile(res.data.user);
        setLogs(res.data.logs);
      } catch (err: any) {
        console.error('Failed to load achievements:', err);
        setError('Failed to load achievements');
      } finally {
        setLoading(false);
      }
    };

    fetchReputation();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading achievements...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-4 pt-20 sm:pt-24 pb-10 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Your progress</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink">Achievement Hub</h1>
            <p className="text-sm text-ink-faint mt-1">Track your contributions, milestones, and momentum in one place.</p>
          </div>
          <Link to="/account" className="text-sm text-ink-faint hover:text-ink transition-colors">
            ← Back to account
          </Link>
        </div>

        <section className="max-w-3xl">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Contribution stats</h2>
                <p className="text-sm text-ink-faint mt-1">A snapshot of your recent activity.</p>
              </div>
              <div className="rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
  {profile?.tier ?? 'Member'}
</div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {profile && (
                <>
                  <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                    <p className="text-sm text-ink-faint">Reputation</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {profile.reputation}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                    <p className="text-sm text-ink-faint">Points</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {profile.points}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                    <p className="text-sm text-ink-faint">Tier</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {profile.tier}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                    <p className="text-sm text-ink-faint">Positive Badges</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {profile.positiveBadges.length}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Milestones</h2>
            <div className="mt-4 space-y-4">
              {profile?.positiveBadges.length ? (
                profile.positiveBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className="rounded-2xl border border-border/70 bg-bg/70 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg">{badge.icon}</span>
                      <div>
                        <p className="font-semibold text-ink">{badge.name}</p>
                        <p className="text-xs text-ink-faint mt-1">{badge.description}</p>
                        <p className="text-xs text-ink-faint mt-1">
                          Earned {new Date(badge.awardedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                  <p className="text-ink-faint">
                    No badges earned yet.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Recent activity</h2>
            <ul className="mt-4 space-y-3">
              {logs.length ? (
                  logs.map((log) => (
                    <li
                      key={log._id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-bg/70 p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {log.action}
                        </p>

                        <p className="text-xs text-ink-faint">
                          {log.delta > 0 ? '+' : ''}
                          {log.delta} points
                        </p>
                      </div>

                      <span className="text-xs text-ink-faint whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="rounded-2xl border border-border/70 bg-bg/70 p-3 text-ink-faint">
                    No recent activity.
                  </li>
                )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
