/*
Handles 'SearchBar' component and 'SearchDropdown' simultaneously.
Adds darker background to avoid overlapping with background.
Filter features to help a better search
*/

import React, { useState, useEffect } from 'react';
import SearchBar from '../../components/search/SearchBar';
import SearchDropdown from '../../components/faq/SearchDropdown';
import { FAQItem } from '../../components/faq/faqUtils';
import type { SearchResult } from '../../types/ui';

interface SearchAreaProps {
  searchQuery: string;
  placeholder?: string;
  onSearchChange: (value: string) => void;
  onSubmit?: (query: string) => void;
  onClear: () => void;
  onResults?: (results: SearchResult[] | null) => void;
  onLoading?: (loading: boolean) => void;
  onError?: (error: string | null) => void;
  dropdownItems?: any[]; 
  categories?: string[];
  onSelectQuestion?: (item: FAQItem) => void;
  onSelectCategory?: (name: string) => void;
  searchLoading?: boolean;
  children?: React.ReactNode; 
}

export default function SearchArea({
  searchQuery,
  placeholder = "Search...",
  onSearchChange,
  onSubmit,
  onClear,
  onResults,
  onLoading,
  onError,
  dropdownItems = [],
  categories = [],
  onSelectQuestion,
  onSelectCategory,
  searchLoading = false,
  children
}: SearchAreaProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'faq' | 'all' | 'community'>('all');

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
      setActiveTab('all');
    }
  }, [searchQuery]);

  const handleClear = () => {
    setIsDropdownOpen(false);
    setActiveTab('all');
    onClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setIsDropdownOpen(false);
      if (onSubmit) onSubmit(searchQuery.trim());
    }
  };


  const filteredDropdownItems = dropdownItems.filter((item) => {
    if (activeTab === 'all') return true;
    
    const itemSource = item.source || 'faq';
    return itemSource === activeTab;
  });

  return (
    <div className="relative w-full">
      {/* The Global Backdrop */}
      {isDropdownOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm transition-all duration-300"
          onClick={() => setIsDropdownOpen(false)} 
          aria-hidden="true"
        />
      )}

      {/* Elevated Container */}
      <div 
        className={`relative ${isDropdownOpen ? 'z-50' : 'z-20'}`}
      >
        
        {isDropdownOpen && (
         <div className="flex justify-center mb-10 animate-fade-in px-4">
            <div className="grid grid-cols-3 p-1.5 bg-card border border-border rounded-xl shadow-subtle w-full max-w-[480px] gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('faq')}
                className={`w-full py-2.5 flex items-center justify-center text-sm font-semibold rounded-lg transition-all duration-200 ${
                  activeTab === 'faq' 
                    ? 'bg-accent text-accent-text shadow' 
                    : 'text-ink-soft hover:text-ink hover:bg-mist/40'
                }`}
              >
                FAQ
              </button>
              
              
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`w-full py-2.5 flex items-center justify-center text-sm font-semibold rounded-lg transition-all duration-200 gap-1.5 ${
                  activeTab === 'all' 
                    ? 'bg-accent text-accent-text shadow' 
                    : 'text-ink-soft hover:text-ink hover:bg-mist/40'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={activeTab === 'all' ? 'text-accent-text' : 'text-ink-faint'}>
                  <line x1="4" y1="21" x2="4" y2="14"></line>
                  <line x1="4" y1="10" x2="4" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12" y2="3"></line>
                  <line x1="20" y1="21" x2="20" y2="16"></line>
                  <line x1="20" y1="12" x2="20" y2="3"></line>
                  <line x1="1" y1="14" x2="7" y2="14"></line>
                  <line x1="9" y1="8" x2="15" y2="8"></line>
                  <line x1="17" y1="16" x2="23" y2="16"></line>
                </svg>
                All
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('community')}
                className={`w-full py-2.5 flex items-center justify-center text-sm font-semibold rounded-lg transition-all duration-200 ${
                  activeTab === 'community' 
                    ? 'bg-accent text-accent-text shadow' 
                    : 'text-ink-soft hover:text-ink hover:bg-mist/40'
                }`}
              >
                Community Posts
              </button>
            </div>
          </div>
        )}

        {/* The Search Input */}
        <SearchBar
          value={searchQuery}
          onQueryChange={onSearchChange}
          onResults={onResults || (() => {})}
          onLoading={onLoading || (() => {})}
          onError={onError || (() => {})}
          placeholder={placeholder}
          disableSuggestions={true}
          onSubmit={(q) => {
            setIsDropdownOpen(false);
            if (onSubmit) onSubmit(q);
          }}
          onClear={handleClear}
        />
        {/* The Dropdown Panel */}
        {isDropdownOpen && (
          <SearchDropdown
            query={searchQuery}
            items={filteredDropdownItems}
            categories={categories}
            onSelectQuestion={(item) => {
              setIsDropdownOpen(false);
              if (onSelectQuestion) onSelectQuestion(item);
            }}
            onSelectCategory={(cat) => {
              setIsDropdownOpen(false);
              if (onSelectCategory) onSelectCategory(cat);
            }}
            onClear={handleClear}
            loading={searchLoading}
          />
        )}
      </div>

      {/* Render the full page results underneath when dropdown is CLOSED */}
      {!isDropdownOpen && children}
    </div>
  );
}