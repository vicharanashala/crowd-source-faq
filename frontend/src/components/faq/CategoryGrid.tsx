import React from 'react';
import { FAQItem, getCategoryTone, getCategoryDescription, getCategoryIcon, formatCategoryName, getQuestionTitle } from './faqUtils';

interface CategoryCardProps {
  name: string;
  items: FAQItem[];
  onOpen: (name: string) => void;
}

export function CategoryCard({ name, items, onOpen }: CategoryCardProps) {
  const tone = getCategoryTone(name);
  const description = getCategoryDescription(items);
  const previewPrimary = items.slice(0, 2);
  const previewSecondary = items.slice(2, 4);

  return (
    <button
      onClick={() => onOpen(name)}
      className="group relative text-left rounded-2xl border border-border/70 bg-card/80 p-5 shadow-subtle transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover overflow-hidden"
    >
      <div className={`absolute -top-6 -right-8 w-24 h-24 rounded-full blur-2xl ${tone.halo}`} />
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className={`w-10 h-10 rounded-xl bg-cream border border-border/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] flex items-center justify-center ${tone.accent}`}>
          {getCategoryIcon(name)}
        </div>
        <span className="text-[11px] font-semibold text-ink-faint">
          {items.length} questions
        </span>
      </div>

      <h3 className="mt-4 text-base font-semibold text-ink">
        {formatCategoryName(name)}
      </h3>

      {description && (
        <p className="mt-1 text-xs text-ink-soft leading-relaxed line-clamp-2">
          {description}
        </p>
      )}

      <div className="mt-4">
        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">Top questions</p>
        <ul className="mt-2 space-y-1.5">
          {previewPrimary.map((item) => (
            <li key={item._id} className="text-xs text-ink-soft line-clamp-1">
              {getQuestionTitle(item)}
            </li>
          ))}
        </ul>
        {previewSecondary.length > 0 && (
          <div className="mt-2 overflow-hidden max-h-0 opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-300">
            <ul className="space-y-1.5">
              {previewSecondary.map((item) => (
                <li key={item._id} className="text-xs text-ink-soft line-clamp-1">
                  {getQuestionTitle(item)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-ink-faint">
        <span>Explore category</span>
        <span className="text-accent opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
          View all
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </div>
    </button>
  );
}

interface CategoryGridProps {
  categories: string[];
  grouped: Record<string, FAQItem[]>;
  onOpen: (name: string) => void;
}

export default function CategoryGrid({ categories, grouped, onOpen }: CategoryGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {categories.map((name) => (
        <CategoryCard
          key={name}
          name={name}
          items={grouped[name] || []}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
