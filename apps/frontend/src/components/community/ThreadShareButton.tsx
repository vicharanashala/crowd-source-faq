/**
 * ThreadShareButton.tsx — Copy-to-clipboard share button.
 *
 * The default onCopy writes `${origin}/community?post=${postId}` to the
 * clipboard and surfaces a success message via the provided callback.
 * The parent owns the success-banner timing.
 *
 * Extracted from ThreadDetail.tsx (formerly in the modal header actions
 * row) so the same visual can be reused on PostDetailDialog and any
 * future post-detail surface.
 */

import React from 'react';

interface ThreadShareButtonProps {
  postId: string;
  /** Called after a successful copy. Pass a setter for the action-error banner. */
  onCopied?: (message: string) => void;
  size?: 'sm' | 'md';
}

export default function ThreadShareButton({
  postId,
  onCopied,
  size = 'md',
}: ThreadShareButtonProps) {
  const dim = size === 'sm' ? 12 : 14;
  const box = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  return (
    <button
      onClick={() => {
        const url = `${window.location.origin}/csfaq/community?post=${postId}`;
        navigator.clipboard
          .writeText(url)
          .then(() => onCopied?.('Post link copied to clipboard'))
          .catch(() => onCopied?.('Could not copy link to clipboard'));
      }}
      className={`${box} rounded-xl bg-mist text-ink-soft hover:bg-border hover:text-ink flex items-center justify-center transition-all`}
      title="Copy link"
    >
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <path d="M5.5 3.5H3.5a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1v-2M8.5 1.5h4v4M6 8l4.5-4.5" />
      </svg>
    </button>
  );
}
