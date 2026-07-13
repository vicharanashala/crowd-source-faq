// Home/FAQ Discovery Page — the single source of truth for the landing portal.
// Layout (when nothing is selected):
//
//   HERO  →  "Ask. Discover. Get Solved."  +  search bar + chips
//   STATISTICS STRIP  →  4 counters
//   MOST POPULAR  →  horizontal scroll cards
//   RECENT FAQs  →  vertical timeline
//   FROM ZOOM MEETINGS  →  existing component
//   BROWSE BY CATEGORY  →  CategoryCardGrid (3-column)
//   CTA  →  "Didn't find your answer?"
//
// Every section pulls live data from the backend (no hardcoded content):
//   /api/faq                                 → FAQs grouped by category
//   /api/public/popular-faqs?limit=5         → Most Popular (views + read time)
//   /api/public/recent-faqs?limit=5          → Recent FAQs
//   /api/faq/recent?source=zoom_transcript   → From Zoom Meetings

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tags } from 'lucide-react';
import Footer from '../components/layout/Footer';
import SearchBar from '../components/search/SearchBar';
import { HomeDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
import { useBatch } from '../context/BatchContext';
import { useFeatureFlag } from '../context/FeatureFlagContext';

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
import FromMeetings from '../components/faq/FromMeetings';
import CategoryCardGrid from '../components/faq/CategoryCardGrid';
import CategorySidebarContent from '../components/faq/CategorySidebar';
import CTA from '../components/ui/CTA';
import { useMergedCategoryFaqs } from '../hooks/useMergedCategoryFaqs';

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

// ── Relative time: "2h ago", "Yesterday", "3 days ago" ──────────────────
function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return `Yesterday`;
  return `${days}d ago`;
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
  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<FAQItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FAQItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortOption, setSortOption] = useState('relevant');
  const [visibleCount, setVisibleCount] = useState(8);
  const [isPopularHovered, setIsPopularHovered] = useState(false);

  const { enabled: sidebarEnabled } = useFeatureFlag('categorySidebar');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [showAllFaqs, setShowAllFaqs] = useState(false);

  const searchBarRef = useRef<HTMLInputElement>(null);
  const popularScrollRef = useRef<HTMLDivElement>(null);

  const [resultFaqId, setResultFaqId] = useState<string | undefined>(undefined);
  const { id: urlFaqId } = useParams<string>();
  const navigate = useNavigate();

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    // /api/search/trending — removed (no longer used)

    return () => { mounted = false; };
  }, [batchId]);

  // ── Derived data ─────────────────────────────────────────────────────────
  // Order by FAQ count (desc), tie-break alphabetically — matches the
  // discovery layout where the busiest categories surface first.
  const categories = useMemo(() => (
    Object.keys(grouped).sort((a, b) => {
      const diff = (grouped[b]?.length ?? 0) - (grouped[a]?.length ?? 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    })
  ), [grouped]);

  const flatQuestions = useMemo(() => (
    categories.flatMap((name) => (grouped[name] || []).map((item) => ({
      ...item,
      category: item.category || name,
      source: item.source || 'faq',
    })))
  ), [categories, grouped]);

  const verifiedCount = useMemo(() =>
    flatQuestions.filter((q) => q.reviewStatus === 'verified').length,
  [flatQuestions]);

  const zoomFaqCount = useMemo(() =>
    flatQuestions.filter((q) => (q.source as string) === 'zoom_transcript').length,
  [flatQuestions]);

  const mergedCategoryFaqs = useMergedCategoryFaqs(grouped, selectedCategories, flatQuestions);

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

  // ── Deep-link to a category via ?category=... ──────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!grouped || Object.keys(grouped).length === 0) return;
    const cat = searchParams.get('category');
    if (!cat) return;
    if (grouped[cat]) {
      setActiveCategory(cat);
      setActiveQuestion(null);
    }
    setSearchParams((prev) => {
      prev.delete('category');
      return prev;
    }, { replace: true });
  }, [grouped, searchParams, setSearchParams]);

  // ── Auto-scroll for Most Popular horizontal carousel ────────────────────
  useEffect(() => {
    const el = popularScrollRef.current;
    if (!el || isPopularHovered || popularFaqs.length === 0) return;
    const interval = setInterval(() => {
      if (!popularScrollRef.current || isPopularHovered) return;
      const { scrollLeft, scrollWidth, clientWidth } = popularScrollRef.current;
      const maxScroll = scrollWidth - clientWidth;
      if (scrollLeft >= maxScroll - 10) {
        popularScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        popularScrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [popularFaqs.length, isPopularHovered]);

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

  const searchActive = searchQuery.trim().length >= 3 && Array.isArray(searchResults) && searchResults.length > 0;
  // v2 — Show the glassmorphic dropdown as soon as the user types. The
  // dropdown's left column shows live results from the same `searchResults`
  // array that the in-page section consumes below — same query, same count.
  const showDropdown = searchQuery.trim().length > 0;

  // v2 — Dropdown ONLY shows API search results, which stream live as the
  // user types. The right column stays as the always-live category
  // autocomplete inside SearchDropdown itself.
  const dropdownItems = useMemo(() => {
    if (Array.isArray(searchResults)) {
      return searchResults;
    }
    return [];
  }, [searchResults]);

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
      // v2 — Don't wipe searchResults on every keystroke; let the SearchBar's
      // 300ms debounce overwrite naturally. Avoids the 0→5→0 flicker.
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
  };

  // True when the user is browsing the discovery landing (nothing selected)
  const showDiscovery = !loading && !error && !activeQuestion && !activeCategory;

  const sidebarContent = (
    <CategorySidebarContent
      grouped={grouped}
      selectedCategories={selectedCategories}
      totalFaqCount={mergedCategoryFaqs.length}
      onSelectionChange={(cats) => { setSelectedCategories(cats); setShowAllFaqs(false); }}
    />
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <HomeDoodles />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-10 relative z-10">
        {/* ─── HERO (badge · eyebrow · title · stats · search · pills) ─── */}
        <section className="relative pt-2 sm:pt-4 pb-2 text-center" aria-label="Page header">
          {/* Icon badge */}
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 text-accent mb-3 relative z-10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 0.7-1.5 1.2-1.5 2.5" />
              <path d="M12 17.5h.01" />
            </svg>
          </div>

          {/* Program eyebrow */}
          {currentBatch?.name && (
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-accent relative z-10">
              {currentBatch.name}
            </p>
          )}

          <h1 className="font-serif text-[1.75rem] sm:text-4xl md:text-5xl lg:text-[3.2rem] leading-[1.15] tracking-tight text-ink mb-6 mt-1.5 relative z-10">
            Ask. Discover. Get{' '}
            <span className="doodle-underline font-serif" style={{ fontWeight: 700 }}>Solved.</span>
            <svg className="inline-block ml-2 align-middle" width="24" height="18" viewBox="0 0 24 18" style={{ opacity: 0.18 }} aria-hidden="true">
              <path d="M2 12 Q6 4 12 9 Q18 14 22 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </h1>

          <p className="text-sm sm:text-base text-ink-soft max-w-lg leading-relaxed mx-auto px-2 relative z-10">
            Search your doubt or explore solved questions from the community.
          </p>

          {total > 0 && (
            <p className="text-[11px] text-ink-faint mt-3 uppercase tracking-wider font-semibold relative z-10">
              {total} {total === 1 ? 'FAQ' : 'FAQs'} · {categories.length} categories
            </p>
          )}

          {/* ─── SEARCH BAR ─── */}
          <div className="mt-10 max-w-3xl mx-auto px-2">
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
          </div>

          </section>

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
            {/* 1.10 (LOW) — disable the Retry button while a fetch is
                in flight so a double-click cannot fire two parallel
                /faq requests. The other data sources fail soft in the
                effect above, so retrying here only re-fetches /faq. */}
            <button
              onClick={() => {
                setError('');
                setLoading(true);
                api.get('/faq', { params: batchId ? { batchId } : undefined })
                  .then((res) => { setGrouped(res.data.grouped || {}); setTotal(res.data.total || 0); })
                  .catch((err: unknown) => {
                    const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs.';
                    setError(m);
                  })
                  .finally(() => setLoading(false));
              }}
              disabled={loading}
              className="px-5 py-2 text-sm font-medium bg-danger text-accent-text rounded-full hover:bg-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Retry
            </button>
          </div>
        )}

        {/* ─── DETAIL VIEW (when a question is opened) ──────────────── */}
        {!loading && !error && activeQuestion && !sidebarEnabled && (
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

        {/* Search results render inline in the dropdown under the search bar
            (see SearchDropdown) — no full-page results view / redirect. */}

        {/* ─── CATEGORY VIEW (non-sidebar only) ────────────────────────── */}
        {!loading && !error && !activeQuestion && !searchActive && activeCategory && !sidebarEnabled && (
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

        {/* ─── SIDEBAR LAYOUT (feature flag: categorySidebar) ──────────── */}
        {!loading && !error && sidebarEnabled && (
          <>
            {/* Mobile: Categories opener button */}
            <button
              onClick={() => setSidebarMobileOpen(true)}
              className="lg:hidden mb-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink bg-card border border-border rounded-xl hover:bg-mist transition-colors"
            >
              <Tags size={16} />
              Categories
              {selectedCategories.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-accent/10 text-accent rounded-full">
                  {selectedCategories.length}
                </span>
              )}
            </button>

            <div className="flex gap-6 items-start mt-6">
              {/* Desktop sidebar */}
              <aside className="hidden lg:flex flex-col w-[260px] shrink-0 sticky top-24 h-[calc(100vh-8rem)] bg-card rounded-2xl border border-border/60 shadow-sm z-30 overflow-hidden">
                {sidebarContent}
              </aside>

              {/* Right panel */}
              <div className="flex-1 min-w-0">
                {/* Stats strip */}
                <section className="mt-0" aria-label="Platform statistics">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="stat-card bg-card rounded-2xl border border-border">
                      <div className="stat-card__icon bg-accent/10 text-accent">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      </div>
                      <div className="stat-card__value">{total.toLocaleString()}+</div>
                      <div className="stat-card__label">Questions Answered</div>
                    </div>
                    <div className="stat-card bg-card rounded-2xl border border-border">
                      <div className="stat-card__icon bg-accent/10 text-accent">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9.5" />
                          <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 0.7-1.5 1.2-1.5 2.5" />
                          <path d="M12 17.5h.01" />
                        </svg>
                      </div>
                      <div className="stat-card__value">{categories.length}</div>
                      <div className="stat-card__label">Categories</div>
                    </div>
                    <div className="stat-card bg-card rounded-2xl border border-border">
                      <div className="stat-card__icon bg-accent/10 text-accent">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="23 7 16 12 23 17 23 7" />
                          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                      </div>
                      <div className="stat-card__value">{zoomFaqCount > 0 ? `${zoomFaqCount}+` : '\u2014'}</div>
                      <div className="stat-card__label">Zoom Sessions</div>
                    </div>
                    <div className="stat-card bg-card rounded-2xl border border-border">
                      <div className="stat-card__icon bg-accent/10 text-accent">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                          <polyline points="16 7 22 7 22 13" />
                        </svg>
                      </div>
                      <div className="stat-card__value">{total > 0 ? `${Math.round((verifiedCount / total) * 100)}%` : '95%'}</div>
                      <div className="stat-card__label">Questions Resolved</div>
                    </div>
                  </div>
                </section>

                {/* Most Popular */}
                <section className="mt-12" aria-labelledby="most-popular-heading">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-accent">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                        <polyline points="16 7 22 7 22 13" />
                      </svg>
                      <h2 id="most-popular-heading" className="font-serif text-xl text-ink leading-none">Most Popular</h2>
                    </div>
                    <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">Last 7 days</span>
                  </div>
                  <div
                    ref={popularScrollRef}
                    className="h-scroll"
                    onMouseEnter={() => setIsPopularHovered(true)}
                    onMouseLeave={() => setIsPopularHovered(false)}
                  >
                    {popularLoading
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="popular-card bg-card rounded-2xl border border-border/60 p-4 animate-pulse min-w-[240px]">
                            <div className="h-3 bg-mist rounded w-3/4 mb-3" />
                            <div className="h-2.5 bg-mist rounded w-full mb-2" />
                            <div className="h-2.5 bg-mist rounded w-2/3" />
                          </div>
                        ))
                      : popularFaqs.length === 0
                        ? <p className="text-xs text-ink-soft py-3">{'No popular FAQs yet \u2014 once interns start viewing, they\'ll show up here.'}</p>
                        : popularFaqs.slice(0, 5).map((item) => (
                            <button
                              key={item._id}
                              type="button"
                              onClick={() => handleQuestionOpen(item)}
                              className="popular-card bg-card rounded-2xl border border-border/60 p-4 cursor-pointer text-left hover:shadow-card-hover transition-all duration-200 group"
                            >
                              <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                                {getQuestionTitle(item)}
                              </h3>
                              {item.answer && (
                                <p className="mt-2 text-xs text-ink-soft leading-relaxed line-clamp-2">
                                  {item.answer}
                                </p>
                              )}
                              <div className="mt-3 flex items-center gap-2 text-[10px] text-ink-faint">
                                <span>{formatViews(item.guestViewCount)}</span>
                                {item.expectedReadMs && <><span>{'\u00B7'}</span><span>{formatReadTime(item.expectedReadMs)}</span></>}
                              </div>
                            </button>
                          ))
                    }
                  </div>
                </section>

                {/* Recent FAQs */}
                <section className="mt-12" aria-labelledby="recent-faqs-heading">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <polyline points="12 7 12 12 15.5 14" />
                      </svg>
                      <h2 id="recent-faqs-heading" className="font-serif text-xl text-ink leading-none">Recent FAQs</h2>
                    </div>
                    <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">Newest</span>
                  </div>
                  <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
                    {recentLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <div key={n} className="flex items-start gap-3 animate-pulse">
                            <div className="w-3 h-3 rounded-full bg-mist shrink-0 mt-1" />
                            <div className="flex-1">
                              <div className="h-3 bg-mist rounded w-3/4 mb-1.5" />
                              <div className="h-2.5 bg-mist rounded w-1/4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : recentPublicFaqs.length === 0 ? (
                      <p className="text-xs text-ink-soft py-3">No recent FAQs yet.</p>
                    ) : (
                      <div className="timeline">
                        {recentPublicFaqs.slice(0, 6).map((item) => (
                          <div key={item._id} className="timeline-item">
                            <div className="timeline-dot" />
                            <button
                              type="button"
                              onClick={() => handleQuestionOpen(item)}
                              className="timeline-content w-full text-left group"
                            >
                              <div className="flex items-center gap-2 mb-0.5">
                                {item.category && (
                                  <span className="text-[10px] font-semibold text-ink-faint bg-mist px-1.5 py-0.5 rounded">
                                    {formatCategoryName(item.category).replace(/^\d+\.\s*/, '')}
                                  </span>
                                )}
                                <span className="text-[10px] text-ink-faint">{formatRelativeTime(item.createdAt)}</span>
                              </div>
                              <p className="text-sm text-ink leading-snug group-hover:text-accent transition-colors line-clamp-1">
                                {getQuestionTitle(item)}
                              </p>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                {/* Merged FAQs or Detail */}
                {activeQuestion ? (
                  <section className="mt-12">
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
                  </section>
                ) : (
                  <section className="mt-12">
                    {(() => {
                      const noCategorySelected = selectedCategories.length === 0;
                      const previewMode = noCategorySelected && !showAllFaqs;
                      const previewItems = previewMode ? mergedCategoryFaqs.slice(0, 8) : mergedCategoryFaqs;
                      const remainingCount = mergedCategoryFaqs.length - 8;

                      return (
                        <>
                          <QuestionList
                            items={previewItems}
                            loading={false}
                            sortOption={sortOption}
                            onSortChange={setSortOption}
                            visibleCount={previewMode ? 8 : visibleCount}
                            onLoadMore={() => {
                              if (previewMode) {
                                setShowAllFaqs(true);
                              } else {
                                setVisibleCount((prev) => prev + 6);
                              }
                            }}
                            emptyMessage="No questions found."
                          />
                          {previewMode && remainingCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowAllFaqs(true)}
                              className="mt-4 w-full py-2.5 text-sm font-medium text-accent bg-accent/8 hover:bg-accent/15 rounded-xl transition-colors"
                            >
                              View All Questions ({mergedCategoryFaqs.length})
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </section>
                )}

                <FromMeetings />
                <CTA />
              </div>
            </div>

            {/* Mobile drawer — overlay, outside flex layout */}
            <AnimatePresence>
              {sidebarMobileOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm lg:hidden"
                    onClick={() => setSidebarMobileOpen(false)}
                  />
                  <motion.aside
                    initial={{ x: -280 }}
                    animate={{ x: 0 }}
                    exit={{ x: -280 }}
                    transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
                    className="fixed left-0 top-16 bottom-0 w-[280px] z-50 lg:hidden bg-card border-r border-border/60 shadow-xl overflow-hidden"
                  >
                    {sidebarContent}
                  </motion.aside>
                </>
              )}
            </AnimatePresence>
          </>
        )}

        {/* ─── DISCOVERY LANDING (non-sidebar) ─────────────────────────── */}
        {showDiscovery && !sidebarEnabled && (
          <>
            {/* ─── STATISTICS STRIP ─── */}
            <section className="mt-6" aria-label="Platform statistics">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="stat-card bg-card rounded-2xl border border-border">
                  <div className="stat-card__icon bg-accent/10 text-accent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <div className="stat-card__value">{total.toLocaleString()}+</div>
                  <div className="stat-card__label">Questions Answered</div>
                </div>
                <div className="stat-card bg-card rounded-2xl border border-border">
                  <div className="stat-card__icon bg-accent/10 text-accent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9.5" />
                      <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 0.7-1.5 1.2-1.5 2.5" />
                      <path d="M12 17.5h.01" />
                    </svg>
                  </div>
                  <div className="stat-card__value">{categories.length}</div>
                  <div className="stat-card__label">Categories</div>
                </div>
                <div className="stat-card bg-card rounded-2xl border border-border">
                  <div className="stat-card__icon bg-accent/10 text-accent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                  </div>
                  <div className="stat-card__value">{zoomFaqCount > 0 ? `${zoomFaqCount}+` : '\u2014'}</div>
                  <div className="stat-card__label">Zoom Sessions</div>
                </div>
                <div className="stat-card bg-card rounded-2xl border border-border">
                  <div className="stat-card__icon bg-accent/10 text-accent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                      <polyline points="16 7 22 7 22 13" />
                    </svg>
                  </div>
                  <div className="stat-card__value">{total > 0 ? `${Math.round((verifiedCount / total) * 100)}%` : '95%'}</div>
                  <div className="stat-card__label">Questions Resolved</div>
                </div>
              </div>
            </section>

            {/* ─── MOST POPULAR (horizontal scroll) ─── */}
            <section className="mt-12" aria-labelledby="most-popular-heading">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-accent">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                    <polyline points="16 7 22 7 22 13" />
                  </svg>
                  <h2 id="most-popular-heading" className="font-serif text-xl text-ink leading-none">Most Popular</h2>
                </div>
                <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">Last 7 days</span>
              </div>
              <div
                ref={popularScrollRef}
                className="h-scroll"
                onMouseEnter={() => setIsPopularHovered(true)}
                onMouseLeave={() => setIsPopularHovered(false)}
              >
                {popularLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="popular-card bg-card rounded-2xl border border-border/60 p-4 animate-pulse min-w-[240px]">
                        <div className="h-3 bg-mist rounded w-3/4 mb-3" />
                        <div className="h-2.5 bg-mist rounded w-full mb-2" />
                        <div className="h-2.5 bg-mist rounded w-2/3" />
                      </div>
                    ))
                  : popularFaqs.length === 0
                    ? <p className="text-xs text-ink-soft py-3">{'No popular FAQs yet \u2014 once interns start viewing, they\'ll show up here.'}</p>
                    : popularFaqs.slice(0, 5).map((item) => (
                        <button
                          key={item._id}
                          type="button"
                          onClick={() => handleQuestionOpen(item)}
                          className="popular-card bg-card rounded-2xl border border-border/60 p-4 cursor-pointer text-left hover:shadow-card-hover transition-all duration-200 group"
                        >
                          <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                            {getQuestionTitle(item)}
                          </h3>
                          {item.answer && (
                            <p className="mt-2 text-xs text-ink-soft leading-relaxed line-clamp-2">
                              {item.answer}
                            </p>
                          )}
                          <div className="mt-3 flex items-center gap-2 text-[10px] text-ink-faint">
                            <span>{formatViews(item.guestViewCount)}</span>
                            {item.expectedReadMs && <><span>{'\u00B7'}</span><span>{formatReadTime(item.expectedReadMs)}</span></>}
                          </div>
                        </button>
                      ))
                }
              </div>
            </section>

            {/* ─── RECENT FAQs (timeline) ─── */}
            <section className="mt-12" aria-labelledby="recent-faqs-heading">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15.5 14" />
                  </svg>
                  <h2 id="recent-faqs-heading" className="font-serif text-xl text-ink leading-none">Recent FAQs</h2>
                </div>
                <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">Newest</span>
              </div>
              <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
                {recentLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div key={n} className="flex items-start gap-3 animate-pulse">
                        <div className="w-3 h-3 rounded-full bg-mist shrink-0 mt-1" />
                        <div className="flex-1">
                          <div className="h-3 bg-mist rounded w-3/4 mb-1.5" />
                          <div className="h-2.5 bg-mist rounded w-1/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recentPublicFaqs.length === 0 ? (
                  <p className="text-xs text-ink-soft py-3">No recent FAQs yet.</p>
                ) : (
                  <div className="timeline">
                    {recentPublicFaqs.slice(0, 6).map((item) => (
                      <div key={item._id} className="timeline-item">
                        <div className="timeline-dot" />
                        <button
                          type="button"
                          onClick={() => handleQuestionOpen(item)}
                          className="timeline-content w-full text-left group"
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            {item.category && (
                              <span className="text-[10px] font-semibold text-ink-faint bg-mist px-1.5 py-0.5 rounded">
                                {formatCategoryName(item.category).replace(/^\d+\.\s*/, '')}
                              </span>
                            )}
                            <span className="text-[10px] text-ink-faint">{formatRelativeTime(item.createdAt)}</span>
                          </div>
                          <p className="text-sm text-ink leading-snug group-hover:text-accent transition-colors line-clamp-1">
                            {getQuestionTitle(item)}
                          </p>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* ─── BROWSE CATEGORIES ─── */}
            <section className="mt-12" aria-labelledby="browse-categories-heading">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                  <h2 id="browse-categories-heading" className="font-serif text-xl text-ink leading-none">Browse by Category</h2>
                </div>
                <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">{categories.length} topics</span>
              </div>
              <CategoryCardGrid
                grouped={grouped}
                onSelect={handleCategoryOpen}
                onQuestionClick={handleQuestionOpen}
              />
            </section>

            {/* ─── FROM ZOOM MEETINGS ─── */}
            <FromMeetings />

            {/* ─── CTA ─── */}
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