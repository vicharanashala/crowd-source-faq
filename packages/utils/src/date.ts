/**
 * Format a date to a human-readable relative time string.
 * e.g. "2 hours ago", "3 days ago", "just now"
 */
export function relativeTime(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;

  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Check if a date-based value has expired.
 */
export function isExpired(expiresAt: Date | string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

/**
 * Format a date in ISO short format (YYYY-MM-DD).
 */
export function formatDateShort(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}
