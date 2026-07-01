// Skeleton + empty state components for the explore page.

import React from 'react';

export function CardSkeleton({ rows = 5 }: { rows?: number }): React.ReactElement {
  return (
    <div
      className="bg-card rounded-2xl border border-border p-5 animate-pulse"
      aria-busy="true"
      aria-label="Loading…"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-4 bg-mist rounded" />
        <div className="h-4 w-32 bg-mist rounded" />
      </div>
      <div className="space-y-3.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="h-5 w-5 bg-mist rounded shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="h-3.5 bg-mist rounded w-5/6 mb-1.5" />
              <div className="h-2.5 bg-mist/60 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SearchSkeleton(): React.ReactElement {
  return (
    <div
      className="bg-card rounded-2xl border border-border p-5 animate-pulse"
      aria-busy="true"
    >
      <div className="h-3 w-32 bg-mist rounded mb-3" />
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 bg-mist/60 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4 h-full min-h-[160px]">
      {icon ?? (
        <div className="w-10 h-10 rounded-full bg-mist flex items-center justify-center mb-3 text-ink-faint">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="text-xs text-ink-soft mt-1">{hint}</p>}
    </div>
  );
}
