/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

import Footer from '../../components/layout/Footer';
import SearchBar from '../../components/search/SearchBar';
import CategoryGrid, { categoryPills } from '../../components/faq/CategoryGrid';
import TopSolved from '../../components/community/TopSolved';
import TrendingIssues from '../../components/search/TrendingIssues';
import FromMeetings from '../../components/faq/FromMeetings';
import CTA from '../../components/ui/CTA';
import ResultItem from '../../components/search/ResultItem';
import HistoryModal from '../../components/faq/HistoryModal';
import api from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { useAuthGate } from '../../context/AuthModalContext';
import type { SearchResult, TrendingQuery } from '../../types/ui';

// Hand-drawn doodle decorations
function DoodleElements(): React.ReactNode {
  return (
    <>
      {/* Curly bracket doodle */}
      <div className="absolute -top-6 -left-16 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="50" height="100" viewBox="0 0 50 100" fill="none" style={{ opacity: 0.3 }}>
          <path d="M40 8 C26 8, 22 18, 22 28 C22 38, 16 44, 6 46 C16 48, 22 54, 22 64 C22 74, 26 84, 40 84" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

      {/* "Let's solve it!" speech bubble */}
      <div className="absolute -top-8 left-[40px] hidden lg:block" style={{ pointerEvents: 'none', transform: 'rotate(-6deg)' }}>
        <svg width="105" height="80" viewBox="0 0 105 80" fill="none" style={{ opacity: 0.32 }}>
          <ellipse cx="52" cy="28" rx="42" ry="22" stroke="var(--deco-stroke)" strokeWidth="2" strokeDasharray="6 4" fill="none"/>
          <path d="M68 46 L80 68 L62 44" stroke="var(--deco-stroke)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <text x="22" y="25" fontSize="11" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="var(--deco-stroke)" opacity="0.85">Let&apos;s</text>
          <text x="18" y="38" fontSize="11" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="var(--deco-stroke)" opacity="0.85">solve it!</text>
        </svg>
      </div>

      {/* Big sparkle */}
      <div className="absolute top-2 right-[28%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ opacity: 0.35 }}>
          <path d="M14 2 L14 26 M2 14 L26 14 M5 5 L23 23 M23 5 L5 23" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Small star */}
      <div className="absolute top-[20px] left-[16%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ opacity: 0.3 }}>
          <path d="M9 0 L9 18 M0 9 L18 9" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M3 3 L15 15 M15 3 L3 15" stroke="var(--section-icon)" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Curved arrow */}
      <div className="absolute top-[120px] -left-10 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="70" height="70" viewBox="0 0 70 70" fill="none" style={{ opacity: 0.3 }}>
          <path d="M12 8 C24 30, 36 44, 58 54" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          <path d="M48 48 L58 54 L50 60" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Lightbulb doodle */}
      <div className="absolute -top-4 -right-14 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="55" height="75" viewBox="0 0 55 75" fill="none" style={{ opacity: 0.3 }}>
          <path d="M27 12 C16 12, 10 20, 10 28 C10 36, 16 40, 20 46 L34 46 C38 40, 44 36, 44 28 C44 20, 38 12, 27 12Z" stroke="var(--section-icon)" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <line x1="20" y1="50" x2="34" y2="50" stroke="var(--section-icon)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="22" y1="54" x2="32" y2="54" stroke="var(--section-icon)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="27" y1="2" x2="27" y2="7" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="8" y1="12" x2="12" y2="16" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="46" y1="12" x2="42" y2="16" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="2" y1="28" x2="7" y2="28" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="47" y1="28" x2="52" y2="28" stroke="var(--section-icon)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Question mark doodle */}
      <div className="absolute top-[210px] -right-14 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" style={{ opacity: 0.35 }}>
          <path d="M12 16 C12 6, 28 6, 28 16 C28 24, 20 26, 20 36" stroke="var(--deco-stroke)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <circle cx="20" cy="44" r="2.5" fill="#b8a080"/>
        </svg>
      </div>

      {/* Pencil doodle */}
      <div className="absolute top-[200px] left-[-20px] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="50" height="50" viewBox="0 0 50 50" fill="none" style={{ opacity: 0.28 }}>
          <path d="M38 5 L12 32 L10 42 L20 40 L46 13 Z" stroke="var(--deco-stroke)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="30" y1="12" x2="38" y2="20" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Code brackets */}
      <div className="absolute top-[330px] right-[-12px] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="45" height="55" viewBox="0 0 45 55" fill="none" style={{ opacity: 0.28 }}>
          <path d="M16 5 L6 27 L16 49" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M29 5 L39 27 L29 49" stroke="var(--deco-stroke)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="14" y1="20" x2="31" y2="20" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="14" y1="34" x2="31" y2="34" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Wavy squiggle */}
      <div className="absolute top-[170px] right-[12%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="90" height="16" viewBox="0 0 90 16" fill="none" style={{ opacity: 0.3 }}>
          <path d="M2 8 Q12 2, 22 8 Q32 14, 42 8 Q52 2, 62 8 Q72 14, 82 8" stroke="var(--section-icon)" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
    </>
  );
}

