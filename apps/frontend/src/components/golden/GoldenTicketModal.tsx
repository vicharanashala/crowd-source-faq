/**
 * GoldenTicketModal — confirmation dialog shown before spending Spurti
 * Points to escalate an FAQ. Details the SP cost + current balance,
 * handles the API call with a clean loading state, and reports success
 * or a friendly error back to the caller (which owns the toast).
 *
 * Backend: POST /api/faq/:id/escalate -> { message, newBalance }
 * 400 on: insufficient SP balance, or still on the 48h cooldown
 * (see promotion.service.ts::escalateFAQ / faq.controller.ts::escalateFAQPriority)
 */

import React, { useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import api, { friendlyError } from '../../utils/api';
import Button from '../ui/Button';

interface GoldenTicketModalProps {
  faqId: string;
  faqQuestion: string;
  spCost: number;
  currentBalance: number;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
  onError: (message: string) => void;
}

export default function GoldenTicketModal({
  faqId,
  faqQuestion,
  spCost,
  currentBalance,
  onClose,
  onSuccess,
  onError,
}: GoldenTicketModalProps): React.ReactElement {
  const [submitting, setSubmitting] = useState(false);
  useBodyScrollLock(true);

  const balanceAfter = currentBalance - spCost;
  const insufficientBalance = balanceAfter < 0;

  const handleConfirm = async () => {
    if (submitting || insufficientBalance) return;
    setSubmitting(true);
    try {
      // ── Plug in your real endpoint here if it differs from this route ──
      const res = await api.post<{ message: string; newBalance: number }>(
        `/faq/${faqId}/escalate`
      );
      onSuccess(res.data.newBalance);
      onClose();
    } catch (err) {
      onError(friendlyError(err, 'Could not escalate this FAQ — please try again.'));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="golden-ticket-modal-title"
    >
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />

      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-border p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden="true">🎫</span>
          <div>
            <h2 id="golden-ticket-modal-title" className="text-sm font-semibold text-ink">
              Use a Golden Ticket?
            </h2>
            <p className="text-xs text-ink-faint mt-0.5 line-clamp-2">"{faqQuestion}"</p>
          </div>
        </div>

        <div className="rounded-xl bg-mist p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-soft">Cost</span>
            <span className="font-semibold text-ink tabular-nums">{spCost} SP</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-soft">Your balance</span>
            <span className="font-semibold text-ink tabular-nums">{currentBalance} SP</span>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 pt-2">
            <span className="text-ink-soft">Balance after</span>
            <span className={`font-semibold tabular-nums ${insufficientBalance ? 'text-danger' : 'text-ink'}`}>
              {Math.max(balanceAfter, currentBalance)} SP
            </span>
          </div>
        </div>

        {insufficientBalance && (
          <p className="text-xs text-danger">
            You don't have enough Spurti Points for this action.
          </p>
        )}

        <p className="text-xs text-ink-faint">
          This moves your question to the top of the Admin Queue for priority review.
          You'll need to wait 48 hours before using another Golden Ticket.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Button variant="secondary" size="md" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="accent"
            size="md"
            className="flex-1"
            onClick={handleConfirm}
            loading={submitting}
            disabled={insufficientBalance}
          >
            Confirm &amp; Escalate
          </Button>
        </div>
      </div>
    </div>
  );
}
