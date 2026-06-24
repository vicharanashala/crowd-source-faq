import React from "react";
import { Sparkles, Terminal, Flame, BookOpen, Mic, Shield, User, LogIn, LayoutDashboard, Sun, Moon } from "lucide-react";

interface TopNavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  trendingCount: number;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  currentUser: any;
  onLogInClick: () => void;
}

export default function TopNavbar({ 
  activeTab, 
  setActiveTab, 
  trendingCount, 
  darkMode, 
  setDarkMode,
  currentUser,
  onLogInClick
}: TopNavbarProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-stone-200/60 dark:border-white/5 bg-[#FAF8F5]/80 dark:bg-[#050505]/80 backdrop-blur-xl transition-all duration-300">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Brand Logo & Institution Info */}
        <div 
          onClick={() => setActiveTab("home")} 
          className="flex cursor-pointer items-center space-x-2.5 group"
        >
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all group-hover:border-purple-500/50">
            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform" />
            <div className="absolute -inset-0.5 -z-10 rounded-xl bg-purple-500/20 opacity-0 blur-sm transition-opacity group-hover:opacity-100" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-base">
              Vicharanashala
            </span>
            <span className="font-mono text-[10px] tracking-wider text-purple-600 dark:text-purple-400 uppercase font-medium">
              IIT Ropar · Support
            </span>
          </div>
        </div>

        {/* Desktop Interactive Nav Menu */}
        <nav className="hidden md:flex items-center space-x-1 bg-[#F0EAE1] dark:bg-white/5 p-1 rounded-xl border border-stone-200 dark:border-white/5 backdrop-blur-md">
          {[
            { id: "home", label: "Overview", icon: BookOpen },
            { id: "faq", label: "Intelligent FAQ", icon: Terminal },
            { id: "voice", label: "Voice Assistant", icon: Mic },
            { id: "chat", label: "Yaksha AI", icon: Sparkles },
            { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
            { id: "admin", label: "Control Center", icon: Shield }
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center space-x-2 px-3.5 py-1.5 font-display text-xs font-semibold rounded-lg transition-all duration-200 ${
                  isActive 
                    ? "text-purple-700 dark:text-purple-300 bg-white dark:bg-white/10 border border-stone-200 dark:border-white/10 shadow-sm" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-[#EBE5DC]/50 dark:hover:bg-white/5 border border-transparent"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-purple-600 dark:text-purple-300" : "text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100"}`} />
                <span>{item.label}</span>
                {item.id === "faq" && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-gradient-to-r from-purple-500 to-blue-500"></span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Status / Actions */}
        <div className="flex items-center space-x-3">
          {/* Theme Switcher Button */}
          <button 
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? "Switch to Professional Light Mode" : "Switch to Immersive Dark Mode"}
            className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-800 dark:text-slate-200 transition-all hover:bg-stone-100 dark:hover:bg-white/10 hover:border-purple-500/30 cursor-pointer shrink-0"
          >
            {darkMode ? (
              <Sun className="h-4 w-4 text-amber-500" />
            ) : (
              <Moon className="h-4 w-4 text-violet-600" />
            )}
          </button>

          <button 
            onClick={() => setActiveTab("faq")}
            className="relative hidden items-center space-x-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400 transition-all hover:bg-amber-500/20 sm:flex"
          >
            <Flame className="h-3.5 w-3.5 animate-pulse text-amber-500" />
            <span className="uppercase">Trending FAQ ({trendingCount})</span>
          </button>

          {currentUser ? (
            <button 
              onClick={() => setActiveTab("dashboard")}
              className="flex items-center space-x-2 rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-purple-500/30 cursor-pointer"
            >
              <User className="h-4 w-4 text-purple-400 animate-pulse" />
              <span className="hidden sm:inline font-mono text-[11px] text-purple-400 font-bold">{currentUser.name.split(" ")[0]} ({currentUser.contributionScore} XP)</span>
            </button>
          ) : (
            <button 
              onClick={onLogInClick}
              className="flex items-center space-x-2 rounded-xl border border-stone-200 dark:border-white/10 bg-purple-600 dark:bg-purple-600 text-white px-3.5 py-1.5 text-xs font-bold hover:opacity-90 cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Sign In Workspace</span>
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
