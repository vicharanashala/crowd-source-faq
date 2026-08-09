// Community Pinboard — reminder list.
// Presentational only: maps `reminders` to `ReminderCard` instances.
// Owns no state and does no fetching — the parent (or the `services/`
// folder contributor) is responsible for supplying the array, including
// any per-reminder upvote/downvote/bookmark callbacks.

import React from 'react';
import ReminderCard, { type ReminderCardProps } from './ReminderCard';

export interface ReminderListProps {
  reminders: ReminderCardProps[];
}

export default function ReminderList({ reminders }: ReminderListProps): React.ReactElement | null {
  if (reminders.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {reminders.map((reminder) => (
        <ReminderCard key={reminder.id} {...reminder} />
      ))}
    </div>
  );
}