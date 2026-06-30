import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAuthModal, useAuthGate } from '../../context/AuthModalContext';
import { useFeatureFlag } from '../../context/FeatureFlagContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildTransformedUrl } from '../../hooks/useCloudinaryUpload';
import NotificationBell from '../../components/notifications/NotificationBell';
import SpurtiChip from './SpurtiChip';
import StreakChip from './StreakChip';

// v1.65.1 — `xlOnly?: true` flags a nav tab as hidden below the xl
// breakpoint (1280px). Used by Golden Ticket when the center
// pill is already at capacity from the other tabs. Mobile drawer
// shows all items regardless of xlOnly.
type NavItem = { label: string; to: string; xlOnly?: true };

const navItems: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Recovery', to: '/recovery' },
  { label: 'Welcome Package', to: '/welcome' },
  { label: 'Community', to: '/community' },
  { label: 'Leaderboard', to: '/leaderboard' },
];

function getAvatarColor(name?: string): string {
  if (!name) return '#6b92e0';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#6b92e0', '#5a9a6b', '#c4943a', '#e07c6b', '#7c6be0', '#e06ba8'];
  return colors[Math.abs(hash) % colors.length];
}


type Theme = 'light' | 'dark' | 'system';
function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme: Theme) {
  const t = theme === 'system' ? getSystemTheme() : theme;
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem('theme', theme);
  } catch {}
}

