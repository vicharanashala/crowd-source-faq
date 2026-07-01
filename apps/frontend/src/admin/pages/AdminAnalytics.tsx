import React, { useState, useEffect, useCallback, useRef } from 'react';
import adminApi from '@/admin/utils/adminApi';
import { useBatch } from '../../context/BatchContext';
import UserActivityChart from '../components/charts/UserActivityChart';
import CategoryDistributionChart from '../components/charts/CategoryDistributionChart';
import { AdminCard, AdminStatCard, AdminSectionLabel } from '../components/ui';
import Spinner from '../../components/ui/Spinner';

interface SummaryData {
  totalFaqs: number;
  approvedFaqs: number;
  totalSearches: number;
  failedSearches: number;
  uniqueUsers: number;
  searchSuccessRate: number;
}

interface TrendData {
  date: string;
  searches: number;
  users: number;
}

interface CategoryData {
  category: string;
  count: number;
  views: number;
}

interface SearchQueryItem {
  query: string;
  count: number;
  lastSearched: string;
}

interface SearchLogResponse {
  totalSearches: number;
  popularQueries: SearchQueryItem[];
  failedQueries: SearchQueryItem[];
}

export default function AdminAnalytics() {
  const { currentBatch, availableBatches } = useBatch();
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [days, setDays] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<'search' | 'content'>('search');

  // Request version tracking to prevent race conditions on parallel API requests
  const requestVersionRef = useRef<number>(0);

  // Data states
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [popularQueries, setPopularQueries] = useState<SearchQueryItem[]>([]);
  const [failedQueries, setFailedQueries] = useState<SearchQueryItem[]>([]);

  // Loading & error states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync batch selector with the context active program on load
  useEffect(() => {
    if (currentBatch?._id) {
      setSelectedBatchId(currentBatch._id);
    }
  }, [currentBatch]);

  const fetchData = useCallback(async () => {
    requestVersionRef.current += 1;
    const thisVersion = requestVersionRef.current;

    setLoading(true);
    setError(null);
    try {
      const batchParam = selectedBatchId ? `&batchId=${selectedBatchId}` : '';
      const results = await Promise.allSettled([
        adminApi.get<SummaryData>(`/analytics/summary?days=${days}${batchParam}`),
        adminApi.get<TrendData[]>(`/analytics/trends?days=${days}${batchParam}`),
        adminApi.get<CategoryData[]>(`/analytics/category-distribution?${batchParam}`),
        adminApi.get<SearchLogResponse>(`/analytics?days=${days}${batchParam}`),
      ]);

      // Stale request protection
      if (thisVersion !== requestVersionRef.current) {
        return;
      }

      const [sumRes, trendRes, catRes, logRes] = results;

      if (sumRes.status === 'fulfilled') {
        setSummary(sumRes.value.data);
      } else {
        console.error('Failed to fetch summary metrics:', sumRes.reason);
      }

      if (trendRes.status === 'fulfilled') {
        setTrends(trendRes.value.data);
      } else {
        console.error('Failed to fetch search activity trends:', trendRes.reason);
      }

      if (catRes.status === 'fulfilled') {
        setCategories(catRes.value.data);
      } else {
        console.error('Failed to fetch category distribution stats:', catRes.reason);
      }

      if (logRes.status === 'fulfilled') {
        setPopularQueries(logRes.value.data.popularQueries || []);
        setFailedQueries(logRes.value.data.failedQueries || []);
      } else {
        console.error('Failed to fetch search log query lists:', logRes.reason);
      }

      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        setError('Failed to fetch analytics data. Please check connection or retry.');
      } else {
        const someFailed = results.some(r => r.status === 'rejected');
        if (someFailed) {
          setError('Some analytics widgets failed to load.');
        }
      }
    } catch (err: any) {
      if (thisVersion === requestVersionRef.current) {
        setError(err?.message || 'An unexpected error occurred.');
      }
    } finally {
      if (thisVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [selectedBatchId, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // CSV Export utility with explicit header-to-key mapping
  const exportToCSV = (data: any[], filename: string, headers: string[], keys: string[]) => {
    const csvRows = [headers.join(',')];
    data.forEach(item => {
      const values = keys.map(key => {
        const val = item[key];
        const stringVal = val === null || val === undefined ? '' : String(val);
        const escaped = stringVal.replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleExportPopular = () => {
    const dataToExport = popularQueries.map(q => ({
      query: q.query,
      count: q.count,
      lastSearched: new Date(q.lastSearched).toLocaleString()
    }));
    exportToCSV(
      dataToExport,
      `popular_queries_batch_${selectedBatchId || 'global'}.csv`,
      ['Search Query', 'Count', 'Last Searched'],
      ['query', 'count', 'lastSearched']
    );
  };

  const handleExportFailed = () => {
    const dataToExport = failedQueries.map(q => ({
      query: q.query,
      count: q.count,
      lastSearched: new Date(q.lastSearched).toLocaleString()
    }));
    exportToCSV(
      dataToExport,
      `failed_queries_batch_${selectedBatchId || 'global'}.csv`,
      ['Failed Query', 'Count', 'Last Searched'],
      ['query', 'count', 'lastSearched']
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Filters Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card/40 border border-border/50 rounded-xl p-4">
        <div>
          <h1 className="text-base font-bold text-ink">Analytics Hub</h1>
          <p className="text-[10px] text-ink-faint">Sprint 1 Dashboard</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Program filter */}
          <div className="flex flex-col">
            <label htmlFor="program-filter" className="text-[9px] text-ink-soft mb-1 font-semibold uppercase tracking-wider">Program</label>
            <select
              id="program-filter"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="bg-card border border-border text-ink text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent"
            >
              <option value="">All Programs (Global)</option>
              {availableBatches.map(b => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Date range filter */}
          <div className="flex flex-col">
            <label htmlFor="timeframe-filter" className="text-[9px] text-ink-soft mb-1 font-semibold uppercase tracking-wider">Timeframe</label>
            <select
              id="timeframe-filter"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-card border border-border text-ink text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent"
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
          </div>

          {/* Refresh Button */}
          <div className="flex items-end h-full mt-4 sm:mt-0">
            <button
              onClick={fetchData}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center bg-card border border-border hover:bg-mist text-ink hover:text-accent rounded-lg transition-colors disabled:opacity-50"
              title="Refresh Analytics"
              aria-label="Refresh analytics data"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={loading ? 'animate-spin' : ''}
                aria-hidden="true"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-danger/10 border border-danger/25 text-danger rounded-xl p-4 text-xs flex justify-between items-center">
          <span>{error}</span>
          <button onClick={fetchData} className="underline font-semibold hover:text-danger-light">Retry</button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-20">
              <div className="h-4 bg-mist rounded w-16 mb-2" />
              <div className="h-6 bg-mist rounded w-24" />
            </div>
          ))
        ) : summary ? (
          <>
            <AdminStatCard label="Total FAQs" value={summary.totalFaqs} sub="in catalog" />
            <AdminStatCard label="Approved FAQs" value={summary.approvedFaqs} sub="live on portal" />
            <AdminStatCard label="Total Searches" value={summary.totalSearches} sub="within timeframe" />
            <AdminStatCard
              label="Failed Searches"
              value={summary.failedSearches}
              sub="returned 0 results"
              alert={summary.failedSearches > 0}
            />
            <AdminStatCard label="Unique Users" value={summary.uniqueUsers} sub="active searches" />
            <AdminStatCard
              label="Success Rate (%)"
              value={Math.round(summary.searchSuccessRate)}
              sub="resolved queries"
              alert={summary.searchSuccessRate < 80}
            />
          </>
        ) : null}
      </div>

      {/* Modular Tab navigation */}
      <div className="flex border-b border-border/50 gap-4">
        <button
          onClick={() => setActiveTab('search')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'search'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          Search Analytics
        </button>
        <button
          onClick={() => setActiveTab('content')}
          className={`pb-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'content'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          Content Distribution
        </button>
      </div>

      {/* Loading main container state */}
      {loading && !summary && (
        <div className="py-24 flex justify-center">
          <Spinner size="lg" />
        </div>
      )}

      {/* Tab Panels */}
      {!loading && (
        <div className="space-y-6">
          {activeTab === 'search' && (
            <>
              {/* Trends Line Chart */}
              <AdminCard title="Search Volume & Unique User Trends" subtitle={`Daily trends over last ${days} days`}>
                {trends.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-ink-faint text-xs italic">
                    No activity recorded in this period.
                  </div>
                ) : (
                  <UserActivityChart data={trends} />
                )}
              </AdminCard>

              {/* Top & Failed Queries Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Popular Queries */}
                <AdminCard
                  title="Top Search Queries"
                  action={
                    popularQueries.length > 0 && (
                      <button
                        onClick={handleExportPopular}
                        className="text-[10px] text-accent hover:underline flex items-center gap-1 font-semibold"
                        aria-label="Export top search queries as CSV"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Export CSV
                      </button>
                    )
                  }
                >
                  {popularQueries.length === 0 ? (
                    <div className="py-8 text-center text-ink-faint text-xs italic">
                      No search logs recorded.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30 max-h-96 overflow-y-auto pr-1">
                      {popularQueries.map((q, i) => (
                        <div key={q.query} className="flex items-center justify-between py-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] text-ink-faint w-4 text-right">{i + 1}</span>
                            <span className="text-ink truncate font-medium">{q.query}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-ink font-semibold tabular-nums">{q.count}</span>
                            <p className="text-[8px] text-ink-faint mt-0.5">
                              {new Date(q.lastSearched).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AdminCard>

                {/* Failed Queries */}
                <AdminCard
                  title="Failed Search Queries (No Results)"
                  action={
                    failedQueries.length > 0 && (
                      <button
                        onClick={handleExportFailed}
                        className="text-[10px] text-accent hover:underline flex items-center gap-1 font-semibold"
                        aria-label="Export failed search queries as CSV"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Export CSV
                      </button>
                    )
                  }
                >
                  {failedQueries.length === 0 ? (
                    <div className="py-8 text-center text-ink-faint text-xs italic">
                      No failed searches found. Excellent!
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30 max-h-96 overflow-y-auto pr-1">
                      {failedQueries.map((q, i) => (
                        <div key={q.query} className="flex items-center justify-between py-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] text-ink-faint w-4 text-right text-danger">{i + 1}</span>
                            <span className="text-ink truncate font-medium">{q.query}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-danger font-semibold tabular-nums">{q.count}</span>
                            <p className="text-[8px] text-ink-faint mt-0.5">
                              {new Date(q.lastSearched).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </AdminCard>
              </div>
            </>
          )}

          {activeTab === 'content' && (
            <AdminCard title="Category Distribution & views" subtitle="Distribution metrics by FAQ Category">
              <CategoryDistributionChart data={categories} />
            </AdminCard>
          )}
        </div>
      )}
    </div>
  );
}
