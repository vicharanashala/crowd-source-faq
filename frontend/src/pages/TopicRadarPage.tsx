import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

interface Topic {
  category: string;
  faqCount: number;
  totalViews: number;
  totalSearches: number;
  helpfulRatio: number | null;
}

interface AttentionItem {
  _id: string;
  question: string;
  category: string;
  reportCount: number;
  helpfulVotes: number;
  unhelpfulVotes: number;
}

interface TrendingQuery {
  query: string;
  count: number;
  lastSearched: string;
}

type Filter = 'All' | 'Needs attention' | 'Trending now';
const quickFilters: Filter[] = ['All', 'Needs attention', 'Trending now'];

export default function TopicRadarPage() {
  const [activeFilter, setActiveFilter] = useState<Filter>('All');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [needsAttention, setNeedsAttention] = useState<AttentionItem[]>([]);
  const [trending, setTrending] = useState<TrendingQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [radarRes, trendingRes] = await Promise.all([
          api.get('/faq/topic-radar'),
          api.get('/search/trending'),
        ]);
        if (cancelled) return;
        setTopics(radarRes.data.topics || []);
        setNeedsAttention(radarRes.data.needsAttention || []);
        setTrending((trendingRes.data.trending || []).slice(0, 6));
      } catch (err) {
        console.error('Failed to load topic radar:', err);
        if (!cancelled) setError('Failed to load topic data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-ink flex items-center justify-center">
        <p className="text-sm text-ink-faint">Loading topic radar…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg text-ink flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-500">{error}</p>
        <Link to="/" className="text-sm text-accent hover:underline">← Back home</Link>
      </div>
    );
  }

  const showTopics = activeFilter !== 'Trending now';
  const showAttention = activeFilter !== 'Trending now';
  const showTrending = activeFilter !== 'Needs attention';

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-4 pt-20 sm:pt-24 pb-10 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Discovery intelligence</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink">Topic Radar</h1>
            <p className="text-sm text-ink-faint mt-1">Live search and FAQ activity across the platform — no placeholders.</p>
          </div>
          <Link to="/" className="text-sm text-ink-faint hover:text-ink transition-colors">
            ← Back home
          </Link>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {quickFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${activeFilter === filter ? 'bg-accent text-white' : 'border border-border bg-bg/70 text-ink hover:bg-accent/10'}`}
              >
                {filter}
              </button>
            ))}
          </div>

          {showTopics && (
            topics.length ? (
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {topics.map((topic) => (
                  <div key={topic.category} className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{topic.category || 'Uncategorized'}</p>
                        <p className="mt-1 text-sm text-ink-faint">{topic.faqCount} FAQ{topic.faqCount === 1 ? '' : 's'} · {topic.totalViews} views</p>
                      </div>
                      {topic.helpfulRatio !== null && (
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                          {Math.round(topic.helpfulRatio * 100)}% helpful
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-ink-faint">No category activity recorded yet.</p>
            )
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          {showTrending && (
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-ink">Trending searches</h2>
              <p className="text-sm text-ink-faint mt-1">The most repeated searches across the platform right now.</p>
              <div className="mt-4 space-y-3">
                {trending.length ? trending.map((item) => (
                  <div key={item.query} className="rounded-2xl border border-border/70 bg-bg/70 p-4">
                    <p className="text-sm font-semibold text-ink">{item.query}</p>
                    <p className="mt-1 text-xs font-medium text-accent">{item.count} search{item.count === 1 ? '' : 'es'} · last {new Date(item.lastSearched).toLocaleDateString()}</p>
                  </div>
                )) : (
                  <p className="text-sm text-ink-faint">No search activity yet.</p>
                )}
              </div>
            </div>
          )}

          {showAttention && (
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-ink">Needs attention</h2>
              <p className="text-sm text-ink-faint mt-1">FAQs that were reported, or rated unhelpful more than helpful.</p>
              <div className="mt-4 space-y-3">
                {needsAttention.length ? needsAttention.map((item) => (
                  <Link
                    key={item._id}
                    to={`/faq/${item._id}`}
                    className="block rounded-2xl border border-border/70 bg-bg/70 p-4 hover:border-accent/50 transition-colors"
                  >
                    <p className="text-sm font-semibold text-ink">{item.question}</p>
                    <p className="mt-1 text-sm text-ink-faint">{item.category || 'Uncategorized'}</p>
                    <p className="mt-3 text-xs font-medium text-accent">
                      {item.reportCount > 0 ? `${item.reportCount} report${item.reportCount === 1 ? '' : 's'}` : `${item.unhelpfulVotes} unhelpful vs ${item.helpfulVotes} helpful`}
                    </p>
                  </Link>
                )) : (
                  <p className="text-sm text-ink-faint">Nothing flagged right now — the knowledge base looks healthy.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
