/**
 * OutdatedBadge — sleek, non-intrusive warning chip for the top-right
 * corner of a KnowledgePostCard. Renders nothing when `isOutdated` is
 * false so callers can mount it unconditionally.
 */

import React from 'react';

interface OutdatedBadgeProps {
  isOutdated: boolean;
}

export default function OutdatedBadge({ isOutdated }: OutdatedBadgeProps): React.ReactElement | null {
  if (!isOutdated) return null;

  return (
    <span
      title="This answer is over 6 months old and may no longer be accurate"
      className="
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full
        text-[11px] font-medium leading-none
        bg-warning-light text-warning border border-warning/20
        whitespace-nowrap
      "
    >
      <span aria-hidden="true">⚠️</span>
      Might be outdated
    </span>
  );
}
