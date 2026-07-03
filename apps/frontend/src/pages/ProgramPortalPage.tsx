import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  /** v1.69 — true for the single program the admin has flagged as
   *  the one to show to non-admin visitors on the home page. */
  isDefault?: boolean;
  faqCount: number;
}

interface BatchesResponse {
  batches: PublicBatch[];
}

/**
 * v1.69 — Program portal. The home page `/` is now the entry point to
 * every program run. It lists active programs as cards and lets an
 * admin create a new one. Clicking a card sets that program as the
 * active one in `BatchContext` and routes to `/program/:slug`.
 *
 * Replaces the previous HomePage that rendered a single batch's FAQ
 * feed. The FAQ feed still exists; it now lives at `/program/:slug`.
 */
export default function ProgramPortalPage() {
  const { user, isAuthenticated } = useAuth();
  const { setCurrentBatch } = useBatch();
  const navigate = useNavigate();

  const [batches, setBatches] = useState<PublicBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await api.get<BatchesResponse>('/batches', { signal: controller.signal });
        setBatches(res.data.batches ?? []);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'CanceledError') return;
        setError('Could not load programs. Please refresh.');
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'moderator';

  /**
   * v1.69 — visibility model:
   * - Admins see every active program (they need to manage all of them).
   * - Non-admins see ONLY the program flagged `isDefault: true`. That's
   *   the single program the admin has "selected" via the "Set as
   *   default" action on /admin/batches. Until an admin picks one,
   *   visitors see every active program (the legacy portal behaviour)
   *   so the page never appears empty by accident.
   */
  const visibleBatches = useMemo(() => {
    if (isAdmin) return batches;
    const defaultB = batches.find((b) => b.isDefault);
    return defaultB ? [defaultB] : batches;
  }, [batches, isAdmin]);

  const sortedBatches = useMemo(() => {
    return [...visibleBatches].sort((a, b) => {
      // Live programs first (start ≤ now ≤ end), then upcoming, then ended
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
              ? 'Every FAQ, community thread, and Zoom transcript is scoped to a single program run. Pick the one you\'re working on, or create a new one.'
              : sortedBatches.length === 1
                ? 'This is the current program. Click below to enter.'
                : 'Pick a program run to enter.'}
          </motion.p>

          {/* Programs are created and managed exclusively from
              /admin/batches. The portal at /programs is read-only —
              for switching between existing programs only. */}
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
            <p className="text-base text-ink font-medium mb-2">
              No programs yet.
            </p>
            <p className="text-sm text-ink-soft">
              {isAdmin
                ? 'Create the first program from the admin panel to get started.'
                : 'Programs appear here once an admin creates them.'}
            </p>
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
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-mist text-ink-faint'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isLive
                              ? 'bg-accent animate-pulse'
                              : isUpcoming
                                ? 'bg-amber-500'
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
    </div>
  );
}
