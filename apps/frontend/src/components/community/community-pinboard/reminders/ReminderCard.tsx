// Community Pinboard — reminder card.
// Presentational only: renders a single reminder (title, description,
// author, vote count, status badges). Owns no state — upvote/downvote/
// bookmark clicks are reported up via optional callbacks so the parent
// (reminders list) stays the single owner of any mutation.

import React from 'react';
import Card from '../../../ui/Card';
import Badge from '../../../ui/Badge';
import Avatar from '../../../ui/Avatar';
import Button from '../../../ui/Button';

export interface ReminderCardProps {
  id: string;
  title: string;
  description: string;
  author: string;
  createdAt: string;
  votes: number;
  bookmarked: boolean;
  verified: boolean;
  pinned: boolean;
  /** Called with the reminder id when the upvote button is clicked. */
  onUpvote?: (id: string) => void;
  /** Called with the reminder id when the downvote button is clicked. */
  onDownvote?: (id: string) => void;
  /** Called with the reminder id when the bookmark button is clicked. */
  onBookmark?: (id: string) => void;
}

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ReminderCard({
  id,
  title,
  description,
  author,
  createdAt,
  votes,
  bookmarked,
  verified,
  pinned,
  onUpvote,
  onDownvote,
  onBookmark,
}: ReminderCardProps): React.ReactElement {
  return (
    <Card variant="default" className="p-4">
      {(pinned || verified) && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {pinned && <Badge variant="accent">Pinned</Badge>}
          {verified && <Badge variant="success">Verified</Badge>}
        </div>
      )}

      <h3 className="font-serif text-lg text-ink tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-ink-soft leading-relaxed">{description}</p>

      <div className="mt-3 flex items-center gap-2">
        <Avatar name={author} size="xs" />
        <span className="text-xs text-ink-faint">{author}</span>
        <span className="text-ink-faint text-xs">·</span>
        <span className="text-xs text-ink-faint">{formatDate(createdAt)}</span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Upvote this reminder"
          onClick={() => onUpvote?.(id)}
        >
          ▲
        </Button>
        <span className="text-sm font-medium text-ink min-w-[1.5rem] text-center">{votes}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Downvote this reminder"
          onClick={() => onDownvote?.(id)}
        >
          ▼
        </Button>
        <Button
          type="button"
          variant={bookmarked ? 'accent' : 'ghost'}
          size="sm"
          aria-label={bookmarked ? 'Remove bookmark from this reminder' : 'Bookmark this reminder'}
          onClick={() => onBookmark?.(id)}
          className="ml-auto"
        >
          {bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
        </Button>
      </div>
    </Card>
  );
}