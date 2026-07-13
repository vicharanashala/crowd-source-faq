import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import {
  FAQItem,
  getCategoryTheme,
  getCategoryIcon,
  formatCategoryName,
} from './faqUtils';
import { useIsDarkTheme } from '../../hooks/useIsDarkTheme';

interface CategorySidebarContentProps {
  grouped: Record<string, FAQItem[]>;
  selectedCategories: string[];
  totalFaqCount: number;
  onSelectionChange: (cats: string[]) => void;
}

export default function CategorySidebarContent({
  grouped,
  selectedCategories,
  totalFaqCount,
  onSelectionChange,
}: CategorySidebarContentProps) {
  const isDark = useIsDarkTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const sortedCategories = useMemo(() => {
    const entries = Object.entries(grouped)
      .map(([name, items]) => ({ name, count: items.length }))
      .filter(({ name }) =>
        formatCategoryName(name)
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      )
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return entries;
  }, [grouped, searchQuery]);

  const toggleCategory = (name: string) => {
    onSelectionChange(
      selectedCategories.includes(name)
        ? selectedCategories.filter((c) => c !== name)
        : [...selectedCategories, name],
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-semibold text-ink uppercase tracking-wide">
          Categories
        </p>
        <p className="text-[10px] text-ink-faint mt-0.5">
          {selectedCategories.length > 0
            ? `${selectedCategories.length} selected · ${totalFaqCount} FAQs`
            : `${Object.keys(grouped).length} categories`}
        </p>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories..."
            className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-mist/60 border border-border/50 rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-colors"
          />
        </div>
      </div>

      {/* Pill list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {sortedCategories.map(({ name, count }) => {
          const theme = getCategoryTheme(name);
          const isSelected = selectedCategories.includes(name);
          const bgColor = isDark ? theme.badgeBgDark : theme.badgeBg;
          const fgColor = isDark ? theme.badgeColorDark : theme.badgeColor;

          return (
            <button
              key={name}
              type="button"
              onClick={() => toggleCategory(name)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm transition-all duration-150"
              style={{
                backgroundColor: isSelected ? bgColor : 'transparent',
                color: isSelected ? fgColor : undefined,
              }}
            >
              <span className="shrink-0">{getCategoryIcon(name)}</span>
              <span className="flex-1 truncate text-[13px]">
                {formatCategoryName(name)}
              </span>
              <span
                className="text-[10px] font-semibold tabular-nums"
                style={{ color: fgColor }}
              >
                {count}
              </span>
            </button>
          );
        })}

        {sortedCategories.length === 0 && (
          <p className="text-[11px] text-ink-faint text-center py-4">
            No categories match your search.
          </p>
        )}
      </div>

      {/* Clear selection (only when active) */}
      {selectedCategories.length > 0 && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => onSelectionChange([])}
            className="w-full py-1.5 text-[11px] font-medium text-ink-soft hover:text-ink bg-mist/60 hover:bg-mist rounded-lg transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}
