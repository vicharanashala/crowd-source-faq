import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

/**
 * SpurtiChip — v1.65, additive.
 *
 * Renders the current user's Spurti Points balance as a small sage
 * pill in the navbar. Pulls from GET /api/support/me/sp (the cheap
 * self-service endpoint added with the Golden Ticket feature).
 *
 * Behavior:
 *  - Hidden when no user is signed in (auth-gated).
 *  - Hidden when SP === 0 (no visual noise for users who haven't
 *    earned any).
 *  - Fetched once per userId flip with an AbortController so
 *    React StrictMode's dev double-mount and a logout/login cycle
 *    don't cause duplicate or stale in-flight requests.
 *  - Errors fail soft — the chip just disappears, never blocks
 *    the rest of the navbar.
 */
export default function SpurtiChip(): React.ReactElement | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [sp, setSp] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) {
      setSp(null);
      return;
    }
    const controller = new AbortController();
    api
      .get<{ sp: number }>('/support/me/sp', { signal: controller.signal })
      .then((res) => setSp(res.data.sp ?? 0))
      .catch((err) => {
        if (axios.isCancel(err)) return; // expected on unmount / userId change
        setSp(null); // fail soft
      });
    return () => controller.abort();
  }, [userId]);

  if (!userId) return null;
  if (sp === null || sp === 0) return null;

  return (
    <div
      className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold shadow-sm"
      title="Spurti Points — Golden Ticket currency"
      aria-label={`Spurti Points balance: ${sp}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        {/* Flame icon — the most readable "SP currency" mark at 12px.
            The 4-pointed star (v1.65) renders as a "+" at small sizes
            and confused users. Flame reads as currency from a
            distance and matches the in-page slider emoji (🔥). */}
        <path d="M12 2 c 0 6 -6 6 -6 12 a 6 6 0 0 0 12 0 c 0 -3 -2 -5 -3 -7 c -1 2 -3 3 -3 -5 z" />
      </svg>
      <span className="tabular-nums">{sp}</span>
      <span className="text-accent/70 font-medium">SP</span>
    </div>
  );
}

// Local import alias — keeps the import block above tidy and lets
// the test layer mock the api module the same way as the rest of
// the codebase.
import api from '../../utils/api';
