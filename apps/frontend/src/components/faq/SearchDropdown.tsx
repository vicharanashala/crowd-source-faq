import React, { useState, useEffect } from 'react';
import SearchFeedback from './SearchFeedback';
import { FAQItem, getCategoryIcon, formatCategoryName, getQuestionTitle, getAnswerText } from './faqUtils';
import {
  flexRowBetween,
  searchListItemDefault,
  searchListItemCompact,
  searchListItemQuestionRow,
  searchListItemResultBody,
  searchPanel,
  searchPanelHeader,
  searchPanelListEmpty,
  searchPanelLoadingSkeleton,
  textXsFaint,
  textXsLabel,
  textLabelXsTop,
} from '../../styles/style_config';

interface SearchDropdownProps {
  query: string;
  items: FAQItem[];
  categories: string[];
  onSelectQuestion: (item: FAQItem) => void;
  onSelectCategory: (name: string) => void; 
  onClear: () => void;
  loading: boolean;
}

export default function SearchDropdown({
  query,
  items,
  categories,
  onSelectQuestion,
  onSelectCategory,
  onClear,
  loading,
}: SearchDropdownProps) {
  const [activeCategories, setActiveCategories] = useState<string[]>([]);

  useEffect(() => {
    setActiveCategories([]);
  }, [query]);

  const displayItems = activeCategories.length > 0
    ? items.filter((item) => {
        const activeLower = activeCategories.map(c => c.toLowerCase());
        const matchCategory = item.category 
          && activeLower.includes(item.category.toLowerCase());
        const matchTags = item.tags && Array.isArray(item.tags) 
          && item.tags.some((tag: string) => activeLower.includes(tag.toLowerCase()));

        return matchCategory || matchTags;
      })
    : items;

  const toggleCategory = (name: string) => {
    setActiveCategories((prev) => 
      prev.includes(name) 
        ? prev.filter((c) => c !== name) 
        : [...prev, name] 
    );
  };

  return (
    <>
    <div className="absolute left-0 right-0 top-full mt-3 z-40 animate-fade-in">
      <div className={searchPanel}>
        <div className={searchPanelHeader}>
          <div>
            <p className={textLabelXsTop}>
              Search suggestions
            </p>
            <p className="text-sm text-ink mt-1">
              Results for <span className="font-semibold text-ink">"{query}"</span>
            </p>
          </div>
          <button
            onClick={() => {
              setActiveCategories([]); 
              onClear();
            }}
            className="text-xs font-medium text-ink-soft hover:transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[1.35fr_0.95fr]">
          <div>
            <div className={flexRowBetween + ' mb-2'}>
              <p className={textXsLabel}>
                Matching questions
              </p>
              <span className={textXsFaint}>{displayItems.length} found</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {loading && (
                [1, 2, 3].map((i) => (
                  <div key={i} className={searchPanelLoadingSkeleton} />
                ))
              )}
              {!loading && displayItems.length === 0 && (
                <div className={searchPanelListEmpty}>
                  <p className="text-xs text-ink-soft">
                    {activeCategories.length > 0
                      ? "No matches found in the selected categories." 
                      : "No matches yet. Keep typing or browse a category."}
                  </p>
                </div>
              )}
              {!loading && displayItems.map((item, idx) => (
                <button
                  key={item._id || item.title || item.question || idx}
                  onClick={() => onSelectQuestion(item)}
                  className={searchListItemDefault}
                >
                  <p className={searchListItemQuestionRow}>
                    {getQuestionTitle(item)}
                  </p>
                  <p className={searchListItemResultBody}>
                    {getAnswerText(item)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={flexRowBetween + ' mb-2'}>
              <p className={textXsLabel}>Categories</p>
              {activeCategories.length > 0 && (
                <button 
                  onClick={() => setActiveCategories([])}
                  className={textXsFaint + " hover:text-ink transition-colors"}
                >
                  Clear filters
                </button>
              )}
            </div>
            
            {categories.length === 0 ? (
              <div className="mt-2 rounded-2xl border border-dashed border-border bg-transparent p-4">
                <p className="text-xs text-ink-soft">
                  No categories to show yet.
                </p>
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                {categories.slice(0, 7).map((name) => {
                  const isActive = activeCategories.includes(name);
                  
                  return (
                    <button
                      key={name}
                      onClick={() => toggleCategory(name)}
                      className={`group ${searchListItemCompact} ${isActive ? 'bg-mist shadow-subtle' : ''}`}
                    >
                      <span className={`transition-opacity ${isActive ? 'opacity-100 text-accent' : 'opacity-40 group-hover:opacity-100'}`}>
                        {getCategoryIcon(name)}
                      </span>
                      <span className={`text-sm ${isActive ? 'text-accent font-medium' : 'text-ink'}`}>
                        {formatCategoryName(name)}
                      </span>
                      
                      {isActive && (
                        <span className="ml-auto text-xs text-ink-faint">Active</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    {!loading && displayItems.length > 0 && (
      <div className='max-w-2xl mx-auto mt-4'>
        <SearchFeedback 
          searchQuery={query} 
          resultFaqId={displayItems[0]?._id} 
        />
      </div>
    )}
    </>
  );
}