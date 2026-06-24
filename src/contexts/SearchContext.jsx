/**
 * SearchContext.jsx — Search state management
 * 
 * Provides search functionality with analytics logging.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { searchQuestions } from '../data/faqData';
import { useAuth } from '../auth/AuthContext';
import * as searchService from '../services/searchService';
import * as analyticsService from '../services/analyticsService';

const SearchContext = createContext({
  query: '',
  results: [],
  performSearch: () => {},
  clearSearch: () => {},
  highlightText: () => '',
});

export const useSearch = () => useContext(SearchContext);

export function SearchProvider({ children }) {
  const { currentUser, isLoggedIn } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const debounceRef = useRef(null);

  const performSearch = useCallback((searchQuery) => {
    setQuery(searchQuery);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const found = searchQuestions(searchQuery);
      setResults(found);

      // Log search if user is logged in
      if (isLoggedIn && currentUser) {
        searchService.logSearch({
          userId: currentUser.id,
          userName: currentUser.name,
          email: currentUser.email,
          query: searchQuery,
          resultsCount: found.length,
        });
        analyticsService.logActivity({
          userId: currentUser.id,
          userName: currentUser.name,
          email: currentUser.email,
          action: 'search',
          question: searchQuery,
          interactionType: 'search',
        });
      }
    }, 300);
  }, [isLoggedIn, currentUser]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  /**
   * Highlight matched text in a string.
   * Returns an array of { text, highlighted } segments.
   */
  const highlightText = useCallback((text, searchTerm) => {
    if (!searchTerm || searchTerm.length < 2 || !text) {
      return [{ text, highlighted: false }];
    }
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => ({
      text: part,
      highlighted: regex.test(part),
    }));
  }, []);

  const value = {
    query,
    results,
    performSearch,
    clearSearch,
    highlightText,
  };

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
}
