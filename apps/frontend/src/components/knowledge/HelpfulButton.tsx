/**
 * HelpfulButton — the "This helped me" toggle for a KnowledgePostCard.
 *
 * Optimistic UX: flips its visual state and count immediately on click,
 * then reconciles with the server response. On failure it rolls back so
 * the UI never lies to the user about a click that didn't actually land.
 *
 * Backend contract: PATCH /api/faq/:id/helped -> { didHelp, helpedCount }
 * (see faq.controller.ts::toggleHelpedByMe — atomic $addToSet/$pull, so
 * duplicate clicks from the same user can never inflate the count).
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import api, { friendlyError } from '../../utils/api';

interface HelpfulButtonProps {
  faqId: string;
  initialHelped: boolean;
  initialCount: number;
  onError?: (message: string) => void;
}

export default function HelpfulButton({
  faqId,
  initialHelped,
  initialCount,
  onError,
}: HelpfulButtonProps): React.ReactElement {
  const [didHelp, setDidHelp] = useState(initialHelped);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (pending) return;

    // Optimistic flip — the button reacts before the network round-trip.
    const prevHelped = didHelp;
    const prevCount = count;
    setDidHelp(!prevHelped);
    setCount(prevHelped ? Math.max(0, prevCount - 1) : prevCount + 1);
    setPending(true);

    try {
      // ── Plug in your real endpoint here if it differs from this route ──
      const res = await api.patch<{ didHelp: boolean; helpedCount: number }>(
        `/faq/${faqId}/helped`
      );
      setDidHelp(res.data.didHelp);
      setCount(res.data.helpedCount);
    } catch (err) {
      // Roll back the optimistic update — the click didn't actually land.
      setDidHelp(prevHelped);
      setCount(prevCount);
      onError?.(friendlyError(err, 'Could not update — please try again.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={pending}
      whileTap={{ scale: 0.94 }}
      aria-pressed={didHelp}
      aria-label={didHelp ? 'Marked as helpful — click to undo' : 'Mark this as helpful'}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        border transition-colors duration-200 ease-smooth
        disabled:cursor-wait
        ${didHelp
          ? 'bg-success-light text-success border-success/30'
          : 'bg-transparent text-ink-faint border-border hover:border-success/40 hover:text-success'}
      `}
    >
      <motion.span
        animate={didHelp ? { scale: [1, 1.3, 1] } : { scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        aria-hidden="true"
      >
        {didHelp ? '💚' : '🤍'}
      </motion.span>
      <span>This helped me</span>
      <span className="tabular-nums text-[11px] opacity-80">{count}</span>
    </motion.button>
  );
}
