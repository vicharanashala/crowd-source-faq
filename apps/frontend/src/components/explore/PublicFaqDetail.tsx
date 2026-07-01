// FAQ detail modal — opens when a user clicks a FAQ in any list.
// Fires the view + reading tracker on mount; closes on Esc, backdrop
// click, or the close button.

import React, { useEffect, useRef, useState } from 'react';
import { usePublicFaqById } from './usePublicFaqApi';
import { useExploreSession, useReadingTracker, useViewTracker } from './useReadingTracker';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { formatFullDate, formatReadTime, trustBadge } from './format';
import { highlightMatch } from './highlightMatch';
import type { PublicFaq } from './types';

interface PublicFaqDetailProps {
  faq: PublicFaq;
  batchId: string;
  highlightQuery?: string;
  onClose: () => void;
}

export function PublicFaqDetail({
  faq,
  batchId,
  highlightQuery,
  onClose,
}: PublicFaqDetailProps): React.ReactElement {
  // Refresh the FAQ to get the latest analytics fields, in case the
  // server has new data (e.g. updated word count after a backfill).
  const { data: live } = usePublicFaqById(faq._id);
  const current = live ?? faq;

  const sessionId = useExploreSession();
  const articleRef = useRef<HTMLElement>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  // Track view + reading
  useViewTracker(current._id, sessionId, batchId);
  const reading = useReadingTracker(current._id, sessionId, batchId, articleRef, {
    expectedReadMs: current.expectedReadMs,
  });

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while modal is open
  useBodyScrollLock(true);

  // Detect "end-of-article" for the reading-completion indicator
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const onScroll = (): void => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom - window.innerHeight < 8) setScrolledToEnd(true);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const badge = trustBadge(current.trustLevel);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ink/40 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`faq-title-${current._id}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl max-h-[88vh] bg-card rounded-2xl border border-border shadow-float flex flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-border/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[11px] text-ink-faint bg-mist px-1.5 py-0.5 rounded">
                {current.category}
              </span>
              {badge && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.tone}`}>
                  {badge.label}
                </span>
              )}
              {current.expectedReadMs > 0 && (
                <span className="text-[11px] text-ink-faint">
                  · {formatReadTime(current.expectedReadMs)}
                </span>
              )}
              {current.sourceType === 'zoom_transcript' && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cream text-ink-soft">
                  From meeting
                </span>
              )}
            </div>
            <h1
              id={`faq-title-${current._id}`}
              className="font-serif text-xl sm:text-2xl text-ink leading-snug"
            >
              {highlightQuery
                ? highlightMatch(current.question, highlightQuery)
                : current.question}
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-ink-faint hover:text-ink hover:bg-mist transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <article
          ref={articleRef}
          className="flex-1 overflow-y-auto p-6 sm:p-8 leading-relaxed text-ink whitespace-pre-line"
        >
          {current.answer}
        </article>

        <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:px-6 sm:py-4 border-t border-border/60 bg-cream/50">
          <div className="flex items-center gap-3 text-[11px] text-ink-faint">
            <span>Added {formatFullDate(current.createdAt)}</span>
            {current.guestViewCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{current.guestViewCount} {current.guestViewCount === 1 ? 'view' : 'views'}</span>
              </>
            )}
          </div>

          {/* Tiny reading progress — non-intrusive, just confirms the tracker is running. */}
          <div className="flex items-center gap-2 text-[11px] text-ink-faint">
            <div className="w-20 h-1.5 rounded-full bg-mist overflow-hidden">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: `${Math.round(reading.scrollPct * 100)}%` }}
                aria-hidden="true"
              />
            </div>
            <span aria-live="polite">
              {scrolledToEnd || reading.hasCompleted
                ? 'Completed'
                : `${Math.round(reading.scrollPct * 100)}% read`}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
