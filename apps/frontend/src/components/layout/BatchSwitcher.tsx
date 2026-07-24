// BatchSwitcher — pill button + dropdown shown in the top bar of every
// page. Lists active batches, allows one-click switching, and surfaces
// a "+ Create new" link (admin only) that opens the admin batches page.
//
// Renders as a clickable pill on mobile (opens a full-width bottom sheet)
// and as a hover dropdown on desktop. The visual style matches the
// existing topbar pill buttons.

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatch } from '../../context/BatchContext';
import {
  topbarCreateButton,
  topbarDropdown,
  topbarDropdownFooter,
  topbarDropdownHeader,
  topbarDropdownItem,
  topbarDropdownItemIcon,
  topbarDropdownItemIconAccent,
  topbarDropdownItemSelected,
  topbarPill,
  topbarPillCompact,
  topbarPillDot,
  textXs,
  textXsFaint,
  textXsLabel,
} from '../../styles/style_config';

interface BatchSwitcherProps {
  /** When true, shows a "Create new" link that goes to /admin/batches. */
  showCreateLink?: boolean;
  /** Compact variant for use in tighter layouts (footer, sidebar). */
  compact?: boolean;
  className?: string;
}

export function BatchSwitcher({
  showCreateLink = false,
  compact = false,
  className = '',
}: BatchSwitcherProps): React.ReactElement | null {
  const { currentBatch, availableBatches, loading, setCurrentBatch } = useBatch();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading && !currentBatch) {
    return (
      <div
        className={`${topbarPillCompact} ${className}`}
        aria-busy="true"
      >
        <span className={topbarPillDot} />
        <span>Loading programs…</span>
      </div>
    );
  }

  if (!currentBatch) {
    // Nothing to switch to yet — render an empty "Pick a program" pill
    // that links to the portal picker.
    return (
      <a
        href="/explore/select"
        className={`${topbarPill} ${className}`}
      >
        <LayersIcon className="text-accent" />
        <span>Pick a program</span>
      </a>
    );
  }

  const handlePick = (id: string): void => {
    if (id !== currentBatch._id) {
      setCurrentBatch(id);
    }
    setOpen(false);
  };

  const handleCreate = (): void => {
    setOpen(false);
    navigate('/admin/batches');
  };

  return (
    <div data-tour="program-selector" ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={compact ? topbarPillCompact : topbarPill}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Current program: ${currentBatch.name}. Click to switch.`}
      >
        <LayersIcon className="text-accent" />
        <span className="truncate max-w-[140px] sm:max-w-[200px]">{currentBatch.name}</span>
        <svg
          className={`text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch program"
          className={topbarDropdown}
        >
          <div className={topbarDropdownHeader}>
            <p className={textXsLabel}>
              Switch program
            </p>
            <p className={`${textXs} text-ink-soft mt-1`}>
              Only FAQs and analytics for the selected program are shown.
            </p>
          </div>

          <ul className="max-h-80 overflow-y-auto py-1.5">
            {availableBatches.length === 0 && (
              <li className="px-4 py-3 text-xs text-ink-soft">
                No active programs yet.
              </li>
            )}
            {availableBatches.map((b) => {
              const selected = b._id === currentBatch._id;
              return (
                <li key={b._id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handlePick(b._id)}
                    className={`group ${selected ? topbarDropdownItemSelected : topbarDropdownItem}`}
                  >
                    <span
                      className={selected ? topbarDropdownItemIconAccent : topbarDropdownItemIcon}
                    >
                      <LayersIcon compact />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-ink truncate">
                        {b.name}
                      </span>
                      <span className={`flex items-center gap-2 text-[11px] ${textXsFaint} mt-0.5`}>
                        <span>{b.faqCount} {b.faqCount === 1 ? 'FAQ' : 'FAQs'}</span>
                        {b.startDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatDateRange(b.startDate, b.endDate)}</span>
                          </>
                        )}
                      </span>
                    </span>
                    {selected && (
                      <svg className="shrink-0 text-accent mt-1.5" width="14" height="14"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {showCreateLink && (
            <div className={topbarDropdownFooter}>
              <button
                type="button"
                onClick={handleCreate}
                className={topbarCreateButton}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create new program
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function LayersIcon({ className = '', compact = false }: { className?: string; compact?: boolean }): React.ReactElement {
  return (
    <svg
      className={className}
      width={compact ? 14 : 14}
      height={compact ? 14 : 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function formatDateRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
    const fmt = (d: Date): string =>
      d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    return `${fmt(s)} – ${fmt(e)}`;
  } catch {
    return '';
  }
}
