import { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';

interface LeaderboardEntry { rank: number; userId: string; name: string; points: number; reputation: number; tier: string; badges: number; joinedAt: string; }

const TIER_COLORS: Record<string, string> = {
  newcomer:         'bg-border/40 text-ink-faint',
  contributor:      'bg-warning/10 text-warning',
  helper:           'bg-blue-500/10 text-blue-400',
  expert:           'bg-yellow-400/10 text-yellow-400',
  champion:         'bg-accent/10 text-accent',
  knowledge_master: 'bg-purple-500/10 text-purple-400',
};
const TIER_ICONS: Record<string, string> = {
  newcomer:         '🌱',
  contributor:      '🥉',
  helper:           '🥈',
  expert:           '🥇',
  champion:         '💎',
  knowledge_master: '👑',
};
const RANK_COLORS: Record<number, string> = {
  1: 'bg-yellow-400/10 border-yellow-400/20 text-yellow-400',
  2: 'bg-border/40 border-border text-ink-soft',
  3: 'bg-warning/10 border-warning/20 text-warning',
};

export default function AdminLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page] = useState(1);
  const LIMIT = 20;

  useEffect(() => {
    setLoading(true);
    adminApi.get<{ leaderboard: LeaderboardEntry[]; total: number }>(`/reputation/leaderboard?limit=${LIMIT}`)
      .then(r => { setEntries(r.data.leaderboard); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-ink-faint -mt-2">{total} ranked users · top 50 overall</p>

      {/* Top 3 podium */}
      {!loading && entries.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {[1, 0, 2].map(idx => {
            const e = entries[idx];
            if (!e) return null;
            return (
              <div key={e.userId}
                className={`rounded-xl border p-4 text-center ${RANK_COLORS[idx + 1] ?? 'bg-card border-border'}`}>
                <div className="text-2xl mb-1">{idx === 1 ? '🥇' : idx === 0 ? '🥈' : '🥉'}</div>
                <p className="text-sm font-semibold text-ink">{e.name}</p>
                <p className="text-xl font-bold text-ink mt-1">{e.points.toLocaleString()}</p>
                <p className="text-[10px] text-ink-faint mt-0.5">points</p>
                <div className="mt-2 flex justify-center gap-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_COLORS[e.tier] || 'bg-border/40 text-ink-faint'}`}>{TIER_ICONS[e.tier] ?? ''} {e.tier}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="admin-table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="admin-thead-row">
              <th className="admin-th">Rank</th><th className="admin-th">User</th><th className="admin-th">Points</th><th className="admin-th">Reputation</th><th className="admin-th">Tier</th><th className="admin-th">Badges</th><th className="admin-th">Joined</th>
            </tr></thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i} className="admin-tr"><td colSpan={7} className="admin-td text-center text-ink-faint">Loading…</td></tr>)
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="admin-empty">No users yet</td></tr>
              ) : entries.map(e => (
                <tr key={e.userId} className={`admin-tr ${e.rank <= 3 ? 'bg-mist/30' : ''}`}>
                  <td className="admin-td">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      e.rank === 1 ? 'bg-yellow-400/10 text-yellow-400' :
                      e.rank === 2 ? 'bg-border/40 text-ink-soft' :
                      e.rank === 3 ? 'bg-warning/10 text-warning' :
                                     'bg-border/40 text-ink-faint'
                    }`}>
                      {e.rank}
                    </span>
                  </td>
                  <td className="admin-td font-medium text-ink">{e.name}</td>
                  <td className="admin-td font-semibold text-ink">{e.points.toLocaleString()}</td>
                  <td className="admin-td text-ink-soft">{e.reputation.toLocaleString()}</td>
                  <td className="admin-td">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${TIER_COLORS[e.tier] || 'bg-border/40 text-ink-faint'}`}>
                      {TIER_ICONS[e.tier] ?? ''} {e.tier}
                    </span>
                  </td>
                  <td className="admin-td"><span className="text-ink-soft">{e.badges > 0 ? `🏅 ${e.badges}` : '—'}</span></td>
                  <td className="admin-td text-ink-faint text-xs">{new Date(e.joinedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
