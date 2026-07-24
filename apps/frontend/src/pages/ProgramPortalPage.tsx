import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Footer from '../components/layout/Footer';
import { HomeDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useBatch } from '../context/BatchContext';
import { slugifyProgramName } from '../utils/programSlug';

interface PublicBatch {
  _id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isDefault?: boolean;
  faqCount: number;
}

interface BatchesResponse {
  batches: PublicBatch[];
}

/**
 * v1.69 — Program portal. Lists active programs and lets admins create new ones.
 */
export default function ProgramPortalPage() {
  const { user, isAuthenticated } = useAuth();
  const { setCurrentBatch, refresh: refreshContext } = useBatch();
  const navigate = useNavigate();

  const [batches, setBatches] = useState<PublicBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Create program modal state ────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const sixMonthsLater = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [form, setForm] = useState({
    name: '',
    description: '',
    startDate: today,
    endDate: sixMonthsLater,
  });

  const fetchBatches = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await api.get<BatchesResponse>('/batches', { signal });
      setBatches(res.data.batches ?? []);
      setError(null);
    } catch (e: unknown) {
      if (e instanceof Error && (e.name === 'CanceledError' || (e as any).code === 'ERR_CANCELED')) return;
      setError('Could not load programs. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchBatches(controller.signal);
    return () => controller.abort();
  }, [fetchBatches]);

  const isAdmin = user?.role === 'admin' || user?.role === 'moderator';

  const visibleBatches = useMemo(() => {
    if (isAdmin) return batches;
    const defaultB = batches.find((b) => b.isDefault);
    return defaultB ? [defaultB] : batches;
  }, [batches, isAdmin]);

  const sortedBatches = useMemo(() => {
    return [...visibleBatches].sort((a, b) => {
      const now = Date.now();
      const aLive = new Date(a.startDate).getTime() <= now && now <= new Date(a.endDate).getTime();
      const bLive = new Date(b.startDate).getTime() <= now && now <= new Date(b.endDate).getTime();
      if (aLive !== bLive) return aLive ? -1 : 1;
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    });
  }, [visibleBatches]);

  const handleEnter = (batch: PublicBatch): void => {
    setCurrentBatch(batch._id);
    const slug = slugifyProgramName(batch.name);
    navigate(`/program/${slug}`);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await api.post('/batches', {
        name: form.name,
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate,
        isActive: true,
      });
      // Refresh both local list and the global ProgramContext
      setLoading(true);
      await fetchBatches();
      await refreshContext();
      setShowCreate(false);
      setForm({ name: '', description: '', startDate: today, endDate: sixMonthsLater });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setCreateError(msg || 'Failed to create program. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-bg text-ink min-h-screen relative z-0">

      <div className="pointer-events-none absolute inset-0 z-[-1] overflow-hidden mt-16">
        <HomeDoodles />
      </div>

      <div className="pt-28 sm:pt-32 pb-20 px-4 sm:px-6 max-w-[1200px] mx-auto relative z-10">
        <div className="flex flex-col items-center mb-12 text-center">
          <motion.span
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full bg-accent-light/40 border border-accent/20 text-accent text-xs font-semibold tracking-wide uppercase"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Programs at Vicharanashala Lab, IIT Ropar
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            className="text-4xl sm:text-6xl font-serif tracking-tight text-ink text-glow-spatial mb-4"
          >
            {isAdmin
              ? 'Choose a program'
              : sortedBatches.length === 1
                ? sortedBatches[0].name
                : 'Choose a program'}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-ink-soft max-w-2xl"
          >
            {isAdmin
              ? "Every FAQ, community thread, and Zoom transcript is scoped to a single program run. Pick the one you're working on, or create a new one."
              : sortedBatches.length === 1
                ? 'This is the current program. Click below to enter.'
                : 'Pick a program run to enter.'}
          </motion.p>

          {/* Admin: Create program button */}
          {isAdmin && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={() => setShowCreate(true)}
              id="create-program-btn"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-bg font-semibold text-sm hover:bg-accent/90 transition-all duration-150 shadow-md hover:shadow-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Create New Program
            </motion.button>
          )}
        </div>

        {error && (
          <div className="max-w-md mx-auto rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-ink-soft mb-8">
            {error}
          </div>
        )}

        {loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-border/60 bg-card/60 p-6 animate-pulse h-56"
              />
            ))}
          </div>
        )}

        {!loading && !error && sortedBatches.length === 0 && (
          <div className="max-w-md mx-auto rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
            <div className="text-4xl mb-4">🗂️</div>
            <p className="text-base text-ink font-medium mb-2">
              No programs yet.
            </p>
            <p className="text-sm text-ink-soft mb-5">
              {isAdmin
                ? "Create the first program to get started. Everything — FAQs, community posts, and Zoom transcripts — will be scoped to it."
                : 'Programs appear here once an admin creates them.'}
            </p>
            {isAdmin && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-bg font-semibold text-sm hover:bg-accent/90 transition-all duration-150"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Create First Program
              </button>
            )}
          </div>
        )}

        {!loading && !error && sortedBatches.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {sortedBatches.map((b) => {
              const slug = slugifyProgramName(b.name);
              const now = Date.now();
              const isLive = new Date(b.startDate).getTime() <= now && now <= new Date(b.endDate).getTime();
              const isUpcoming = new Date(b.startDate).getTime() > now;
              const status = isLive ? 'Live' : isUpcoming ? 'Upcoming' : 'Archived';
              return (
                <motion.button
                  key={b._id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleEnter(b)}
                  className="text-left rounded-2xl border border-border/60 bg-card/80 hover:bg-card hover:border-accent/40 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] p-6 transition-all duration-200 group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                          isLive
                            ? 'bg-accent/20 text-accent'
                            : isUpcoming
                              ? 'bg-warning/15 text-warning'
                              : 'bg-mist text-ink-faint'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isLive
                              ? 'bg-accent animate-pulse'
                              : isUpcoming
                                ? 'bg-warning'
                                : 'bg-ink-faint'
                          }`}
                        />
                        {status}
                      </span>
                      {b.isDefault && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-accent/15 text-accent border border-accent/30">
                          Featured
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-ink-faint font-mono">
                      /{slug}
                    </span>
                  </div>
                  <h3 className="font-serif text-xl text-ink mb-2 group-hover:text-accent transition-colors">
                    {b.name}
                  </h3>
                  {b.description && (
                    <p className="text-sm text-ink-soft line-clamp-3 mb-4">
                      {b.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-ink-faint mt-auto">
                    <span>
                      {new Date(b.startDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                      {' → '}
                      {new Date(b.endDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </span>
                    <span className="ml-auto">
                      {b.faqCount} {b.faqCount === 1 ? 'FAQ' : 'FAQs'}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {!isAuthenticated && !loading && (
          <div className="mt-16 text-center text-sm text-ink-soft">
            <p>
              Want to ask questions or join the community?{' '}
              <button
                onClick={() => navigate('/?signin=1')}
                className="text-accent font-semibold hover:underline"
              >
                Sign in
              </button>
              .
            </p>
          </div>
        )}
      </div>

      <Footer />

      {/* ── Create Program Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full max-w-lg bg-card border border-border/80 rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-serif text-ink">Create New Program</h2>
                <button
                  onClick={() => setShowCreate(false)}
                  className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-mist transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-1.5">
                    Program Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="program-name-input"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Summer Internship 2026"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                    maxLength={120}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-1.5">
                    Description
                  </label>
                  <textarea
                    id="program-description-input"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What is this program about? (optional)"
                    rows={3}
                    maxLength={1000}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink-soft mb-1.5">
                      Start Date <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="program-start-date"
                      type="date"
                      required
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-soft mb-1.5">
                      End Date <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="program-end-date"
                      type="date"
                      required
                      value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg text-ink focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                    />
                  </div>
                </div>

                {createError && (
                  <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                    {createError}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border text-ink-soft font-medium text-sm hover:bg-mist transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="program-create-submit"
                    disabled={creating || !form.name.trim()}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-bg font-semibold text-sm hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {creating ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Creating…
                      </span>
                    ) : 'Create Program'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
