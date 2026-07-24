/**
 * v1.69 — Phase 12: UserActiveProgramIndicator
 *
 * Lightweight pill rendered at the top of the user-facing pages
 * (FAQ / Community / Support) so the user
 * always knows which program they're viewing. The pill is
 * derived from `BatchContext.currentBatch`; the navbar's
 * `BatchSwitcher` is the way to actually switch programs.
 *
 * For per-program data:
 *   - The home page course picker picks the course within the
 *     active program.
 *   - The FAQ / Community / Support pages
 *     already pull ?batchId=... from `currentBatch._id` via
 *     the existing hooks (this commit is a UX improvement, not
 *     a backend change).
 */

import React from 'react';
import { useBatch } from '../../context/BatchContext';
import { accentChipCompact, accentDot, accentTextMuted, textXsFaint } from '../../styles/style_config';

export default function UserActiveProgramIndicator(): React.ReactElement | null {
  const { currentBatch } = useBatch();
  if (!currentBatch) return null;
  return (
    <div
      className={`${accentChipCompact} mb-4`}
      data-testid="user-active-program-pill"
    >
      <span className={accentDot} />
      <span>Browsing program:</span>
      <span className="font-semibold text-ink">{currentBatch.name}</span>
      {currentBatch.isDefault && (
        <span className={accentTextMuted}>
          ★ Default
        </span>
      )}
      <span className={`${textXsFaint} hidden sm:inline`}>
        · use the program switcher in the navbar to change
      </span>
    </div>
  );
}
