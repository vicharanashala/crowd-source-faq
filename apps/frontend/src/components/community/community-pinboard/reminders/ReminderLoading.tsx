// apps/frontend/src/components/community/community-pinboard/reminders/ReminderLoading.tsx
// Community Pinboard — reminder list loading placeholder.
// Pure presentational skeleton, shaped like ReminderCard (badge row, title,
// description, author row, action row), stacked to match ReminderList's
// spacing. No props, no state, no fetching.

import React from 'react';
import Card from '../../../ui/Card';

function ReminderCardSkeleton(): React.ReactElement {
  return (
    <Card variant="default" className="p-4 animate-pulse">
      <div className="h-3.5 w-16 bg-mist rounded-full mb-3" />
      <div className="h-4 w-3/4 bg-mist rounded mb-2" />
      <div className="h-3 w-full bg-mist/60 rounded mb-1.5" />
      <div className="h-3 w-2/3 bg-mist/60 rounded mb-3" />
      <div className="flex items-center gap-2 mb-4">
        <div className="h-5 w-5 rounded-full bg-mist shrink-0" />
        <div className="h-2.5 w-20 bg-mist/60 rounded" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 bg-mist rounded-lg" />
        <div className="h-3 w-4 bg-mist/60 rounded" />
        <div className="h-7 w-7 bg-mist rounded-lg" />
        <div className="h-7 w-20 bg-mist rounded-lg ml-auto" />
      </div>
    </Card>
  );
}

export default function ReminderLoading(): React.ReactElement {
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading reminders">
      {Array.from({ length: 3 }).map((_, i) => (
        <ReminderCardSkeleton key={i} />
      ))}
    </div>
  );
}