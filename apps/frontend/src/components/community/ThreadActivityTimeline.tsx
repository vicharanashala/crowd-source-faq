/**
 * ThreadActivityTimeline.tsx — Vertical timeline rendering the lifecycle
 * status history of a community post.
 *
 * Each entry shows: from-chip → to-chip, the change note, the actor name,
 * and the formatted timestamp. The vertical line and dots are pure CSS.
 *
 * Extracted from ThreadDetail.tsx (formerly lines 627-672) so the parent
 * component doesn't have to inline this entire 45-line block.
 */

import React from 'react';
import { LIFECYCLE_CONFIG, formatDate } from '../ui/threadUtils';

export interface LifecycleStatusHistoryEntry {
  from: string;
  to: string;
  changedBy?: { name?: string; _id?: string };
  changedAt: string;
  note?: string;
}

interface ThreadActivityTimelineProps {
  statusHistory: LifecycleStatusHistoryEntry[];
}

export default function ThreadActivityTimeline({ statusHistory }: ThreadActivityTimelineProps) {
  if (!statusHistory || statusHistory.length === 0) return null;

  return (
    <div className="px-6 sm:px-8 py-5 border-t border-border/30">
      <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3 flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="6" cy="6" r="5" />
          <path d="M6 3V6.5L8 8" strokeLinecap="round" />
        </svg>
        Lifecycle History
      </h3>
      <div className="relative pl-4">
        {/* Vertical timeline line */}
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        <div className="space-y-3">
          {statusHistory.map((entry, i) => {
            const lcTo = LIFECYCLE_CONFIG[entry.to];
            return (
              <div key={i} className="relative flex items-start gap-3">
                {/* Dot */}
                <div className="relative z-10 w-3 h-3 rounded-full border-2 border-border bg-card flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {LIFECYCLE_CONFIG[entry.from] && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${LIFECYCLE_CONFIG[entry.from].cls}`}>
                        {LIFECYCLE_CONFIG[entry.from].label}
                      </span>
                    )}
                    <span className="text-xs text-ink-faint">→</span>
                    {lcTo && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${lcTo.cls}`}>
                        {lcTo.label}
                      </span>
                    )}
                  </div>
                  {entry.note && <p className="text-xs text-ink-soft mt-0.5">{entry.note}</p>}
                  <p className="text-[10px] text-ink-faint mt-0.5">
                    by {entry.changedBy?.name || 'System'} · {formatDate(entry.changedAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
