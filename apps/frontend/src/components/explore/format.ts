// Helpers for the public FAQ page.

import type { PublicFaq } from './types';

export function formatRelativeDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatFullDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatReadTime(ms: number): string {
  if (!ms || ms <= 0) return '< 1 min read';
  const minutes = ms / 60_000;
  if (minutes < 1) return '< 1 min read';
  if (minutes < 1.5) return '1 min read';
  return `${Math.round(minutes)} min read`;
}

/** Compute a star-rating-ish badge label from the trust level. */
export function trustBadge(level: PublicFaq['trustLevel']): { label: string; tone: string } | null {
  switch (level) {
    case 'expert':
      return { label: 'Expert', tone: 'bg-accent/15 text-accent' };
    case 'high':
      return { label: 'Verified', tone: 'bg-success/15 text-success' };
    case 'medium':
      return { label: 'Community', tone: 'bg-warning/15 text-warning' };
    case 'low':
      return { label: 'Draft', tone: 'bg-mist text-ink-soft' };
    default:
      return null;
  }
}
