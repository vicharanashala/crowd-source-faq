/**
 * SegmentedTabs.tsx — Small reusable segmented pill-tab control.
 *
 * The Discussions/Important Links toggle needed the exact
 * `bg-mist rounded-xl` pill-group markup that already exists inline in
 * `CommunityPage.tsx` for its status filter (All/Unanswered/Open).
 * Rather than hand-copy that markup a second time, it's componentised
 * here for the new toggle.
 *
 * The pre-existing status-filter pills in `CommunityPage.tsx` were
 * intentionally left untouched rather than migrated to this component —
 * that block predates this module, isn't part of its scope, and
 * refactoring it would be an unrelated change that only increases merge
 * risk with whoever owns that filter. Flagged here as a follow-up
 * de-duplication opportunity for that file's owner, not done unilaterally.
 */

import React from 'react';

export interface SegmentedTabOption<T extends string> {
  key: T;
  label: string;
}

export interface SegmentedTabsProps<T extends string> {
  options: SegmentedTabOption<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}

export default function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: SegmentedTabsProps<T>) {
  return (
    <div className={`flex gap-1 p-1 bg-mist rounded-xl w-fit ${className}`}>
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
            ${value === key ? 'bg-card text-ink shadow-subtle' : 'text-ink-soft hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
