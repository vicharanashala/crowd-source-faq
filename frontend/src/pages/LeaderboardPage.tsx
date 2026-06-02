import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import { CommunityDoodles } from '../components/ui/PageDoodles';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  reputation: number;
  tier: string;
  badges: number;
  joinedAt: string;
}

const TIER_COLORS: Record<string, string> = {
  newcomer: 'bg-gray-100 text-gray-600',
  bronze: 'bg-amber-100 text-amber-700',
  silver: 'bg-slate-100 text-slate-600',
  gold: 'bg-yellow-100 text-yellow-700',
  platinum: 'bg-indigo-100 text-indigo-700',
  legend: 'bg-violet-100 text-violet-700',
};

const TIER_ICONS: Record<string, string> = {
  newcomer: '🌱',
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '💎',
  legend: '👑',
};

const RANK_STYLES: Record<number, string> = {
  1: 'from-yellow-400 to-amber-500 text-white',
  2: 'from-slate-300 to-slate-400 text-white',
  3: 'from-orange-400 to-orange-500 text-white',
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ leaderboard: LeaderboardEntry[] }>('/reputation/leaderboard?limit=50')
      .then(r => setEntries(r.data.leaderboard))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <CommunityDoodles />
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-12 relative z-10">
        {/* Header */}
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-serif text-ink tracking-tight">Community Leaderboard</h1>
          <p className="text-sm text-ink-soft mt-1">Top contributors in the Yaksha community</p>
        </div>

        {/* Podium */}
        {!loading && entries.length >= 3 && (
          <div className="px-1 pt-2">
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[0, 1, 2].map((idx) => {
                const e = entries[idx];
                if (!e) return null;
                return (
                  <div key={e.userId} className={`relative rounded-2xl border p-5 text-center bg-card shadow-subtle ${e.rank === 1 ? 'border-yellow-400/50 ring-2 ring-yellow-200/40' : 'border-border'}`}>
                    <div className={`absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${e.rank === 1 ? 'bg-yellow-400 text-yellow-900' : e.rank === 2 ? 'bg-slate-300 text-slate-800' : 'bg-orange-400 text-orange-900'}`}>
                      {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : '🥉'}
                    </div>
                    <p className="text-sm font-semibold text-ink mt-2">{e.name}</p>
                    <div className="flex justify-center gap-1 mt-1.5 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_COLORS[e.tier] || 'bg-mist text-ink-soft'}`}>
                        {TIER_ICONS[e.tier] ?? ''} {e.tier}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-ink mt-3">{e.points.toLocaleString()}</p>
                    <p className="text-[10px] text-ink-faint mt-0.5">points</p>
                    {e.badges > 0 && (
                      <p className="text-xs text-ink-soft mt-1">🏅 {e.badges} badge{e.badges !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="pb-12">
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-subtle">
            {loading ? (
              <div className="p-8 text-center text-sm text-ink-faint">Loading…</div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-faint">No users yet</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-mist border-b border-border/70">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-ink-soft uppercase tracking-wide w-12">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-ink-soft uppercase tracking-wide">User</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Points</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.userId} className="border-b border-border/40 last:border-0 hover:bg-mist/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-ink-faint">
                        {e.rank <= 3 ? (
                          <span className="text-sm">{e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : '🥉'}</span>
                        ) : (
                          <span className="text-sm text-ink-faint">{e.rank}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-ink">{e.name}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-ink">{e.points.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_COLORS[e.tier] || 'bg-mist text-ink-soft'}`}>
                          {TIER_ICONS[e.tier] ?? ''} {e.tier}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}