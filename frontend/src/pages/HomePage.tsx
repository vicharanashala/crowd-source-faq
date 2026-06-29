// Home/FAQ Discovery Page — the single source of truth for the landing portal.
// Layout (when nothing is selected):
//
//   HERO  →  "Ask. Discover. Get Solved."  +  stats
//   SEARCH BAR  (big)
//   CATEGORY FILTER PILLS  (clickable, with counts)
//   TWO-COLUMN BODY
//     left  →  Most Popular  +  Recent FAQs  +  Top Solved Today  +
//              From Zoom Meetings  +  All FAQs (full 141)
//     right →  Browse Categories (4×2 icon grid) + Trending Issues
//   BROWSE ALL CATEGORIES  (full-width, all 14)
//   CTA  →  "Still have a question?"
//
// Every section pulls live data from the backend (no hardcoded content):
//   /api/faq                                 → 141 FAQs grouped by category
//   /api/public/popular-faqs?limit=5         → Most Popular (views + read time)
//   /api/public/recent-faqs?limit=5          → Recent FAQs
//   /api/faq/recent?source=zoom_transcript   → From Zoom Meetings
//   /api/community/solved?limit=4            → Top Solved Today
//   /api/community                           → Trending Issues
//   /api/search/trending                     → (kept for future use)

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import UserActiveProgramIndicator from '../components/layout/UserActiveProgramIndicator';
import SearchBar from '../components/search/SearchBar';
import { HomeDoodles } from '../components/ui/PageDoodles';
import api, { friendlyError } from '../utils/api';
import type { TrendingQuery } from '../types/ui';
import { useBatch } from '../context/BatchContext';

// Modular FAQ components — shared utilities
import {
  FAQItem,
  getCategoryIcon,
  getCategoryDescription,
  formatCategoryName,
  getCategoryTone,
  getQuestionTitle,
} from '../components/faq/faqUtils';
import SearchDropdown from '../components/faq/SearchDropdown';
import SearchFeedback from '../components/faq/SearchFeedback';
import QuestionList from '../components/faq/QuestionList';
import QuestionDetail from '../components/faq/QuestionDetail';

// Sidebar / chrome — already built, already wired to live APIs
import TopSolved from '../components/community/TopSolved';
import TrendingIssues from '../components/search/TrendingIssues';
import FromMeetings from '../components/faq/FromMeetings';
import CTA from '../components/ui/CTA';

// ── Public-popular FAQ shape (extends FAQItem with view / read metrics) ──
interface PublicPopularFaq extends FAQItem {
  popularityScore?: number;
  guestViewCount?: number;
  avgReadCompletion?: number;
  avgTimeSpentRatio?: number;
  wordCount?: number;
  expectedReadMs?: number;
}

// ── Read-time formatter: 8.7s → "< 1 min read", 75s → "2 min read" ────────
function formatReadTime(ms?: number): string {
  if (!ms || ms <= 0) return '< 1 min read';
  const minutes = ms / 60000;
  if (minutes < 1) return '< 1 min read';
  return `${Math.round(minutes)} min read`;
}

// ── View-count formatter: 0 → "0 views", 1 → "1 view", 4 → "4 views" ────
function formatViews(n?: number): string {
  const v = n ?? 0;
  return `${v} ${v === 1 ? 'view' : 'views'}`;
}

