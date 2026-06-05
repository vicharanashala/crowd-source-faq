import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { getPublicUrl } from '../../../utils/publicUrl';

const PAGE_LABELS: Record<string, string> = {
  '/admin':          'Dashboard',
  '/admin/faqs':     'FAQs',
  '/admin/faqs/review': 'FAQ Review',
  '/admin/community': 'Community',
  '/admin/users':     'Users',
  '/admin/moderation': 'Moderation',
  '/admin/leaderboard': 'Leaderboard',
  '/admin/unresolved-search': 'FAQ Gaps',
  '/admin/zoom-meetings': 'Zoom Meetings',
  '/admin/zoom-insights': 'Zoom Insights',
  '/admin/settings': 'Settings',
  '/admin/settings/ai': 'AI Settings',
};

interface AdminNavbarProps { onMobileMenuToggle: () => void; }

export default function AdminNavbar({ onMobileMenuToggle }: AdminNavbarProps) {
  const location = useLocation();
  const { user } = useAdminAuth();
  const label = PAGE_LABELS[location.pathname] ?? 'Admin';
  const publicUrl = getPublicUrl();

  return (
    <header className="h-14 bg-admin-card border-b border-white/5 flex items-center justify-between px-5 shrink-0 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button onClick={onMobileMenuToggle}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-md text-admin-muted hover:text-admin-text hover:bg-admin-surface transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <h1 className="text-sm font-light text-admin-muted tracking-wide">{label}</h1>
      </div>
      <div className="flex items-center gap-2.5">
        <Link
          to="/"
          className="text-xs text-admin-muted hover:text-admin-text transition-colors border border-white/5 rounded-md px-2.5 py-1 hover:bg-admin-bg"
        >
          ← Website
        </Link>
        <div className="w-7 h-7 rounded-full bg-admin-surface flex items-center justify-center text-xs font-semibold text-admin-muted">
          {user?.name?.[0]?.toUpperCase() ?? 'A'}
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-medium text-admin-text leading-none">{user?.name}</p>
          <p className="text-[10px] text-admin-muted mt-0.5 leading-none">{user?.role}</p>
        </div>
      </div>
    </header>
  );
}
