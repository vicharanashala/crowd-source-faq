import React from 'react';

interface TagChipsProps {
  tags?: string[];
  onTagClick?: (tag: string) => void;
  max?: number;
  size?: 'sm' | 'xs';
}

/**
 * Renders FAQ tag chips. Read-only if no onTagClick is passed
 * (matches the static display style community posts already use);
 * clickable + hover state when it is.
 */
export default function TagChips({ tags, onTagClick, max = 6, size = 'xs' }: TagChipsProps) {
  if (!tags || tags.length === 0) return null;
  const visible = tags.slice(0, max);
  const sizeClass = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTagClick?.(tag);
          }}
          disabled={!onTagClick}
          className={`inline-flex items-center ${sizeClass} rounded-full bg-accent/10 border border-accent/20 text-accent font-semibold transition-all duration-200 ${
            onTagClick
              ? 'hover:bg-accent/20 hover:border-accent/40 cursor-pointer hover:-translate-y-0.5'
              : 'cursor-default'
          }`}
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}
