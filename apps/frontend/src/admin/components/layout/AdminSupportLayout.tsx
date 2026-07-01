import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const SUPPORT_NAV_ITEMS = [
  { to: '/admin/support', label: 'Inbox', end: true },
  { to: '/admin/support/analytics', label: 'Analytics' },
  { to: '/admin/support/categories', label: 'Schemas' },
  { to: '/admin/support/guidance', label: 'Checklists' },
  { to: '/admin/golden-tickets', label: 'Golden Queue' },
];

export default function AdminSupportLayout() {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full w-full max-w-[1200px] mx-auto">
      {/* Horizontal Navbar */}
      <div className="mb-6 border-b border-[rgb(var(--border-rgb)_/_0.6)]">
        <nav className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-[-1px]">
          {SUPPORT_NAV_ITEMS.map((item) => {
            // Support Inbox is at exactly /admin/support. Since other routes start with it, we need `end: true` for exact matching if it's the root.
            const isActive = item.end 
              ? location.pathname === item.to 
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-all duration-200 border-b-2 ${
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-transparent text-ink-soft hover:text-ink hover:border-[rgb(var(--border-rgb)_/_0.6)]'
                }`}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Page Content */}
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
