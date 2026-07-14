import React, { useMemo } from 'react';
import CategoryCard from './CategoryCard';
import type { FAQItem } from './faqUtils';

interface CategoryCardGridProps {
  grouped: Record<string, FAQItem[]>;
  onSelect: (categoryName: string) => void;
}

/**
 * Responsive grid of CategoryCard, one per FAQ category.
 * Sorts categories by their leading number (1., 2., ... 10., 11., 12., 13.)
 * so the grid flows in the same order users see in the seed file.
 *
 * 1 col on mobile, 2 on tablet, 3 on desktop — matches image 1.
 */
export default function CategoryCardGrid({ grouped, onSelect }: CategoryCardGridProps) {
  const categories = useMemo(() => {
    return Object.entries(grouped)
      .map(([name, items]) => ({ name, items, count: items.length }))
      .sort((a, b) => {
        // Strip leading "N. " for sort so "1.", "2.", ..., "10." come out
        // in natural numeric order, not lexicographic ("10." before "2.").
        const an = Number(a.name.match(/^\s*(\d+)/)?.[1] ?? '0');
        const bn = Number(b.name.match(/^\s*(\d+)/)?.[1] ?? '0');
        if (an !== bn) return an - bn;
        return a.name.localeCompare(b.name);
      });
  }, [grouped]);

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-ink-soft">
        No categories yet. Check back soon.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map(({ name, items, count }) => (
        <CategoryCard
          key={name}
          name={name}
          count={count}
          items={items}
          onSelect={() => onSelect(name)}
        />
      ))}
    </div>
  );
}
