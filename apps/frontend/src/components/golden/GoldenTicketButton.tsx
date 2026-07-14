/**
 * GoldenTicketButton — "Use Golden Ticket" trigger for a KnowledgePostCard.
 *
 * States:
 *   loading      — skeleton pill while /faq/escalation-status is in flight
 *   on cooldown  — disabled button + CooldownBar countdown
 *   available    — enabled button; click opens GoldenTicketModal for confirmation
 *
 * The parent owns toast notifications (onEscalated / onError) so this
 * component stays focused on the escalation flow itself.
 */

import React, { useState } from 'react';
import { useEscalationStatus } from '../../hooks/useEscalationStatus';
import CooldownBar from './CooldownBar';
import GoldenTicketModal from './GoldenTicketModal';

interface GoldenTicketButtonProps {
  faqId: string;
  faqQuestion: string;
  onEscalated: (newBalance: number) => void;
  onError: (message: string) => void;
}

export default function GoldenTicketButton({
  faqId,
  faqQuestion,
  onEscalated,
  onError,
}: GoldenTicketButtonProps): React.ReactElement | null {
  const { status, loading, refetch } = useEscalationStatus();
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) {
    return <div className="h-7 w-32 rounded-full bg-mist animate-pulse" aria-hidden="true" />;
  }

  if (!status) return null; // status fetch failed — fail closed, don't block the rest of the card

  return (
    <div className="flex flex-col items-end gap-1.5">
      {!status.canEscalate && status.cooldownEndsAt ? (
        <div className="w-40">
          <CooldownBar
            cooldownEndsAt={status.cooldownEndsAt}
            cooldownHours={status.cooldownHours}
            onComplete={refetch}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={!status.canEscalate}
          className="
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
            bg-accent text-white shadow-sm
            hover:brightness-110 active:brightness-95
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200 ease-smooth
          "
        >
          <span aria-hidden="true">🎫</span>
          Use Golden Ticket
        </button>
      )}

      {modalOpen && (
        <GoldenTicketModal
          faqId={faqId}
          faqQuestion={faqQuestion}
          spCost={status.spCost}
          currentBalance={status.sp}
          onClose={() => setModalOpen(false)}
          onSuccess={(newBalance) => {
            onEscalated(newBalance);
            refetch();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}
