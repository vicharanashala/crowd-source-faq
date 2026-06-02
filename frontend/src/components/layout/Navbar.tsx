import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import NotificationBell from '../../components/ui/NotificationBell';

const navItems = [
  { label: 'Home', to: '/' },
  { label: 'FAQ', to: '/faq' },
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

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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
    logout();
    navigate('/login');
  };

  const initials = user?.name ? user.name.charAt(0).toUpperCase() : '?';
  const avatarColor = getAvatarColor(user?.name);
  const isCommunityActive = location.pathname === '/community';

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-[400ms] ease-smooth
        ${scrolled
          ? 'bg-bg/82 backdrop-blur-[20px] saturate-[1.8] border-b border-black/[0.04] shadow-subtle'
          : 'bg-transparent border-b border-transparent'
        }`}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between relative">

        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2.5 group flex-shrink-0">
          <div className="w-9 h-9 rounded-[10px] border-2 border-ink flex items-center justify-center transition-transform duration-300 group-hover:rotate-[-6deg]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1f1f1f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <span className="font-serif text-xl tracking-tight text-ink">
            Yaksha FAQ
          </span>
        </NavLink>

        {/* Center Pill Group (Desktop) */}
        <div className="hidden lg:flex items-center gap-1.5 px-1.5 py-[5px] rounded-full border-[1.5px] border-border bg-white/50 backdrop-blur-[12px] absolute left-1/2 -translate-x-1/2">
          {navItems.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-pill ${isActive ? 'active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-2 flex-shrink-0">

        {/* Unauthenticated — show Sign in / Register */}
        {!isAuthenticated && (
          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-4 py-1.5 text-sm font-semibold bg-accent text-white rounded-full hover:bg-accent-hover transition-colors"
            >
              Register
            </button>
          </div>
        )}

        {/* Authenticated */}
        {isAuthenticated && (
          <>
            {!isCommunityActive && (
              <button
                onClick={() => navigate('/community?ask=true')}
                className="hidden lg:flex items-center px-5 py-[7px] text-[0.82rem] font-semibold text-ink bg-transparent border-[1.5px] border-ink rounded-full cursor-pointer transition-all duration-300 ease-smooth tracking-[0.01em] leading-none hover:bg-ink hover:text-white hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)] hover:-translate-y-px active:translate-y-0"
              >
                Ask Question
              </button>
            )}

            <div className="hidden lg:block w-px h-6 bg-border mx-1" />

            <NotificationBell />

            {/* User Avatar + Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setProfileOpen(!profileOpen); }}
                className="flex items-center gap-1.5 cursor-pointer group"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-[0_0_0_2px_#fff,0_1px_4px_rgba(0,0,0,0.08)] transition-transform duration-200 group-hover:scale-105"
                  style={{ backgroundColor: avatarColor }}
                >
                  {initials}
                </div>
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="#6b6b6b" strokeWidth="2.5"
                  className={`hidden md:block transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-12 w-48 bg-white rounded-xl border border-border shadow-float py-2 animate-fade-in z-50">
                  <div className="px-4 py-2 border-b border-border/50">
                    <p className="text-sm font-medium text-ink">{user?.name || 'User'}</p>
                    <p className="text-xs text-ink-faint">{user?.email || ''}</p>
                  </div>
                  {(user?.role === 'admin' || user?.role === 'moderator') && (
                    <button
                      onClick={() => { navigate('/admin'); setProfileOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-ink-soft hover:bg-bg hover:text-ink transition-colors border-b border-border/30"
                    >
                      Admin Dashboard
                    </button>
                  )}
                  <button
                    onClick={() => { navigate('/account'); setProfileOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-ink-soft hover:bg-bg hover:text-ink transition-colors border-b border-border/30"
                  >
                    Account
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm text-ink-soft hover:bg-bg hover:text-ink transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </>
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
        className={`lg:hidden overflow-hidden transition-all duration-[350ms] ease-smooth ${
          mobileOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
        style={{
          backgroundColor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: mobileOpen ? '1px solid #e5e5e5' : 'none',
        }}
      >
        <div className="px-6 py-4 flex flex-col gap-1">
          {navItems.map(({ label, to }) => (
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
                }`}
            >
              {label}
            </NavLink>
          ))}
          <div className="flex gap-2 mt-3">
            {!isCommunityActive && isAuthenticated && (
              <button
                onClick={() => { navigate('/community?ask=true'); setMobileOpen(false); }}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-ink bg-transparent border-[1.5px] border-ink rounded-full cursor-pointer transition-all hover:bg-ink hover:text-white"
              >
                Ask Question
              </button>
            )}
            {!isAuthenticated && (
              <button
                onClick={() => { navigate('/login'); setMobileOpen(false); }}
                className="flex-1 py-2.5 px-4 text-sm font-semibold text-ink bg-transparent border-[1.5px] border-ink rounded-full cursor-pointer transition-all hover:bg-ink hover:text-white"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}