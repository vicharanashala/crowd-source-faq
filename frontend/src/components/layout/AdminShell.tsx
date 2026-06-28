import { Link, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Flag, BarChart3, Users, MessageSquare, Settings, LogOut, ChevronLeft } from "lucide-react";

const adminLinks = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/moderation", label: "Moderation", icon: Flag },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/questions", label: "Questions", icon: MessageSquare },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export const AdminShell = ({ children, title, eyebrow, actions }: any) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-brand-paper flex" data-testid="admin-shell">
      <aside className="hidden lg:flex flex-col w-64 border-r border-brand-line bg-white sticky top-0 h-screen">
        <Link to="/" className="px-6 py-6 border-b border-brand-line flex items-center gap-2" data-testid="admin-brand-link">
          <div className="w-7 h-7 bg-brand-ink flex items-center justify-center">
            <span className="font-serif text-brand-paper text-lg leading-none italic">C</span>
          </div>
          <div className="leading-none">
            <p className="font-serif text-lg text-brand-ink">CrowdSource</p>
            <p className="label-eyebrow text-[9px]">ADMIN CONSOLE</p>
          </div>
        </Link>
        <nav className="flex-1 py-6">
          <p className="label-eyebrow px-6 mb-3">Manage</p>
          {adminLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${isActive ? 'bg-[#F0F0EE] text-brand-ink border-l-2 border-brand-ink font-medium' : 'text-brand-body hover:text-brand-ink hover:bg-[#F9F9F8] border-l-2 border-transparent'}`
              }
              data-testid={`admin-nav-${l.label.toLowerCase()}`}
            >
              <l.icon size={15} strokeWidth={1.5} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-brand-line p-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-xs text-brand-body hover:text-brand-ink" data-testid="admin-exit-btn">
            <LogOut size={13} /> Exit admin
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="border-b border-brand-line bg-white px-6 md:px-10 py-5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="lg:hidden w-9 h-9 border border-brand-line flex items-center justify-center" data-testid="admin-back-btn">
              <ChevronLeft size={16} />
            </button>
            <div>
              {eyebrow && <p className="label-eyebrow mb-1">{eyebrow}</p>}
              <h1 className="font-serif text-3xl md:text-4xl text-brand-ink leading-none tracking-tight">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">{actions}</div>
        </header>
        <div className="p-6 md:p-10">{children}</div>
      </div>
    </div>
  );
};
