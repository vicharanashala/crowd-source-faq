import React from 'react';
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
  return (
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
            onClick={onClear}
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
              <span className={textXsFaint}>{items.length} found</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {loading && (
                [1, 2, 3].map((i) => (
                  <div key={i} className={searchPanelLoadingSkeleton} />
                ))
              )}
              {!loading && items.length === 0 && (
                <div className={searchPanelListEmpty}>
                  <p className="text-xs text-ink-soft">
                    No matches yet. Keep typing or browse a category.
                  </p>
                </div>
              )}
              {!loading && items.map((item, idx) => (
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
            {/* 1.12 (LOW) — empty-state for the categories column when
                no categories are available. Merged with PR #144's
                style_config.ts refactor: the `group` Tailwind class
                on the button below is required for the icon's
                `group-hover:opacity-100` to actually fire. */}
            <p className={textXsLabel}>
              Categories
            </p>
            {categories.length === 0 ? (
              <div className="mt-2 rounded-2xl border border-dashed border-border bg-transparent p-4">
                <p className="text-xs text-ink-soft">
                  No categories to show yet.
                </p>
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                {categories.slice(0, 7).map((name) => (
                  <button
                    key={name}
                    onClick={() => onSelectCategory(name)}
                    className={`group ${searchListItemCompact}`}
                  >
                    <span className="opacity-40 group-hover:opacity-100 transition-opacity">{getCategoryIcon(name)}</span>
                    <span className="text-sm text-ink">{formatCategoryName(name)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
