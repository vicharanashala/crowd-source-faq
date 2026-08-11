// BookmarkList — "Bookmarks" section of the Community Pinboard.
//
// Owned by: Member 6 (community-pinboard/bookmarks)
//
// Renders the reminders the current user has bookmarked and exposes
// a remove-bookmark action through a callback. No API calls happen
// here — the parent/page owns fetching and mutating bookmark state.
//
// ─────────────────────────────────────────────────────────────────
// ASSUMPTION / TEMPORARY TYPE:
// The task spec asks this component to "use the existing shared
// Reminder type from the repository" (expected to live at
// packages/types/src/models/reminder.ts) and to render an already-
// existing ReminderCard if one is provided by the reminders
// contributor. As of this implementation, neither
// packages/types/src/models/reminder.ts nor a reminders/ directory
// exists in the repository yet.
//
// Per the ownership rules for this task, this file must NOT create
// or modify packages/types/src/models/reminder.ts, and must NOT
// duplicate a full ReminderCard component. So, scoped strictly to
// this file (inside community-pinboard/bookmarks, which is owned by
// this task), a minimal local `Reminder` type stand-in is declared
// below purely to type-check this component today.
//
// TODO (integration): once @csfaq/types exports a real `Reminder`
// type, replace the local declaration with:
//   import type { Reminder } from '@csfaq/types';
// and once a shared `ReminderCard` component exists (likely in a
// sibling `reminders/` module), replace `BookmarkedReminderRow`
// below with that shared component.
// ─────────────────────────────────────────────────────────────────

import React from 'react';
import Card from '../../../ui/Card';
import {
  textLabelXsBold,
  textLabelBold,
  textBodySoft,
  textXsFaint,
} from '../../../../styles/typography';

/**
 * Temporary local stand-in for the shared `Reminder` type.
 * Shaped to be a superset-compatible drop-in for the eventual
 * `@csfaq/types` Reminder — swap the import once that type ships.
 */
export interface Reminder {
  _id: string;
  title: string;
  content: string;
  tags?: string[];
  createdAt?: string;
  author?: { name?: string };
}

interface BookmarkListProps {
  reminders: Reminder[];
  onRemoveBookmark?: (reminderId: string) => void;
}

// ── Icons ────────────────────────────────────────────────────────
function BookmarkFilledIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="currentColor" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 2.5C2 1.67 2.67 1 3.5 1h5C9.33 1 10 1.67 10 2.5v7.5L7 8.5 4 10V2.5z" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyBookmarkIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ── Empty state ──────────────────────────────────────────────────
function BookmarksEmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 min-h-[160px]">
      <div className="w-10 h-10 rounded-full bg-mist flex items-center justify-center mb-3 text-ink-faint">
        <EmptyBookmarkIcon />
      </div>
      <p className="text-sm font-medium text-ink">No bookmarks yet</p>
      <p className="text-xs text-ink-soft mt-1">
        Reminders you bookmark will show up here for quick access.
      </p>
    </div>
  );
}

// ── Single bookmarked reminder row ──────────────────────────────
// Deliberately minimal (not a full "ReminderCard") so it doesn't
// collide with a shared ReminderCard another contributor may add.
function BookmarkedReminderRow({
  reminder,
  onRemoveBookmark,
}: {
  reminder: Reminder;
  onRemoveBookmark?: (reminderId: string) => void;
}): React.ReactElement {
  return (
    <Card variant="default" className="p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className={textLabelBold}>{reminder.title}</p>
        <p className={`${textBodySoft} mt-1 line-clamp-2`}>{reminder.content}</p>

        {reminder.tags && reminder.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reminder.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[11px] font-medium text-accent"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {reminder.author?.name && (
          <p className={`${textXsFaint} mt-2`}>{reminder.author.name}</p>
        )}
      </div>

      {onRemoveBookmark && (
        <button
          type="button"
          onClick={() => onRemoveBookmark(reminder._id)}
          aria-label={`Remove bookmark for ${reminder.title}`}
          title="Remove bookmark"
          className="flex-shrink-0 flex items-center gap-1 text-xs text-accent font-medium hover:text-accent-hover transition-colors"
        >
          <BookmarkFilledIcon />
          Remove
        </button>
      )}
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function BookmarkList({
  reminders,
  onRemoveBookmark,
}: BookmarkListProps): React.ReactElement {
  return (
    <section aria-labelledby="bookmarks-heading">
      <h2 id="bookmarks-heading" className={textLabelXsBold}>
        Bookmarks
      </h2>

      {reminders.length === 0 ? (
        <BookmarksEmptyState />
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {reminders.map((reminder) => (
            <BookmarkedReminderRow
              key={reminder._id}
              reminder={reminder}
              onRemoveBookmark={onRemoveBookmark}
            />
          ))}
        </div>
      )}
    </section>
  );
}
