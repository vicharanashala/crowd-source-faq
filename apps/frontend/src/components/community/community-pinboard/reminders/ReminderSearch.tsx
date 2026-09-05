// apps/frontend/src/components/community/community-pinboard/reminders/ReminderSearch.tsx
// Community Pinboard — reminder search input.
// Presentational only: forwards the raw input value up via `onChange`.
// Owns no state of its own — `value` is fully controlled by the parent.

import React from 'react';
import Input from '../../../ui/Input';

export interface ReminderSearchProps {
  value: string;
  placeholder?: string;
  onChange?: (value: string) => void;
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11L14.5 14.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ReminderSearch({
  value,
  placeholder = 'Search reminders...',
  onChange,
}: ReminderSearchProps): React.ReactElement {
  return (
    <div className="w-full sm:max-w-xs">
      <Input
        aria-label="Search reminders"
        type="search"
        value={value}
        placeholder={placeholder}
        iconLeft={<SearchIcon />}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}