export default function Navbar({ showProgramSwitcher: _showProgramSwitcher = false }: { showProgramSwitcher?: boolean } = {}) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return 'system';
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme') {
        const next = (e.newValue as Theme) || 'system';
        setTheme(next);
        applyTheme(next);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (theme === 'system') {
        document.documentElement.setAttribute('data-theme', mql.matches ? 'dark' : 'light');
      }
    };
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, [theme]);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const { language, setLanguage } = useLanguage();
  
  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  const { user, isAuthenticated, logout } = useAuth();
  const { openModal } = useAuthModal();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const gate = useAuthGate();
  // Support link is only rendered when the experimental feature is on.
  const supportOn = useFeatureFlag('sessionSupport');
  // v1.65.1 — Golden Ticket is its own experimental feature flag.
  // Hidden from the nav when the admin has it off (the /golden
  // route's FeatureGate surfaces the same "this feature is
  // currently off" panel if a user types the URL directly).
  const goldenOn = useFeatureFlag('goldenTicket');
  // v1.65.1 — Golden Ticket link. Shown only at xl: because the
  // center pill (Home/FAQ/Community/Leaderboard + the sessionSupport
  // tabs Support/Golden) is already at capacity at lg. At xl there's
  // enough room; below that Golden is reachable via /golden and
  // any admin nudge in the inbox.
  const goldenExtras: NavItem[] = goldenOn
    ? [{ label: 'Golden', to: '/golden', xlOnly: true as const }]
    : [];
  let allNavItems: NavItem[] = supportOn
    ? [...navItems, { label: 'Support', to: '/support' }, ...goldenExtras]
    : navItems;

  if (user?.role === 'admin') {
    allNavItems = allNavItems.filter(item => item.label !== 'Welcome Package');
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close profile dropdown on outside click — ref-based to avoid stale closure
  useEffect(() => {
    if (!profileOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    // Small delay so the click that opened the menu doesn't immediately close it
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [profileOpen]);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    // Stay on current page — the user is just logged out, not navigated.
  };

  const initials = user?.name ? user.name.charAt(0).toUpperCase() : '?';
  const avatarColor = getAvatarColor(user?.name);
  // Thumbnail transform — cap the navbar avatar at 64×64 so we're not
  // downloading the full-size upload on every page. Cloudinary returns
  // a transformed URL, no extra round-trip.
  const avatarSrc = user?.avatar?.url
    ? buildTransformedUrl(user.avatar.url, 'w_64,h_64,c_fill,g_auto,q_auto,f_auto')
    : undefined;
  const isCommunityActive = location.pathname === '/community';

  return (
    <header className="fixed top-2 sm:top-4 left-0 right-0 z-50 px-4 transition-all duration-[400ms] ease-smooth flex justify-center">
      <div className={`w-full max-w-[1200px] px-4 sm:px-6 h-14 sm:h-16 grid grid-cols-[1fr_auto_1fr] items-center relative rounded-full transition-all duration-[400ms]
        ${scrolled
          ? 'bg-[rgb(var(--bg-card-rgb)_/_0.75)] backdrop-blur-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-[rgb(var(--border-rgb)_/_0.5)] saturate-[1.5]'
          : 'bg-[rgb(var(--bg-card-rgb)_/_0.4)] backdrop-blur-[12px] border border-[rgb(var(--border-rgb)_/_0.2)] shadow-[0_4px_20px_rgba(0,0,0,0.03)]'
        }`}
      >

        {/* Logo */}
        <div className="flex items-center justify-self-start">
          <NavLink to="/" className="flex items-center gap-2.5 group w-fit">
          <div className="w-9 h-9 rounded-[10px] border-2 border-ink text-ink flex items-center justify-center transition-transform duration-300 group-hover:rotate-[-6deg] bg-[rgb(var(--bg-card-rgb)_/_0.5)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <span className="font-sans font-bold tracking-tight text-ink text-xl">
            Yaksha FAQ
          </span>
          </NavLink>
        </div>

        {/* Center Pill Group (Desktop) — Vertically centered in the
            navbar. Hidden below xl, shown on xl+ so it's available
            across the 1280–1535px laptop range too. At 2xl+ the
            Ask Question button joins it on the right. Tighter
            padding (gap-0.5 px-2) + smaller font keeps "Support"
            and "Golden" from truncating at the 1280–1535px range. */}
        <div className="hidden xl:flex items-center gap-0.5 px-2 py-1 rounded-full border-[1.5px] border-border/60 bg-card/85 backdrop-blur-[20px] shadow-subtle absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 hover:bg-card/95">
          {allNavItems.map(({ label, to, xlOnly }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                // Active = solid sage pill with white text.
                // Inactive = transparent, ink-soft, hover lifts to ink.
                // transition-all duration-200 = smooth hover.
                `nav-pill text-[0.78rem] ${isActive ? 'active' : ''} ${xlOnly ? 'hidden xl:inline-flex' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        {/* Center Pill Group (Desktop) */}
        <div className="justify-self-center">
          <div className="hidden lg:flex items-center justify-center gap-1.5 px-1.5 py-[5px] rounded-full border-[1.5px] border-[rgb(var(--border-rgb)_/_0.6)] bg-[rgb(var(--bg-card-rgb)_/_0.85)] backdrop-blur-[24px] shadow-md transition-all duration-300 hover:bg-[rgb(var(--bg-card-rgb)_/_0.95)] z-50">
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
        </div>

        {/* Right side actions */}
        <div className="flex items-center justify-self-end gap-2 sm:gap-3">
          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border border-[rgb(var(--border-rgb)_/_0.4)] bg-[rgb(var(--bg-card-rgb)_/_0.5)] text-ink-soft hover:text-ink hover:bg-[rgb(var(--border-rgb)_/_0.15)] transition-all duration-300 shadow-sm"
            title={language === 'en' ? 'Switch to Hindi' : 'अंग्रेजी में बदलें'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-75">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span>{language === 'en' ? 'EN' : 'हि'}</span>
          </button>

          {/* Unauthenticated — Sign in (text) + Get started (filled) */}
          {!isAuthenticated && (
            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={() => openModal('signin')}
                className="px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={() => openModal('register')}
                className="btn-base btn-primary text-sm"
              >
                Get started
              </button>
            </div>
          )}

          {/* Authenticated Utility Group */}
          {isAuthenticated && (
            <div className="flex items-center gap-3 lg:gap-4">
              {/* Ask Question button — hidden until 2xl (1536px) so
                  it stops fighting the center pill for space on
                  narrower desktop screens. Users can still ask
                  from /community. */}
              <button
                onClick={() => navigate('/community?ask=true')}
                className="hidden 2xl:inline-flex btn-base btn-primary text-xs"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Ask Question
              </button>

              <div className="hidden lg:block w-px h-6 bg-border" />

              <div className="flex items-center gap-2">
                {/* Spurti Points chip */}
                <SpurtiChip />

                {/* Learning Streak chip */}
                <StreakChip />

                <NotificationBell />

                {/* User Avatar + Dropdown */}
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setProfileOpen(!profileOpen); }}
                    className="flex items-center gap-1.5 cursor-pointer group"
                  >
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt={user?.name ? `${user.name} avatar` : 'avatar'}
                        className="w-9 h-9 rounded-full object-cover ring-2 ring-card transition-transform duration-200 group-hover:scale-105"
                        loading="lazy"
                        />
                        ) : (
                        <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-accent-text text-sm font-semibold ring-2 ring-card transition-transform duration-200 group-hover:scale-105"
                        style={{ backgroundColor: avatarColor }}
                      >
                        {initials}
                      </div>
                    )}
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5"
                      className={`hidden md:block text-ink-soft transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 top-[3.25rem] w-56 bg-[rgb(var(--bg-card-rgb)_/_0.85)] backdrop-blur-[24px] rounded-2xl border border-[rgb(var(--border-rgb)_/_0.5)] shadow-[0_8px_30px_rgba(0,0,0,0.12)] py-2 animate-fade-in z-50">
                      <div className="px-4 py-2 border-b border-border/50">
                        <p className="text-sm font-medium text-ink">{user?.name || 'User'}</p>
                        <p className="text-xs text-ink-faint">{user?.email || ''}</p>
                      </div>
                      {(user?.role === 'admin' || user?.role === 'moderator') && (
                        <button
                          onClick={() => { navigate('/admin'); setProfileOpen(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-[rgb(var(--bg-card-rgb)_/_0.5)] hover:text-ink transition-colors border-b border-[rgb(var(--border-rgb)_/_0.3)]"
                        >
                          Admin Dashboard
                        </button>
                      )}
                      <button
                        onClick={() => { navigate('/account'); setProfileOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-[rgb(var(--bg-card-rgb)_/_0.5)] hover:text-ink transition-colors border-b border-[rgb(var(--border-rgb)_/_0.3)]"
                      >
                        Account
                      </button>
                      
                      <button
                        onClick={() => { navigate('/saved'); setProfileOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-[rgb(var(--bg-card-rgb)_/_0.5)] hover:text-ink transition-colors border-b border-[rgb(var(--border-rgb)_/_0.3)]"
                      >
                        Saved
                      </button>

                      <div className="px-4 py-2.5 border-b border-border/30 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2">Appearance</p>
                        <div className="flex bg-mist rounded-lg p-1 gap-1">
                          <button
                            onClick={() => handleThemeChange('light')}
                            className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-medium rounded-md transition-colors ${theme === 'light' ? 'bg-card text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                            Light
                          </button>
                          <button
                            onClick={() => handleThemeChange('dark')}
                            className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-medium rounded-md transition-colors ${theme === 'dark' ? 'bg-card text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" /></svg>
                            Dark
                          </button>
                          <button
                            onClick={() => handleThemeChange('system')}
                            className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-medium rounded-md transition-colors ${theme === 'system' ? 'bg-card text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                            System
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-[rgb(var(--bg-card-rgb)_/_0.5)] hover:text-ink transition-colors mt-1"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden flex w-9 h-9 items-center justify-center rounded-[10px] hover:bg-black/[0.04] transition-colors"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </>
              ) : (
                <>
                  <line x1="4" y1="7" x2="20" y2="7"/>
                  <line x1="4" y1="12" x2="20" y2="12"/>
                  <line x1="4" y1="17" x2="20" y2="17"/>
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      <div
        className={`lg:hidden overflow-hidden transition-all duration-[350ms] ease-smooth border-t border-border ${
          mobileOpen ? 'max-h-[28rem] opacity-100' : 'max-h-0 opacity-0'
        }`}
        style={{
          backgroundColor: 'rgb(var(--bg-card-rgb) / 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="px-6 py-4 flex flex-col gap-1">
          {allNavItems.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-accent-light text-accent'
                    : 'text-ink-soft hover:text-ink hover:bg-black/[0.03]'
                }`
              }
            >
              {label}
            </NavLink>
          ))}

          {/* Mobile: Sign-in / Get started */}
          {!isAuthenticated && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { openModal('signin'); setMobileOpen(false); }}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-ink-soft border border-border rounded-full hover:bg-mist transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={() => { openModal('register'); setMobileOpen(false); }}
                className="btn-base btn-primary flex-1 text-sm"
              >
                Get started
              </button>
            </div>
          )}
          {isAuthenticated && (
            <>
              <NavLink
                to="/saved"
                end
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive ? 'bg-accent-light text-accent' : 'text-ink-soft hover:text-ink hover:bg-black/[0.03]'
                  }`
                }
              >
                Saved
              </NavLink>
              <div className="mt-2 px-4 py-2 text-xs text-ink-faint border-t border-border/40">
                Signed in as <span className="font-medium text-ink">{user?.name}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
