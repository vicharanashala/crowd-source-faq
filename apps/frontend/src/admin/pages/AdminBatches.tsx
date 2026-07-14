/**
 * AdminBatches — DEPRECATED redirect page.
 *
 * v1.69 — Phase 10: the legacy `/admin/batches` page is
 * superseded by the Programs Hub at `/admin/programs`. The Hub
 * covers every batch admin action (CRUD on the dashboard, the
 * per-program detail view with 9 tabs, the legacy per-program
 * settings editor at `/admin/programs/:id/settings`, and the
 * courses CRUD at `/admin/courses`). This page renders a
 * clear deprecation notice and auto-redirects after a brief
 * delay so existing bookmarks don't 404.
 *
 * Keeping the route alive (rather than removing it) is
 * intentional: legacy links + browser history should still
 * work. The notice makes the migration visible to anyone who
 * has the old URL bookmarked.
 */

import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useBatch } from '../../context/BatchContext';

const REDIRECT_AFTER_MS = 4500;

export default function AdminBatches() {
  const { availableBatches, currentBatch } = useBatch();
  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(REDIRECT_AFTER_MS / 1000)
  );

  useEffect(() => {
    const t = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  // After the countdown hits zero, send the user to the
  // Programs Hub (or directly to the current program's
  // detail view if there is one).
  if (secondsLeft <= 0) {
    return <Navigate to={currentBatch ? `/admin/programs/${currentBatch._id}` : '/admin/programs'} replace />;
  }

  const quickLinks = [
    { to: '/admin/programs', label: 'Programs Hub', desc: 'Grid of every program with at-a-glance stats' },
    { to: '/admin/courses',  label: 'Courses',      desc: 'Per-program course CRUD' },
    { to: currentBatch ? `/admin/programs/${currentBatch._id}/settings` : '/admin/programs', label: 'Per-program settings', desc: 'Theme, hero, sections — for one program' },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-100 text-amber-700 shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-serif text-ink">
              /admin/batches has moved
            </h1>
            <p className="text-sm text-ink-soft mt-1">
              The legacy batch admin page is superseded by the
              new <strong>Programs Hub</strong>. Every action that
              lived here is now on the Hub:
            </p>
            <ul className="text-[12px] text-ink-soft mt-2 space-y-0.5 list-disc pl-4">
              <li>List every program with at-a-glance stats → Programs Hub</li>
              <li>Create / edit / archive a program → Programs Hub (top-right)</li>
              <li>Set a program as default → Programs Hub (★ icon)</li>
              <li>Theme / hero / sections → per-program Settings tab</li>
              <li>Courses → /admin/courses (per-program filter)</li>
            </ul>
          </div>
        </div>
      </motion.div>

      <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-3">
        <p className="text-sm font-semibold text-ink">Quick links</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {quickLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="block rounded-xl border border-border/60 bg-card/40 p-3 hover:border-accent/40 hover:bg-accent/5 transition-colors"
            >
              <p className="text-sm font-medium text-ink">{l.label}</p>
              <p className="text-[11px] text-ink-soft mt-0.5">{l.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {availableBatches.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
          <p className="text-sm font-semibold text-ink">Jump to a specific program</p>
          <p className="text-[11px] text-ink-soft mt-1">
            Click a row to open that program's detail view (9 tabs: Overview, Settings, Courses, Members, AI, Zoom, Discord, Features, Support, AppSettings).
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {availableBatches.map((b) => (
              <Link
                key={b._id}
                to={`/admin/programs/${b._id}`}
                className="text-[11px] font-medium px-3 py-1 rounded-md border border-border/60 bg-mist text-ink-soft hover:bg-cream hover:text-ink"
              >
                {b.name}{b.isDefault ? ' ★' : ''}
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-ink-faint text-center">
        Auto-redirecting in {secondsLeft}s — or click a link above.
      </p>
    </div>
  );
}
