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

export default function UserActiveProgramIndicator(): React.ReactElement | null {
  const { currentBatch } = useBatch();
  if (!currentBatch) return null;
  return (
    <div
      className="inline-flex items-center gap-2 text-[11px] font-medium text-ink-faint bg-card/70 border border-border/60 rounded-full px-3 py-1 mb-4"
      data-testid="user-active-program-pill"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
      <span>Browsing program:</span>
      <span className="font-semibold text-ink">{currentBatch.name}</span>
      {currentBatch.isDefault && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-accent">
          ★ Default
        </span>
      )}
      <span className="text-ink-faint text-[10px] hidden sm:inline">
        · use the program switcher in the navbar to change
      </span>
    </div>
  );
}
