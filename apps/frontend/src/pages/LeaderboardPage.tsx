import React, { useState, useEffect } from 'react';

type LeaderboardEntry = {
  _id: string;
  name?: string;
  points?: number;
  total?: number;
  user?: { name: string }[];
};

export default function LeaderboardPage() {
  const [view, setView] = useState<'all-time' | 'weekly'>('all-time');
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/csfaq/api/leaderboard/${view}`)
      .then((res) => res.json())
      .then((json) => setData(json))
      .catch((err) => console.error('Leaderboard fetch failed:', err))
      .finally(() => setLoading(false));
  }, [view]);

  const getName = (entry: LeaderboardEntry) => {
    if (view === 'all-time') return entry.name || `User ${entry._id.slice(-4)}`;
    return entry.user?.[0]?.name || `User ${entry._id.slice(-4)}`;
  };

  const getPoints = (entry: LeaderboardEntry) => {
    return view === 'all-time' ? entry.points : entry.total;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
      <p className="text-[rgb(var(--text-muted-rgb))] mb-6">
        See who's leading the pack.
      </p>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setView('all-time')}
          className={`px-4 py-2 rounded-full border transition ${
            view === 'all-time'
              ? 'bg-[rgb(var(--accent-rgb))] text-white'
              : 'bg-[rgb(var(--bg-card-rgb))] text-[rgb(var(--text-rgb))]'
          }`}
        >
          All-Time
        </button>
        <button
          onClick={() => setView('weekly')}
          className={`px-4 py-2 rounded-full border transition ${
            view === 'weekly'
              ? 'bg-[rgb(var(--accent-rgb))] text-white'
              : 'bg-[rgb(var(--bg-card-rgb))] text-[rgb(var(--text-rgb))]'
          }`}
        >
          This Week
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : data.length === 0 ? (
        <p className="text-[rgb(var(--text-muted-rgb))]">
          No activity yet — be the first to earn points!
        </p>
      ) : (
        <div className="rounded-xl border border-[rgb(var(--border-rgb)_/_0.6)] bg-[rgb(var(--bg-card-rgb)_/_0.85)] overflow-hidden">
          {data.map((entry, index) => (
            <div
              key={entry._id}
              className="flex items-center justify-between px-5 py-4 border-b border-[rgb(var(--border-rgb)_/_0.3)] last:border-b-0"
            >
              <div className="flex items-center gap-4">
                <span className="font-bold w-6 text-center">{index + 1}</span>
                <span>{getName(entry)}</span>
              </div>
              <span className="font-semibold">{getPoints(entry)} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}