// FAQ Page — A cards-based layout showing FAQ categories and a powerful search.
// Designed specifically for interns who are looking for answers desperately and need them fast.
//
// Layout states:
// 1. DETAIL STATE     → shows the clicked FAQ detail view.
// 2. SEARCH ACTIVE     → shows the list of search results.
// 3. CATEGORY ACTIVE   → shows the filtered category questions list.
// 4. DEFAULT STATE     → shows a grid of category-wise FAQ cards showing top questions.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import UserActiveProgramIndicator from '../components/layout/UserActiveProgramIndicator';
import SearchBar from '../components/search/SearchBar';
import { HomeDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
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
  applyQuestionNumbers,
} from '../components/faq/faqUtils';
import SearchDropdown from '../components/faq/SearchDropdown';
import SearchFeedback from '../components/faq/SearchFeedback';
import QuestionList from '../components/faq/QuestionList';
import QuestionDetail from '../components/faq/QuestionDetail';
import CTA from '../components/ui/CTA';
import CategoryQuizDialog from '../components/faq/CategoryQuizDialog';

// ═══════════════════════════════════════════════════════════════════════════
//  Main page
// ═══════════════════════════════════════════════════════════════════════════
export default function FAQPage() {
  const { currentBatch } = useBatch();
  const batchId = currentBatch?._id ?? null;

  // ── Core data ────────────────────────────────────────────────────────────
  const [grouped, setGrouped] = useState<Record<string, FAQItem[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<FAQItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FAQItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortOption, setSortOption] = useState('relevant');
  const [visibleCount, setVisibleCount] = useState(8);
  const [clarifications, setClarifications] = useState<string[]>([]);
  const [quizCategory, setQuizCategory] = useState<string | null>(null);

  const searchBarRef = useRef<HTMLInputElement>(null);
  const [resultFaqId, setResultFaqId] = useState<string | undefined>(undefined);
  const { id: urlFaqId } = useParams<string>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ── M8: Guard against missing batchId (no program selected) ────
  const noProgramSelected = !batchId;

  // ── Fetch all FAQs when batchId changes ─────────────────────────
  useEffect(() => {
    if (!batchId) return;
    let mounted = true;
    setLoading(true);

    // /api/faq — full grouped list
    api.get('/faq', { params: { batchId } })
      .then((res) => {
        if (!mounted) return;
        setGrouped(applyQuestionNumbers(res.data.grouped || {}));
        setTotal(res.data.total || 0);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs. Please try again.';
        setError(message);
      })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, [batchId]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const categories = useMemo(() => Object.keys(grouped).sort((a, b) => {
    // Order by the dynamic categoryNumber assigned in applyQuestionNumbers
    // so the 1, 2, 3… labels stay in sync with display order.
    const an = grouped[a]?.[0]?.categoryNumber ?? 0;
    const bn = grouped[b]?.[0]?.categoryNumber ?? 0;
    return an - bn;
  }), [grouped]);

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
      .catch(() => { /* FAQ not found */ });
  }, [urlFaqId, grouped]);

  // Pre-selected FAQ highlight signal
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

  // ── Deep-link to a category via ?category=... (from the home page) ───────
  useEffect(() => {
    if (!grouped || Object.keys(grouped).length === 0) return;
    const cat = searchParams.get('category');
    if (!cat) return;
    if (grouped[cat]) {
      setActiveCategory(cat);
      setActiveQuestion(null);
    }
    // Consume the param so "back to all categories" works normally afterward.
    setSearchParams((prev) => {
      prev.delete('category');
      return prev;
    }, { replace: true });
  }, [grouped, searchParams, setSearchParams]);

  // ── L5: Sync search state from URL on back/forward navigation ───
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlSearch = params.get('search') ?? '';
      setSearchQuery(urlSearch);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
  // v2 — Show the glassmorphic dropdown as soon as the user types a single
  // character. The dropdown's left column shows live results from the same
  // `searchResults` array that the in-page section consumes below, so the
  // two views cannot disagree on counts.
  const showDropdown = searchQuery.trim().length > 0;

  // v2 — Dropdown now ONLY shows API search results, which stream live as
  // the user types. The right column stays as the always-live category
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
      // v2 — Do NOT clear searchResults on every keystroke. The SearchBar
      // streams new results every 300ms; wiping on every input causes a
      // visible flicker between "5 results" and "0 results" while the user
      // types. We let the SearchBar's debounced handleSearch() overwrite
      // searchResults naturally; if the user goes below 3 chars, the
      // SearchBar explicitly clears via onResults(null).
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
    setClarifications([]);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <HomeDoodles />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-[112px] sm:pt-[128px] pb-10 relative z-10">
        {/* Active program pill */}
        <div className="flex justify-center">
          <UserActiveProgramIndicator />
        </div>

        {/* ─── TITLE BANNER ───────────────────────────────────────────── */}
        <section className="text-center pt-3 pb-2 relative">
          <h1 className="font-serif text-3xl sm:text-4xl leading-tight text-ink mt-3">
            Intern FAQs — <span className="text-accent font-serif" style={{ fontWeight: 700 }}>solved</span>
          </h1>
          <p className="text-sm text-ink-soft mt-3 max-w-xl mx-auto">
            Find immediate answers to your program, certificate, and internship doubts.
          </p>
          {!loading && !error && total > 0 && (
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-ink-faint mt-2.5">
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
              onClarifications={setClarifications}
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

        {/* ─── CATEGORY FILTER PILLS ─────────────────────────────────── */}
        {!loading && !error && !activeQuestion && !searchActive && categories.length > 0 && (
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
            {categories.map((cat) => {
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
                  {grouped[cat]?.[0]?.categoryNumber ? `${grouped[cat][0].categoryNumber}. ` : ''}{formatCategoryName(cat)} · {count}
                </button>
              );
            })}
          </nav>
        )}

        {/* ─── LOADING / ERROR STATES ──────────────────────────────── */}
        {loading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 mt-10">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[200px] rounded-2xl border border-border bg-card/70 animate-pulse" />
            ))}
          </div>
        )}

        {/* ─── NO PROGRAM SELECTED (M8 guard) ──────────────────────── */}
        {noProgramSelected && !loading && (
          <div className="mt-8 rounded-2xl bg-mist border border-border/50 p-8 text-center space-y-3">
            <p className="text-sm font-medium text-ink">No program selected.</p>
            <p className="text-xs text-ink-soft">Select a program above to browse FAQs relevant to your internship.</p>
          </div>
        )}

        {error && !loading && (
          <div className="mt-8 rounded-2xl bg-danger-light border border-danger/15 p-6 text-center space-y-3">
            <p className="text-sm text-danger font-medium">{error}</p>
            <button
              onClick={() => { setError(''); setLoading(true); api.get('/faq').then(res => { setGrouped(applyQuestionNumbers(res.data.grouped || {})); setTotal(res.data.total || 0); }).catch((err: unknown) => { const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs.'; setError(m); }).finally(() => setLoading(false)); }}
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

        {/* ─── SEARCH RESULTS ─────────────────────────────────────────
            v2 — Uses the same `.search-panel` glassmorphic class as the
            search dropdown above, so the two views feel like one component
            family. This section appears once results exist and the dropdown
            is dismissed (focus lost / user scrolled / Enter). It does NOT
            hide the hero or category cards — those stay visible so the
            user keeps their navigation scaffold.
        */}
        {!loading && !error && !activeQuestion && searchActive && (
          <section className="max-w-4xl mx-auto mt-6 search-panel p-6">
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
            {searchResults && searchResults.length === 0 && !searchLoading && clarifications.length > 0 && (
              <div className="mt-6 p-5 rounded-2xl border border-accent/15 bg-accent-light/30 max-w-xl">
                <p className="text-xs font-bold text-accent uppercase tracking-wider">Did you mean?</p>
                <div className="mt-3 space-y-2">
                  {clarifications.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        handleSearchChange(c);
                        if (searchBarRef.current) {
                          searchBarRef.current.value = c;
                        }
                      }}
                      className="block text-left text-sm text-ink hover:text-accent font-semibold transition-colors flex items-center gap-2 group"
                    >
                      <span className="text-base group-hover:scale-110 transition-transform">💡</span> {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ─── FILTERED CATEGORY VIEW ───────────────────────────────── */}
        {!loading && !error && !activeQuestion && !searchActive && activeCategory && (
          <section className="max-w-4xl mx-auto mt-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 border-b border-border/40 pb-5">
              <div>
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
                  {activeCategoryItems[0]?.categoryNumber ? `${activeCategoryItems[0].categoryNumber}. ` : ''}{formatCategoryName(activeCategory)}
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

              <button
                type="button"
                onClick={() => setQuizCategory(activeCategory)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-accent hover:bg-accent-hover text-accent-text text-xs font-bold transition-all shadow-md self-start md:self-center"
              >
                <span>📝</span> Practice Category Quiz
              </button>
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

        {/* ─── DEFAULT STATE: CATEGORY-WISE CARDS GRID ──────────────── */}
        {!loading && !error && !activeQuestion && !searchActive && !activeCategory && (
          <section className="max-w-6xl mx-auto mt-10">
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => {
                const items = grouped[cat] || [];
                const count = items.length;
                const topQuestions = items.slice(0, 3);
                const tone = getCategoryTone(cat);

                return (
                  <div
                    key={cat}
                    onClick={() => handleCategoryOpen(cat)}
                    className="group bg-card rounded-2xl border border-border/60 shadow-subtle p-5 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-accent/30 transition-all duration-300 ease-smooth cursor-pointer text-left flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-4">
                        <span className={`w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center transition-colors group-hover:bg-accent/15 ${tone.accent}`}>
                          {getCategoryIcon(cat)}
                        </span>
                        <span className="text-[10px] font-medium text-ink-soft bg-mist px-2.5 py-1 rounded-full">
                          {count} {count === 1 ? 'question' : 'questions'}
                        </span>
                      </div>

                      {/* Card Title */}
                      <h3 className="text-base font-semibold text-ink leading-snug mb-4 line-clamp-2 group-hover:text-accent transition-colors duration-200">
                        {items[0]?.categoryNumber ? `${items[0].categoryNumber}. ` : ''}{formatCategoryName(cat)}
                      </h3>

                      {/* Top Questions List */}
                      {topQuestions.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider mb-2">
                            Top questions
                          </p>
                          <ul className="space-y-2.5">
                            {topQuestions.map((item, idx) => (
                              <li
                                key={item._id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuestionOpen(item);
                                }}
                                className="text-xs text-ink-soft hover:text-accent flex gap-1.5 leading-snug transition-colors duration-200"
                              >
                                <span className="text-ink-faint shrink-0 tabular-nums">
                                  {item.questionNumber ? `${item.questionNumber}` : `${idx + 1}.`}
                                </span>
                                <span className="truncate">
                                  {getQuestionTitle(item)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Card Footer Link */}
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-accent pt-4 border-t border-border/40 mt-4">
                      <span>Explore all</span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-transform duration-300 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CTA bottom section */}
            <div className="mt-14">
              <CTA />
            </div>
          </section>
        )}
      </main>

      <Footer />

      {searchActive && searchResults && searchResults.length > 0 && (
        <SearchFeedback searchQuery={searchQuery} resultFaqId={resultFaqId} />
      )}

      {quizCategory && (
        <CategoryQuizDialog
          category={quizCategory}
          onClose={() => setQuizCategory(null)}
        />
      )}
    </div>
  );
}