const fallbackPopular = [
  'offer letter',
  'noc request',
  'team formation',
  'project submission',
  'certificate',
];

interface ResultItemProps {
  result: SearchResult;
  expanded: boolean;
  onToggle: () => void;
  onShowHistory: (id: string, question: string) => void;
  navigate: ReturnType<typeof import('react-router-dom').useNavigate>;
}


export default function HomePage() {
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [trending, setTrending] = useState<TrendingQuery[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [showAllPopular, setShowAllPopular] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyFaq, setHistoryFaq] = useState<{ id: string; question: string } | null>(null);
  const searchBarRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const gate = useAuthGate();

  const handleAskCommunity = gate(
    () => {
      const title = query.trim() ? encodeURIComponent(query.trim()) : '';
      navigate(`/community?ask=true${title ? `&title=${title}` : ''}`);
    },
    'Sign in to ask the community a question.'
  );

  useEffect(() => {
    let isMounted = true;
    api.get('/search/trending')
      .then((res: any) => {
        if (isMounted) setTrending(res.data.trending || []);
      })
      .catch(() => {
        if (isMounted) setTrending([]);
      })
      .finally(() => {
        if (isMounted) setTrendingLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setExpandedId(null);
  }, [results]);

  const normalizedQuery = query.trim().toLowerCase();
  const isTyping = normalizedQuery.length > 0;
  const isReadyForResults = query.trim().length >= 3;
  const showDropdown = isTyping || loading || Array.isArray(results);
  const showResultsPanel = loading || Array.isArray(results);
  const isSearchActive = showResultsPanel && isReadyForResults;

  let suggestionItems = normalizedQuery
    ? categoryPills.filter((cat: any) => cat.name.toLowerCase().includes(normalizedQuery))
    : categoryPills.slice(0, 5);
  if (normalizedQuery && suggestionItems.length === 0) {
    suggestionItems = categoryPills.slice(0, 5);
  }

  const popularItems = trending.length
    ? trending
    : fallbackPopular.map((item) => ({ query: item, count: undefined }));

  const matchingResults = Array.isArray(results) ? results : [];

  const handleQuickSearch = async (selectedQuery: string) => {
    const nextQuery = selectedQuery.trim();
    if (!nextQuery) return;

    setQuery(nextQuery);
    setExpandedId(null);
    setLoading(true);
    setResults(null);
    setSearchError(null);
    searchBarRef.current?.focus();
    window.scrollTo({ top: 200, behavior: 'smooth' });

    try {
      const res = await api.post('/search', { query: nextQuery });
      setResults(res.data.results);
    } catch (err: any) {
      if (axios.isCancel(err)) return;
      setResults([]);
      setSearchError('Search failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (categoryName: string) => {
    setActiveCategory(categoryName);
    handleQuickSearch(categoryName);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (activeCategory && value.trim().toLowerCase() !== activeCategory.toLowerCase()) {
      setActiveCategory('');
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setLoading(false);
    setSearchError(null);
    setActiveCategory('');
    setExpandedId(null);
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-8">
        {/* Hero heading */}
        <section className="relative text-center mb-8">
          <DoodleElements />

          <h1 className="font-serif text-[1.75rem] sm:text-4xl md:text-5xl lg:text-[3.2rem] leading-[1.15] tracking-tight text-ink mb-3">
            Ask. Discover. Get{' '}
            <span className="doodle-underline font-serif" style={{ fontWeight: 700 }}>Solved.</span>
            <svg className="inline-block ml-2 align-middle" width="24" height="18" viewBox="0 0 24 18" style={{ opacity: 0.18 }}>
              <path d="M2 12 Q6 4 12 9 Q18 14 22 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          </h1>

          <p className="text-sm sm:text-base text-ink-soft mb-6 sm:mb-8 max-w-lg leading-relaxed mx-auto px-2">
            Search your doubt or explore solved questions from the community.
          </p>
        </section>

        {/* Backdrop blur overlay when search is active */}
        {showDropdown && (
          <div
            className="search-overlay"
            onClick={handleClear}
            aria-hidden="true"
          />
        )}

        {/* Search + Categories */}
        <section className="relative mb-10 sm:mb-12">
          <div className={`relative max-w-3xl mx-auto ${showDropdown ? 'z-40' : 'z-20'}`}>
            <SearchBar
              ref={searchBarRef}
              value={query}
              onQueryChange={handleQueryChange}
              onResults={setResults}
              onLoading={setLoading}
              onError={setSearchError}
              disableSuggestions={true}
            />

            {showDropdown && (
              <div className="absolute left-0 right-0 top-full mt-3 z-40 animate-fade-in">
                <div className="search-panel">
                  <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] mb-1">
                        <button
                          onClick={handleClear}
                          className="hover:text-ink transition-colors flex items-center gap-1"
                        >
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 2L3 6L9 10" />
                          </svg>
                          Home
                        </button>
                        <span>›</span>
                        <span className="font-medium text-ink-faint">
                          {showResultsPanel
                            ? `Results for "${query}"`
                            : `Suggestions for "${query}"`}
                        </span>
                      </div>
                      {!isTyping && (
                        <p className="text-sm text-ink mt-0.5">
                          Results for <span className="font-semibold text-ink">"{query}"</span>
                        </p>
                      )}
                    </div>
                    {isTyping && (
                      <button
                        onClick={handleClear}
                        className="text-xs font-medium text-ink-soft hover:transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[1.35fr_0.95fr]">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
                          Matching questions
                        </p>
                        {showResultsPanel && (
                          <span className="text-xs text-ink-faint">
                            {matchingResults.length} found
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {loading && (
                          [1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="h-[86px] rounded-2xl search-skeleton animate-pulse"
                            />
                          ))
                        )}

                        {!loading && matchingResults.length > 0 && matchingResults.map((result, idx) => {
                          const resultKey = result._id || `${result.source || 'result'}-${idx}`;
                          const isExpanded = expandedId === resultKey;
                          return (
                            <ResultItem
                              key={resultKey}
                              result={result}
                              expanded={isExpanded}
                              onToggle={() => setExpandedId(isExpanded ? null : resultKey)}
                              onShowHistory={(id: string, question: string) => setHistoryFaq({ id, question })}
                              navigate={navigate}
                            />
                          );
                        })}

                        {searchError && (
                          <div className="rounded-2xl bg-danger-light border border-danger/15 p-4 text-xs text-danger">
                            {searchError}
                          </div>
                        )}

                        {!loading && !searchError && matchingResults.length === 0 && isReadyForResults && (
                          <div className="rounded-2xl border border-dashed border-border bg-transparent p-4">
                            <p className="text-xs text-ink-soft">
                              No matches found. Try a different phrase.
                            </p>
                          </div>
                        )}
                      </div>

                      <div 
                        onClick={handleAskCommunity}
                        className="mt-4 px-4 py-3 rounded-lg flex gap-3 items-start cursor-pointer transition-all duration-200 ask-community-container border group"
                      >
                        <svg className="w-5 h-5 opacity-70 shrink-0 mt-0.5 ask-community-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                        </svg>
                        <div className="flex flex-col gap-0.5">
                          <p className="font-medium text-sm ask-community-title">Need help from real people?</p>
                          <p className="font-medium text-[13px] flex items-center ask-community-action">
                            Ask in community 
                            <svg className="w-3.5 h-3.5 ml-1 transition-transform duration-200 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
                          Suggestions
                        </p>
                        <div className="mt-2 space-y-1">
                          {suggestionItems.map((cat: any) => (
                            <button
                              key={cat.name}
                              onClick={() => handleQuickSearch(cat.name)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl border border-border/60 bg-transparent text-left transition-colors search-list-item"
                            >
                              <span className="opacity-40 group-hover:opacity-100 transition-opacity">{cat.icon}</span>
                              <span className="text-sm text-ink">{cat.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
                          Popular searches
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {!trendingLoading && (
                            [1, 2, 3].map((i) => (
                              <div key={i} className="h-8 w-24 rounded-full search-skeleton animate-pulse" />
                            ))
                          )}

                          {!trendingLoading && (showAllPopular ? popularItems : popularItems.slice(0, 5)).map((item) => (
                            <button
                              key={item.query}
                              onClick={() => handleQuickSearch(item.query)}
                              className="search-popular-pill"
                            >
                              <svg className="search-popular-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M6 3.5V6L8 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                              </svg>
                              <span className="capitalize whitespace-nowrap">{item.query}</span>
                              {item.count !== undefined && (
                                <span className="search-popular-badge">{item.count}</span>
                              )}
                            </button>
                          ))}

                          {!trendingLoading && popularItems.length > 5 && (
                            <button
                              onClick={() => setShowAllPopular(!showAllPopular)}
                              className="text-[11px] font-semibold text-accent hover:underline px-2 py-1.5"
                            >
                              {showAllPopular ? 'Show less' : 'View more'}
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={`mt-5 sm:mt-6 transition-all duration-300 ${
            showDropdown ? 'opacity-70 translate-y-1' : 'opacity-100'
          }`}>
            <CategoryGrid
              activeCategory={activeCategory}
              onSelect={handleCategorySelect}
            />
          </div>
        </section>

        {/* Top Solved + Trending Issues Row */}
        {!isSearchActive && (
          <section className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 sm:gap-8 items-start">
            <TopSolved />
            <div className="lg:mt-14 mt-0">
              <TrendingIssues />
            </div>
          </section>
        )}

        {/* From Zoom Meetings — the project's actual goal, surfaced for interns */}
        {!isSearchActive && <FromMeetings />}

        {/* CTA */}
        {!isSearchActive && <CTA />}

        {/* Footer */}
        <Footer />
      </main>

      {historyFaq && (
        <HistoryModal
          faqId={historyFaq.id}
          faqQuestion={historyFaq.question}
          onClose={() => setHistoryFaq(null)}
        />
      )}
    </div>
  );
}