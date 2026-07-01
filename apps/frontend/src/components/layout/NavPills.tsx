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
];

export function useNavItems() {
  const { user } = useAuth();
  const supportOn = useFeatureFlag('sessionSupport');
  const goldenOn = useFeatureFlag('goldenTicket');
  const welcomeOn = useFeatureFlag('welcomePackage');

  const goldenExtras: NavItem[] = goldenOn
    ? [{ label: 'Golden', to: '/golden', xlOnly: true as const }]
    : [];

  // Welcome Package nav link is admin-controlled. `welcomeOn` is undefined
  // while flags load and null for an unknown key — only hide on an explicit
  // `false` so the link doesn't disappear mid-load.
  const visibleBaseItems = welcomeOn === false
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

  return allNavItems;
}

export function NavPills() {
  const { user } = useAuth();
  const allNavItems = useNavItems();

  return (
    <div className="flex items-center justify-center gap-1.5 px-1.5 py-[5px] rounded-full border-[1.5px] border-[rgb(var(--border-rgb)_/_0.6)] bg-[rgb(var(--bg-card-rgb)_/_0.85)] backdrop-blur-[24px] shadow-md transition-all duration-300 hover:bg-[rgb(var(--bg-card-rgb)_/_0.95)] z-50">
      {allNavItems.map(({ label, to, xlOnly }) => {
        const isWelcome = to === '/welcome';
        const needsPulse = isWelcome && user && !user.orientationCompleted;

        return (
          <NavLink
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
