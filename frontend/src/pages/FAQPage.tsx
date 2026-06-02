import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import SearchBar from '../components/ui/SearchBar';
import { FAQDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
import type { TrendingQuery } from '../types/ui';

// Modular components
import {
  FAQItem,
  getCategoryIcon,
  getCategoryDescription,
  formatCategoryName,
  getCategoryTone,
  IconGrid,
  getQuestionTitle,
} from '../components/faq/faqUtils';
import SearchDropdown from '../components/faq/SearchDropdown';
import SearchFeedback from '../components/faq/SearchFeedback';
import CategoryGrid from '../components/faq/CategoryGrid';
import QuestionList from '../components/faq/QuestionList';
import QuestionDetail from '../components/faq/QuestionDetail';

// Sub-component props interfaces
interface CategoryPillsProps {
  categories: string[];
  activeCategory: string;
  onSelect: (name: string) => void;
}

// Sub-components
function CategoryPills({ categories, activeCategory, onSelect }: CategoryPillsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: number) => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollBy({ left: direction * 240, behavior: 'smooth' });
  };

  const allActive = !activeCategory;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
          Browse categories
        </p>
        <span className="text-xs text-ink-soft">{categories.length} categories</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleScroll(-1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-white/90 shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories left"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          ref={scrollerRef}
          className="flex-1 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
        >
          <button
            onClick={() => onSelect('')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
              ${allActive
                ? 'bg-ink text-white border-ink'
                : 'bg-white/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
              }`}
          >
            <span className={allActive ? 'text-white' : 'text-ink-faint'}>
              <IconGrid />
            </span>
            All
          </button>

          {categories.map((name) => {
            const isActive = activeCategory?.toLowerCase() === name.toLowerCase();
            const tone = getCategoryTone(name);
            return (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
                  ${isActive
                    ? 'bg-accent text-white border-accent/60 shadow-[0_10px_26px_rgba(90,122,90,0.25)]'
                    : 'bg-white/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
                  }`}
              >
                <span className={isActive ? 'text-white' : tone.accent}>
                  {getCategoryIcon(name)}
                </span>
                {formatCategoryName(name)}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => handleScroll(1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-white/90 shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories right"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}



export default function FAQPage() {
  const [grouped, setGrouped] = useState<Record<string, FAQItem[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<FAQItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FAQItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortOption, setSortOption] = useState('relevant');
  const [visibleCount, setVisibleCount] = useState(8);
  const searchBarRef = useRef<HTMLInputElement>(null);
  const [trendingWords, setTrendingWords] = useState<TrendingQuery[]>([]);

  const [resultFaqId, setResultFaqId] = useState<string | undefined>(undefined);
  const { id: urlFaqId } = useParams<string>();
  const navigate = useNavigate();

  // Scroll to top when a question detail is opened
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Track top result FAQ ID when search results arrive
  useEffect(() => {
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      setResultFaqId((searchResults[0] as FAQItem)._id);
    }
  }, [searchResults]);

  useEffect(() => {
    api.get('/faq')
      .then((res) => {
        setGrouped(res.data.grouped || {});
        setTotal(res.data.total || 0);
      })
      .catch((err: unknown) => {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs. Please try again.';
        setError(message);
      })
      .finally(() => setLoading(false));

    // Fetch trending queries for the word cloud
    api.get('/search/trending')
      .then((res) => setTrendingWords((res.data.trending || []).map((t: { query: string; count: number }) => ({ query: t.query, count: t.count }))))
      .catch((err: unknown) => {
        console.error('Failed to load trending queries:', err);
      });
  }, []);

  const categories = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const flatQuestions = useMemo(() => (
    categories.flatMap((name) => (grouped[name] || []).map((item) => ({
      ...item,
      category: item.category || name,
      source: item.source || 'faq',
    })))
  ), [categories, grouped]);

  useEffect(() => {
    // Check for pre-selected FAQ from HomePage search navigation
    // Guard: only run once grouped data is actually available (race condition fix)
    if (!grouped || Object.keys(grouped).length === 0) return;

    const highlightStr = sessionStorage.getItem('yaksha_faq_highlight');
    if (highlightStr) {
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
    }
  }, [grouped]);

  // If user landed on /faq/:id directly, open that FAQ immediately
  useEffect(() => {
    if (!urlFaqId || !grouped || Object.keys(grouped).length === 0) return;
    // Search all categories for the FAQ with this ID
    for (const [cat, items] of Object.entries(grouped)) {
      const found = items.find((item) => item._id === urlFaqId);
      if (found) {
        setActiveQuestion({ ...found, category: cat });
        setActiveCategory(cat);
        return;
      }
    }
  }, [urlFaqId, grouped]);

  useEffect(() => {
    setVisibleCount(8);
  }, [activeCategory, searchResults, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults(null);
      setSearchLoading(false);
    }
  }, [searchQuery]);

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

  const handleWordClick = (wordQuery: string) => {
    setSearchQuery(wordQuery);
    setActiveCategory('');
    setActiveQuestion(null);
    runSearch(wordQuery);
  };

  const handleCategoryOpen = (name: string) => {
    // Use functional update to batch all state changes in one render cycle,
    // preventing intermediate render flashes (e.g. activeQuestion=null briefly visible)
    setActiveCategory(name);
    setActiveQuestion(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
    setVisibleCount(8);
  };

  const handleQuestionOpen = (item: FAQItem) => {
    setActiveQuestion(item);
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleBackToCategories = () => {
    setActiveCategory('');
    setActiveQuestion(null);
  };

  const handleBackFromDetail = () => {
    // Detect whether the user came from the homepage via a highlighted card
    // (clicked from "Solved Recently" or similar on the HomePage).
    // If so, navigate back to '/' instead of relying on browser history.
    const fromHomepage = !!sessionStorage.getItem('yaksha_faq_highlight');
    sessionStorage.removeItem('yaksha_faq_highlight');

    if (fromHomepage) {
      navigate('/');
      return;
    }
    // Otherwise just close the detail panel — the conditional rendering
    // will show the correct prior state (search results or category list)
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

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <FAQDoodles />
      <Navbar />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-10 relative z-10">
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-serif text-ink tracking-tight">
            Intern FAQs — solved
          </h1>
          {total > 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              {total} questions across {categories.length} categories
            </p>
          )}
        </div>

        {/* Backdrop blur overlay when search is active */}
        {showDropdown && (
          <div
            className="fixed inset-0 z-30 bg-ink/20 backdrop-blur-sm transition-opacity duration-300"
            onClick={handleClearSearch}
            aria-hidden="true"
          />
        )}

        <section className="relative mb-10 sm:mb-12">
          <div className={`relative max-w-3xl mx-auto ${showDropdown ? 'z-40' : 'z-20'}`}>
            <SearchBar
              ref={searchBarRef}
              value={searchQuery}
              onQueryChange={handleSearchChange}
              onResults={(res) => setSearchResults(res as unknown as FAQItem[])}
              onLoading={setSearchLoading}
              onError={(err) => setError(err || '')}
              placeholder="Search for topics, keywords, or questions..."
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

          <div className={`mt-5 sm:mt-6 transition-all duration-300 ${
            showDropdown ? 'opacity-70 translate-y-1' : 'opacity-100'
          }`}>
            <CategoryPills
              categories={categories}
              activeCategory={activeCategory}
              onSelect={handleCategoryOpen}
            />
          </div>

          {/* Trending searches — top 10 queries from search logs (noise filtered) */}
          {trendingWords.length > 0 && !showDropdown && !activeCategory && !activeQuestion && !searchActive && (() => {
            // Filter out noise: very short queries, 1-word queries with low count,
            // and queries that are obviously test/junk (e.g. "test", "meow")
            const NOISE = new Set(['test', 'meow', 'awdawd', 'a', 'asdf', 'qwerty', 'hi', 'hello', 'hey']);
            const cleaned = trendingWords
              .filter((w) => {
                const q = w.query.trim().toLowerCase();
                if (NOISE.has(q)) return false;
                if (q.length < 4) return false;
                if (w.count < 2) return false;
                return true;
              })
              .slice(0, 10);
            if (cleaned.length === 0) return null;
            return (
              <div className="mt-5 transition-all duration-300">
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Trending searches</p>
                <div className="bg-card/60 rounded-2xl border border-border/50 shadow-subtle p-4">
                  <div className="flex flex-wrap gap-2">
                    {cleaned.map((word, i) => (
                      <button
                        key={word.query + i}
                        onClick={() => handleWordClick(word.query)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 border border-border/70 text-xs font-medium text-ink hover:bg-accent hover:text-white hover:border-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-subtle"
                      >
                        <span className="text-ink-faint font-semibold text-[10px]">#{i + 1}</span>
                        {word.query}
                        <span className="text-ink-faint text-[10px]">({word.count})</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </section>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[220px] rounded-2xl border border-border bg-white/70 animate-pulse" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl bg-danger-light border border-danger/15 p-6 text-center space-y-3">
            <p className="text-sm text-danger font-medium">{error}</p>
            <button
              onClick={() => { setError(''); setLoading(true); api.get('/faq').then(res => { setGrouped(res.data.grouped || {}); setTotal(res.data.total || 0); }).catch((err: unknown) => { const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs.'; setError(m); }).finally(() => setLoading(false)); }}
              className="px-5 py-2 text-sm font-medium bg-danger text-white rounded-full hover:bg-danger/90 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

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

        {!loading && !error && !activeQuestion && searchActive && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Search results</p>
                <h2 className="text-lg font-semibold text-ink">Results for "{searchQuery}"</h2>
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
              onSelect={handleQuestionOpen}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No results yet. Try another keyword or browse a category."
            />
          </section>
        )}

        {!loading && !error && !activeQuestion && !searchActive && activeCategory && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <button
                  onClick={handleBackToCategories}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back to categories
                </button>
                <h2 className="mt-3 text-xl font-semibold text-ink flex items-center gap-2">
                  <span className="w-9 h-9 rounded-xl bg-mist flex items-center justify-center text-ink-faint">
                    {getCategoryIcon(activeCategory)}
                  </span>
                  {formatCategoryName(activeCategory)}
                </h2>
                {activeCategoryMeta && (
                  <p className="mt-2 text-sm text-ink-soft max-w-2xl">
                    {activeCategoryMeta}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <span>{activeCategoryItems.length} questions</span>
              </div>
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
              onSelect={handleQuestionOpen}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No questions in this category yet."
            />
          </section>
        )}

        {!loading && !error && !activeQuestion && !searchActive && !activeCategory && (
          <CategoryGrid
            categories={categories}
            grouped={grouped}
            onOpen={handleCategoryOpen}
          />
        )}
      </main>

      <Footer />

      {searchActive && (
        <SearchFeedback searchQuery={searchQuery} resultFaqId={resultFaqId} />
      )}
    </div>
  );
}