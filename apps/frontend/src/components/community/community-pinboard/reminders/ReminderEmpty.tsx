// apps/frontend/src/components/community/community-pinboard/reminders/ReminderEmpty.tsx
// Community Pinboard — reminder list empty state.
// Pure presentational, follows the same icon + title layout as the
// EmptyState pattern used elsewhere (see explore/ExploreSkeleton.tsx).

import React from 'react';
import Card from '../../../ui/Card';

export interface ReminderEmptyProps {
  message?: string;
}

export default function ReminderEmpty({
  message = 'No reminders found.',
}: ReminderEmptyProps): React.ReactElement {
  return (
    <Card variant="default" className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-10 h-10 rounded-full bg-mist flex items-center justify-center mb-3 text-ink-faint">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16" />
          <path d="M9 15h6" />
        </svg>
      </div>
      <p role="status" className="text-sm font-medium text-ink">
        {message}
      </p>
    </Card>
  );
}