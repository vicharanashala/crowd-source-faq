import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, LogIn, UserPlus, ChevronDown, User, LayoutDashboard, LogOut, ShieldCheck, HelpCircle, MessageSquare } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { MagneticButton } from './ui/Interactions';

export default function Navbar({ onSearchOpen, onAdminAccess, onFeedbackOpen, onQueryOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, isLoggedIn, isAdmin, openAuth, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });
  const dropRef = useRef(null);
  const navTabsRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const links = [
    { path: '/',    label: 'Home' },
    { path: '/faq', label: 'FAQs' },
  ];

  if (isAdmin) {
    links.push({ path: '/admin', label: 'Admin' });
  }

  // WOW 11: Sliding active underline
  useEffect(() => {
    const updateUnderline = () => {
      const activeBtn = navTabsRef.current?.querySelector('[data-active="true"]');
      if (activeBtn && navTabsRef.current) {
        const tabsRect = navTabsRef.current.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        setUnderline({
          left: btnRect.left - tabsRect.left,
          width: btnRect.width,
        });
      }
    };
    updateUnderline();
    window.addEventListener('resize', updateUnderline);
    return () => window.removeEventListener('resize', updateUnderline);
  }, [location.pathname, links.length]);

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-5 lg:px-8 transition-all duration-500 ${scrolled ? 'navbar-glass' : 'navbar-solid'}`}>
      {/* Left: branding */}
      <div className="flex items-center gap-3 min-w-[200px]">
        <img
          src="/iit-ropar-logo.png"
          alt="IIT Ropar"
          className="h-8 w-8 object-contain flex-shrink-0"
        />
        <img
          src="/meditation-logo.png"
          alt="Vicharanashala"
          className="h-8 w-auto object-contain flex-shrink-0"
        />
        <div className="flex flex-col gap-0">
          <span className="text-white font-bold text-base tracking-widest uppercase leading-tight">
            VICHARANASHALA
          </span>
          <span className="text-slate-400 text-[11px] leading-tight">
            Lab for Education Design
          </span>
        </div>
      </div>

      {/* Center: tagline + nav tabs */}
      <div className="flex-1 flex flex-col items-center gap-0.5">
        <span className="text-[11px] font-bold tracking-[0.18em] text-amber-400 uppercase">
          The FAQ That Fixes Itself
        </span>
        <div ref={navTabsRef} className="relative flex items-center gap-0">
          {links.map(link => {
            const isActive = location.pathname === link.path;
            return (
              <button
                key={link.path}
                data-active={isActive}
                onClick={() => navigate(link.path)}
                className={`px-4 py-1 text-sm transition-colors relative ${
                  isActive
                    ? 'text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {link.label}
              </button>
            );
          })}
          {/* Sliding underline */}
          <span
            className="nav-underline absolute bottom-0 h-[2px] bg-white rounded-full"
            style={{ left: underline.left, width: underline.width }}
          />
        </div>
      </div>

      {/* Right: auth controls */}
      <div className="flex items-center gap-2 min-w-[200px] justify-end">
        <button
          onClick={onSearchOpen}
          className="text-slate-400 hover:text-white p-1.5 rounded transition-colors mr-1 cursor-interactive"
          title="Search (⌘K)"
        >
          <Search size={15} />
        </button>

        {!isLoggedIn ? (
          <>
            <button
              onClick={() => openAuth()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 border border-slate-500 rounded-md hover:border-slate-300 hover:text-white transition-colors cursor-interactive"
            >
              <LogIn size={13} />
              Login
            </button>
            <MagneticButton
              onClick={() => openAuth()}
              className="magnetic-btn-primary flex items-center gap-1.5 px-3 py-1.5"
            >
              <UserPlus size={13} />
              Sign Up
            </MagneticButton>
            <button
              onClick={onAdminAccess}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-transparent border border-slate-500 hover:border-slate-300 text-slate-300 hover:text-white cursor-interactive"
            >
              Admin view
            </button>
          </>
        ) : isAdmin ? (
          <>
            <MagneticButton
              onClick={() => navigate('/admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md ${
                location.pathname === '/admin'
                  ? 'magnetic-btn-primary'
                  : 'bg-transparent border border-slate-500 text-slate-300 hover:border-slate-300 hover:text-white'
              }`}
            >
              <ShieldCheck size={13} />
              Admin Dashboard
            </MagneticButton>
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 border border-slate-500 rounded-md hover:border-red-400 hover:text-red-400 transition-colors cursor-interactive"
            >
              <LogOut size={13} />
              Logout
            </button>
          </>
        ) : (
          <>
            <MagneticButton
              onClick={() => navigate('/')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                location.pathname !== '/admin'
                  ? 'magnetic-btn-primary'
                  : 'bg-transparent border border-slate-500 hover:border-slate-300 text-slate-300 hover:text-white'
              }`}
            >
              Student view
            </MagneticButton>
            <button
              onClick={onAdminAccess}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-transparent border border-slate-500 hover:border-slate-300 text-slate-300 hover:text-white cursor-interactive"
            >
              Admin view
            </button>

            <div className="relative" ref={dropRef}>
              <button
                onClick={() => setDropdownOpen(v => !v)}
                className="flex items-center gap-1.5 ml-1 cursor-interactive"
              >
                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-[11px] font-bold text-amber-400">
                  {initials}
                </div>
                <ChevronDown size={12} className={`text-slate-400 transition-transform duration-300 ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#fffdf9] border border-[#e2dccb] rounded-xl shadow-lg py-1 z-50">
                  <div className="px-3 py-2 border-b border-[#e2dccb]">
                    <p className="text-xs font-semibold text-[#1c2333] truncate">{currentUser?.name}</p>
                    <p className="text-[11px] text-[#7c7260] truncate">{currentUser?.email}</p>
                  </div>
                  <button
                    onClick={() => { setDropdownOpen(false); navigate('/dashboard'); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-[#5b5447] hover:bg-[#f7f4ee] transition-colors cursor-interactive"
                  >
                    <LayoutDashboard size={13} />
                    Dashboard
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); navigate('/profile'); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-[#5b5447] hover:bg-[#f7f4ee] transition-colors cursor-interactive"
                  >
                    <User size={13} />
                    Profile
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); onFeedbackOpen?.(); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-[#5b5447] hover:bg-[#f7f4ee] transition-colors cursor-interactive"
                  >
                    <MessageSquare size={13} />
                    Share Feedback
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); onQueryOpen?.(); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-[#5b5447] hover:bg-[#f7f4ee] transition-colors cursor-interactive"
                  >
                    <HelpCircle size={13} />
                    Raise a Query
                  </button>
                  <div className="border-t border-[#e2dccb] mt-1">
                    <button
                      onClick={() => { setDropdownOpen(false); logout(); navigate('/'); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors cursor-interactive"
                    >
                      <LogOut size={13} />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
