import React, { useState, useRef } from 'react';
import api from '../../utils/api';

interface FlagOutdatedButtonProps {
  faqId: string;
  reviewStatus: string;
  onFlagged?: () => void;
}

export default function FlagOutdatedButton({ faqId, reviewStatus, onFlagged }: FlagOutdatedButtonProps) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  const openModal = () => {
    setShowModal(true);
    setReason('');
    setError('');
    setTimeout(() => dialogRef.current?.showModal(), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.patch(`/faq/${faqId}/flag`, { reason: reason.trim() });
      dialogRef.current?.close();
      setShowModal(false);
      onFlagged?.();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      if (e2.response?.data?.message?.includes('already under review')) {
        setError('This FAQ is already under review.');
      } else {
        setError(e2.response?.data?.message || 'Failed to flag. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isAlreadyUnderReview = reviewStatus === 'pending_review' || reviewStatus === 'update_requested';

  return (
    <>
      <button
        onClick={openModal}
        disabled={isAlreadyUnderReview}
        title={isAlreadyUnderReview ? 'This FAQ is already under review' : 'Flag as outdated'}
        className={`text-xs px-2 py-1 rounded border transition-colors
          ${isAlreadyUnderReview
            ? 'border-border text-ink-faint cursor-not-allowed'
            : 'border-border text-ink-soft hover:border-orange-300 hover:text-orange-600'
          }`}
      >
        🚩 {isAlreadyUnderReview ? 'Under review' : 'Flag outdated'}
      </button>

      {showModal && (
        <dialog
          ref={dialogRef}
          onClose={() => setShowModal(false)}
          className="m-auto rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
        >
          <form onSubmit={handleSubmit} className="p-6 space-y-4 min-w-72">
            <h3 className="text-sm font-semibold text-ink">Flag as Outdated</h3>
            <p className="text-xs text-ink-soft">
              Why do you think this answer needs updating?
              <span className="block mt-1 text-ink-faint">(optional — max 200 chars)</span>
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 200))}
              placeholder="E.g. The process changed last week..."
              rows={3}
              className="w-full rounded-xl border border-border bg-mist px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { dialogRef.current?.close(); setShowModal(false); }}
                className="px-4 py-2 text-xs rounded-xl border border-border text-ink-soft hover:bg-mist transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-xs rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Submit Flag'}
              </button>
            </div>
            {error && <p className="text-xs text-danger bg-danger-light rounded-lg px-3 py-2">{error}</p>}
          </form>
        </dialog>
      )}
    </>
  );
}