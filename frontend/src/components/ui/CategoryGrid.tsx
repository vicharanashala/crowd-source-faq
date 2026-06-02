import React, { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Category } from '../../types/ui';

export const categoryPills: Category[] = [
  {
    name: 'ViBe (Learning Platform)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5h7a3 3 0 0 1 3 3v11H6a3 3 0 0 0-3 3z"/>
        <path d="M21 5h-7a3 3 0 0 0-3 3v11h7a3 3 0 0 1 3 3z"/>
      </svg>
    ),
  },
  {
    name: 'Team Formation',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="3"/>
        <circle cx="17" cy="9" r="2.5"/>
        <path d="M3 19a5 5 0 0 1 10 0"/>
        <path d="M14 19a4 4 0 0 1 7 0"/>
      </svg>
    ),
  },
  {
    name: 'Timings',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8"/>
        <path d="M12 8v4l3 2"/>
      </svg>
    ),
  },
  {
    name: 'NOC',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
        <path d="M14 3v4h4"/>
        <path d="M9 14l2 2 4-4"/>
      </svg>
    ),
  },
  {
    name: 'Offer Letter',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="12" rx="2"/>
        <path d="M3 8l9 6 9-6"/>
      </svg>
    ),
  },
  {
    name: 'Projects',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      </svg>
    ),
  },
  {
    name: 'Rosetta',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l2.3 4.7L19 9l-3.5 3.4L16.7 17 12 14.6 7.3 17l1.2-4.6L5 9l4.7-1.3z"/>
      </svg>
    ),
  },
  {
    name: 'Certificate',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="9" r="4"/>
        <path d="M8 13l-2 6 4-2 2 2 2-2 4 2-2-6"/>
      </svg>
    ),
  },
  {
    name: 'Interviews',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>
        <path d="M7 10h6M7 13h9"/>
      </svg>
    ),
  },
  {
    name: 'Others',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
];

interface CategoryGridProps {
  activeCategory?: string;
  onSelect?: (category: string) => void;
  className?: string;
  categories?: Category[];
}

export default function CategoryGrid({
  activeCategory,
  onSelect,
  className = '',
  categories = categoryPills,
}: CategoryGridProps) {
  const navigate = useNavigate();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFades = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 8);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  const handleScroll = (direction: number) => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollBy({
      left: direction * 240,
      behavior: 'smooth',
    });
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
          Quick filters
        </p>
        <button
          onClick={() => navigate('/faq')}
          className="text-xs font-medium text-ink-soft hover:text-accent transition-colors"
        >
          Browse all
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleScroll(-1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-white/90 backdrop-blur-sm shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories left"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          ref={scrollerRef}
          onScroll={updateFades}
          className="relative flex-1 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
        >
          {showLeftFade && (
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-bg/90 to-transparent pointer-events-none z-10" />
          )}
          {showRightFade && (
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg/90 to-transparent pointer-events-none z-10" />
          )}
          {categories.map((cat) => {
            const isActive = !!(activeCategory
              && activeCategory.toLowerCase() === cat.name.toLowerCase());
            return (
              <button
                key={cat.name}
                onClick={() => (onSelect ? onSelect(cat.name) : navigate('/faq'))}
                aria-pressed={isActive}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
                  ${isActive
                    ? 'bg-accent text-white border-accent/50 shadow-[0_10px_26px_rgba(90,122,90,0.25)]'
                    : 'bg-white/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
                  }`}
              >
                <span className={`${isActive ? 'text-white' : 'text-ink-faint'}`}>
                  {cat.icon as ReactNode}
                </span>
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => handleScroll(1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-white/90 backdrop-blur-sm shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories right"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}