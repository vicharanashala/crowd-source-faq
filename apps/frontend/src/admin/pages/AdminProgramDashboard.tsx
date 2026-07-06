/**
 * v1.69 — Phase 10: Admin Program Dashboard.
 *
 * Grid of every program with at-a-glance health stats:
 *   - enrolled user count (ProgramEnrollment)
 *   - open support tickets
 *   - unanswered community posts
 *   - FAQ count
 *   - Zoom meetings count
 *   - isDefault flag
 *
 * Click a card → AdminProgramDetail (the tabbed per-program
 * view with Settings / Courses / Members / AI / Zoom / Discord
 * / Features / Support shortcuts).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import adminApi from '../utils/adminApi';
import { useBatch } from '../../context/BatchContext';
import { CardSkeleton } from '../../components/explore/ExploreSkeleton';
import CreateProgramModal from '../components/program/CreateProgramModal';

interface ProgramListItem {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  status: 'draft' | 'active' | 'archived' | 'completed';
  enrollmentMode: 'open' | 'invite_only' | 'closed';
  startDate: string;
  endDate: string;
  faqCount?: number;
  courseCount?: number;
  enrollmentCount?: number;
  openSupportCount?: number;
  openCommunityCount?: number;
  zoomMeetingCount?: number;
}

interface ToastState { msg: string; type: 'success' | 'error' | 'info'; }

function StatPill({ label, value, tone }: { label: string; value: number | string; tone?: 'green' | 'amber' | 'red' | 'neutral' }) {
  const palette = {
    green:  'bg-accent/10 text-accent border-accent/30',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    red:    'bg-rose-50 text-rose-700 border-rose-200',
    neutral:'bg-mist text-ink-soft border-border/60',
  } as const;
  return (
    <div className={`rounded-md border px-2 py-1 text-[10px] font-medium ${palette[tone ?? 'neutral']}`}>
      <span className="opacity-75">{label}</span> {value}
    </div>
  );
}

function ProgramCard({ p, onOpen }: { p: ProgramListItem; onOpen: (id: string) => void }) {
  const statusTone =
    p.status === 'active'   ? 'green'  :
    p.status === 'draft'    ? 'neutral':
    p.status === 'completed'? 'amber'  :
                              'red';
  return (
    <motion.button
      whileHover={{ y: -2 }}
      onClick={() => onOpen(p._id)}
      className="text-left rounded-2xl border border-border/60 bg-card p-5 hover:shadow-subtle transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink truncate">{p.name}</h3>
          <p className="text-[11px] text-ink-faint">
            {new Date(p.startDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            {' → '}
            {new Date(p.endDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
          {p.isDefault && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              ★ Default
            </span>
          )}
          <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${
            statusTone === 'green'  ? 'bg-accent/15 text-accent' :
            statusTone === 'amber'  ? 'bg-amber-100 text-amber-700' :
            statusTone === 'red'    ? 'bg-rose-100 text-rose-700' :
                                      'bg-mist text-ink-soft'
          }`}>
            {p.status}
          </span>
        </div>
      </div>
      {p.description && (
        <p className="text-[12px] text-ink-soft line-clamp-2 mb-3">{p.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <StatPill label="FAQs"        value={p.faqCount ?? '—'} tone="neutral" />
        <StatPill label="Courses"     value={p.courseCount ?? '—'} tone="neutral" />
        <StatPill label="Members"     value={p.enrollmentCount ?? '—'} tone="green" />
        {typeof p.openSupportCount === 'number' && p.openSupportCount > 0 && (
          <StatPill label="Open support" value={p.openSupportCount} tone="amber" />
        )}
        {typeof p.openCommunityCount === 'number' && p.openCommunityCount > 0 && (
          <StatPill label="Open community" value={p.openCommunityCount} tone="amber" />
        )}
        <StatPill label="Zoom"        value={p.zoomMeetingCount ?? '—'} tone="neutral" />
      </div>
    </motion.button>
  );
}

export default function AdminProgramDashboard(): React.ReactElement {
  const { availableBatches, refresh: refreshBatches } = useBatch();
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<ProgramListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'draft' | 'archived' | 'completed'>('all');
  const [createOpen, setCreateOpen] = useState(false);

  

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Fetch the admin batch list with stats. The /admin/all
      // endpoint returns every program (active + inactive);
      // we cross-reference with the local BatchContext to
      // surface the friendly name and isDefault flag.
      const res = await adminApi.get<{ batches: ProgramListItem[] }>('/batches/admin/all');
      setPrograms(res.data.batches ?? []);
    } catch (err) {
      setError('Failed to load programs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!programs) return [];
    if (filter === 'all') return programs;
    return programs.filter((p) => p.status === filter);
  }, [programs, filter]);

  const counts = useMemo(() => {
    if (!programs) return { all: 0, active: 0, draft: 0, archived: 0, completed: 0 };
    return {
      all: programs.length,
      active: programs.filter((p) => p.status === 'active').length,
      draft: programs.filter((p) => p.status === 'draft').length,
      archived: programs.filter((p) => p.status === 'archived').length,
      completed: programs.filter((p) => p.status === 'completed').length,
    };
  }, [programs]);

  const openDetail = (id: string): void => {
    void navigate(`/admin/programs/${id}`);
  };

  // v1.69 — multi-program provisioning: after a successful create, the
  // backend has already provisioned ProgramConfig, ProgramSettings, and
  // per-program FeatureFlag overrides. We land the admin on the new
  // program's detail view so they can immediately start populating it
  // (FAQs, categories, welcome kit, Zoom, etc.).
  const handleCreated = (batch: { _id: string; name: string }): void => {
    setToast({ msg: `Created "${batch.name}". Provisioned workspace ready.`, type: 'success' });
    void load();
    void refreshBatches();
    void navigate(`/admin/programs/${batch._id}`);
  };

  return (
    <div className="space-y-5">
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${
            toast.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' :
            toast.type === 'info'  ? 'bg-accent/10 text-accent border-accent/30' :
                                     'bg-accent/10 text-accent border-accent/30'
          }`}
        >
          {toast.msg}
        </motion.div>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-ink">Programs</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            Each program is a self-contained cohort with its own FAQs, courses, AI config,
            Zoom + Discord credentials, feature flag overrides, and member roster.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void load(); void refreshBatches(); }}
            className="admin-btn-ghost text-xs"
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link
            to="/admin/courses"
            className="admin-btn-ghost text-xs"
          >
            Manage courses
          </Link>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="admin-btn-primary text-xs"
            data-testid="create-program-button"
          >
            + Create program
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['all', 'active', 'draft', 'archived', 'completed'] as const).map((k) => {
          const isActive = filter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-accent-text'
                  : 'bg-mist text-ink-soft hover:bg-cream'
              }`}
            >
              {k.charAt(0).toUpperCase() + k.slice(1)}{' '}
              <span className="opacity-60">({counts[k]})</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          {error} <button type="button" onClick={() => { void load(); }} className="underline ml-2">Retry</button>
        </div>
      )}

      {loading && programs === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="text-sm text-ink-soft">
            {filter === 'all'
              ? 'No programs yet. Click "+ Create program" above to provision a new workspace.'
              : `No programs with status "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProgramCard key={p._id} p={p} onOpen={openDetail} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink-faint">
        Tip: {availableBatches.length} program{availableBatches.length === 1 ? '' : 's'} in the
        public-facing BatchSwitcher. Click any card to open the per-program detail view.
      </p>

      <CreateProgramModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
