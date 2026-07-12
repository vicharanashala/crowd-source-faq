import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useBatch } from '../context/BatchContext';
import api from '../utils/api';
import Footer from '../components/layout/Footer';
import LeaderboardPodium from '../components/leaderboard/LeaderboardPodium';
import LeaderboardRow from '../components/leaderboard/LeaderboardRow';
import YourRankCard from '../components/leaderboard/YourRankCard';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  tier: string;
  points: number;
  acceptedAnswers: number;
  faqContributions: number;
  badges: { badgeId: string; awardedAt: string }[];
  rankChange: number;
}

interface LeaderboardResponse {
  rankings: LeaderboardEntry[];
  me: { rank: number; points: number; tier: string } | null;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

type Period = 'all' | 'week' | 'month';

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: 'month', label: 'This Month' },
  { key: 'week', label: 'This Week' },
];

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border animate-pulse">
          <div className="w-8 h-8 rounded-full bg-mist" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-mist rounded" />
            <div className="h-3 w-20 bg-mist rounded" />
          </div>
          <div className="h-5 w-16 bg-mist rounded" />
        </div>
      ))}
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { currentBatch } = useBatch();

  const [period, setPeriod] = useState<Period>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (currentBatch?._id) params.batchId = currentBatch._id;
      if (period !== 'all') params.period = period;

      const res = await api.get<LeaderboardResponse>('/leaderboard', { params });
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [page, period, currentBatch?._id]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Reset page when period changes
  useEffect(() => {
    setPage(1);
  }, [period]);

  const podium = data?.rankings.slice(0, 3) ?? [];
  const rest = data?.rankings.slice(3) ?? [];

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <main className="max-w-[900px] mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-10 w-full flex-1">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-ink">Leaderboard</h1>
          <p className="text-sm text-ink-soft mt-1">Top contributors making a difference</p>
        </div>

        {/* Period Tabs */}
        <div className="flex items-center justify-center gap-1 p-1 rounded-full bg-mist mb-6 w-fit mx-auto">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPeriod(tab.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                period === tab.key
                  ? 'bg-card text-ink shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Your Rank Card */}
        {data?.me && user && (
          <div className="mb-6">
            <YourRankCard rank={data.me.rank} points={data.me.points} tier={data.me.tier} />
          </div>
        )}

        {loading && <LoadingSkeleton />}

        {!loading && error && (
          <div className="text-center py-12">
            <p className="text-sm text-danger mb-3">{error}</p>
            <button
              onClick={fetchLeaderboard}
              className="px-4 py-2 text-xs font-semibold rounded-full bg-accent text-accent-text hover:bg-accent-dark transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Podium */}
            {podium.length > 0 && (
              <div className="mb-6">
                <LeaderboardPodium entries={podium} />
              </div>
            )}

            {/* Table */}
            {data.rankings.length > 0 ? (
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-3 text-center text-[10px] font-semibold text-ink-faint uppercase tracking-widest w-12">#</th>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold text-ink-faint uppercase tracking-widest">Contributor</th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold text-ink-faint uppercase tracking-widest">Points</th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold text-ink-faint uppercase tracking-widest hidden sm:table-cell">Stats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((entry) => (
                      <LeaderboardRow
                        key={entry.userId}
                        rank={entry.rank}
                        name={entry.name}
                        avatar={entry.avatar}
                        tier={entry.tier}
                        points={entry.points}
                        acceptedAnswers={entry.acceptedAnswers}
                        faqContributions={entry.faqContributions}
                        rankChange={entry.rankChange}
                        isCurrentUser={entry.userId === user?.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 bg-card rounded-2xl border border-border">
                <p className="text-sm text-ink-soft">No contributors yet. Be the first!</p>
              </div>
            )}

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-medium rounded-full border border-border text-ink-soft hover:bg-mist transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs text-ink-soft">
                  Page {data.pagination.page} of {data.pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={page >= data.pagination.totalPages}
                  className="px-3 py-1.5 text-xs font-medium rounded-full border border-border text-ink-soft hover:bg-mist transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
