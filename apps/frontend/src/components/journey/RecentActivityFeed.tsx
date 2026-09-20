/**
 * RecentActivityFeed — timeline of the user's recent actions.
 * Rows stagger-fade in via the parent page's GSAP timeline (see
 * LearningJourneyPage.tsx — it targets `.journey-activity-row`).
 */

import React from 'react';
import Card from '../ui/Card';
import type { ActivityItem } from '../../hooks/useLearningJourney';

const ICONS: Record<ActivityItem['icon'], string> = {
  helpful: '💚',
  faq: '📝',
  golden: '🎫',
  badge: '🏅',
  module: '📚',
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

interface RecentActivityFeedProps {
  items: ActivityItem[];
}

export default function RecentActivityFeed({ items }: RecentActivityFeedProps): React.ReactElement {
  return (
    <Card variant="elevated" className="journey-activity-card p-5">
      <h2 className="text-sm font-semibold text-ink mb-4">Recent Activity</h2>

      {items.length === 0 ? (
        <p className="text-xs text-ink-faint py-6 text-center">No activity yet — get started by exploring the FAQ bank!</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="journey-activity-row flex items-start gap-3 py-2.5 border-b border-border/50 last:border-b-0"
            >
              <span className="text-base leading-none mt-0.5" aria-hidden="true">{ICONS[item.icon]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink truncate">{item.label}</p>
                {item.detail && <p className="text-xs text-ink-faint truncate">{item.detail}</p>}
              </div>
              <span className="text-[11px] text-ink-faint whitespace-nowrap tabular-nums">
                {formatRelativeTime(item.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
