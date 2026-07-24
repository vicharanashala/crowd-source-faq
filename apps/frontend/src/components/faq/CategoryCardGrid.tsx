import React, { useMemo } from 'react';
import CategoryCard from './CategoryCard';
import type { FAQItem } from './faqUtils';
import { emptyPaddedCenter, surfaceCardFlat, textBodySoft } from '../../styles/style_config';

interface CategoryCardGridProps {
  grouped: Record<string, FAQItem[]>;
  onSelect: (categoryName: string) => void;
}

/**
 * Responsive grid of CategoryCard, one per FAQ category.
 * 1 col on mobile, 2 on tablet, 3 on desktop.
 */
export default function CategoryCardGrid({ grouped, onSelect }: CategoryCardGridProps) {
  const categories = useMemo(() => {
    return Object.entries(grouped)
      .map(([name, items]) => ({ name, items, count: items.length }))
      .sort((a, b) => {
        const an = Number(a.name.match(/^\s*(\d+)/)?.[1] ?? '0');
        const bn = Number(b.name.match(/^\s*(\d+)/)?.[1] ?? '0');
        if (an !== bn) return an - bn;
        return a.name.localeCompare(b.name);
      });
  }, [grouped]);

  if (categories.length === 0) {
    return (
      <div className={`rounded-2xl border border-dashed border-border ${surfaceCardFlat}/50 p-10 ${emptyPaddedCenter}`}>
        <p className={textBodySoft}>No categories yet. Check back soon.</p>
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
