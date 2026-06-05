import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import { CommunityDoodles } from '../components/ui/PageDoodles';
import Avatar from '../components/ui/Avatar';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  reputation: number;
  tier: string;
  badges: number;
  acceptedAnswers: number;
  faqContributions: number;
  trustScore: number;
  joinedAt: string;
  periodPoints?: number;
}

type Period = 'weekly' | 'monthly' | 'all';

const TIER_COLORS: Record<string, string> = {
  newcomer:       'bg-mist text-ink-soft',
  contributor:   'bg-warning-light text-warning',
  helper:        'bg-mist text-ink-soft',
  expert:        'bg-warning-light text-warning',
  champion:      'bg-accent-light text-accent',
  knowledge_master: 'bg-[rgba(139,92,246,0.1)] text-[#8b5cf6]',
};

const TIER_ICONS: Record<string, string> = {
  newcomer:       '🌱',
  contributor:   '🥉',
  helper:        '🥈',
  expert:        '🥇',
  champion:      '💎',
  knowledge_master: '👑',
};

const RANK_STYLES: Record<number, string> = {
  1: 'from-yellow-400 to-amber-500 text-white',
  2: 'from-slate-300 to-slate-400 text-white',
  3: 'from-orange-400 to-orange-500 text-white',
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [period, setPeriod] = useState<Period>('all');

  // Stable fetcher used by both initial load and the 30s polling loop
  const fetchLeaderboard = useCallback((isInitial: boolean) => {
    if (isInitial) setLoading(true);
    api.get<{ leaderboard: LeaderboardEntry[] }>(`/reputation/leaderboard?period=${period}&limit=50`)
      .then(r => {
        setEntries(r.data.leaderboard);
        setLastUpdated(new Date());
      })
      .catch(() => {})
      .finally(() => { if (isInitial) setLoading(false); });
  }, [period]);

  useEffect(() => {
    fetchLeaderboard(true);
  }, [fetchLeaderboard]);

  // Real-time polling: refresh every 30s so ranks/trust/points stay current.
  // Pauses when the tab is hidden (browser cuts setInterval) and resumes
  // immediately on focus.
  useEffect(() => {
    let cancelled = false;
    const tick = () => { if (!cancelled) fetchLeaderboard(false); };
    const id = setInterval(tick, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [fetchLeaderboard]);

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <CommunityDoodles />
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-12 relative z-10">
        {/* Header + period tabs */}
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-serif text-ink tracking-tight">Community Leaderboard</h1>
          <p className="text-sm text-ink-soft mt-1">Top contributors in the Yaksha community</p>
          {lastUpdated && (
            <p className="text-[10px] text-ink-faint mt-1 flex items-center justify-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-light0 animate-pulse" />
              <span>Live · updated {Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000))}s ago · refreshes every 30s</span>
            </p>
          )}
          <div className="flex justify-center gap-1 mt-3">
            {(['weekly', 'monthly', 'all'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 text-xs rounded-lg border transition-colors ${
                  period === p
                    ? 'bg-ink text-bg border-ink'
                    : 'border-border text-ink-faint hover:bg-mist'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Top 3 Contributors podium — per spec: avatar, badge, reputation, FAQs, accepted answers */}
        {!loading && entries.length >= 3 && (
          <div className="px-1 pt-2 mb-8">
            <div className="grid grid-cols-3 gap-3 sm:gap-4 items-end">
              {/* Reorder: 2nd (idx 0), 1st (idx 1, taller), 3rd (idx 2) for classic podium look */}
              {[1, 0, 2].map((order) => {
                const e = entries[order];
                if (!e) return null;
                const isFirst = e.rank === 1;
                return (
                  <div
                    key={e.userId}
                    className={`relative rounded-2xl border p-4 sm:p-5 text-center bg-card shadow-subtle transition-all ${
                      isFirst ? 'border-warning/60 ring-2 ring-warning/30 sm:scale-105 pb-6 sm:pb-7' : 'border-border'
                    }`}
                  >
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                      isFirst ? 'bg-warning text-[#1a1a1a]' : e.rank === 2 ? 'bg-ink-faint text-[#1a1a1a]' : 'bg-[#f97316] text-[#1a1a1a]'
                    }`}>
                      {isFirst ? '🥇 #1' : e.rank === 2 ? '🥈 #2' : '🥉 #3'}
                    </div>
                    <div className="flex justify-center mt-2 mb-2">
                      <Avatar name={e.name} size={isFirst ? 'lg' : 'md'} />
                    </div>
                    <p className="text-sm font-semibold text-ink truncate">{e.name}</p>
                    <div className="flex justify-center gap-1 mt-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TIER_COLORS[e.tier] || 'bg-mist text-ink-soft'}`}>
                        {TIER_ICONS[e.tier] ?? ''} {e.tier}
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-ink mt-2">{e.points.toLocaleString()}</p>
                    <p className="text-[10px] text-ink-faint -mt-0.5">points</p>
                    <div className="flex justify-around mt-2 pt-2 border-t border-border/40 text-[10px] text-ink-soft">
                      <div className="flex flex-col">
                        <span className="font-bold text-ink">{e.acceptedAnswers}</span>
                        <span className="text-[9px] text-ink-faint">answers</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-ink">{e.faqContributions}</span>
                        <span className="text-[9px] text-ink-faint">FAQs</span>
                      </div>
                    </div>
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
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide hidden sm:table-cell">Answers</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide hidden sm:table-cell">FAQs</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-ink-soft uppercase tracking-wide hidden md:table-cell">Trust</th>
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
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="text-sm text-ink">{e.acceptedAnswers}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="text-sm text-ink">{e.faqContributions}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-10 h-1.5 bg-mist rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full"
                              style={{ width: `${e.trustScore}%` }}
                            />
                          </div>
                          <span className="text-xs text-ink-faint w-6 text-right">{e.trustScore}</span>
                        </div>
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
