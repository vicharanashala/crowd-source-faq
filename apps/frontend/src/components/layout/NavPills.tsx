import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useFeatureFlag } from '../../context/FeatureFlagContext';

export type NavItem = { label: string; to: string; xlOnly?: true };

export const baseNavItems: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Welcome Package', to: '/welcome' },
  { label: 'Community', to: '/community' },
  { label: 'Leaderboard', to: '/leaderboard' },
];

export function useNavItems() {
  const { user } = useAuth();
  const { enabled: supportOn } = useFeatureFlag('sessionSupport');
  const { enabled: goldenOn } = useFeatureFlag('goldenTicket');
  const { enabled: welcomeOn, loading: flagsLoading } = useFeatureFlag('welcomePackage');

  const goldenExtras: NavItem[] = goldenOn
    ? [{ label: 'Golden', to: '/golden', xlOnly: true as const }]
    : [];

  // Welcome Package nav link is admin-controlled. Hide on an explicit
  // `false` (and only after the flag list has loaded — don't flicker
  // the link off during the initial load).
  const visibleBaseItems =
    !flagsLoading && welcomeOn === false
      ? baseNavItems.filter((item) => item.to !== '/welcome')
      : baseNavItems;

  let allNavItems: NavItem[] = supportOn
    ? [...visibleBaseItems, { label: 'Support', to: '/support' }, ...goldenExtras]
    : visibleBaseItems;

  if (user?.role === 'admin') {
    allNavItems = allNavItems
      .filter(item => item.label !== 'Welcome Package')
      .map(item => {
        if (item.label === 'Support') return { ...item, to: '/admin/support' };
        if (item.label === 'Golden') return { ...item, to: '/admin/golden-tickets' };
        return item;
      });
  }

  // "My Questions" pill — only for logged-in, non-admin users
  if (user && user.role !== 'admin') {
    const communityIdx = allNavItems.findIndex(item => item.to === '/community');
    const myQuestionsItem: NavItem = { label: 'My Questions', to: '/my-questions' };
    if (communityIdx !== -1) {
      allNavItems = [
        ...allNavItems.slice(0, communityIdx + 1),
        myQuestionsItem,
        ...allNavItems.slice(communityIdx + 1),
      ];
    } else {
      allNavItems = [...allNavItems, myQuestionsItem];
    }
  }

  return allNavItems;
}

export function NavPills() {
  const { user } = useAuth();
  const allNavItems = useNavItems();

  return (
    <div data-tour="nav-pills" className="flex items-center justify-center gap-1.5 px-1.5 py-[5px] rounded-full border-[1.5px] border-[rgb(var(--border-rgb)_/_0.6)] bg-[rgb(var(--bg-card-rgb)_/_0.85)] backdrop-blur-[24px] shadow-md transition-all duration-300 hover:bg-[rgb(var(--bg-card-rgb)_/_0.95)] z-50">
      {allNavItems.map(({ label, to, xlOnly }) => {
        const isWelcome = to === '/welcome';
        const needsPulse = isWelcome && user && !user.orientationCompleted;

        return (
          <NavLink
            data-tour={`nav-pill-${label.toLowerCase().replace(/\s+/g, '-')}`}
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `nav-pill relative ${isActive ? 'active' : ''} ${xlOnly ? 'hidden xl:inline-flex' : ''} ${needsPulse && !isActive ? 'animate-pulse text-[rgb(var(--accent-rgb))] shadow-[inset_0_0_15px_rgb(var(--accent-rgb)_/_0.15)] bg-[rgb(var(--accent-rgb)_/_0.05)]' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                {label}
                {needsPulse && !isActive && <span className="absolute -top-1 -right-1 w-2 h-2 bg-[rgb(var(--accent-rgb))] rounded-full animate-ping" />}
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}
