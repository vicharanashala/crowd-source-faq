// NOTE:
// This component should remain presentational.
// Do not add business logic or data fetching here.
// Community Pinboard — page header.
// Presentational only: title + subtitle + an optional icon slot. Owns no
// state — `icon` is passed in by the parent so a teammate can wire up a
// real icon/widget later without editing this file.

import React from 'react';

interface CommunityPinboardHeaderProps {
  /**
   * Optional icon/element rendered to the left of the title.
   * TODO(owner: widget folder contributor): pass a real icon/illustration
   * here once the pinboard widget/branding is ready. Left undefined for
   * now — no default icon is rendered.
   */
  icon?: React.ReactNode;
}

export default function CommunityPinboardHeader({
  icon,
}: CommunityPinboardHeaderProps): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl text-ink tracking-tight">
          Community Pinboard
        </h1>
        <p className="text-sm text-ink-soft mt-1">
          Community-curated reminders and resources.
        </p>
      </div>
    </div>
  );
}