/**
 * InternshipEndDateModal — Sign My Tee v1.87
 *
 * Compulsory, single-screen modal that every Summership-era user
 * sees the first time they hit any authenticated page, before they
 * can use the rest of the app. Pattern follows the existing
 * `ProjectSelectionModal` and `ZoomAssessmentModal`:
 *
 *   - AnimatePresence + framer-motion backdrop
 *   - useBodyScrollLock
 *   - `PATCH /auth/profile` with the entered date
 *   - On success, refresh the auth context so `user.internshipEndDate`
 *     updates everywhere atomically; close the modal.
 *
 * The user CANNOT dismiss the modal without entering a valid date
 * — there's no "Cancel" or "Skip" button, and clicking the backdrop
 * is a no-op (the gate provider intercepts the click). To prevent
 * the date from being "in the past", we set `min` to today's local
 * date — interns cannot accidentally set a date that's already
 * gone.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface Props {
  isOpen: boolean;
  onResolved: () => void;
}

function todayIso(): string {
  const d = new Date();
  // Format YYYY-MM-DD in local time. toISOString() would shift to UTC and
  // we want the user's wall-clock date, not where-the-server-is date.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function InternshipEndDateModal({ isOpen, onResolved }: Props) {
  const { fetchUser, user } = useAuth();
  const [value, setValue] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(isOpen);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value) {
      setError('Pick your Internship End Date.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.patch('/auth/profile', { internshipEndDate: value });
      await fetchUser();
      setSubmitting(false);
      onResolved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save the date.';
      setError(msg);
      setSubmitting(false);
    }
  };

  // Pre-fill with the user's current value if any (e.g. an admin reset).
  const initialValue =
    user?.internshipEndDate && typeof user.internshipEndDate === 'string'
      ? user.internshipEndDate.slice(0, 10)
      : user && (user as any).internshipEndDate instanceof Date
      ? ((user as any).internshipEndDate as Date).toISOString().slice(0, 10)
      : '';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop — we don't allow a click-through dismissal here
              because the spec mandates the user must enter the date. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-bg/90 backdrop-blur-md"
            aria-hidden
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="internship-end-title"
            className="relative w-full max-w-md bg-bg border border-border rounded-2xl shadow-2xl p-6 space-y-5"
          >
            <div className="text-center">
              <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h2 id="internship-end-title" className="text-2xl font-serif text-ink mb-1.5">
                Welcome to Summership
              </h2>
              <p className="text-sm text-ink-soft">
                Before we get started, please confirm when your <strong>Internship ends</strong>.
                We'll use this to open the <em>Sign My Tee</em> window 3 days around it.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="block text-xs font-medium text-ink-soft mb-1.5">
                  Internship End Date
                </span>
                <input
                  type="date"
                  required
                  min={todayIso()}
                  defaultValue={initialValue || ''}
                  onChange={(e) => { setValue(e.target.value); setError(null); }}
                  className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                />
              </label>

              {error && (
                <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !value}
                className="w-full px-5 py-3 rounded-xl bg-accent text-accent-text font-semibold hover:bg-accent-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-accent-text/30 border-t-accent-text animate-spin" />
                )}
                {submitting ? 'Saving…' : 'Continue'}
              </button>

              <p className="text-[11px] text-ink-faint text-center pt-1">
                This is a one-time setup. You can update it later from Account → Profile if needed.
              </p>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
