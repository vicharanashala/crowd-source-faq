/**
 * v1.69 — Phase 12: AdminActiveProgramIndicator
 *
 * Small banner-style widget for the admin layout that surfaces
 * the currently active program (from BatchContext) so the
 * admin always knows which program their per-program
 * mutations are targeting. Clicking the chip navigates to the
 * program detail view; the dropdown lets the admin switch the
 * active program in-place.
 *
 * The active-program state lives in `BatchContext.currentBatch`.
 * `setCurrentBatch` is a server round-trip; the local cache is
 * refreshed in-place so the rest of the app sees the new active
 * program on the next render.
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useBatch } from '../../../context/BatchContext';
import type { Batch } from '../../../context/BatchContext';

export default function AdminActiveProgramIndicator(): React.ReactElement | null {
  const { currentBatch, availableBatches, setCurrentBatch } = useBatch();
  
  const [open, setOpen] = useState(false);

  if (!currentBatch) {
    return (
      <Link
        to="/admin/programs"
        className="inline-flex items-center gap-2 text-[11px] font-medium text-ink-faint hover:text-ink"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
        No program selected — set a default →
      </Link>
    );
  }

  const select = (b: Batch): void => {
    setOpen(false);
    setCurrentBatch(b._id);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 text-[11px] font-medium text-ink hover:text-ink group"
        data-testid="active-program-chip"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span>Active program:</span>
        <span className="font-semibold">{currentBatch.name}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50 group-hover:opacity-100">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute right-0 top-full mt-1 w-72 rounded-xl border border-border/60 bg-card shadow-lg overflow-hidden z-40"
          >
            <div className="p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint px-2 py-1">
                Switch active program
              </p>
              <div className="max-h-64 overflow-y-auto">
                {availableBatches.length === 0 ? (
                  <p className="text-[11px] text-ink-faint px-2 py-3">
                    No programs available.
                  </p>
                ) : (
                  availableBatches.map((b) => {
                    const isActive = b._id === currentBatch._id;
                    return (
                      <button
                        key={b._id}
                        type="button"
                        onClick={() => select(b)}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 ${
                          isActive ? 'bg-mist text-ink' : 'text-ink-soft hover:bg-cream hover:text-ink'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isActive ? 'bg-emerald-500' : 'bg-border'
                          }`}
                        />
                        <span className="truncate flex-1">{b.name}</span>
                        {b.isDefault && (
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-accent">
                            ★ Default
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div className="border-t border-border/60 p-2 flex items-center justify-between">
              <Link
                to={`/admin/programs/${currentBatch._id}`}
                onClick={() => setOpen(false)}
                className="text-[11px] text-accent hover:underline"
              >
                Open program details →
              </Link>
              <Link
                to="/admin/programs"
                onClick={() => setOpen(false)}
                className="text-[11px] text-ink-soft hover:text-ink"
              >
                All programs
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
