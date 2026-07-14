// Home/FAQ Discovery Page — the single source of truth for the landing portal.
// Layout (when nothing is selected):
//
//   HERO  →  "Ask. Discover. Get Solved."  +  stats
//   SEARCH BAR  (big)
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
import Footer from '../components/layout/Footer';
import SearchBar from '../components/search/SearchBar';
import { HomeDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
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
function BrowseCategoryRow({
  name,
  count,
  onSelect,
}: {
  name: string;
  count: number;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="group w-full flex items-center justify-between py-2.5 px-2 -mx-2 rounded-xl hover:bg-cream/60 transition-colors duration-150"
      >
        <span className="text-sm font-medium text-ink group-hover:text-accent transition-colors line-clamp-1 text-left">
          {formatCategoryName(name)}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-ink-faint">
          <span className="tabular-nums">{count}</span>
          <svg className="text-ink-faint group-hover:text-accent transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </button>
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  All-Categories accordion card
//  Collapsed → category name + count. Expanded → a small per-category search
//  box, the top 3 most-searched FAQs (by popularity), and a link to the full
//  FAQ section. Typing in the box filters this category's FAQs locally.
// ═══════════════════════════════════════════════════════════════════════════
const TOP_PER_CATEGORY = 3;

function AllCategoryCard({
  name,
  count,
  items,
  topItems,
  expanded,
  onToggle,
  onOpenQuestion,
  onViewAll,
}: {
  name: string;
  count: number;
  items: FAQItem[];
  topItems: FAQItem[];
  expanded: boolean;
  onToggle: () => void;
  onOpenQuestion: (item: FAQItem) => void;
  onViewAll: () => void;
}): React.ReactElement {
  const panelId = `cat-panel-${name.replace(/\s+/g, '-')}`;
  const [query, setQuery] = useState('');

  // Fallback ordering when the live ranking endpoint hasn't loaded:
  // popularity, then guest views.
  const ranked = useMemo(() => (
    [...items].sort((a, b) => (
      (Number(b.popularityScore) || 0) - (Number(a.popularityScore) || 0)
      || (Number(b.guestViewCount) || 0) - (Number(a.guestViewCount) || 0)
    ))
  ), [items]);

  // Default view = top-N by live opens + search hits (from the backend).
  // If that feed is empty, fall back to the popularity ordering above.
  const top = (topItems && topItems.length > 0 ? topItems : ranked).slice(0, TOP_PER_CATEGORY);

  const q = query.trim().toLowerCase();
  const visible = q
    ? ranked.filter((it) => getQuestionTitle(it).toLowerCase().includes(q))
    : top;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden scroll-mt-32">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 hover:bg-cream/40 transition-colors text-left"
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-9 h-9 rounded-xl bg-cream text-accent flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7h18M3 12h18M3 17h12" />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 className="font-serif text-lg text-ink leading-snug truncate">{formatCategoryName(name)}</h3>
            <p className="text-xs text-ink-soft mt-0.5">{count} {count === 1 ? 'FAQ' : 'FAQs'}</p>
          </div>
        </div>
        <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-ink-faint transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div id={panelId} className="border-t border-border/60 px-5 pt-4 pb-2">
          {/* Per-category search box */}
          <div className="relative mb-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search in ${formatCategoryName(name)}…`}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-border/70 bg-cream/50 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-card transition-colors"
              autoComplete="off"
            />
          </div>

          {/* Top-3 (or filtered) FAQ rows */}
          <div className="divide-y divide-border/40">
            {visible.length === 0 ? (
              <p className="text-xs text-ink-soft py-3">
                {q ? 'No matches in this category.' : 'No questions in this category yet.'}
              </p>
            ) : (
              visible.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => onOpenQuestion({ ...item, category: name })}
                  className="group w-full text-left flex items-start gap-3 py-3"
                >
                  <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-accent/40 group-hover:bg-accent transition-colors" aria-hidden="true" />
                  <span className="flex-1 min-w-0 text-sm text-ink group-hover:text-accent transition-colors line-clamp-2">
                    {getQuestionTitle(item)}
                  </span>
                  <svg className="shrink-0 mt-1 text-ink-faint group-hover:text-accent transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              ))
            )}
          </div>

          {/* Footer — caption + link to the full FAQ section */}
          <div className="mt-1 pt-3 border-t border-border/60 flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-faint">
              {q
                ? `${visible.length} ${visible.length === 1 ? 'match' : 'matches'}`
                : count > TOP_PER_CATEGORY
                  ? `Top ${TOP_PER_CATEGORY} of ${count}`
                  : `${count} ${count === 1 ? 'FAQ' : 'FAQs'}`}
            </span>
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs text-accent font-medium hover:underline inline-flex items-center gap-1"
            >
              Open in FAQ section
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Numbered FAQ row — used by Most Popular + Recent FAQs lists
// ═══════════════════════════════════════════════════════════════════════════
function NumberedFaqRow({
  rank,
  item,
  meta,
  onOpen,
}: {
  rank: number;
  item: FAQItem;
  meta?: React.ReactNode;
  onOpen: (item: FAQItem) => void;
}): React.ReactElement {
  const verified = item.reviewStatus === 'verified';
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="group w-full text-left flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-xl hover:bg-cream/60 transition-colors duration-150"
      >
        <span className="shrink-0 w-6 h-6 rounded-md bg-cream text-ink-soft text-[11px] font-semibold flex items-center justify-center mt-0.5 tabular-nums">
          {rank}
        </span>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-ink leading-snug line-clamp-2 group-hover:text-accent transition-colors">
            {getQuestionTitle(item)}
          </h3>
          {item.answer && (
            <p className="text-xs text-ink-soft mt-1 line-clamp-1">
              {item.answer}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {item.category && (
              <span className="text-[11px] text-ink-faint bg-mist px-1.5 py-0.5 rounded">
                {formatCategoryName(item.category).replace(/^\d+\.\s*/, '')}
              </span>
            )}
            {verified && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success/15 text-success">
                Verified
              </span>
            )}
            {meta}
          </div>
        </div>

        <svg className="shrink-0 mt-1.5 text-ink-faint group-hover:text-accent transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Skeleton row used while data is loading
// ═══════════════════════════════════════════════════════════════════════════
function NumberedSkeletonRow({ rank }: { rank: number }): React.ReactElement {
  return (
    <li className="flex items-start gap-3 py-2.5 px-2 -mx-2">
      <span className="shrink-0 w-6 h-6 rounded-md bg-mist animate-pulse flex items-center justify-center text-[11px] tabular-nums text-transparent">{rank}</span>
      <div className="flex-1">
        <div className="h-3 bg-mist rounded animate-pulse w-4/5 mb-1.5" />
        <div className="h-2.5 bg-mist rounded animate-pulse w-full mb-1" />
        <div className="h-2.5 bg-mist rounded animate-pulse w-2/3" />
      </div>
    </li>
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
  // Per-category top FAQs ranked by live opens + search hits (dynamic).
  const [topByCategory, setTopByCategory] = useState<Record<string, FAQItem[]>>({});

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<FAQItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FAQItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortOption, setSortOption] = useState('relevant');
  const [visibleCount, setVisibleCount] = useState(8);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

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

  const toggleCategory = useCallback((name: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
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

    // /api/public/category-top-faqs — per-category top 3 by opens + search hits
    api.get('/public/category-top-faqs', { params: { limit: 3, batchId } })
      .then((res) => { if (mounted) setTopByCategory(res.data?.grouped || {}); })
      .catch(() => { /* non-fatal — falls back to popularityScore ordering */ });

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

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <HomeDoodles />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-[112px] sm:pt-[128px] pb-10 relative z-10">
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

        {/* Search results render inline in the dropdown under the search bar
            (see SearchDropdown) — no full-page results view / redirect. */}

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
            {/* ─── 3-COLUMN: Most Popular · Recent FAQs · Browse Categories ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
              {/* ───── MOST POPULAR ───── */}
              <section className="bg-card rounded-2xl border border-border p-6 flex flex-col h-full" aria-labelledby="most-popular-heading">
                <header className="flex items-center justify-between mb-6 shrink-0">
                  <div className="flex items-center gap-2 text-accent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                      <polyline points="16 7 22 7 22 13" />
                    </svg>
                    <h2 id="most-popular-heading" className="font-serif text-lg text-ink leading-none">Most Popular</h2>
                  </div>
                  <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">Last 7 days</span>
                </header>
                <div className="flex-1 flex flex-col">
                  <ol className="space-y-0">
                    {popularLoading
                      ? [1, 2, 3, 4, 5].map((n) => <NumberedSkeletonRow key={n} rank={n} />)
                      : popularFaqs.length === 0
                        ? <p className="text-xs text-ink-soft py-3">No popular FAQs yet — once interns start viewing, they&apos;ll show up here.</p>
                        : popularFaqs.slice(0, 5).map((item, idx) => (
                            <NumberedFaqRow
                              key={item._id}
                              rank={idx + 1}
                              item={item}
                              meta={
                                <>
                                  <span className="text-[11px] text-ink-faint">{formatViews(item.guestViewCount)}</span>
                                  <span className="text-[11px] text-ink-faint">· {formatReadTime(item.expectedReadMs)}</span>
                                </>
                              }
                              onOpen={handleQuestionOpen}
                            />
                          ))
                    }
                  </ol>
                </div>
              </section>

              {/* ───── RECENT FAQs ───── */}
              <section className="bg-card rounded-2xl border border-border p-6 flex flex-col h-full" aria-labelledby="recent-faqs-heading">
                <header className="flex items-center justify-between mb-6 shrink-0">
                  <div className="flex items-center gap-2 text-accent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <polyline points="12 7 12 12 15.5 14" />
                    </svg>
                    <h2 id="recent-faqs-heading" className="font-serif text-lg text-ink leading-none">Recent FAQs</h2>
                  </div>
                  <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">Newest</span>
                </header>
                <div className="flex-1 flex flex-col">
                  <ol className="space-y-0">
                    {recentLoading
                      ? [1, 2, 3, 4, 5].map((n) => <NumberedSkeletonRow key={n} rank={n} />)
                      : recentPublicFaqs.length === 0
                        ? <p className="text-xs text-ink-soft py-3">No recent FAQs yet.</p>
                        : recentPublicFaqs.slice(0, 5).map((item, idx) => (
                            <NumberedFaqRow
                              key={item._id}
                              rank={idx + 1}
                              item={item}
                              meta={
                                <>
                                  <span className="text-[11px] text-ink-faint">{formatShortDate(item.createdAt)}</span>
                                  {item.expectedReadMs ? <span className="text-[11px] text-ink-faint">· {formatReadTime(item.expectedReadMs)}</span> : null}
                                </>
                              }
                              onOpen={handleQuestionOpen}
                            />
                          ))
                    }
                  </ol>
                </div>
              </section>

              {/* ───── BROWSE CATEGORIES ───── */}
              <section className="bg-card rounded-2xl border border-border p-6 flex flex-col h-full" aria-labelledby="browse-categories-heading">
                <header className="flex items-center justify-between mb-6 shrink-0">
                  <div className="flex items-center gap-2 text-accent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    <h2 id="browse-categories-heading" className="font-serif text-lg text-ink leading-none">Browse Categories</h2>
                  </div>
                  <span className="text-[10px] text-ink-faint uppercase tracking-wider font-semibold">{categories.length} topics</span>
                </header>
                <div className="flex-1 flex flex-col">
                  <ul className="space-y-0">
                    {categories.slice(0, 8).map((cat) => (
                      <BrowseCategoryRow
                        key={cat}
                        name={cat}
                        count={grouped[cat]?.length ?? 0}
                        onSelect={() => handleCategoryOpen(cat)}
                      />
                    ))}
                    {categories.length > 8 && (
                      <li className="pt-2 border-t border-border/60 mt-2">
                        <button
                          type="button"
                          onClick={scrollToAllCategories}
                          className="text-xs text-accent font-medium hover:underline px-2"
                        >
                          + {categories.length - 8} more categories below
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              </section>
            </div>

            {/* ─── ALL CATEGORIES (accordion) ─── */}
            <section ref={allCategoriesRef} id="all-categories" className="mt-16 scroll-mt-32" aria-labelledby="all-categories-heading">
              <header className="flex items-baseline justify-between mb-8">
                <h2 id="all-categories-heading" className="font-serif text-2xl text-ink">All Categories</h2>
                <span className="text-xs text-ink-soft">{categories.length} topics</span>
              </header>
              {categories.length === 0 ? (
                <p className="text-sm text-ink-soft">No categories yet.</p>
              ) : (
                <div className="space-y-3">
                  {categories.map((cat) => (
                    <AllCategoryCard
                      key={cat}
                      name={cat}
                      count={grouped[cat]?.length ?? 0}
                      items={grouped[cat] || []}
                      topItems={topByCategory[cat] || []}
                      expanded={expandedCats.has(cat)}
                      onToggle={() => toggleCategory(cat)}
                      onOpenQuestion={handleQuestionOpen}
                      onViewAll={() => navigate(`/faq?category=${encodeURIComponent(cat)}`)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ─── TOP SOLVED TODAY · TRENDING ISSUES ─── */}
            <section className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 sm:gap-8 items-start mt-16">
              <TopSolved />
              <div className="lg:mt-14 mt-0">
                <TrendingIssues />
              </div>
            </section>

            {/* ─── FROM ZOOM MEETINGS ─── */}
            <FromMeetings />

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