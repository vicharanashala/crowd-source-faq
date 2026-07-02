import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SearchBar from './SearchBar';
import { categoryPills } from '../faq/CategoryGrid';
import ResultItem from './ResultItem';
import HistoryModal from '../faq/HistoryModal';
import api from '../../utils/api';
import { useAuthGate } from '../../context/AuthModalContext';
import { useBatch } from '../../context/BatchContext';
import { useCategoryClusters } from '../explore/usePublicFaqApi';
import type { SearchResult, TrendingQuery } from '../../types/ui';

interface InteractiveSearchOverlayProps {
  onSearchComplete?: (query: string) => void;
  variant?: 'default' | 'compact';
}

const fallbackPopular = [
  'offer letter',
  'noc request',
  'team formation',
  'project submission',
  'certificate',
];

export default function InteractiveSearchOverlay({ onSearchComplete, variant = 'default' }: InteractiveSearchOverlayProps) {
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
  // v1.70 — Dynamic Categories: pull the per-program AI-named
  // clusters for the suggestion pills. We fall back to the
  // hardcoded `categoryPills` export (kept around for the
  // pre-24h-refresh window and the offline / API-down case)
  // until the hook returns data. The 24h backend cron (see
  // utils/ai/categoryClusterer.ts) keeps the response fresh.
  const { currentBatch } = useBatch();
  const activeBatchId = currentBatch?._id ?? null;
  const { data: clustersData } = useCategoryClusters(activeBatchId, 5);
  const dynamicPills = useMemo(() => {
    const cs = clustersData?.clusters ?? [];
    return cs.map((c) => ({ name: c.canonicalName, icon: null as React.ReactNode }));
  }, [clustersData]);
  const pillsToShow = dynamicPills.length > 0 ? dynamicPills : categoryPills;

  const handleAskCommunity = gate(
    () => {
      const title = query.trim() ? encodeURIComponent(query.trim()) : '';
      navigate(`/community?ask=true${title ? `&title=${title}` : ''}`);
    },
    'Sign in to ask the community a question.'
  );

  // H42: re-fetch when activeBatchId changes so switching program
  // refreshes trending queries. Also send `batchId` as a query param
  // so the backend can scope the response per program.
  useEffect(() => {
    let isMounted = true;
    setTrendingLoading(true);
    api.get('/search/trending', { params: { batchId: activeBatchId } })
      .then((res) => {
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
  }, [activeBatchId]);

  useEffect(() => {
    setExpandedId(null);
  }, [results]);

  const normalizedQuery = query.trim().toLowerCase();
  const isTyping = normalizedQuery.length > 0;
  const isReadyForResults = query.trim().length >= 2;
  const showDropdown = isTyping || loading || Array.isArray(results);
  const showResultsPanel = loading || Array.isArray(results);

  let suggestionItems = normalizedQuery
    ? pillsToShow.filter((cat) => cat.name.toLowerCase().includes(normalizedQuery))
    : pillsToShow.slice(0, 5);
  if (normalizedQuery && suggestionItems.length === 0) {
    suggestionItems = pillsToShow.slice(0, 5);
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
    onSearchComplete?.(nextQuery);

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

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (activeCategory && value.trim().toLowerCase() !== activeCategory.toLowerCase()) {
      setActiveCategory('');
    }
    onSearchComplete?.(value);
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setLoading(false);
    setSearchError(null);
    setActiveCategory('');
    setExpandedId(null);
    onSearchComplete?.('');
  };

  return (
    <div className={`relative w-full ${showDropdown ? 'z-40' : 'z-20'}`}>
      {showDropdown && (
        <div
          className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-30 transition-opacity duration-300"
          onClick={handleClear}
          aria-hidden="true"
        />
      )}
      
      <div className={`relative z-40 w-full ${variant === 'default' ? 'max-w-3xl mx-auto' : ''}`}>
        <SearchBar
          ref={searchBarRef}
          value={query}
          onQueryChange={handleQueryChange}
          onResults={setResults}
          onLoading={setLoading}
          onError={setSearchError}
          disableSuggestions={true}
          variant={variant}
        />

        {showDropdown && (
          <div className={`absolute ${variant === 'compact' ? 'right-0 w-[480px] lg:w-[600px] max-w-[100vw]' : 'left-0 right-0 max-w-3xl'} top-full mt-3 z-50 animate-fade-in text-left`}>
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

                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
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
                          onShowHistory={(id, question) => setHistoryFaq({ id, question })}
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
                      {suggestionItems.map((cat) => (
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
                      {/* H41: skeletons should appear WHILE loading, not when done.
                          Original `!trendingLoading &&` made them invisible during
                          the actual load. */}
                      {trendingLoading && (
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