// ── Relative date formatter: 2026-06-13 → "Jun 13" ──────────────────────
function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Sidebar helper — list item used in the full "Browse all categories" section
// ═══════════════════════════════════════════════════════════════════════════
function CategoryListItem({
  name,
  count,
  onSelect,
}: {
  name: string;
  count: number;
  onSelect: () => void;
}): React.ReactElement {
  const tone = getCategoryTone(name);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex items-center justify-between gap-3 py-3 px-3 -mx-3 rounded-xl hover:bg-cream/60 transition-colors text-left"
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span className={`shrink-0 ${tone.accent}`}>{getCategoryIcon(name)}</span>
        <span className="text-sm font-medium text-ink group-hover:text-accent transition-colors line-clamp-1">
          {formatCategoryName(name)}
        </span>
      </span>
      <span className="flex items-center gap-2 text-[11px] text-ink-faint shrink-0">
        <span className="tabular-nums">{count}</span>
        <svg className="text-ink-faint group-hover:text-accent transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Compact category icon button (the 8-icon sidebar grid)
// ═══════════════════════════════════════════════════════════════════════════
function CategoryIconGrid({
  categories,
  grouped,
  onSelect,
}: {
  categories: string[];
  grouped: Record<string, FAQItem[]>;
  onSelect: (name: string) => void;
}): React.ReactElement | null {
  if (categories.length === 0) return null;
  const visible = categories.slice(0, 8);
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {visible.map((cat) => {
        const tone = getCategoryTone(cat);
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelect(cat)}
            className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-cream/50 border border-border/60 hover:bg-card hover:border-accent/30 hover:-translate-y-0.5 transition-all duration-200"
            title={formatCategoryName(cat)}
          >
            <span className={`shrink-0 ${tone.accent} group-hover:scale-110 transition-transform`}>
              {getCategoryIcon(cat)}
            </span>
            <span className="text-[10px] font-semibold text-ink-soft group-hover:text-ink line-clamp-1 leading-tight text-center w-full">
              {formatCategoryName(cat).replace(/^\d+\.\s*/, '').slice(0, 14)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Numbered FAQ row — used by Most Popular + Recent FAQs lists
// ═══════════════════════════════════════════════════════════════════════════
function NumberedFaqRow({
  rank,
  item,
  rightMeta,
  onOpen,
}: {
  rank: number;
  item: FAQItem;
  rightMeta?: React.ReactNode;
  onOpen: (item: FAQItem) => void;
}): React.ReactElement {
  const verified = item.reviewStatus === 'verified';
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group w-full text-left flex items-start gap-3 py-3 px-3 -mx-3 rounded-xl hover:bg-cream/60 transition-colors"
    >
      {/* Rank circle */}
      <span className="shrink-0 w-6 h-6 rounded-md bg-cream text-[11px] font-semibold text-ink-faint flex items-center justify-center tabular-nums mt-0.5 border border-border/60 group-hover:bg-card group-hover:text-accent transition-colors">
        {rank}
      </span>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-ink group-hover:text-accent transition-colors leading-snug line-clamp-2">
          {getQuestionTitle(item)}
        </h3>
        {item.answer && (
          <p className="text-xs text-ink-soft mt-1 line-clamp-1 leading-relaxed">
            {item.answer}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          {item.category && (
            <span className="text-[11px] text-ink-faint bg-mist px-1.5 py-0.5 rounded-md">
              {formatCategoryName(item.category).replace(/^\d+\.\s*/, '')}
            </span>
          )}
          {verified && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-success-light text-success flex items-center gap-0.5">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Verified
            </span>
          )}
          {item.sourceType === 'zoom_transcript' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300 border border-cyan-200/40">
              From Zoom
            </span>
          )}
        </div>
      </div>

      {/* Right-aligned meta (views · read time / date) */}
      <div className="shrink-0 text-right text-[11px] text-ink-faint whitespace-nowrap mt-0.5">
        {rightMeta}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Skeleton row used while data is loading
// ═══════════════════════════════════════════════════════════════════════════
function NumberedSkeletonRow({ rank }: { rank: number }): React.ReactElement {
  return (
    <div className="flex items-start gap-3 py-3 px-3 -mx-3">
      <span className="shrink-0 w-6 h-6 rounded-md bg-mist animate-pulse flex items-center justify-center text-[11px] tabular-nums text-transparent">{rank}</span>
      <div className="flex-1">
        <div className="h-3 bg-mist rounded animate-pulse w-4/5 mb-1.5" />
        <div className="h-2.5 bg-mist rounded animate-pulse w-full mb-1" />
        <div className="h-2.5 bg-mist rounded animate-pulse w-2/3" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main page
// ═══════════════════════════════════════════════════════════════════════════
export default function HomePage() {
  const { currentBatch } = useBatch();
  const batchId = currentBatch?._id ?? null;

  // ── Core data ────────────────────────────────────────────────────────────
  const [grouped, setGrouped] = useState<Record<string, FAQItem[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Discovery data (parallel feeds) ─────────────────────────────────────
  const [popularFaqs, setPopularFaqs] = useState<PublicPopularFaq[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [recentPublicFaqs, setRecentPublicFaqs] = useState<PublicPopularFaq[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [trendingWords, setTrendingWords] = useState<TrendingQuery[]>([]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<FAQItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FAQItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortOption, setSortOption] = useState('relevant');
  const [visibleCount, setVisibleCount] = useState(8);

  const searchBarRef = useRef<HTMLInputElement>(null);
  const allCategoriesRef = useRef<HTMLDivElement>(null);

  const [resultFaqId, setResultFaqId] = useState<string | undefined>(undefined);
  const { id: urlFaqId } = useParams<string>();
  const navigate = useNavigate();

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToAllCategories = useCallback(() => {
    allCategoriesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── Fetch all data sources dynamically when batchId changes ──────────────
  useEffect(() => {
    if (!batchId) return;
    let mounted = true;

    setLoading(true);
    setPopularLoading(true);
    setRecentLoading(true);

    // /api/faq — full grouped list
    api.get('/faq', { params: { batchId } })
      .then((res) => {
        if (!mounted) return;
        setGrouped(res.data.grouped || {});
        setTotal(res.data.total || 0);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs. Please try again.';
        setError(message);
      })
      .finally(() => { if (mounted) setLoading(false); });

    // /api/public/popular-faqs — Most Popular (views, read time)
    api.get('/public/popular-faqs', { params: { limit: 6, batchId } })
      .then((res) => { if (mounted) setPopularFaqs(res.data?.faqs || []); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (mounted) setPopularLoading(false); });

    // /api/public/recent-faqs — Recent FAQs
    api.get('/public/recent-faqs', { params: { limit: 6, batchId } })
      .then((res) => { if (mounted) setRecentPublicFaqs(res.data?.faqs || []); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (mounted) setRecentLoading(false); });

    // /api/search/trending — for trending queries
    api.get('/search/trending', { params: { batchId } })
      .then((res) => { if (mounted) setTrendingWords((res.data.trending || []).map((t: { query: string; count: number }) => ({ query: t.query, count: t.count }))); })
      .catch((err: unknown) => { console.error(friendlyError(err, 'Failed to load trending queries.')); });

    return () => { mounted = false; };
  }, [batchId]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const categories = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const flatQuestions = useMemo(() => (
    categories.flatMap((name) => (grouped[name] || []).map((item) => ({
      ...item,
      category: item.category || name,
      source: item.source || 'faq',
    })))
  ), [categories, grouped]);

  // ── Deep-link handler (/faq/:id from URL) ───────────────────────────────
  useEffect(() => {
    if (!urlFaqId) return;
    if (grouped && Object.keys(grouped).length > 0) {
      for (const [cat, items] of Object.entries(grouped)) {
        const found = items.find((item) => item._id === urlFaqId);
        if (found) {
          setActiveQuestion({ ...found, category: cat });
          setActiveCategory(cat);
          return;
        }
      }
    }
    api.get(`/faq/${urlFaqId}`)
      .then((res) => {
        const faq = res.data;
        if (faq && faq._id) {
          setActiveQuestion({ ...faq, category: faq.category || '' });
          setActiveCategory(faq.category || '');
        }
      })
      .catch(() => { /* FAQ not found or access denied */ });
  }, [urlFaqId, grouped]);

  // Pre-selected FAQ from homepage navigation (highlight signal)
  useEffect(() => {
    if (!grouped || Object.keys(grouped).length === 0) return;
    const highlightStr = sessionStorage.getItem('yaksha_faq_highlight');
    if (!highlightStr) return;
    try {
      const highlight = JSON.parse(highlightStr) as FAQItem;
      sessionStorage.removeItem('yaksha_faq_highlight');
      const category = highlight.category || '';
      if (category && grouped[category]) {
        const found = grouped[category].find((item) => item._id === highlight._id);
        if (found) {
          setActiveQuestion({ ...found, category });
          setActiveCategory(category);
        }
      }
    } catch {
      sessionStorage.removeItem('yaksha_faq_highlight');
    }
  }, [grouped]);

  // ── Search bookkeeping ──────────────────────────────────────────────────
  useEffect(() => {
    setVisibleCount(8);
  }, [activeCategory, searchResults, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults(null);
      setSearchLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      setResultFaqId((searchResults[0] as FAQItem)._id);
    }
  }, [searchResults]);

  const activeCategoryItems = activeCategory ? (grouped[activeCategory] || []) : [];
  const activeCategoryMeta = getCategoryDescription(activeCategoryItems);

  const searchActive = searchQuery.trim().length >= 3 && Array.isArray(searchResults);
  const showDropdown = searchQuery.trim().length > 0 && !searchActive;

  const dropdownItems = useMemo(() => {
    if (Array.isArray(searchResults) && searchQuery.trim().length >= 3) {
      return searchResults;
    }
    if (!searchQuery.trim()) {
      return flatQuestions.slice(0, 5);
    }
    const normalized = searchQuery.trim().toLowerCase();
    return flatQuestions.filter((item) => (
      getQuestionTitle(item).toLowerCase().includes(normalized)
    )).slice(0, 5);
  }, [flatQuestions, searchResults, searchQuery]);

  const relatedItems = useMemo(() => {
    if (!activeQuestion?.category) return [];
    const pool = grouped[activeQuestion.category] || [];
    return pool.filter((item) => item._id !== activeQuestion._id).slice(0, 5);
  }, [activeQuestion, grouped]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleCategoryOpen = (name: string) => {
    setActiveCategory(name);
    setActiveQuestion(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
    setVisibleCount(8);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const handleQuestionOpen = (item: FAQItem) => {
    setActiveQuestion(item);
    setSearchQuery('');
    setSearchResults(null);
    scrollToTop();
  };

  const handleBackToCategories = () => {
    setActiveCategory('');
    setActiveQuestion(null);
  };

  const handleBackFromDetail = () => {
    const fromHomepage = !!sessionStorage.getItem('yaksha_faq_highlight');
    sessionStorage.removeItem('yaksha_faq_highlight');
    if (fromHomepage) {
      navigate('/');
      return;
    }
    setActiveQuestion(null);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      setActiveCategory('');
      setActiveQuestion(null);
      setSearchResults(null);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
  };

  const runSearch = async (q: string) => {
    const queryStr = q.trim();
    if (queryStr.length < 3) return;
    setSearchLoading(true);
    setError('');
    try {
      const res = await api.post('/search', { query: queryStr });
      setSearchResults(res.data.results || []);
    } catch {
      setSearchResults([]);
      setError('Search failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleFindSolutionsClick = () => {
    searchBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchBarRef.current?.focus();
  };

  // True when the user is browsing the discovery landing (nothing selected)
  const showDiscovery = !loading && !error && !activeQuestion && !searchActive && !activeCategory;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <HomeDoodles />
      <Navbar />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-[112px] sm:pt-[128px] pb-10 relative z-10">
        {/* Active program pill (v1.69) */}
        <div className="flex justify-center">
          <UserActiveProgramIndicator />
        </div>

        {/* ─── HERO ──────────────────────────────────────────────────── */}
        <section className="text-center pt-3 pb-2 relative">
          <h1 className="font-serif text-3xl sm:text-4xl md:text-[3.2rem] leading-[1.1] tracking-tight text-ink mt-3">
            Ask. Discover. Get{' '}
            <span className="doodle-underline font-serif" style={{ fontWeight: 700 }}>Solved.</span>
          </h1>
          <p className="text-sm sm:text-base text-ink-soft mt-4 max-w-xl mx-auto leading-relaxed">
            Search your doubt or explore solved questions from the community.
          </p>
          {total > 0 && (
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-faint mt-3">
              {total} {total === 1 ? 'FAQ' : 'FAQs'} · {categories.length} categories
            </p>
          )}
        </section>

        {/* ─── SEARCH BAR ───────────────────────────────────────────── */}
        <section className="relative max-w-2xl mx-auto mt-8 mb-4">
          <div className={`relative ${showDropdown ? 'z-40' : 'z-20'}`}>
            <SearchBar
              ref={searchBarRef}
              value={searchQuery}
              onQueryChange={handleSearchChange}
              onResults={(res) => setSearchResults(res as unknown as FAQItem[])}
              onLoading={setSearchLoading}
              onError={(err) => setError(err || '')}
              placeholder="Ask anything about your internship..."
              disableSuggestions={true}
            />

            {showDropdown && (
              <SearchDropdown
                query={searchQuery}
                items={dropdownItems}
                categories={categories}
                onSelectQuestion={handleQuestionOpen}
                onSelectCategory={handleCategoryOpen}
                onClear={handleClearSearch}
                loading={searchLoading}
              />
            )}
          </div>
        </section>

        {/* ─── CATEGORY FILTER PILLS (clickable horizontal row) ─────── */}
        
        {showDiscovery && categories.length > 0 && (
          <nav
            className="mt-3 max-w-5xl mx-auto px-1 flex flex-wrap justify-center gap-2"
            aria-label="Filter by category"
          >
            <button
              type="button"
              onClick={() => handleCategoryOpen('')}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-200 ${
                !activeCategory
                  ? 'bg-accent text-accent-text border-accent/60 shadow-[0_6px_18px_rgba(90,122,90,0.18)]'
                  : 'bg-card text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5'
              }`}
            >
              All
            </button>
            {categories.slice(0, 11).map((cat) => {
              const isActive = activeCategory === cat;
              const count = grouped[cat]?.length ?? 0;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryOpen(cat)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-200 ${
                    isActive
                      ? 'bg-accent text-accent-text border-accent/60 shadow-[0_6px_18px_rgba(90,122,90,0.18)]'
                      : 'bg-card text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5'
                  }`}
                >
                  {formatCategoryName(cat)} · {count}
                </button>
              );
            })}
            {categories.length > 11 && (
              <button
                type="button"
                onClick={scrollToAllCategories}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold border border-dashed border-border/70 text-ink-soft hover:text-ink hover:bg-cream transition-all duration-200"
              >
                + {categories.length - 11} more
              </button>
            )}
          </nav>
        )}

        {/* ─── FEATURE CARDS ─ always visible on landing ─────────── */}
        
        {!activeQuestion && !searchActive && !activeCategory && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-8 mb-2 animate-fade-in" aria-label="Core features">
            {[
              {
                title: 'Ask Questions',
                description: 'Post your internship-related questions and get answers from the community.',
                icon: (
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                ),
                action: () => navigate('/community?create=true'),
              },
              {
                title: 'Find Solutions',
                description: 'Search through existing FAQs to quickly solve common problems.',
                icon: (
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                  </svg>
                ),
                action: handleFindSolutionsClick,
              },
              {
                title: 'Community Support',
                description: 'Connect with other interns, discuss issues, and help each other.',
                icon: (
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.97 5.97 0 00-.75-2.906m-.173-3.414a3 3 0 11-5.69 0M7.5 10.5a3 3 0 115.69 0m0 0a3 3 0 11-5.69 0M6 18.72a9.094 9.094 0 01-3.741-.479 3 3 0 014.682-2.72m-.94 3.198l-.002.031c0 .225.012.447.037.666A11.944 11.944 0 0012 21c2.17 0 4.207-.576 5.963-1.584A6.062 6.062 0 0018 18.72m-12 0a5.97 5.97 0 01.75-2.906m-.173-3.414a3 3 0 105.69 0m-5.69 0a3 3 0 105.69 0" />
                  </svg>
                ),
                action: () => navigate('/community'),
              },
              {
                title: 'AI Assistance',
                description: 'Need help? Ask Yaksha AI to get instant guidance.',
                icon: (
                  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3 15l5.187-.813L9 9l.813 5.187L15 15l-5.187.813zM18 10.5l-.563 2.25L15 13.5l2.438.75.562 2.25.563-2.25 2.437-.75-2.437-.75-.563-2.25zM21 6l-.281 1.125L19.5 7.5l1.219.375.281 1.125.281-1.125 1.219-.375-1.219-.375L21 6z" />
                  </svg>
                ),
                action: () => {
                  const event = new CustomEvent('askai:open');
                  window.dispatchEvent(event);
                },
              },
            ].map((card, idx) => (
              <button
                key={idx}
                type="button"
                onClick={card.action}
                className="group text-left relative flex flex-col p-5 rounded-2xl border border-border/40 bg-card/30 backdrop-blur-md hover:bg-card-hover/50 hover:border-accent/40 hover:-translate-y-1 hover:shadow-card-hover transition-all duration-300 ease-smooth overflow-hidden"
              >
                <div className="absolute -inset-px bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none" />
                <div className="relative z-10 shrink-0 w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3.5 group-hover:scale-110 group-hover:bg-accent/15 transition-all duration-300 ease-smooth">
                  {card.icon}
                </div>
                <div className="relative z-10 flex-1 flex flex-col">
                  <h3 className="font-serif text-sm font-semibold text-ink group-hover:text-accent transition-colors duration-200 mb-1 leading-snug">
                    {card.title}
                  </h3>
                  <p className="text-[11px] text-ink-soft leading-normal">
                    {card.description}
                  </p>
                </div>
              </button>
            ))}
          </section>
        )}

        {/* ─── LOADING / ERROR STATES ──────────────────────────────── */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-10">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[220px] rounded-2xl border border-border bg-card/70 animate-pulse" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="mt-8 rounded-2xl bg-danger-light border border-danger/15 p-6 text-center space-y-3">
            <p className="text-sm text-danger font-medium">{error}</p>
            <button
              onClick={() => { setError(''); setLoading(true); api.get('/faq').then(res => { setGrouped(res.data.grouped || {}); setTotal(res.data.total || 0); }).catch((err: unknown) => { const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs.'; setError(m); }).finally(() => setLoading(false)); }}
              className="px-5 py-2 text-sm font-medium bg-danger text-accent-text rounded-full hover:bg-danger/90 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ─── DETAIL VIEW (when a question is opened) ──────────────── */}
        {!loading && !error && activeQuestion && (
          <QuestionDetail
            item={activeQuestion}
            relatedItems={relatedItems}
            onBack={handleBackFromDetail}
            onSelectRelated={handleQuestionOpen}
            backLabel={
              searchActive
                ? 'Back to Search Results'
                : activeCategory
                ? `Back to ${formatCategoryName(activeCategory)}`
                : 'Back to Categories'
            }
          />
        )}

        {/* ─── SEARCH RESULTS ───────────────────────────────────────── */}
        {!loading && !error && !activeQuestion && searchActive && (
          <section className="max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Search results</p>
                <h2 className="text-lg font-semibold text-ink">Results for &quot;{searchQuery}&quot;</h2>
              </div>
              <button
                onClick={handleClearSearch}
                className="text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                Clear search
              </button>
            </div>
            <QuestionList
              items={searchResults || []}
              loading={searchLoading}
              sortOption={sortOption}
              onSortChange={setSortOption}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No results yet. Try another keyword or browse a category."
            />
          </section>
        )}

        {/* ─── CATEGORY VIEW ────────────────────────────────────────── */}
        {!loading && !error && !activeQuestion && !searchActive && activeCategory && (
          <section className="max-w-4xl mx-auto">
            <div className="mb-6">
              <button
                onClick={handleBackToCategories}
                className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back to all categories
              </button>
              <h2 className="mt-3 text-xl font-semibold text-ink flex items-center gap-2">
                <span className={`w-9 h-9 rounded-xl bg-mist flex items-center justify-center ${getCategoryTone(activeCategory).accent}`}>
                  {getCategoryIcon(activeCategory)}
                </span>
                {formatCategoryName(activeCategory)}
                <span className="ml-1 text-[11px] uppercase tracking-wider font-semibold text-ink-faint">
                  · {activeCategoryItems.length} {activeCategoryItems.length === 1 ? 'question' : 'questions'}
                </span>
              </h2>
              {activeCategoryMeta && (
                <p className="mt-2 text-sm text-ink-soft max-w-2xl">
                  {activeCategoryMeta}
                </p>
              )}
            </div>
            <QuestionList
              items={activeCategoryItems.map((item) => ({
                ...item,
                category: activeCategory,
                source: item.source || 'faq',
              }))}
              loading={false}
              sortOption={sortOption}
              onSortChange={setSortOption}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No questions in this category yet."
            />
          </section>
        )}

        {/* ─── DISCOVERY LANDING ─────────────────────────────────────── */}
        {showDiscovery && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-10">
              {/* LEFT — main column */}
              <div className="lg:col-span-2 space-y-12">
                {/* ───── MOST POPULAR (Last 7 days, numbered) ───── */}
                <section aria-labelledby="most-popular-heading">
                  <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-subtle">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                        <h2 id="most-popular-heading" className="font-serif text-lg text-ink leading-none">Most Popular</h2>
                        <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold ml-1">Last 7 days</span>
                      </div>
                    </div>
                    <div className="divide-y divide-border/40">
                      {popularLoading
                        ? [1, 2, 3, 4, 5].map((n) => <NumberedSkeletonRow key={n} rank={n} />)
                        : popularFaqs.length === 0
                          ? <p className="text-xs text-ink-soft py-3">No popular FAQs yet — once interns start viewing, they'll show up here.</p>
                          : popularFaqs.slice(0, 5).map((item, idx) => (
                              <NumberedFaqRow
                                key={item._id}
                                rank={idx + 1}
                                item={item}
                                rightMeta={
                                  <span className="block">
                                    {formatViews(item.guestViewCount)}
                                    <span className="mx-1">·</span>
                                    {formatReadTime(item.expectedReadMs)}
                                  </span>
                                }
                                onOpen={handleQuestionOpen}
                              />
                            ))
                      }
                    </div>
                  </div>
                </section>

                {/* ───── RECENT FAQs (Newest, numbered) ───── */}
                <section aria-labelledby="recent-faqs-heading">
                  <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-subtle">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <h2 id="recent-faqs-heading" className="font-serif text-lg text-ink leading-none">Recent FAQs</h2>
                        <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold ml-1">Newest</span>
                      </div>
                    </div>
                    <div className="divide-y divide-border/40">
                      {recentLoading
                        ? [1, 2, 3, 4, 5].map((n) => <NumberedSkeletonRow key={n} rank={n} />)
                        : recentPublicFaqs.length === 0
                          ? <p className="text-xs text-ink-soft py-3">No recent FAQs yet.</p>
                          : recentPublicFaqs.slice(0, 5).map((item, idx) => (
                              <NumberedFaqRow
                                key={item._id}
                                rank={idx + 1}
                                item={item}
                                rightMeta={
                                  <span className="block">
                                    {formatShortDate(item.createdAt)}
                                    {item.expectedReadMs ? <><span className="mx-1">·</span>{formatReadTime(item.expectedReadMs)}</> : null}
                                  </span>
                                }
                                onOpen={handleQuestionOpen}
                              />
                            ))
                      }
                    </div>
                  </div>
                </section>

                {/* ───── TOP SOLVED TODAY (4-card grid from community) ───── */}
                <TopSolved />

                {/* ───── FROM ZOOM MEETINGS ───── */}
                <FromMeetings />

                {/* ───── ALL FAQs (full live list, 141 questions) ───── */}
                <section aria-labelledby="all-faqs-heading">
                  <div className="flex items-center justify-between mb-5">
                     <div className="flex items-center gap-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      <h2 id="all-faqs-heading" className="font-serif text-xl text-ink">All FAQs</h2>
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-faint">
                        {total} questions
                      </span>
                    </div>
                  </div>
                  <QuestionList
                    items={flatQuestions}
                    loading={loading}
                    sortOption={sortOption}
                    onSortChange={setSortOption}
                    visibleCount={visibleCount}
                    onLoadMore={() => setVisibleCount((prev) => prev + 12)}
                    emptyMessage="No FAQs yet."
                  />
                </section>
              </div>

              {/* RIGHT — sticky sidebar */}
              <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
                {/* 4×2 icon grid — Browse Categories */}
                <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-subtle">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 3h7v7H3z" />
                        <path d="M14 3h7v7h-7z" />
                        <path d="M14 14h7v7h-7z" />
                        <path d="M3 14h7v7H3z" />
                      </svg>
                      <h3 className="font-serif text-lg text-ink">Browse Categories</h3>
                    </div>
                  </div>
                  <CategoryIconGrid
                    categories={categories}
                    grouped={grouped}
                    onSelect={handleCategoryOpen}
                  />
                  {categories.length > 8 && (
                    <button
                      type="button"
                      onClick={scrollToAllCategories}
                      className="block w-full text-center mt-4 text-xs text-accent font-medium hover:underline"
                    >
                      Browse all {categories.length} categories →
                    </button>
                  )}
                </div>

                {/* Trending Issues */}
                <TrendingIssues />
              </aside>
            </section>

            {/* Explore by Category */}
            <section className="mt-10" aria-labelledby="explore-by-category-heading">
              <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-subtle">
                <div className="mb-5">
                  <h2 id="explore-by-category-heading" className="font-serif text-lg text-ink">Explore by Category</h2>
                  <p className="text-xs text-ink-soft mt-1">Browse questions by popular categories</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                  {categories.map((cat) => {
                    const count = grouped[cat]?.length ?? 0;
                    const formattedName = formatCategoryName(cat);
                    const icon = getCategoryIcon(cat);
                    
                    // Generate color scheme based on category name
                    const nameLower = cat.toLowerCase();
                    let iconBg = 'bg-accent/15 text-accent';
                    if (nameLower.includes('intern') || nameLower.includes('about')) {
                      iconBg = 'bg-emerald-500/15 text-emerald-500';
                    } else if (nameLower.includes('noc') || nameLower.includes('document')) {
                      iconBg = 'bg-blue-500/15 text-blue-400';
                    } else if (nameLower.includes('zoom') || nameLower.includes('attendance') || nameLower.includes('meeting')) {
                      iconBg = 'bg-purple-500/15 text-purple-400';
                    } else if (nameLower.includes('stipend') || nameLower.includes('payment') || nameLower.includes('finance')) {
                      iconBg = 'bg-amber-500/15 text-amber-500';
                    } else if (nameLower.includes('certif') || nameLower.includes('badge')) {
                      iconBg = 'bg-red-500/15 text-red-500';
                    } else if (nameLower.includes('team') || nameLower.includes('phase') || nameLower.includes('course')) {
                      iconBg = 'bg-teal-500/15 text-teal-400';
                    } else if (nameLower.includes('general') || nameLower.includes('other')) {
                      iconBg = 'bg-gray-500/15 text-gray-400';
                    }

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryOpen(cat)}
                        className="flex items-center gap-3 p-3 rounded-xl bg-cream/30 border border-border/55 hover:bg-cream hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200 text-left w-full"
                      >
                        <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${iconBg}`}>
                          {icon}
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-xs font-semibold text-ink line-clamp-1">
                            {formattedName}
                          </h3>
                          <p className="text-[10px] text-ink-faint mt-0.5 whitespace-nowrap">
                            {count} {count === 1 ? 'question' : 'questions'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Quick Access */}
            <section className="mt-8" aria-labelledby="quick-access-heading">
              <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-subtle">
                <div className="mb-5">
                  <h2 id="quick-access-heading" className="font-serif text-lg text-ink">Quick Access</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {/* Ask a Question */}
                  <button
                    type="button"
                    onClick={() => navigate('/community?create=true')}
                    className="group flex items-center justify-between p-3.5 rounded-xl bg-cream/30 border border-border/55 hover:bg-cream hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200 text-left w-full"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-ink group-hover:text-accent transition-colors line-clamp-1">Ask a Question</h3>
                        <p className="text-[10px] text-ink-faint mt-0.5 line-clamp-1">Get help from peers</p>
                      </div>
                    </div>
                    <svg className="shrink-0 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>

                  {/* Browse FAQ */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory('');
                      setActiveQuestion(null);
                      setSearchQuery('');
                      setSearchResults(null);
                      scrollToTop();
                    }}
                    className="group flex items-center justify-between p-3.5 rounded-xl bg-cream/30 border border-border/55 hover:bg-cream hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200 text-left w-full"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 w-8 h-8 rounded-lg bg-blue-500/15 text-blue-500 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-ink group-hover:text-accent transition-colors line-clamp-1">Browse FAQ</h3>
                        <p className="text-[10px] text-ink-faint mt-0.5 line-clamp-1">Find solved answers</p>
                      </div>
                    </div>
                    <svg className="shrink-0 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>

                  {/* Join Community */}
                  <button
                    type="button"
                    onClick={() => navigate('/community')}
                    className="group flex items-center justify-between p-3.5 rounded-xl bg-cream/30 border border-border/55 hover:bg-cream hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200 text-left w-full"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 w-8 h-8 rounded-lg bg-purple-500/15 text-purple-500 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-ink group-hover:text-accent transition-colors line-clamp-1">Join Community</h3>
                        <p className="text-[10px] text-ink-faint mt-0.5 line-clamp-1">Connect with interns</p>
                      </div>
                    </div>
                    <svg className="shrink-0 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>

                  {/* Welcome Package */}
                  <button
                    type="button"
                    onClick={() => navigate('/programs')}
                    className="group flex items-center justify-between p-3.5 rounded-xl bg-cream/30 border border-border/55 hover:bg-cream hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200 text-left w-full"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.29 7 12 12 20.71 7" />
                          <line x1="12" y1="22" x2="12" y2="12" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-ink group-hover:text-accent transition-colors line-clamp-1">Welcome Package</h3>
                        <p className="text-[10px] text-ink-faint mt-0.5 line-clamp-1">Start your journey</p>
                      </div>
                    </div>
                    <svg className="shrink-0 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>

                  {/* Track Issues */}
                  <button
                    type="button"
                    onClick={() => navigate('/support')}
                    className="group flex items-center justify-between p-3.5 rounded-xl bg-cream/30 border border-border/55 hover:bg-cream hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200 text-left w-full"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 w-8 h-8 rounded-lg bg-red-500/15 text-red-500 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-ink group-hover:text-accent transition-colors line-clamp-1">Track Issues</h3>
                        <p className="text-[10px] text-ink-faint mt-0.5 line-clamp-1">Track your queries</p>
                      </div>
                    </div>
                    <svg className="shrink-0 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>

                  {/* Ask Yaksha AI */}
                  <button
                    type="button"
                    onClick={() => {
                      const event = new CustomEvent('askai:open');
                      window.dispatchEvent(event);
                    }}
                    className="group flex items-center justify-between p-3.5 rounded-xl bg-cream/30 border border-border/55 hover:bg-cream hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200 text-left w-full"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="shrink-0 w-8 h-8 rounded-lg bg-teal-500/15 text-teal-500 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 8V4H8" />
                          <rect width="16" height="12" x="4" y="8" rx="2" />
                          <path d="M2 14h2" />
                          <path d="M20 14h2" />
                          <path d="M15 13v2" />
                          <path d="M9 13v2" />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-ink group-hover:text-accent transition-colors line-clamp-1">Ask Yaksha AI</h3>
                        <p className="text-[10px] text-ink-faint mt-0.5 line-clamp-1">AI-powered support</p>
                      </div>
                    </div>
                    <svg className="shrink-0 text-ink-faint group-hover:text-accent group-hover:translate-x-0.5 transition-all" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </section>

            {/* ─── BROWSE ALL CATEGORIES — full-width section ────── */}
            <section ref={allCategoriesRef} className="mt-14 scroll-mt-32" aria-labelledby="all-categories-heading">
              <div className="bg-card rounded-2xl border border-border p-5 sm:p-8 shadow-subtle">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 6h16M4 12h16M4 18h10" />
                    </svg>
                    <h2 id="all-categories-heading" className="font-serif text-xl text-ink">Browse all categories</h2>
                  </div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-faint">
                    {categories.length} categories · {total} FAQs
                  </span>
                </div>
                {categories.length === 0 ? (
                  <p className="text-sm text-ink-soft">No categories yet.</p>
                ) : (
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0.5">
                    {categories.map((cat) => (
                      <li key={cat}>
                        <CategoryListItem
                          name={cat}
                          count={grouped[cat]?.length ?? 0}
                          onSelect={() => handleCategoryOpen(cat)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* CTA — "Still have a question?" */}
            <CTA />
          </>
        )}
      </main>

      <Footer />

      {searchActive && searchResults && searchResults.length > 0 && (
        <SearchFeedback searchQuery={searchQuery} resultFaqId={resultFaqId} />
      )}
    </div>
  );
}