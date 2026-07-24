// Debounced search bar for the public FAQ page.
// Renders a compact pill bar (not a giant hero input) so it can be sticky
// at the top of the page once the user scrolls past the hero.

import React, { useEffect, useRef, useState } from 'react';
import {
  exploreSearchBar,
  exploreSearchClear,
  exploreSearchIcon,
} from '../../styles/style_config';

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
      <div className={exploreSearchIcon}>
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
        className={exploreSearchBar}
      />
      {showClear && internal && (
        <button
          type="button"
          onClick={clear}
          className={exploreSearchClear}
          aria-label="Clear search"
        >
          Clear
        </button>
      )}
    </div>
  );
}
