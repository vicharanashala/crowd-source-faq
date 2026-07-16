import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Bell, Flame, Award, Shield, User, LogOut, Menu, X } from 'lucide-react';

interface TopNavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ currentTab, setCurrentTab }) => {
  const { user, logout, notifications, markNotificationsRead, login, register, errorMsg, clearError } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [college, setCollege] = useState('');
  const [studentId, setStudentId] = useState('');

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isRegister) {
        await register(name, email, password, studentId, college);
      } else {
        await login(email, password);
      }
      setShowAuthModal(false);
      // Reset forms
      setName('');
      setEmail('');
      setPassword('');
      setCollege('');
      setStudentId('');
    } catch (err) {
      // Error is stored in AuthContext and rendered in modal
    }
  };

  const handleTabClick = (tabName: string) => {
    setCurrentTab(tabName);
    setMobileMenuOpen(false);
  };

  const navLinks = [
    { id: 'home', label: 'Portal Core' },
    { id: 'faqs', label: 'FAQ Explorer' },
    { id: 'chat', label: 'Yaksha AI Chat' },
    { id: 'voice', label: 'Voice Portal' },
    { id: 'spurti', label: 'Spurti Dashboard' },
  ];

  if (user?.role === 'ADMIN') {
    navLinks.push({ id: 'admin', label: 'Admin Council' });
  }

  return (
    <>
      <nav className="sticky top-0 z-40 bg-[#050510]/85 border-b border-slate-800/80 backdrop-blur-xl transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div 
                className="cursor-pointer flex items-center gap-2 group" 
                onClick={() => setCurrentTab('home')}
              >
                <svg className="w-8 h-8 group-hover:rotate-45 transition-transform duration-500 filter drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7C3AED" />
                      <stop offset="100%" stopColor="#06B6D4" />
                    </linearGradient>
                  </defs>
                  <path d="M12 2L19 9L12 16L5 9L12 2Z" fill="url(#logoGrad)" opacity="0.85"/>
                  <path d="M12 7L16 11L12 15L8 11L12 7Z" fill="#FFF"/>
                  <circle cx="12" cy="12" r="9" stroke="url(#logoGrad)" strokeWidth="1.5" strokeDasharray="3 3"/>
                </svg>
                <div>
                  <span className="font-display font-bold text-lg text-white tracking-tight group-hover:text-cyan-400 transition-colors">
                    Yaksha AI
                  </span>
                  <span className="text-[9px] text-[#06B6D4] font-mono block tracking-widest leading-none font-bold uppercase">
                    Vicharanashala
                  </span>
                </div>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center space-x-1.5">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => handleTabClick(link.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                    currentTab === link.id
                      ? 'bg-[#7C3AED]/20 text-[#06B6D4] border border-[#06B6D4]/30 shadow-md shadow-cyan-950/20'
                      : 'text-slate-350 hover:bg-slate-900/60 hover:text-white border border-transparent'
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>

            {/* Right-Side Operations */}
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  {/* Streak Flame */}
                  {user.streak > 0 && (
                    <div className="flex items-center gap-1 text-orange-400 bg-orange-950/20 px-2 py-1 rounded-full border border-orange-900/30 text-xs font-semibold animate-pulse" title="Daily Streak">
                      <Flame size={14} className="fill-orange-400" />
                      <span>{user.streak}d</span>
                    </div>
                  )}

                  {/* SP & Rank Badge */}
                  <div className="hidden sm:flex items-center gap-1.5 text-violet-300 bg-slate-900/80 px-2.5 py-1 rounded-full border border-violet-900/35 text-xs font-semibold font-mono">
                    <Award size={14} className="text-[#06B6D4]" />
                    <span>{user.spurtiPoints} SP</span>
                  </div>

                  {/* Notifications Center */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowNotifications(!showNotifications);
                        if (!showNotifications && unreadCount > 0) {
                          markNotificationsRead();
                        }
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-900/65 hover:text-white relative border border-slate-800/40"
                    >
                      <Bell size={16} />
                      {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                      )}
                    </button>

                    {/* Notification Dropdown Panel */}
                    {showNotifications && (
                      <div className="absolute right-0 mt-3 w-80 bg-slate-950/98 border border-slate-800/90 rounded-xl shadow-2xl backdrop-blur-xl z-50 py-2.5 overflow-hidden">
                        <div className="px-4 py-1.5 border-b border-slate-900 flex justify-between items-center">
                          <span className="text-xs font-bold text-white tracking-wider uppercase">Chamber Alerts</span>
                          {unreadCount > 0 && <span className="text-[10px] text-cyan-400 font-mono font-bold bg-cyan-950/40 px-1.5 py-0.5 rounded">{unreadCount} New</span>}
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center text-slate-500 text-xs font-sans">
                              The oracle chamber remains peaceful. No notifications.
                            </div>
                          ) : (
                            notifications.map((n) => (
                              <div key={n.id} className={`px-4 py-2.5 border-b border-slate-900/50 hover:bg-slate-900/20 text-xs transition-colors ${!n.isRead ? 'border-l-2 border-l-cyan-400 bg-slate-900/10' : ''}`}>
                                <p className="text-slate-200 font-sans leading-relaxed">{n.message}</p>
                                <span className="text-[9px] text-slate-500 font-mono block mt-1">
                                  {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Profile Dropdown or Actions */}
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => logout()}
                      className="p-2 rounded-lg text-slate-400 hover:bg-red-950/20 hover:text-red-400 border border-slate-800/40 transition-colors"
                      title="Log Out"
                    >
                      <LogOut size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => {
                    clearError();
                    setShowAuthModal(true);
                  }}
                  className="bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:shadow-lg hover:shadow-cyan-950/40 transition-all cursor-pointer"
                >
                  Enter Portal
                </button>
              )}

              {/* Mobile menu button */}
              <div className="md:hidden">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-900 hover:text-white border border-slate-850"
                >
                  {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#050510]/98 border-t border-slate-900 px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleTabClick(link.id)}
                className={`block w-full text-left px-3 py-2 rounded-lg text-xs font-bold ${
                  currentTab === link.id
                    ? 'bg-[#7C3AED]/20 text-[#06B6D4]'
                    : 'text-slate-350 hover:bg-slate-900'
                }`}
              >
                {link.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Auth Modal Overlay */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-[#070718] border border-[#7C3AED]/30 w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Glow accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#7C3AED] to-[#06B6D4]" />
            
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-display font-extrabold text-white text-center mb-1">
              {isRegister ? 'Register Candidate' : 'Initiate Session'}
            </h2>
            <p className="text-slate-400 text-xs text-center mb-6">
              {isRegister ? 'Join the Vicharanashala research network' : 'Present credentials to consult Yaksha AI'}
            </p>

            {!isRegister && (
              <div className="bg-[#7C3AED]/10 border border-[#7C3AED]/25 rounded-xl p-3 mb-4 text-xs font-mono text-slate-350 select-text">
                <span className="text-[#06B6D4] font-bold block mb-1.5 uppercase tracking-wider text-[9px]">Portal Test Access</span>
                <div className="grid grid-cols-2 gap-3 text-[11px] leading-tight">
                  <div className="border-r border-slate-800/50 pr-2">
                    <span className="text-slate-500 font-sans font-bold text-[9px] uppercase tracking-wider block">Admin Console</span>
                    <p className="text-white mt-1 select-all">admin@vicharanashala.in</p>
                    <p className="text-cyan-400/80 mt-0.5 select-all">admin123</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans font-bold text-[9px] uppercase tracking-wider block">Candidate Access</span>
                    <p className="text-white mt-1 select-all">scholar@vicharanashala.in</p>
                    <p className="text-cyan-400/80 mt-0.5 select-all">scholar123</p>
                  </div>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="bg-red-950/30 border border-red-800/40 text-red-400 p-2.5 rounded-lg text-xs mb-4 text-center">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:border-[#7C3AED] focus:outline-none"
                    placeholder="Enter your name"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Email ID</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:border-[#7C3AED] focus:outline-none"
                  placeholder="name@college.edu"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:border-[#7C3AED] focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              {isRegister && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Student ID</label>
                    <input
                      type="text"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:border-[#7C3AED] focus:outline-none"
                      placeholder="e.g. 2023CSB1001"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">College</label>
                    <input
                      type="text"
                      value={college}
                      onChange={(e) => setCollege(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-xs focus:border-[#7C3AED] focus:outline-none"
                      placeholder="IIT Ropar"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-[#7C3AED] to-[#06B6D4] text-white py-2 rounded-lg text-xs font-bold hover:brightness-110 shadow-lg shadow-violet-950/20 cursor-pointer"
              >
                {isRegister ? 'Form Account' : 'Authenticate'}
              </button>
            </form>

            <div className="text-center mt-4">
              <button
                onClick={() => {
                  clearError();
                  setIsRegister(!isRegister);
                }}
                className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
              >
                {isRegister ? 'Already registered? Log in here' : "Don't have an account? Register here"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TopNavbar;
