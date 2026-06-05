import React, { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';

interface LeaderboardEntry { rank: number; userId: string; name: string; points: number; reputation: number; tier: string; badges: number; joinedAt: string; }

const TIER_COLORS: Record<string, string> = {
  newcomer:       'bg-admin-surface text-admin-muted',
  contributor:   'bg-amber-100 text-amber-700',
  helper:        'bg-slate-100 text-slate-600',
  expert:        'bg-yellow-100 text-yellow-700',
  champion:      'bg-indigo-100 text-indigo-700',
  knowledge_master: 'bg-violet-100 text-violet-700',
};
const TIER_ICONS: Record<string, string> = {
  newcomer:       '🌱',
  contributor:   '🥉',
  helper:        '🥈',
  expert:        '🥇',
  champion:      '💎',
  knowledge_master: '👑',
};
const RANK_COLORS: Record<number, string> = { 1: 'bg-yellow-50 border-yellow-200 text-yellow-800', 2: 'bg-slate-50 border-slate-200 text-slate-700', 3: 'bg-orange-50 border-orange-200 text-orange-700' };

export default function AdminLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  useEffect(() => {
    setLoading(true);
    adminApi.get<{ leaderboard: LeaderboardEntry[]; total: number }>(`/reputation/leaderboard?limit=${LIMIT}`)
      .then(r => { setEntries(r.data.leaderboard); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }, [page]);

  const th = 'px-4 py-2.5 text-left text-[10px] font-semibold text-admin-muted uppercase tracking-wide';
  const td = 'px-4 py-3 text-sm text-admin-text';

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-admin-text">Leaderboard</h2>
        <p className="text-sm text-admin-muted mt-0.5">{total} ranked users · top 50 overall</p>
      </div>

      {/* Top 3 podium */}
      {!loading && entries.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {[1, 0, 2].map(idx => {
            const e = entries[idx];
            if (!e) return null;
            return (
              <div key={e.userId}
                className={`rounded-xl border p-4 text-center ${RANK_COLORS[idx + 1] ?? 'bg-admin-card border-white/5'}`}>
                <div className="text-2xl mb-1">{idx === 1 ? '🥇' : idx === 0 ? '🥈' : '🥉'}</div>
                <p className="text-sm font-semibold text-admin-text">{e.name}</p>
                <p className="text-xl font-bold text-admin-text mt-1">{e.points.toLocaleString()}</p>
                <p className="text-[10px] text-admin-muted mt-0.5">points</p>
                <div className="mt-2 flex justify-center gap-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_COLORS[e.tier] || 'bg-admin-surface text-admin-muted'}`}>{TIER_ICONS[e.tier] ?? ''} {e.tier}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-admin-bg border-b border-white/5">
              <th className={th}>Rank</th><th className={th}>User</th><th className={th}>Points</th><th className={th}>Reputation</th><th className={th}>Tier</th><th className={th}>Badges</th><th className={th}>Joined</th>
            </tr></thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i} className="border-b border-white/5"><td colSpan={7} className="px-4 py-4 text-center text-sm text-admin-muted">Loading…</td></tr>)
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-admin-muted">No users yet</td></tr>
              ) : entries.map(e => (
                <tr key={e.userId} className={`border-b border-white/5 last:border-0 hover:bg-admin-bg transition-colors ${e.rank <= 3 ? 'bg-admin-bg/50' : ''}`}>
                  <td className={td}>
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${e.rank === 1 ? 'bg-yellow-100 text-yellow-800' : e.rank === 2 ? 'bg-slate-100 text-slate-700' : e.rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-admin-surface text-admin-muted'}`}>
                      {e.rank}
                    </span>
                  </td>
                  <td className={`${td} font-medium text-admin-text`}>{e.name}</td>
                  <td className={`${td} font-semibold text-admin-text`}>{e.points.toLocaleString()}</td>
                  <td className={`${td} text-admin-muted`}>{e.reputation.toLocaleString()}</td>
                  <td className={td}>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${TIER_COLORS[e.tier] || 'bg-admin-surface text-admin-muted'}`}>
                      {TIER_ICONS[e.tier] ?? ''} {e.tier}
                    </span>
                  </td>
                  <td className={td}><span className="text-admin-muted">{e.badges > 0 ? `🏅 ${e.badges}` : '—'}</span></td>
                  <td className={`${td} text-admin-muted text-xs`}>{new Date(e.joinedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
