// Debounced search bar for the public FAQ page.
// Renders a compact pill bar (not a giant hero input) so it can be sticky
// at the top of the page once the user scrolls past the hero.

import React, { useEffect, useRef, useState } from 'react';

interface ExploreSearchBarProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** If true, the bar shows a "Clear" affordance. */
  showClear?: boolean;
  className?: string;
  autoFocus?: boolean;
  onEscape?: () => void;
}

export function ExploreSearchBar({
  value,
  onChange,
  placeholder = 'Search FAQs by keyword, category, or tag…',
  showClear = true,
  className = '',
  autoFocus = false,
  onEscape,
}: ExploreSearchBarProps): React.ReactElement {
  const [internal, setInternal] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync if parent clears the value externally.
  useEffect(() => {
    setInternal(value);
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const v = e.target.value;
    setInternal(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(v), 250);
  }

  function clear(): void {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInternal('');
    onChange('');
  }

  return (
    <div className={`relative ${className}`}>
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </div>
      <input
        type="text"
        value={internal}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (internal) clear();
            else onEscape?.();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        aria-label="Search FAQs"
        className="w-full pl-12 pr-24 py-3.5 rounded-full border border-border/70 bg-cream text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-card transition-all duration-200 shadow-subtle"
      />
      {showClear && internal && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint hover:text-ink px-2 py-1 rounded-full hover:bg-mist transition-colors"
          aria-label="Clear search"
        >
          Clear
        </button>
      )}
    </div>
  );
}
