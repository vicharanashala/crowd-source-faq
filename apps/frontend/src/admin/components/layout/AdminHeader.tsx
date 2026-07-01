import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { useDebounce } from '../../../hooks/useDebounce';
import NotificationBell from '../../../components/notifications/NotificationBell';
import AdminActiveProgramIndicator from './AdminActiveProgramIndicator';
import { NavPills } from '../../../components/layout/NavPills';
import logoWide from '../../../assets/logo-wide.png';

function getAvatarColor(name?: string): string {
  if (!name) return '#6b92e0';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#6b92e0', '#5a9a6b', '#c4943a', '#e07c6b', '#7c6be0', '#e06ba8'];
  return colors[Math.abs(hash) % colors.length];
}

interface AdminHeaderProps {
  mobileOpen: boolean;
  setMobileOpen: (val: boolean) => void;
}

export default function AdminHeader({ mobileOpen, setMobileOpen }: AdminHeaderProps) {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSearchablePage = location.pathname.startsWith('/admin/support') || location.pathname.startsWith('/admin/golden-tickets');
  const currentQuery = searchParams.get('q') || '';
  
  // Local state for the input
  const [inputValue, setInputValue] = useState(currentQuery);
  const debouncedInput = useDebounce(inputValue, 500);
  
  // Update URL when debounced value changes
  useEffect(() => {
    if (debouncedInput === searchParams.get('q')) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedInput) next.set('q', debouncedInput);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }, [debouncedInput, searchParams, setSearchParams]);

  // Sync input value if URL changes externally
  useEffect(() => {
    if (currentQuery !== debouncedInput) {
      setInputValue(currentQuery);
    }
  }, [currentQuery]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  useEffect(() => {
    if (!profileOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [profileOpen]);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/');
  };

  const initials = user?.name ? user.name.charAt(0).toUpperCase() : 'A';
  const avatarColor = getAvatarColor(user?.name);
  const avatarSrc = user?.avatar?.url; // Keeping simple for Admin Layout

  const searchInputNode = isSearchablePage ? (
    <div className="relative group w-52 lg:w-64 shrink-0">
      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint group-focus-within:text-accent transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input 
        type="text" 
        placeholder="Search query or username..." 
        value={inputValue}
        onChange={handleSearch}
        className="w-full bg-[rgb(var(--bg-card-rgb)_/_0.85)] border-[1.5px] border-[rgb(var(--border-rgb)_/_0.6)] text-ink text-sm rounded-full pl-10 pr-4 py-[7px] outline-none focus:bg-[rgb(var(--bg-card-rgb)_/_0.95)] focus:border-accent/50 focus:ring-2 focus:ring-accent/10 transition-all placeholder-ink-faint shadow-sm"
      />
    </div>
  ) : null;

  return (
    <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl border-b border-border/40 px-4 sm:px-6 h-16 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-4 flex-1 basis-0 min-w-0 shrink-0 justify-start">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-ink-soft hover:bg-mist transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="7" x2="20" y2="7"/>
            <line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="17" x2="20" y2="17"/>
          </svg>
        </button>
        <Link to="/admin" className="flex items-center gap-2 group">
          <img
            src={logoWide}
            alt="Yaksha FAQ"
            className="h-10 sm:h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <span className="font-sans font-bold tracking-tight text-ink hidden sm:block text-lg">Admin</span>
        </Link>
      </div>

      {/* Center Nav Pills & Search (Desktop) */}
      <div className="hidden lg:flex shrink-0 items-center justify-center gap-3">
        <NavPills />
        {searchInputNode}
      </div>

      <div className="flex items-center justify-end gap-3 sm:gap-4 flex-1 basis-0 min-w-0 shrink-0">
        {/* Context-aware Search Squircle (Tablet only, as it moves to center on Desktop) */}
        <div className="hidden md:block lg:hidden">
          {searchInputNode}
        </div>

        <div className="hidden sm:block">
          <AdminActiveProgramIndicator />
        </div>
        
        <div className="h-6 w-px bg-border/60 mx-1 hidden sm:block" />

        <NotificationBell />

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 group p-1 pr-2 rounded-full hover:bg-mist transition-colors cursor-pointer"
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="avatar" className="w-8 h-8 rounded-full object-cover ring-2 ring-transparent group-hover:ring-accent/30 transition-all" />
            ) : (
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-inner transition-transform group-hover:scale-105"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
            )}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`hidden sm:block text-ink-faint transition-transform ${profileOpen ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-12 w-56 bg-card backdrop-blur-xl rounded-2xl border border-border/50 shadow-xl py-2 animate-fade-in z-50">
              <div className="px-4 py-2.5 border-b border-border/40">
                <p className="text-sm font-medium text-ink truncate">{user?.name || 'Admin User'}</p>
                <p className="text-xs text-ink-faint truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { setProfileOpen(false); navigate('/'); }}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-mist hover:text-ink transition-colors"
              >
                Exit to User View
              </button>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-danger/80 hover:bg-danger/10 hover:text-danger transition-colors border-t border-border/40"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
