// apps/frontend/src/components/community/community-pinboard/reminders/ReminderFilters.tsx
// Community Pinboard — reminder filter controls.
// Presentational only: renders the Pinned / Verified toggle pills. Owns
// no state — `showPinned`/`showVerified` are passed in by the parent and
// clicks are reported back via optional callbacks, matching the
// controlled pattern used by PinboardTabs.

import React from 'react';

interface FilterPillProps {
  label: string;
  active: boolean;
  onToggle?: () => void;
}

function FilterPill({ label, active, onToggle }: FilterPillProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`Filter by ${label}`}
      onClick={() => onToggle?.()}
      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
        active ? 'bg-accent text-accent-text' : 'bg-mist text-ink-soft hover:bg-mist/70'
      }`}
    >
      {label}
    </button>
  );
}

export interface ReminderFiltersProps {
  showPinned: boolean;
  showVerified: boolean;
  onTogglePinned?: () => void;
  onToggleVerified?: () => void;
}

export default function ReminderFilters({
  showPinned,
  showVerified,
  onTogglePinned,
  onToggleVerified,
}: ReminderFiltersProps): React.ReactElement {
  return (
    <div role="group" aria-label="Reminder filters" className="flex flex-wrap items-center gap-1.5">
      <FilterPill label="Pinned" active={showPinned} onToggle={onTogglePinned} />
      <FilterPill label="Verified" active={showVerified} onToggle={onToggleVerified} />
    </div>
  );
}