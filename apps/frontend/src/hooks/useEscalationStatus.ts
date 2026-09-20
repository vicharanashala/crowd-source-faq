/**
 * useEscalationStatus — current user's Spurti Points balance + whether
 * they're on cooldown for the FAQ "Golden Ticket" escalation action.
 *
 * Backend: GET /api/faq/escalation-status
 *   -> { sp, spCost, cooldownHours, cooldownEndsAt, canEscalate }
 * (see faq.controller.ts::getEscalationStatus)
 */

import { useCallback, useEffect, useState } from 'react';
import api, { friendlyError } from '../utils/api';

export interface EscalationStatus {
  sp: number;
  spCost: number;
  cooldownHours: number;
  cooldownEndsAt: string | null;
  canEscalate: boolean;
}

export function useEscalationStatus() {
  const [status, setStatus] = useState<EscalationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ── Plug in your real endpoint here if it differs from this route ──
      const res = await api.get<EscalationStatus>('/faq/escalation-status');
      setStatus(res.data);
    } catch (err) {
      setError(friendlyError(err, 'Could not load your Spurti Points balance.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { status, loading, error, refetch };
}
