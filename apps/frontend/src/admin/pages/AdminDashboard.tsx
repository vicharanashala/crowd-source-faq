import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import adminApi from '../utils/adminApi';
import FAQGrowthChart from '../components/charts/FAQGrowthChart';
import UserActivityChart from '../components/charts/UserActivityChart';
import { AdminCard, AdminSectionLabel, AdminStatCard } from '../components/ui';

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
  documentQueueStatus?: 'online' | 'disabled' | 'failed';
}

function Toast({ toast }: { toast: { msg: string; type: 'success' | 'error' } }): React.ReactElement {
  const colour = toast.type === 'error' ? 'bg-danger/10 text-danger border-danger/20' : 'bg-success/10 text-success border-success/20';
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${colour}`}
    >
      {toast.msg}
    </motion.div>
  );
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
  const [queueStatus, setQueueStatus] = useState<'online' | 'disabled' | 'failed'>('disabled');
  const [toggling, setToggling] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success'): void => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  async function handleToggleQueue() {
    if (toggling) return;
    setToggling(true);
    const nextVal = queueStatus !== 'online';
    try {
      await adminApi.patch('/feature-flags/documentPipeline', { enabled: nextVal });
      showToast(`Document queue ${nextVal ? 'enabled' : 'disabled'} successfully.`);
      
      const s = await adminApi.get<StatsData>('/admin/stats');
      setStats(s.data);
      setQueueStatus(s.data.documentQueueStatus ?? 'disabled');
    } catch (err) {
      showToast('Failed to update document queue status.', 'error');
    } finally {
      setToggling(false);
    }
  }

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
      setQueueStatus(s.data.documentQueueStatus ?? 'disabled');
      setGrowth(g.data);
      setActivity(a.data);
      setSearchInsights(si.data);
      setCommunityTotal(ct.data.total);
      setCommunityUnanswered(cu.data.total);
    }).finally(() => setLoading(false));
  }, []);

  const skeletonCount = () => Array.from({ length: 4 });

  return (
    <div className="space-y-6 max-w-5xl">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>
      {/* FAQ stats */}
      <div>
        <AdminSectionLabel label="FAQs" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? skeletonCount().map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse"><div className="h-7 bg-mist rounded w-16 mb-2" /><div className="h-3 bg-mist rounded w-24" /></div>) : stats ? (
            <>
              <AdminStatCard label="Total" value={stats.totalFaqs} trend={stats.trends?.faqs} sub="this week" />
              <AdminStatCard label="Pending" value={stats.pendingFaqs} sub="awaiting review" alert={stats.pendingFaqs > 0} />
              <AdminStatCard label="Approved" value={stats.approvedFaqs} sub="live" />
              <AdminStatCard label="Rejected" value={stats.rejectedFaqs} sub="removed" />
            </>
          ) : null}
        </div>
      </div>

      {/* Users + Searches */}
      <div>
        <AdminSectionLabel label="Users &amp; Search" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? skeletonCount().map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse"><div className="h-7 bg-mist rounded w-16 mb-2" /><div className="h-3 bg-mist rounded w-24" /></div>) : stats ? (
            <>
              <AdminStatCard label="Users" value={stats.totalUsers} sub={`+${stats.newUsersThisWeek ?? 0} this week`} />
              <AdminStatCard label="Searches Today" value={stats.searchesToday} sub="queries" />
              <AdminStatCard label="Total Searches" value={stats.totalSearches} sub="all time" />
              <AdminStatCard
                label="Failed Searches"
                value={searchInsights?.failedSearches ?? 0}
                sub={`${searchInsights?.failRate ?? '0%'} fail rate`}
                alert={(searchInsights?.failedSearches ?? 0) > 0}
              />
            </>
          ) : null}
        </div>
      </div>

      {/* Community */}
      <div>
        <AdminSectionLabel label="Community" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? skeletonCount().slice(0, 2).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse"><div className="h-7 bg-mist rounded w-16 mb-2" /><div className="h-3 bg-mist rounded w-24" /></div>) : (
            <>
              <AdminStatCard label="Posts" value={communityTotal} sub="total posts" />
              <AdminStatCard label="Unanswered" value={communityUnanswered} sub="need response" alert={communityUnanswered > 0} />
            </>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdminCard title="FAQ Growth" subtitle="Last 14 days">
          {loading ? <div className="h-40 bg-mist rounded-lg animate-pulse" /> : <FAQGrowthChart data={growth} />}
        </AdminCard>
        <AdminCard title="User Activity" subtitle="Last 14 days">
          {loading ? <div className="h-40 bg-mist rounded-lg animate-pulse" /> : <UserActivityChart data={activity} />}
        </AdminCard>
      </div>

      {/* Top search terms */}
      {!loading && searchInsights?.topQueries && searchInsights.topQueries.length > 0 && (
        <AdminCard title="Top Search Terms">
          <div className="divide-y divide-border/50">
            {searchInsights.topQueries.slice(0, 8).map((q, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-ink-faint w-4 text-right">{i + 1}</span>
                  <span className="text-sm text-ink">{q.term}</span>
                </div>
                <span className="text-xs text-ink-soft tabular-nums">{q.count?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      {/* Platform & Background Services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!loading && stats && (
          <AdminCard title="Platform">
            <div className="divide-y divide-border/50">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-ink-soft">Top Category</span>
                <span className="text-sm font-medium text-ink">{stats.topCategory}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-ink-soft">Resolution Rate</span>
                <span className="text-sm font-medium text-ink">
                  {stats.totalFaqs > 0 ? Math.round((stats.approvedFaqs / stats.totalFaqs) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-ink-soft">FAQ Trend</span>
                <span className={`text-sm font-medium ${(stats.trends?.faqs ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {(stats.trends?.faqs ?? 0) >= 0 ? '+' : ''}{stats.trends?.faqs ?? 0}% vs last week
                </span>
              </div>
            </div>
          </AdminCard>
        )}

        {!loading && (
          <AdminCard title="Background Services" subtitle="Manage background workers & Redis pipelines">
            <div className="divide-y divide-border/50">
              <div className="flex items-center justify-between py-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">Document Processing</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${
                      queueStatus === 'online'
                        ? 'bg-success/15 text-success border-success/30'
                        : queueStatus === 'failed'
                        ? 'bg-danger/15 text-danger border-danger/30'
                        : 'bg-mist text-ink-soft border-border'
                    }`}>
                      {queueStatus}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft max-w-xs leading-relaxed">
                    Redis-backed background worker (BullMQ) for PDF/DOCX indexing and OCR pipelines.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleQueue}
                  disabled={toggling}
                  className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                    queueStatus === 'online' ? 'bg-success' : 'bg-mist border border-border'
                  } ${toggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  aria-pressed={queueStatus === 'online'}
                  aria-label={`${queueStatus === 'online' ? 'Disable' : 'Enable'} Document Processing`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                      queueStatus === 'online' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <div className="py-2.5">
                <p className="text-[10px] text-ink-faint leading-normal">
                  Note: If toggling online fails, make sure `REDIS_TCP_URL` is configured and `REDIS_DISABLED` is not set to `true` in the server environment.
                </p>
              </div>
            </div>
          </AdminCard>
        )}
      </div>
    </div>
  );
}