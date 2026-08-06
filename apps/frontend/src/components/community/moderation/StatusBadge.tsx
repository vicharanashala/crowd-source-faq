/**
 * StatusBadge.tsx — Generic, reusable status badge for Community Moderation.
 *
 * Wraps the existing `components/ui/Badge` primitive instead of introducing
 * a parallel badge implementation. Callers pass a `status` key and this
 * component resolves the icon, label, and color variant. An optional
 * `label` prop lets a caller override the display text (e.g. localisation)
 * without touching the icon/variant mapping.
 *
 * Pure/presentational — no data fetching, no side effects, no callbacks.
 */

import React from 'react';
import Badge from '../../ui/Badge';

export type StatusBadgeType =
  | 'support'
  | 'pinned'
  | 'verified'
  | 'official'
  | 'important'
  | 'new';

interface StatusConfig {
  label: string;
  icon: string;
  variant: 'success' | 'warning' | 'info' | 'accent';
}

const STATUS_CONFIG: Record<StatusBadgeType, StatusConfig> = {
  support:   { label: 'Support',  icon: '🛟', variant: 'info' },
  pinned:    { label: 'Pinned',   icon: '📌', variant: 'accent' },
  verified:  { label: 'Verified', icon: '⭐', variant: 'success' },
  official:  { label: 'Official', icon: '🏛', variant: 'accent' },
  important: { label: 'Important', icon: '❗', variant: 'warning' },
  new:       { label: 'New',      icon: '🆕', variant: 'info' },
};

export interface StatusBadgeProps {
  /** Which status this badge represents. Drives icon + color automatically. */
  status: StatusBadgeType;
  /** Override the default label text (icon/color stay tied to `status`). */
  label?: string;
  /** Hide the leading icon. Defaults to showing it. */
  showIcon?: boolean;
  className?: string;
}

export default function StatusBadge({
  status,
  label,
  showIcon = true,
  className = '',
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  if (!config) return null;

  return (
    <Badge variant={config.variant} className={className}>
      {showIcon && <span aria-hidden="true">{config.icon}</span>}
      <span>{label ?? config.label}</span>
    </Badge>
  );
}
