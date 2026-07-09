import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, LayoutDashboard, ShieldCheck, Menu, X } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import meditationLogo from "@/assets/meditation-logo.png";
import type { User } from "@supabase/supabase-js";

export type HeaderProfileAction = {
  avatarUrl?: string | null;
  fullName?: string | null;
  email?: string | null;
  loading?: boolean;
  onClick: () => void;
};

export function SiteHeader({ profileAction }: { profileAction?: HeaderProfileAction }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function loadAdmin(u: User | null) {
      if (!u) return setIsAdmin(false);
      const { data } = await supabase.rpc("has_role", { _user_id: u.id, _role: "admin" });
      setIsAdmin(!!data);
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      loadAdmin(data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      loadAdmin(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  }

  const links = [
    { to: "/browse", label: "Browse" },
    { to: "/ask", label: "Ask AI" },
    { to: "/courses", label: "Learn" },
    { to: "/community", label: "Community" },
    { to: "/queries", label: "Queries" },
    { to: "/support", label: "Support" },
  ] as const;


  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 overflow-hidden">
            <img src={meditationLogo} alt="Vidyā logo" className="h-8 w-8 object-contain" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-xl text-foreground">Vidyā</div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Living FAQ
            </div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="px-3 py-2 text-sm text-foreground/70 hover:text-foreground transition-colors"
              activeProps={{ className: "text-primary font-medium gold-underline" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard"><LayoutDashboard className="h-4 w-4" /> Dashboard</Link>
              </Button>
              {isAdmin && (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/admin"><ShieldCheck className="h-4 w-4" /> Admin</Link>
                </Button>
              )}
              <NotificationBell />
              {profileAction && (
                <button
                  onClick={profileAction.onClick}
                  aria-label="Open profile"
                  className="rounded-full border border-border bg-background/90 p-0.5 hover:border-primary/40 transition-colors"
                >
                  <HeaderAvatar profileAction={profileAction} />
                </button>
              )}
              <Button onClick={signOut} variant="outline" size="sm">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button>
              <Button asChild size="sm" className="bg-foreground text-background hover:bg-foreground/90"><Link to="/auth">Join</Link></Button>
            </>
          )}
        </div>

        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border px-5 py-3 flex flex-col gap-2 bg-background">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="py-2 text-sm" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link to="/dashboard" className="py-2 text-sm" onClick={() => setOpen(false)}>Dashboard</Link>
              {isAdmin && <Link to="/admin" className="py-2 text-sm" onClick={() => setOpen(false)}>Admin</Link>}
              {profileAction && (
                <button
                  onClick={() => {
                    profileAction.onClick();
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 py-2 text-sm text-left"
                >
                  <HeaderAvatar profileAction={profileAction} /> Profile
                </button>
              )}
              <button onClick={signOut} className="py-2 text-sm text-left">Sign out</button>
            </>
          ) : (
            <Link to="/auth" className="py-2 text-sm" onClick={() => setOpen(false)}>Sign in</Link>
          )}
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-24 bg-background">
      <div className="mx-auto max-w-6xl px-5 py-10 grid gap-6 md:grid-cols-3">
        <div>
          <div className="font-display text-xl text-foreground">Vidyā</div>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs">
            A living FAQ portal for the Vicharanashala Internship — knowledge that gets smarter every day.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          <div className="text-foreground font-medium mb-2">Explore</div>
          <div className="flex flex-col gap-1">
            <Link to="/browse">Browse FAQs</Link>
            <Link to="/ask">Ask AI</Link>
            <Link to="/queries">Community queries</Link>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <div className="text-foreground font-medium mb-2">Powered by</div>
          <div>Semantic search · AI-grounded answers</div>
        </div>
      </div>
      <div className="text-center text-xs text-muted-foreground pb-6">
        © {new Date().getFullYear()} Vidyā · Built with care.
      </div>
    </footer>
  );
}

export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-6xl px-5 ${className}`}>{children}</div>;
}

function HeaderAvatar({ profileAction }: { profileAction: HeaderProfileAction }) {
  const initials = (profileAction.fullName ?? profileAction.email ?? "U")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Avatar className="h-8 w-8">
      <AvatarImage src={profileAction.avatarUrl ?? undefined} alt={profileAction.fullName ?? "avatar"} />
      <AvatarFallback className="text-[10px]">{profileAction.loading ? "…" : initials}</AvatarFallback>
    </Avatar>
  );
}
