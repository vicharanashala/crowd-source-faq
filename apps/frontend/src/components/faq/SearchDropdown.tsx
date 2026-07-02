import React from 'react';
import { FAQItem, getCategoryIcon, formatCategoryName, getQuestionTitle, getAnswerText } from './faqUtils';

// Condense an answer to its first 2-3 sentences for the inline summary card.
// Ported from the pre-restructure HomePage "Quick AI Summary" feature.
function condenseAnswer(text: string): string {
  // Split on sentence-ending punctuation followed by whitespace, so dots
  // inside domains/abbreviations (e.g. "samagama.in") don't break sentences.
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 3).join(' ').trim();
}

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

        {/* ─── INLINE AI SUMMARY BLOCK ────────────────────────── */}
        {!loading && items.length > 0 && getAnswerText(items[0]) && (
          <div className="mx-4 mb-3 rounded-2xl bg-accent/5 border border-accent/20 p-5 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-accent/10 to-transparent pointer-events-none rounded-bl-full" />

            <div className="flex items-center gap-2 mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider text-accent">
                Quick AI Summary
              </span>
            </div>

            <p className="text-sm font-medium text-ink leading-relaxed line-clamp-3">
              {condenseAnswer(getAnswerText(items[0]))}
            </p>

            <div className="mt-3 flex items-center justify-between text-[11px] text-ink-faint border-t border-border/40 pt-2.5">
              <span>Based on top verified resource</span>
              <button
                type="button"
                onClick={() => onSelectQuestion(items[0])}
                className="text-accent font-semibold hover:underline flex items-center gap-1"
              >
                Read full solution
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        )}

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
