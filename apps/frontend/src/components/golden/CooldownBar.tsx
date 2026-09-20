/**
 * CooldownBar — visual timer for the 48h Golden Ticket cooldown.
 * Ticks every second, shows a progress bar (elapsed / total window) and
 * a human "Xh Ym left" readout. Calls onComplete once the cooldown ends
 * so the parent can re-fetch status and re-enable the button.
 */

import React, { useEffect, useMemo, useState } from 'react';

interface CooldownBarProps {
  cooldownEndsAt: string;
  cooldownHours: number;
  onComplete?: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Available now';
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m left`;
  return `${hours}h ${minutes}m left`;
}

export default function CooldownBar({
  cooldownEndsAt,
  cooldownHours,
  onComplete,
}: CooldownBarProps): React.ReactElement {
  const endsAtMs = useMemo(() => new Date(cooldownEndsAt).getTime(), [cooldownEndsAt]);
  const totalWindowMs = cooldownHours * 3600 * 1000;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = Math.max(0, endsAtMs - now);
  const elapsedMs = Math.max(0, totalWindowMs - remainingMs);
  const pct = totalWindowMs > 0 ? Math.min(100, (elapsedMs / totalWindowMs) * 100) : 100;

  useEffect(() => {
    if (remainingMs <= 0) onComplete?.();
  }, [remainingMs, onComplete]);

  return (
    <div className="w-full" role="status" aria-live="polite">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-ink-faint">Golden Ticket cooldown</span>
        <span className="text-[11px] font-semibold text-ink tabular-nums">{formatRemaining(remainingMs)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-mist overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-smooth"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
