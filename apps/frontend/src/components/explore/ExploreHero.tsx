// Hero section for the public FAQ page — large centered title, subtitle,
// and (optionally) a category filter pill bar. Matches the existing
// FAQ Hive aesthetic from the screenshot.

import React from 'react';
import type { PublicCategory } from './types';
import { HomeDoodles } from '../ui/PageDoodles';

interface ExploreHeroProps {
  /** Name of the active batch — used as the eyebrow above the H1. */
  batchName: string;
  totalFaqs: number;
  totalCategories: number;
  categories?: PublicCategory[];
  activeCategory: string | null;
  onSelectCategory: (name: string | null) => void;
  children?: React.ReactNode;
}

export function ExploreHero({
  batchName,
  totalFaqs,
  totalCategories,
  categories,
  activeCategory,
  onSelectCategory,
  children,
}: ExploreHeroProps): React.ReactElement {
  return (
    <section
      className="relative pt-24 sm:pt-28 pb-12 text-center"
      aria-label="Page header"
    >
      <div className="absolute inset-0 pointer-events-none mt-12 sm:mt-16">
        <HomeDoodles />
      </div>
      
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 text-accent mb-3 relative z-10">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 0.7-1.5 1.2-1.5 2.5" />
          <path d="M12 17.5h.01" />
        </svg>
      </div>
      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-accent relative z-10">
        {batchName}
      </p>
      <h1 className="font-serif text-[1.75rem] sm:text-4xl md:text-5xl lg:text-[3.2rem] leading-[1.15] tracking-tight text-ink mb-6 mt-1.5 relative z-10">
        Ask. Discover. Get{' '}
        <span className="doodle-underline font-serif" style={{ fontWeight: 700 }}>Solved.</span>
        <svg className="inline-block ml-2 align-middle" width="24" height="18" viewBox="0 0 24 18" style={{ opacity: 0.18 }}>
          <path d="M2 12 Q6 4 12 9 Q18 14 22 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </h1>
      <p className="text-sm sm:text-base text-ink-soft max-w-lg leading-relaxed mx-auto px-2 relative z-10">
        Search your doubt or explore solved questions from the community.
      </p>

      {totalFaqs > 0 && (
        <p className="text-[11px] text-ink-faint mt-3 uppercase tracking-wider font-semibold">
          {totalFaqs} {totalFaqs === 1 ? 'FAQ' : 'FAQs'} · {totalCategories}{' '}
          {totalCategories === 1 ? 'category' : 'categories'}
        </p>
      )}

      {children && <div className="mt-10 max-w-3xl mx-auto px-2">{children}</div>}

      {categories && categories.length > 0 && (
        <nav
          className="mt-6 max-w-4xl mx-auto px-2 flex flex-wrap justify-center gap-2"
          aria-label="Filter by category"
        >
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-200 ${
              activeCategory === null
                ? 'bg-accent text-accent-text border-accent/60'
                : 'bg-card text-ink border-border/70 hover:bg-cream'
            }`}
          >
            All
          </button>
          {categories.slice(0, 10).map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => onSelectCategory(activeCategory === cat.name ? null : cat.name)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-200 ${
                activeCategory === cat.name
                  ? 'bg-accent text-accent-text border-accent/60'
                  : 'bg-card text-ink border-border/70 hover:bg-cream'
              }`}
            >
              {cat.name} · {cat.count}
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}
