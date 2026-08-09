/**
 * LinkCard.tsx — Reusable card for a single Important Link.
 *
 * Reuses:
 *  - `Card` (ui/Card) for the shell
 *  - `Badge` (ui/Badge) for the category chip
 *  - `StatusBadge` (community/moderation, status="official") for the
 *    Official badge — built in the Community Moderation module, reused
 *    here rather than re-implementing badge logic
 *  - `Button` (ui/Button) for the Open action
 *  - `CopyLinkButton` for the Copy Link action
 *
 * Pure/presentational — no API calls. `onOpen` is optional; if omitted,
 * the Open button falls back to `window.open(url, '_blank', 'noopener,noreferrer')`.
 */

import React from 'react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import StatusBadge from '../moderation/StatusBadge';
import CopyLinkButton from './CopyLinkButton';
import { textBodyFaint, textHeaderSm } from '../../../styles/style_config';
import type { ImportantLink } from './types';

export interface LinkCardProps {
  link: ImportantLink;
  /** Optional override for the Open action (e.g. to log analytics before navigating). */
  onOpen?: (link: ImportantLink) => void;
  className?: string;
}

export default function LinkCard({ link, onOpen, className = '' }: LinkCardProps) {
  const handleOpen = () => {
    if (onOpen) {
      onOpen(link);
      return;
    }
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card variant="elevated" className={`p-5 flex flex-col gap-3 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">
            {link.icon}
          </span>
          <h3 className={`${textHeaderSm} truncate`}>{link.title}</h3>
        </div>
        {link.isOfficial && <StatusBadge status="official" />}
      </div>

      <p className={`${textBodyFaint} line-clamp-2`}>{link.description}</p>

      <div>
        <Badge variant="accent">{link.category}</Badge>
      </div>

      <div className="flex items-center gap-2 pt-1 mt-auto">
        <Button type="button" variant="primary" size="sm" onClick={handleOpen}>
          <span aria-hidden="true">↗️</span>
          <span>Open</span>
        </Button>
        <CopyLinkButton url={link.url} />
      </div>
    </Card>
  );
}
