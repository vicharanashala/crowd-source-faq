/**
 * ThreadBookmarkButton.tsx — Standalone bookmark toggle for a community post.
 *
 * Owns no state of its own — the parent passes `isBookmarked` and
 * `onToggle`. The parent is responsible for the API call and optimistic
 * state update; this component just renders the icon and click handler.
 *
 * Extracted from ThreadDetail.tsx (formerly in the modal header actions
 * row) so the same visual can be reused on PostDetailDialog and the
 * SavedKnowledgePage without duplication.
 */

import React from 'react';

interface ThreadBookmarkButtonProps {
  isBookmarked: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
}

export default function ThreadBookmarkButton({
  isBookmarked,
  onToggle,
  size = 'md',
}: ThreadBookmarkButtonProps) {
  const dim = size === 'sm' ? 12 : 14;
  const box = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  return (
    <button
      onClick={onToggle}
      className={`${box} rounded-xl flex items-center justify-center transition-all ${
        isBookmarked
          ? 'bg-accent/10 text-accent'
          : 'bg-mist text-ink-soft hover:bg-border hover:text-ink'
      }`}
      title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
    >
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 14 14"
        fill={isBookmarked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <path d="M3.5 2h7v10l-3.5-2.5-3.5 2.5V2z" />
      </svg>
    </button>
  );
}
