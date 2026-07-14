import React from 'react';
import { FAQItem, getCategoryIcon, formatCategoryName, getQuestionTitle, getAnswerText } from './faqUtils';

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
  return (
    <div className="absolute left-0 right-0 top-full mt-3 z-40 animate-fade-in">
      <div className="search-panel">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
              Search suggestions
            </p>
            <p className="text-sm text-ink mt-1">
              Results for <span className="font-semibold text-ink">"{query}"</span>
            </p>
          </div>
          <button
            onClick={onClear}
            className="text-xs font-medium text-ink-soft hover:transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[1.35fr_0.95fr]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
                Matching questions
              </p>
              <span className="text-xs text-ink-faint">{items.length} found</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {loading && (
                [1, 2, 3].map((i) => (
                  <div key={i} className="h-[72px] rounded-2xl search-skeleton animate-pulse" />
                ))
              )}
              {!loading && items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border bg-transparent p-4">
                  <p className="text-xs text-ink-soft">
                    No matches yet. Keep typing or browse a category.
                  </p>
                </div>
              )}
              {!loading && items.map((item, idx) => (
                <button
                  key={item._id || item.title || item.question || idx}
                  onClick={() => onSelectQuestion(item)}
                  className="w-full text-left rounded-2xl border border-border/60 px-3 py-2 search-list-item"
                >
                  <p className="text-sm font-semibold text-ink line-clamp-2">
                    {getQuestionTitle(item)}
                  </p>
                  <p className="text-xs text-ink-soft line-clamp-3 mt-1 leading-relaxed">
                    {getAnswerText(item)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
              Categories
            </p>
            <div className="mt-2 space-y-1">
              {categories.slice(0, 7).map((name) => (
                <button
                  key={name}
                  onClick={() => onSelectCategory(name)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl border border-border/60 text-left search-list-item"
                >
                  <span className="opacity-40 group-hover:opacity-100 transition-opacity">{getCategoryIcon(name)}</span>
                  <span className="text-sm text-ink">{formatCategoryName(name)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
