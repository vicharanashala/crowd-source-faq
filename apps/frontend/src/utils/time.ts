/**
 * Time / date formatting helpers — shared across admin + community
 * notifications, FAQ freshness, support ticket timestamps, etc.
 *
 * Five near-identical copies of `timeAgo` were copy-pasted into
 * admin files (audit finding M42). This module is the canonical
 * source. Each function is documented and parameterised where the
 * copies diverged.
 */

/**
 * Compact relative time string for "X ago" labels.
 *   - < 60s  → "just now"
 *   - < 60m  → "5m ago"
 *   - < 24h  → "3h ago"
 *   - < 7d   → "2d ago"
 *   - else   → locale date "Jun 13"
 *
 * Pass `now` in tests; defaults to `Date.now()`.
 */
export function timeAgo(
  date: string | Date | null | undefined,
  now: number = Date.now(),
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const ms = now - d.getTime();
  if (Number.isNaN(ms)) return '';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Compact "time remaining" label for cooldown timers / deadlines.
 *   - ≤ 0     → "now"
 *   - < 60s   → "Xs" (e.g. "45s")
 *   - < 60m   → "Mm Ss" (e.g. "5m 30s")
 *   - < 24h   → "Xh Ym" (e.g. "3h 15m")
 *   - else    → "Xd Yh" (e.g. "2d 4h")
 *
 * Negative or zero is rendered as 'now' so the caller doesn't have
 * to check before passing.
 */
export function formatTimerRemaining(msRemaining: number): string {
  if (msRemaining <= 0) return 'now';
  const totalSec = Math.floor(msRemaining / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs < 24) return `${hrs}h ${remainMins}m`;
  const days = Math.floor(hrs / 24);
  const remainHrs = hrs % 24;
  return `${days}d ${remainHrs}h`;
}

/**
 * HH:MM:SS countdown (zero-padded). For the giant Golden Ticket
 * countdown timer specifically.
 *   - 0        → "00:00:00"
 *   - < 1h     → "00:MM:SS"
 *   - < 1d     → "HH:MM:SS"
 *   - >= 1d    → "DD:HH:MM:SS" (days overflow into a 4th segment)
 */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return '00:00:00';
  const totalSec = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}:${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
