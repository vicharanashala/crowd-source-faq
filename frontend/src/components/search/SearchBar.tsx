import React, { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../../utils/api';
import { getQueryExpansions } from '../../utils/queryExpander';
import type { SearchResult } from '../../types/ui';
import { useBatch } from '../../context/BatchContext';

interface Suggestion {
  _id: string;
  question: string;
  category: string;
}

interface SearchBarProps {
  onResults: (results: SearchResult[] | null) => void;
  onLoading: (loading: boolean) => void;
  onError?: (error: string | null) => void;
  value?: string;
  onQueryChange?: (value: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  disableSuggestions?: boolean;
}

const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  {
    onResults,
    onLoading,
    onError,
    value,
    onQueryChange,
    placeholder = 'Ask anything about your internship...',
    onFocus,
    onBlur,
    className = '',
    disableSuggestions = false,
  },
  ref
) {
  const { currentBatch } = useBatch();
  const batchId = currentBatch?._id ?? null;
  const navigate = useNavigate();
  const [internalQuery, setInternalQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [queryExpansions, setQueryExpansions] = useState<string[]>([]);
  const isControlled = value !== undefined;
  const query = isControlled ? (value ?? '') : internalQuery;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      onResults(null);
      onError?.(null);
      return;
    }

    onLoading(true);
    onError?.(null);
    try {
      const res = await api.post<{ results: SearchResult[] }>('/search', {
        query: searchQuery.trim(),
        batchId: batchId || undefined,
      });
      onResults(res.data.results ?? null);
    } catch (err: any) {
      if (axios.isCancel(err)) {
        return; // Ignore cancelled requests
      }
      onResults([]);
      onError?.('Search failed. Please check your connection and try again.');
    } finally {
      onLoading(false);
    }
  };

  const fetchSuggestions = async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const res = await api.get<{ suggestions: Suggestion[] }>(`/search/suggest?q=${encodeURIComponent(q.trim())}`);
      setSuggestions(res.data.suggestions ?? []);
      setShowSuggestions(true);
    } catch {
      setSuggestions([]);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (isControlled) {
      onQueryChange?.(val);
    } else {
      setInternalQuery(val);
    }

    // Update query expansions for UI display
    const expansions = getQueryExpansions(val);
    setQueryExpansions(expansions);

    // Suggestion debounce (300ms)
    if (!disableSuggestions) {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
      suggestDebounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
    }

    // Search debounce (600ms)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 3) {
      debounceRef.current = setTimeout(() => {
        setShowSuggestions(false);
        handleSearch(val);
      }, 600);
    } else {
      // Keep showing suggestions/result dropdown while user is typing
      // Only clear results when query goes below 3 chars
      onResults(null);
      onError?.(null);
      if (!disableSuggestions) {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowSuggestions(false);
    handleSearch(query);
  };

  const handleSuggestionClick = async (faqId: string) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setSuggestionError(null);
    try {
      const res = await api.get<{ _id: string; question: string; answer: string; category: string }>(`/faq/${faqId}`);
      sessionStorage.setItem('yaksha_faq_highlight', JSON.stringify(res.data));
    } catch {
      setSuggestionError('Could not load FAQ. Navigating anyway.');
    }
    navigate(`/faq/${faqId}`);
  };

  // Close suggestions on outside click
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.();
    // Delay so click on suggestion registers first
    setTimeout(() => {
      if (wrapperRef.current && !wrapperRef.current.contains(document.activeElement)) {
        setShowSuggestions(false);
      }
    }, 200);
  };

  return (
    <form onSubmit={handleSubmit} className={`w-full max-w-3xl mx-auto ${className}`}>
      <div ref={wrapperRef} className="relative search-glow rounded-[26px] transition-all duration-300">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>

        <input
          ref={ref}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (debounceRef.current) clearTimeout(debounceRef.current);
              setShowSuggestions(false);
              handleSearch(query);
            }
          }}
          onFocus={onFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full pl-12 pr-32 py-5 sm:py-[22px] rounded-[26px] border border-border bg-card text-sm sm:text-base text-ink placeholder-ink-faint focus:outline-none focus:border-accent focus:bg-card transition-all duration-300 shadow-[0_14px_34px_rgba(31,41,51,0.07)]"
          autoComplete="off"
        />

        <button
          type="submit"
          disabled={!query.trim()}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 btn-base btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="5.5" cy="5.5" r="4"/>
            <path d="M9.5 9.5L12.5 12.5"/>
          </svg>
          Search
        </button>

        {/* Suggestions dropdown */}
        {!disableSuggestions && showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl border border-border/60 bg-card shadow-subtle z-50 overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s._id}
                type="button"
                onMouseDown={() => handleSuggestionClick(s._id)}
                className="w-full text-left px-5 py-3.5 text-sm text-ink hover:bg-cream/60 transition-colors duration-150 border-b border-border/30 last:border-0 flex items-center gap-3"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-accent shrink-0">
                  <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="line-clamp-1 text-ink">{s.question}</span>
                <span className="ml-auto text-xs text-ink-faint  shrink-0">{s.category}</span>
              </button>
            ))}
          </div>
        )}

        {/* Query Expansion Hints */}
        {queryExpansions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 px-4 py-3 rounded-2xl border border-accent/20 bg-accent-light shadow-subtle z-40">
            <p className="text-xs font-semibold text-accent/80 mb-2 uppercase tracking-wide">🔍 Searching also for:</p>
            <div className="flex flex-wrap gap-2">
              {queryExpansions.map((expansion, idx) => (
                <span key={idx} className="inline-block px-2.5 py-1 bg-white/50 text-accent text-xs rounded-full border border-accent/20">
                  {expansion}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Suggestion click error */}
        {suggestionError && (
          <div className="absolute top-full left-0 right-0 mt-2 px-4 py-2 bg-danger-light border border-danger/20 rounded-xl text-xs text-danger">
            {suggestionError}
          </div>
        )}
      </div>
    </form>
  );
});

export default SearchBar;