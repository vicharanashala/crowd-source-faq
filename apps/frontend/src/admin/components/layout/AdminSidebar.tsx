import React, { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { useFeatureFlags } from '../../../context/FeatureFlagContext';

interface NavItem {
  to: string; label: string; icon: () => ReactNode; end?: boolean; featureFlag?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/admin',            label: 'Dashboard',   icon: GridIcon,    end: true },
    ],
  },
  {
    label: 'Content',
    items: [
      { to: '/admin/faqs',           label: 'FAQs',          icon: DocIcon },
      { to: '/admin/welcome',        label: 'Welcome',       icon: SparkleIcon },
      { to: '/admin/programs',       label: 'Programs Hub',    icon: LayersIcon },
      { to: '/admin/faqs/review',    label: 'FAQ Review',    icon: ShieldCheckIcon, featureFlag: 'faqFreshness' },
      { to: '/admin/auto-answer',    label: 'AI Answers',    icon: SparkleIcon, featureFlag: 'aiAutoAnswer' },
      { to: '/admin/faq-audit',     label: 'FAQ Audit',     icon: StethoscopeIcon, featureFlag: 'faqFreshness' },
      { to: '/admin/unresolved-search', label: 'FAQ Gaps',    icon: SearchMissIcon },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/admin/community',      label: 'Community',     icon: ChatIcon },
      { to: '/admin/moderation',     label: 'Moderation',    icon: ShieldIcon },
    ],
  },
  {
    label: 'Zoom',
    items: [
      { to: '/admin/zoom',           label: 'Zoom Assessments', icon: VideoIcon },
      { to: '/admin/zoom/questions', label: 'Zoom Questions',   icon: ListIcon },
    ],
  },
  {
    label: 'Support & Golden',
    items: [
      { to: '/admin/support', label: 'Support Dashboard', icon: SupportIcon, featureFlag: 'sessionSupport' },
    ],
  },
  {
    label: 'Members',
    items: [
      { to: '/admin/users',          label: 'Users',         icon: UsersIcon },
    ],
  },
  {
    label: 'Data Sources',
    items: [
      { to: '/admin/zoom-meetings',  label: 'Zoom Meetings', icon: VideoIcon },
      { to: '/admin/document-insights', label: 'Document Insights', icon: DocIcon, featureFlag: 'documentPipeline' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/settings/ai',    label: 'AI Settings',   icon: BrainIcon },
      { to: '/admin/features',      label: 'Feature Flags', icon: FlagIcon },
      { to: '/admin/settings',       label: 'Settings',      icon: SettingsIcon },
    ],
  },
];

function GridIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function DocIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>; }
function ChatIcon()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
function UsersIcon()  { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function ShieldIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function SettingsIcon(){ return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>; }
function SearchMissIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="8" x2="14" y2="14"/><line x1="14" y1="8" x2="8" y2="14"/></svg>; }
function VideoIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>; }
function BrainIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.5"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.5"/></svg>; }
function ShieldCheckIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>; }
function StethoscopeIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 18H4a2 2 0 0 1-2-2v-1h20v1a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a6 6 0 0 1 12 0v6"/><circle cx="12" cy="18" r="3"/></svg>; }
function SparkleIcon()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/><path d="M19 15l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/></svg>; }
function LayersIcon()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>; }
function SupportIcon()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>; }


function FlagIcon()      { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>; }
function ListIcon()      { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>; }



function SidebarContent({ onMobileClose }: { onMobileClose: () => void }) {
  const { logout } = useAdminAuth();
  const { flags } = useFeatureFlags();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); };

  const filteredNav = NAV.map((group) => {
    const items = group.items.filter((item) => {
      if (!item.featureFlag) return true;
      return flags[item.featureFlag]?.enabled ?? false;
    });
    return { ...group, items };
  }).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col h-full overflow-hidden text-ink">
      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto custom-scrollbar">
        {filteredNav.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="px-3 pb-2 text-[10px] font-bold text-ink-faint uppercase tracking-widest">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 ${
                      isActive
                        ? 'bg-accent/10 text-accent font-semibold shadow-sm'
                        : 'text-ink-soft hover:text-ink hover:bg-mist'
                    }`
                  }
                >
                  {item.icon()}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

interface AdminSidebarProps { mobileOpen: boolean; onMobileClose: () => void; }

export default function AdminSidebar({ mobileOpen, onMobileClose }: AdminSidebarProps) {
  return (
    <>
      <aside className="hidden lg:flex flex-col w-[260px] shrink-0 sticky top-24 h-[calc(100vh-8rem)] bg-card rounded-2xl border border-border/60 shadow-sm ml-6 z-30 overflow-hidden">
        <SidebarContent onMobileClose={onMobileClose} />
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm lg:hidden" onClick={onMobileClose} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
              className="fixed left-0 top-16 bottom-0 w-[280px] z-50 lg:hidden bg-card border-r border-border/60 shadow-xl overflow-hidden">
              <SidebarContent onMobileClose={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
