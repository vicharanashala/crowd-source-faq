// Community Pinboard — tab navigation.
// Fully controlled, presentational tab bar. Owns no state of its own —
// `activeTab` is passed in and `onTabChange` reports selection back up
// to the page, which is the single owner of "which tab is active".

import React from 'react';

export type PinboardTabKey = 'reminders' | 'bookmarks' | 'links';

interface PinboardTabSpec {
  key: PinboardTabKey;
  label: string;
}

const PINBOARD_TABS: PinboardTabSpec[] = [
  { key: 'reminders', label: 'Important Reminders' },
  { key: 'bookmarks', label: 'My Bookmarks' },
  { key: 'links', label: 'Important Links' },
];

interface PinboardTabsProps {
  /** Currently active tab. Owned and passed in by the parent page. */
  activeTab: PinboardTabKey;
  /** Called when the user selects a different tab. */
  onTabChange: (tab: PinboardTabKey) => void;
}

export default function PinboardTabs({
  activeTab,
  onTabChange,
}: PinboardTabsProps): React.ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Community Pinboard"
      className="flex flex-wrap items-center gap-1.5"
    >
      {PINBOARD_TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-accent text-accent-text'
                : 'bg-mist text-ink-soft hover:bg-mist/70'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}