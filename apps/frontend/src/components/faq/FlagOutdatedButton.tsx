import React, { useState, useRef } from 'react';
import api from '../../utils/api';
import {
  dialogBody,
  dialogLabel,
  dialogLabelFaint,
  dialogShell,
  dialogTitleSm,
  flagButtonDisabled,
  flagButtonIdle,
  flagCancelButton,
  flagErrorBanner,
  flagSubmitButton,
  textAreaBase,
} from '../../styles/style_config';

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
        className={isAlreadyUnderReview ? flagButtonDisabled : flagButtonIdle}
      >
        🚩 {isAlreadyUnderReview ? 'Under review' : 'Flag outdated'}
      </button>

      {showModal && (
        <dialog
          ref={dialogRef}
          onClose={() => setShowModal(false)}
          className={dialogShell}
        >
          <form onSubmit={handleSubmit} className={dialogBody}>
            <h3 className={dialogTitleSm}>Flag as Outdated</h3>
            <p className={dialogLabel}>
              Why do you think this answer needs updating?
              <span className={dialogLabelFaint}>(optional — max 200 chars)</span>
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 200))}
              placeholder="E.g. The process changed last week..."
              rows={3}
              className={textAreaBase}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { dialogRef.current?.close(); setShowModal(false); }}
                className={flagCancelButton}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={flagSubmitButton}
              >
                {loading ? 'Sending…' : 'Submit Flag'}
              </button>
            </div>
            {error && <p className={flagErrorBanner}>{error}</p>}
          </form>
        </dialog>
      )}
    </>
  );
}