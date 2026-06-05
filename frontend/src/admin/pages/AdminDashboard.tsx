import React, { useEffect, useState } from 'react';
import adminApi from '../utils/adminApi';
import FAQGrowthChart from '../components/charts/FAQGrowthChart';
import UserActivityChart from '../components/charts/UserActivityChart';
import { ChartSkeleton, StatsCardSkeleton } from '../components/common/SkeletonLoader';

interface StatsData {
  totalFaqs: number;
  pendingFaqs: number;
  approvedFaqs: number;
  rejectedFaqs: number;
  totalUsers: number;
  searchesToday: number;
  totalSearches: number;
  unanswered: number;
  topCategory: string;
  newUsersThisWeek: number;
  trends?: { faqs: number };
}

interface FAQGrowthData { date?: string; count?: number; }
interface UserActivityData { date?: string; searches?: number; users?: number; }
interface SearchInsights { failedSearches?: number; failRate?: string; topQueries?: { term?: string; count?: number }[]; }

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [growth, setGrowth] = useState<FAQGrowthData[]>([]);
  const [activity, setActivity] = useState<UserActivityData[]>([]);
  const [searchInsights, setSearchInsights] = useState<SearchInsights | null>(null);
  const [communityTotal, setCommunityTotal] = useState(0);
  const [communityUnanswered, setCommunityUnanswered] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.get<StatsData>('/admin/stats'),
      adminApi.get<FAQGrowthData[]>('/admin/faq-growth?days=14'),
      adminApi.get<UserActivityData[]>('/admin/user-activity-chart?days=14'),
      adminApi.get<SearchInsights>('/admin/search-insights'),
      adminApi.get<{ total: number }>('/admin/community/posts?limit=1&page=1'),
      adminApi.get<{ total: number }>('/admin/community/posts?status=unanswered&limit=1&page=1'),
    ]).then(([s, g, a, si, ct, cu]) => {
      setStats(s.data);
      setGrowth(g.data);
      setActivity(a.data);
      setSearchInsights(si.data);
      setCommunityTotal(ct.data.total);
      setCommunityUnanswered(cu.data.total);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold text-admin-text">Dashboard</h2>
        <p className="text-sm text-admin-muted mt-0.5">Platform overview</p>
      </div>

      {/* FAQ stats */}
      <div>
        <p className="text-xs font-semibold text-admin-muted uppercase tracking-wide mb-2">FAQs</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />) : stats ? (
            <>
              <StatCard label="Total" value={stats.totalFaqs} sub={`+${stats.trends?.faqs ?? 0}% this week`} />
              <StatCard label="Pending" value={stats.pendingFaqs} sub="awaiting review" alert={stats.pendingFaqs > 0} />
              <StatCard label="Approved" value={stats.approvedFaqs} sub="live" />
              <StatCard label="Rejected" value={stats.rejectedFaqs} sub="removed" />
            </>
          ) : null}
        </div>
      </div>

      {/* Users + Searches */}
      <div>
        <p className="text-xs font-semibold text-admin-muted uppercase tracking-wide mb-2">Users &amp; Search</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />) : stats ? (
            <>
              <StatCard label="Users" value={stats.totalUsers} sub={`+${stats.newUsersThisWeek ?? 0} this week`} />
              <StatCard label="Searches Today" value={stats.searchesToday} sub="queries" />
              <StatCard label="Total Searches" value={stats.totalSearches} sub="all time" />
              <StatCard label="Failed Searches" value={searchInsights?.failedSearches ?? 0} sub={`${searchInsights?.failRate ?? '0%'} fail rate`} alert={(searchInsights?.failedSearches ?? 0) > 0} />
            </>
          ) : null}
        </div>
      </div>

      {/* Community */}
      <div>
        <p className="text-xs font-semibold text-admin-muted uppercase tracking-wide mb-2">Community</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? Array.from({ length: 2 }).map((_, i) => <StatsCardSkeleton key={i} />) : (
            <>
              <StatCard label="Posts" value={communityTotal} sub="total posts" />
              <StatCard label="Unanswered" value={communityUnanswered} sub="need response" alert={communityUnanswered > 0} />
            </>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-xs font-semibold text-admin-text">FAQ Growth</p>
            <p className="text-[10px] text-admin-muted">Last 14 days</p>
          </div>
          <div className="p-4">
            {loading ? <ChartSkeleton height={160} /> : <FAQGrowthChart data={growth} />}
          </div>
        </div>
        <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-xs font-semibold text-admin-text">User Activity</p>
            <p className="text-[10px] text-admin-muted">Last 14 days</p>
          </div>
          <div className="p-4">
            {loading ? <ChartSkeleton height={160} /> : <UserActivityChart data={activity} />}
          </div>
        </div>
      </div>

      {/* Top search terms */}
      {!loading && searchInsights?.topQueries && searchInsights.topQueries.length > 0 && (
        <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-xs font-semibold text-admin-text">Top Search Terms</p>
          </div>
          <div className="divide-y divide-white/5">
            {searchInsights.topQueries.slice(0, 8).map((q, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-admin-muted w-4 text-right">{i + 1}</span>
                  <span className="text-sm text-admin-text">{q.term}</span>
                </div>
                <span className="text-xs text-admin-muted tabular-nums">{q.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platform info */}
      {!loading && stats && (
        <div className="bg-admin-card border border-white/5 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-xs font-semibold text-admin-text">Platform</p>
          </div>
          <div className="divide-y divide-white/5">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-admin-muted">Top Category</span>
              <span className="text-sm font-medium text-admin-text">{stats.topCategory}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-admin-muted">Resolution Rate</span>
              <span className="text-sm font-medium text-admin-text">
                {stats.totalFaqs > 0 ? Math.round((stats.approvedFaqs / stats.totalFaqs) * 100) : 0}%
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-admin-muted">FAQ Trend</span>
              <span className={`text-sm font-medium ${((stats.trends?.faqs ?? 0) >= 0) ? 'text-emerald-600' : 'text-red-500'}`}>
                {(stats.trends?.faqs ?? 0) >= 0 ? '+' : ''}{stats.trends?.faqs ?? 0}% vs last week
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, alert }: { label: string; value: number; sub: string; alert?: boolean }) {
  return (
    <div className={`bg-admin-card border rounded-lg p-4 ${alert ? 'border-amber-300 bg-amber-50' : 'border-white/5'}`}>
      <p className={`text-2xl font-bold tabular-nums ${alert ? 'text-amber-700' : 'text-admin-text'}`}>{value}</p>
      <p className="text-sm font-medium text-admin-text mt-0.5">{label}</p>
      <p className="text-xs text-admin-muted mt-0.5">{sub}</p>
    </div>
  );
}
