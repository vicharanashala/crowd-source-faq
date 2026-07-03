import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import adminApi from '../../utils/adminApi';

interface CreatedBatch {
  _id: string;
  name: string;
}

interface CreateProgramModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (batch: CreatedBatch) => void;
}

/**
 * CreateProgramModal — self-service program creation.
 *
 * Posts to POST /api/batches. The backend immediately calls
 * `bootstrapProgram()` which creates ProgramConfig + ProgramSettings
 * + per-program FeatureFlag overrides before returning 201. On 201
 * we navigate to /admin/programs/:id so the admin lands on a fully
 * provisioned workspace ready to be populated.
 *
 * The form intentionally mirrors the backend Zod schema exactly
 * (name, description, startDate, endDate, isActive). Adding new
 * fields here requires a matching change in batch.controller.ts.
 */
export default function CreateProgramModal({ open, onClose, onCreated }: CreateProgramModalProps): React.ReactElement | null {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setName('');
    setDescription('');
    setStartDate(today);
    setEndDate(today);
    setError(null);
  };

  const handleClose = (): void => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError('End date must be after start date.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await adminApi.post<CreatedBatch>('/batches', {
        name: name.trim(),
        description: description.trim(),
        startDate,
        endDate,
        isActive: true,
      });
      onCreated(res.data);
      reset();
      onClose();
    } catch (err: any) {
      const data = err?.response?.data as { message?: string; issues?: Array<{ path?: string[]; message?: string }> } | undefined;
      const issues = data?.issues ?? [];
      // Prefer the first field-specific Zod issue over the generic
      // "Invalid input." so the admin can see exactly which field
      // rejected. Falls back to the generic message when no issues
      // are returned (e.g. 500 or network).
      const firstIssue = issues[0];
      const fieldLabel = firstIssue?.path?.[0] ? ` (${firstIssue.path[0]})` : '';
      const msg = (firstIssue?.message ? `${firstIssue.message}${fieldLabel}` : data?.message)
        || 'Failed to create program. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="relative w-full max-w-lg rounded-2xl border border-border/60 bg-card shadow-card-hover p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-ink">Create new program</h2>
              <p className="text-xs text-ink-soft mt-1">
                A self-contained workspace with empty FAQs, categories, community, welcome kit,
                and per-program settings. You'll populate it after creation.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="cp-name" className="block text-xs font-medium text-ink mb-1">
                  Program name
                </label>
                <input
                  id="cp-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Winter Internship 2027"
                  maxLength={120}
                  className="admin-input"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="cp-desc" className="block text-xs font-medium text-ink mb-1">
                  Short description
                </label>
                <textarea
                  id="cp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="One sentence about the cohort (optional)"
                  maxLength={1000}
                  rows={2}
                  className="admin-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cp-start" className="block text-xs font-medium text-ink mb-1">
                    Start date
                  </label>
                  <input
                    id="cp-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="admin-input"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="cp-end" className="block text-xs font-medium text-ink mb-1">
                    End date
                  </label>
                  <input
                    id="cp-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="admin-input"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="admin-btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="admin-btn-primary text-xs"
                >
                  {submitting ? 'Provisioning…' : 'Create program'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}