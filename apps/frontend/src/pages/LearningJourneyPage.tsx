/**
 * LearningJourneyPage — "My Learning Journey" personal dashboard.
 *
 * GSAP choreography (skipped for prefers-reduced-motion, see
 * useReducedMotion):
 *   1. Header + stat cards stagger-fade/slide in on mount.
 *   2. Each StatCard's number counts up independently (see StatCard.tsx).
 *   3. Recent Activity rows stagger in slightly after the cards.
 *
 * All animation state lives in a gsap.context() scoped to the page root
 * so it's fully cleaned up on unmount (StrictMode-safe — no leaked
 * tweens across remounts).
 */

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import Avatar from '../components/ui/Avatar';
import Spinner from '../components/ui/Spinner';
import StatCard from '../components/journey/StatCard';
import RecentActivityFeed from '../components/journey/RecentActivityFeed';
import { useAuth } from '../hooks/useAuth';
import { useLearningJourney } from '../hooks/useLearningJourney';
import { useReducedMotion } from '../hooks/useReducedMotion';

function ModuleIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SpurtiIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function StreakIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C9 6 7 9 7 13a5 5 0 0 0 10 0c0-1.5-.5-2.5-1.5-4 .3 2-1 3-2 2.5.8-2-.5-5-1.5-9.5z" />
    </svg>
  );
}

export default function LearningJourneyPage(): React.ReactElement {
  const { user } = useAuth();
  const { data, loading } = useLearningJourney();
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || !data || !rootRef.current) return;
    if (reducedMotion) return; // final CSS state already correct — no animation needed

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.from('.journey-header', { opacity: 0, y: -12, duration: 0.5 })
        .from(
          '.journey-stat-card',
          { opacity: 0, y: 20, duration: 0.55, stagger: 0.12 },
          '-=0.25'
        )
        .from(
          '.journey-activity-card',
          { opacity: 0, y: 20, duration: 0.5 },
          '-=0.3'
        )
        .from(
          '.journey-activity-row',
          { opacity: 0, x: -12, duration: 0.35, stagger: 0.06 },
          '-=0.2'
        );
    }, rootRef);

    return () => ctx.revert();
  }, [loading, data, reducedMotion]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  const modulePct = data.modulesTotal > 0
    ? Math.round((data.modulesCompleted / data.modulesTotal) * 100)
    : 0;

  return (
    <div ref={rootRef} className="min-h-screen bg-bg grid-bg relative">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-10 relative z-10">
        <div className="journey-header flex items-center gap-4 mb-8">
          <Avatar name={user?.name} src={user?.avatar?.url} size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-serif text-ink tracking-tight truncate">
              My Learning Journey
            </h1>
            <p className="text-xs sm:text-sm text-ink-soft mt-0.5">
              Welcome back, {user?.name?.split(' ')[0] ?? 'there'} — here's where you stand.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            label={`Modules Completed (of ${data.modulesTotal})`}
            value={data.modulesCompleted}
            icon={<ModuleIcon />}
            accentClassName="bg-accent-light text-accent"
            footer={
              <div className="h-1.5 w-full rounded-full bg-mist overflow-hidden mt-1">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-700 ease-smooth"
                  style={{ width: `${modulePct}%` }}
                />
              </div>
            }
          />
          <StatCard
            label="Spurti Points Balance"
            value={data.spurtiPoints}
            icon={<SpurtiIcon />}
            accentClassName="bg-warning-light text-warning"
          />
          <StatCard
            label="Contributions This Week"
            value={data.recentActivity.length}
            icon={<StreakIcon />}
            accentClassName="bg-success-light text-success"
          />
        </div>

        <RecentActivityFeed items={data.recentActivity} />
      </main>
    </div>
  );
}
