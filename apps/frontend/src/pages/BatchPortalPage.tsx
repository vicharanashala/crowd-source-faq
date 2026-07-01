// BatchPortalPage — the "choose a program" picker. Shown to anonymous
// visitors who land on the public site without a previously-selected
// batch, and to anyone who clicks "Pick a program" in the BatchSwitcher.
//
// Renders a card grid: each card is a batch with name, description,
// date range, and FAQ count. Clicking a card sets the active batch
// (via setCurrentBatch) and navigates to the explore page.

import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBatch } from '../context/BatchContext';
import Spinner from '../components/ui/Spinner';
import Footer from '../components/layout/Footer';

export default function BatchPortalPage(): React.ReactElement {
  const { availableBatches, currentBatch, loading, error, setCurrentBatch } = useBatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Where to send the user after they pick a batch. Default: / (ExplorePage)
  const next = searchParams.get('next') || '/';

  // If we already have a batch selected (URL had ?batch=X or localStorage),
  // bounce straight to the destination — no need to re-pick.
  useEffect(() => {
    if (currentBatch) {
      navigate(next, { replace: true });
    }
  }, [currentBatch, next, navigate]);

  const handlePick = (id: string): void => {
    if (setCurrentBatch(id)) {
      navigate(next, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      <header className="border-b border-border/60 bg-bg/85 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group" aria-label="FAQ Hive home">
            <span className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-accent group-hover:border-accent/60 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M9 7h7M9 11h5" />
              </svg>
            </span>
            <span className="font-serif text-base text-ink">FAQ Hive</span>
          </a>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
          {/* ─── Hero ──────────────────────────────────────────────── */}
          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 text-accent mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl text-ink leading-tight">
              Choose a Program
            </h1>
            <p className="text-sm sm:text-base text-ink-soft mt-3">
              Each program has its own FAQ library. Pick the one you're
              interested in — you can switch any time.
            </p>
          </div>

          {/* ─── States ────────────────────────────────────────────── */}
          <div className="mt-10 sm:mt-14">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-12 text-ink-soft">
                <Spinner size="lg" />
                <p className="text-sm">Loading programs…</p>
              </div>
            ) : error ? (
              <div className="max-w-md mx-auto text-center p-6 bg-card border border-border rounded-2xl">
                <p className="text-sm font-medium text-ink">{error}</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-3 text-xs text-accent font-medium hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : availableBatches.length === 0 ? (
              <div className="max-w-md mx-auto text-center p-8 bg-card border border-border rounded-2xl">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-mist text-ink-faint mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-ink">No programs are open right now</p>
                <p className="text-xs text-ink-soft mt-2">
                  Check back later — new programs open throughout the year.
                </p>
              </div>
            ) : (
              <ul
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                aria-label="Available programs"
              >
                {availableBatches.map((b) => (
                  <li key={b._id}>
                    <button
                      type="button"
                      onClick={() => handlePick(b._id)}
                      className="group w-full text-left bg-card rounded-2xl border border-border p-5 hover:border-accent/60 hover:shadow-card-hover transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-text transition-colors">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polygon points="12 2 2 7 12 12 22 7 12 2" />
                            <polyline points="2 17 12 22 22 17" />
                            <polyline points="2 12 12 17 22 12" />
                          </svg>
                        </span>
                        <span className="text-[11px] text-ink-faint bg-mist px-2 py-0.5 rounded tabular-nums">
                          {b.faqCount} {b.faqCount === 1 ? 'FAQ' : 'FAQs'}
                        </span>
                      </div>
                      <h2 className="font-serif text-lg text-ink leading-snug group-hover:text-accent transition-colors">
                        {b.name}
                      </h2>
                      {b.description && (
                        <p className="text-xs text-ink-soft mt-2 line-clamp-3 leading-relaxed">
                          {b.description}
                        </p>
                      )}
                      {b.startDate && b.endDate && (
                        <p className="text-[11px] text-ink-faint mt-3 flex items-center gap-1.5">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          {formatDateRange(b.startDate, b.endDate)}
                        </p>
                      )}
                      <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                        <span className="text-[11px] text-ink-faint uppercase tracking-wider font-semibold">
                          Browse FAQs
                        </span>
                        <svg className="text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function formatDateRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
    const fmt = (d: Date): string =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(s)} – ${fmt(e)}`;
  } catch {
    return '';
  }
}
