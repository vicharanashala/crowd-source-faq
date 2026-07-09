import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import React, { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ScrollText,
  BarChart3,
  Ban,
  CheckCircle,
  FileText,
  Loader2,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Plus,
  Save,
  Sparkles,
  Search,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";


import { SiteHeader, SiteFooter, Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  adminAnalytics,
  adminActivityLog,
  adminAnswerQuery,
  adminBulkDeleteFaqs,
  adminBulkDeleteQueries,
  adminDeleteFaq,
  adminDeleteFaqComment,
  adminDeleteQuery,
  adminRecentComments,
  adminFaqGrowth,
  adminListFaqs,
  adminListQueries,
  adminListUsers,
  adminRecentActivity,
  adminFailedSearchTerms,
  adminUnansweredClusters,
  adminSuggestFaqDraft,
  adminEngagementHeatmap,
  adminTopContributors,
  adminSearchInsights,
  adminSetFaqPublished,
  adminSetUserRole,
  adminToggleUser,
  adminTopCategories,
  adminTopSearches,
  adminUpsertFaq,
  adminUserActivity,
  amIAdmin,
  claimFirstAdmin,
  listCategories,
  listSiteAlerts,
  upsertSiteAlert,
  deleteSiteAlert,
} from "@/lib/faq.functions";

import {
  CategoriesTab,
  CoursesTab,
  FlagsTab,
  SettingsTab,
} from "@/components/admin-governance";
import { AdminCommunityTab, AdminSupportTab } from "@/components/admin-community";
import { BookOpen, Flag, Settings as SettingsIcon, Tag, LifeBuoy, MessagesSquare } from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Vidyā" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

type Tab = "overview" | "users" | "queries" | "faqs" | "categories" | "courses" | "flags" | "settings" | "activity" | "audit" | "community" | "support" | "alerts" | "selfheal";

function Admin() {
  const adminFn = useServerFn(amIAdmin);
  const claim = useServerFn(claimFirstAdmin);
  const isAdmin = useQuery({ queryKey: ["amIAdmin"], queryFn: () => adminFn() });
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  const claimMut = useMutation({
    mutationFn: () => claim(),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("You're now an admin");
        qc.invalidateQueries({ queryKey: ["amIAdmin"] });
      } else toast.error("An admin already exists");
    },
  });

  if (isAdmin.isLoading)
    return (
      <Shell>
        <div className="text-muted-foreground">Loading…</div>
      </Shell>
    );

  if (!isAdmin.data) {
    return (
      <Shell>
        <div className="paper-card rounded-xl p-8 max-w-lg mx-auto text-center">
          <ShieldCheck className="h-8 w-8 mx-auto text-gold" />
          <h2 className="mt-4 font-display text-2xl text-primary">Admin area</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You need admin access. If no admin exists yet, claim it now — first signed-in user wins.
          </p>
          <Button
            variant="ornate"
            className="mt-6"
            onClick={() => claimMut.mutate()}
            disabled={claimMut.isPending}
          >
            Claim admin
          </Button>
          <div className="mt-4 text-xs text-muted-foreground">
            <Link to="/dashboard" className="underline">
              Back to dashboard
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { id: "users", label: "Users", icon: <Users className="h-3.5 w-3.5" /> },
    { id: "queries", label: "Queries", icon: <MessageCircle className="h-3.5 w-3.5" /> },
    { id: "faqs", label: "FAQs", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "categories", label: "Categories", icon: <Tag className="h-3.5 w-3.5" /> },
    { id: "community", label: "Community", icon: <MessagesSquare className="h-3.5 w-3.5" /> },
    { id: "support", label: "Support", icon: <LifeBuoy className="h-3.5 w-3.5" /> },
    { id: "courses", label: "Courses", icon: <BookOpen className="h-3.5 w-3.5" /> },
    { id: "flags", label: "Flags", icon: <Flag className="h-3.5 w-3.5" /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon className="h-3.5 w-3.5" /> },
    { id: "alerts", label: "Alerts", icon: <Megaphone className="h-3.5 w-3.5" /> },
    { id: "selfheal", label: "Self-Heal", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "activity", label: "Activity", icon: <Activity className="h-3.5 w-3.5" /> },
    { id: "audit", label: "Audit Log", icon: <ScrollText className="h-3.5 w-3.5" /> },

  ];


  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-1 mb-6 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-gold text-primary"
                : "border-transparent text-muted-foreground hover:text-primary"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab />}
      {tab === "queries" && <QueriesPanel />}
      {tab === "faqs" && <FaqEditor />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "community" && <AdminCommunityTab />}
      {tab === "support" && <AdminSupportTab />}
      {tab === "courses" && <CoursesTab />}
      {tab === "flags" && <FlagsTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "alerts" && <AlertsTab />}
      {tab === "selfheal" && <SelfHealTab />}
      {tab === "activity" && <ActivityTab />}
      {tab === "audit" && <AuditLogTab />}
    </Shell>

  );

}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Container className="py-12">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Console</div>
        <h1 className="font-display text-4xl md:text-5xl text-primary mt-2">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Live analytics, user management, and knowledge base.
        </p>
        <div className="mt-8">{children}</div>
      </Container>
      <SiteFooter />
    </div>
  );
}

/* -------------------- Overview -------------------- */

function OverviewTab() {
  const fn = useServerFn(adminAnalytics);
  const topFn = useServerFn(adminTopSearches);
  const growthFn = useServerFn(adminFaqGrowth);
  const activityFn = useServerFn(adminUserActivity);
  const insightsFn = useServerFn(adminSearchInsights);
  const catsFn = useServerFn(adminTopCategories);
  const stats = useQuery({ queryKey: ["adminAnalytics"], queryFn: () => fn() });
  const top = useQuery({ queryKey: ["adminTopSearches"], queryFn: () => topFn() });
  const growth = useQuery({ queryKey: ["adminFaqGrowth"], queryFn: () => growthFn() });
  const activity = useQuery({ queryKey: ["adminUserActivity"], queryFn: () => activityFn() });
  const insights = useQuery({ queryKey: ["adminSearchInsights"], queryFn: () => insightsFn() });
  const topCats = useQuery({ queryKey: ["adminTopCategories"], queryFn: () => catsFn() });
  const failedFn = useServerFn(adminFailedSearchTerms);
  const failedTerms = useQuery({ queryKey: ["adminFailedTerms"], queryFn: () => failedFn() });
  const heatFn = useServerFn(adminEngagementHeatmap);
  const contribFn = useServerFn(adminTopContributors);
  const heat = useQuery({ queryKey: ["adminEngagementHeatmap"], queryFn: () => heatFn() });
  const contributors = useQuery({ queryKey: ["adminTopContributors"], queryFn: () => contribFn() });

  const cards = [
    { key: "totalUsers", label: "Total users", icon: Users },
    { key: "activeStudents", label: "Active (7d)", icon: TrendingUp },
    { key: "totalFAQs", label: "FAQs", icon: FileText },
    { key: "totalViews", label: "FAQ views", icon: BarChart3 },
    { key: "totalSearches", label: "Total searches", icon: Search },
    { key: "todaySearches", label: "Today's searches", icon: TrendingUp },
    { key: "totalLikes", label: "Upvotes", icon: ThumbsUp },
    { key: "totalDislikes", label: "Downvotes", icon: ThumbsDown },
    { key: "totalQueries", label: "Queries", icon: MessageCircle },
    { key: "pendingQueries", label: "Pending", icon: MessageCircle },
  ] as const;

  const shortDate = (d: string) => d.slice(5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const val = stats.data ? (stats.data[c.key as keyof typeof stats.data] as number) : null;
          return (
            <div key={c.key} className="paper-card rounded-xl p-4">
              <Icon className="h-4 w-4 text-gold" />
              <div className="mt-2 font-display text-2xl text-primary">
                {stats.isLoading ? "—" : (val ?? 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="paper-card rounded-xl p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
            <FileText className="h-3 w-3" /> FAQ growth (14 days)
          </div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growth.data ?? []}>
                <defs>
                  <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={shortDate} fontSize={10} />
                <YAxis fontSize={10} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#fg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="paper-card rounded-xl p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
            <Activity className="h-3 w-3" /> User activity (14 days)
          </div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activity.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={shortDate} fontSize={10} />
                <YAxis fontSize={10} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="searches" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="users" stroke="#d97706" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Search insights + Top categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="paper-card rounded-xl p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
            <Search className="h-3 w-3" /> Search insights
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <div className="font-display text-2xl text-primary">
                {insights.isLoading ? "—" : (insights.data?.totalSearches ?? 0).toLocaleString()}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Total</div>
            </div>
            <div>
              <div className="font-display text-2xl text-rose-600">
                {insights.isLoading ? "—" : (insights.data?.failedSearches ?? 0).toLocaleString()}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Unmatched</div>
            </div>
            <div>
              <div className="font-display text-2xl text-amber-600">
                {insights.isLoading ? "—" : `${insights.data?.failRate ?? 0}%`}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Fail rate</div>
            </div>
          </div>
          <div className="mt-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Top searches
            </div>
            {top.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {top.data?.length === 0 && (
              <div className="text-sm text-muted-foreground">No searches yet.</div>
            )}
            <ol className="space-y-1.5">
              {top.data?.slice(0, 8).map((row, i) => (
                <li key={row.query} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                  <span className="flex-1 truncate text-primary">{row.query}</span>
                  <span className="text-xs text-muted-foreground">{row.count}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="paper-card rounded-xl p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
            <BarChart3 className="h-3 w-3" /> Top categories
          </div>
          <div className="mt-4">
            {topCats.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {topCats.data?.length === 0 && (
              <div className="text-sm text-muted-foreground">No categories yet.</div>
            )}
            <ul className="space-y-3">
              {topCats.data?.map((c) => {
                const max = Math.max(1, ...(topCats.data ?? []).map((x) => x.faqs));
                const pct = Math.round((c.faqs / max) * 100);
                return (
                  <li key={c.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-primary font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.faqs} FAQ{c.faqs === 1 ? "" : "s"} · {c.views.toLocaleString()} views
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-gold"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <div className="paper-card rounded-xl p-5">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
          <Search className="h-3 w-3" /> Unmatched search terms
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Words from searches with no FAQ match — content gaps to close.
        </p>
        <div className="mt-4">
          {failedTerms.isLoading && (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
          {failedTerms.data && failedTerms.data.length === 0 && (
            <div className="text-sm text-muted-foreground">No unmatched searches yet.</div>
          )}
          {failedTerms.data && failedTerms.data.length > 0 && (
            <div className="flex flex-wrap gap-2 items-baseline">
              {failedTerms.data.map((t) => {
                const max = Math.max(...(failedTerms.data ?? []).map((x) => x.count));
                const scale = 0.85 + (t.count / max) * 1.3;
                return (
                  <span
                    key={t.term}
                    className="text-primary bg-muted/60 hover:bg-muted rounded px-2 py-0.5 leading-tight"
                    style={{ fontSize: `${scale}rem` }}
                    title={`${t.count} occurrences`}
                  >
                    {t.term}
                    <span className="text-[10px] text-muted-foreground ml-1">
                      {t.count}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Engagement heatmap + Top contributors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="paper-card rounded-xl p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
            <Activity className="h-3 w-3" /> Engagement heatmap
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Search activity by day &amp; hour (last 30 days).
          </p>
          {heat.isLoading && <div className="mt-4 text-sm text-muted-foreground">Loading…</div>}
          {heat.data && (
            <div className="mt-4 overflow-x-auto">
              <div className="inline-block min-w-full">
                <div className="grid" style={{ gridTemplateColumns: "auto repeat(24, minmax(14px, 1fr))" }}>
                  <div />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-[9px] text-muted-foreground text-center">
                      {h % 3 === 0 ? h : ""}
                    </div>
                  ))}
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day, di) => (
                    <React.Fragment key={day}>
                      <div className="text-[10px] text-muted-foreground pr-2 flex items-center justify-end">
                        {day}
                      </div>
                      {heat.data!.grid[di].map((v, hi) => {
                        const intensity = heat.data!.max ? v / heat.data!.max : 0;
                        return (
                          <div
                            key={hi}
                            className="aspect-square rounded-sm border border-border/40"
                            title={`${day} ${hi}:00 — ${v} searches`}
                            style={{
                              backgroundColor: v
                                ? `hsl(var(--primary) / ${0.15 + intensity * 0.85})`
                                : "hsl(var(--muted) / 0.4)",
                            }}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="paper-card rounded-xl p-5">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-3 w-3" /> Top contributors (30d)
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Ranked by votes, comments &amp; community posts.
          </p>
          <div className="mt-4">
            {contributors.isLoading && (
              <div className="text-sm text-muted-foreground">Loading…</div>
            )}
            {contributors.data && contributors.data.length === 0 && (
              <div className="text-sm text-muted-foreground">No contributions yet.</div>
            )}
            <ol className="space-y-2">
              {contributors.data?.map((c, i) => {
                const max = Math.max(1, ...(contributors.data ?? []).map((x) => x.total));
                const pct = Math.round((c.total / max) * 100);
                return (
                  <li key={c.userId} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 tabular-nums">
                      {i + 1}
                    </span>
                    {c.avatar ? (
                      <img
                        src={c.avatar}
                        alt=""
                        className="h-7 w-7 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-primary truncate">{c.name}</div>
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {c.votes}v · {c.comments}c · {c.posts}p
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Users -------------------- */

function UsersTab() {
  const listFn = useServerFn(adminListUsers);
  const toggleFn = useServerFn(adminToggleUser);
  const roleFn = useServerFn(adminSetUserRole);
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["adminUsers"], queryFn: () => listFn() });

  const mut = useMutation({
    mutationFn: ({ userId, disable }: { userId: string; disable: boolean }) =>
      toggleFn({ data: { userId, disable } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: "admin" | "moderator"; grant: boolean }) =>
      roleFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(`${v.grant ? "Granted" : "Revoked"} ${v.role}`);
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="paper-card rounded-xl p-5 overflow-x-auto">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-gold" />
        <h3 className="font-display text-lg text-primary">User management</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {users.data?.length ?? 0} users
        </span>
      </div>
      {users.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {users.data && users.data.length === 0 && (
        <div className="text-sm text-muted-foreground">No users yet.</div>
      )}
      {users.data && users.data.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Name", "Email", "Roles", "Joined", "Last seen", "Queries", "Votes", "Status", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="px-2 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.id} className="border-b border-border/60">
                <td className="px-2 py-2 font-medium text-primary whitespace-nowrap">{u.name}</td>
                <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{u.email}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {u.roles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">user</span>
                  ) : (
                    u.roles.map((r) => (
                      <span
                        key={r}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/15 text-gold font-medium mr-1"
                      >
                        {r}
                      </span>
                    ))
                  )}
                </td>
                <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-2 py-2 text-center">{u.queries}</td>
                <td className="px-2 py-2 text-center">{u.votes}</td>
                <td className="px-2 py-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      u.disabled ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                    }`}
                  >
                    {u.disabled ? "Disabled" : "Active"}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={u.roles.includes("admin") ? "default" : "outline"}
                      disabled={roleMut.isPending}
                      onClick={() =>
                        roleMut.mutate({
                          userId: u.id,
                          role: "admin",
                          grant: !u.roles.includes("admin"),
                        })
                      }
                      title={u.roles.includes("admin") ? "Revoke admin" : "Grant admin"}
                      className="h-7 px-2 text-[10px]"
                    >
                      Admin
                    </Button>
                    <Button
                      size="sm"
                      variant={u.roles.includes("moderator") ? "default" : "outline"}
                      disabled={roleMut.isPending}
                      onClick={() =>
                        roleMut.mutate({
                          userId: u.id,
                          role: "moderator",
                          grant: !u.roles.includes("moderator"),
                        })
                      }
                      title={u.roles.includes("moderator") ? "Revoke moderator" : "Grant moderator"}
                      className="h-7 px-2 text-[10px]"
                    >
                      Mod
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mut.isPending}
                      onClick={() => mut.mutate({ userId: u.id, disable: !u.disabled })}
                      title={u.disabled ? "Enable user" : "Disable user"}
                      className="h-7 px-2"
                    >
                      {u.disabled ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <Ban className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* -------------------- Queries -------------------- */

function QueriesPanel() {
  const listFn = useServerFn(adminListQueries);
  const answerFn = useServerFn(adminAnswerQuery);
  const delFn = useServerFn(adminDeleteQuery);
  const bulkDelFn = useServerFn(adminBulkDeleteQueries);
  const qc = useQueryClient();
  const qs = useQuery({ queryKey: ["adminQueries"], queryFn: () => listFn() });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "pending" | "answered">("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const mut = useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) =>
      answerFn({ data: { id, answer } }),
    onSuccess: () => {
      toast.success("Answered");
      qc.invalidateQueries({ queryKey: ["adminQueries"] });
      qc.invalidateQueries({ queryKey: ["recentQueries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["adminQueries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDel = useMutation({
    mutationFn: (ids: string[]) => bulkDelFn({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.count} queries`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["adminQueries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (qs.data ?? []).filter((q) => {
    if (filter === "all") return true;
    if (filter === "answered") return q.status === "answered";
    return q.status !== "answered";
  });

  const counts = {
    all: qs.data?.length ?? 0,
    pending: (qs.data ?? []).filter((q) => q.status !== "answered").length,
    answered: (qs.data ?? []).filter((q) => q.status === "answered").length,
  };

  // Similar-query grouping: normalize text, group by shared normalized form.
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const groups = new Map<string, string[]>();
  for (const q of filtered) {
    const k = normalize(q.question);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(q.id);
    groups.set(k, arr);
  }
  const dupOf = new Map<string, number>();
  for (const ids of groups.values()) {
    if (ids.length > 1) ids.forEach((id) => dupOf.set(id, ids.length));
  }

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
          <MessageSquare className="h-3 w-3" /> Community queries
        </div>
        <div className="ml-auto flex gap-1 text-xs">
          {(["pending", "answered", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setFilter(k);
                setSelected(new Set());
              }}
              className={`px-2.5 py-1 rounded-md border ${
                filter === k
                  ? "bg-gold/15 border-gold/50 text-primary"
                  : "border-border text-muted-foreground hover:text-primary"
              }`}
            >
              {k[0].toUpperCase() + k.slice(1)} ({counts[k]})
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <input
              type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(filtered.map((q) => q.id)) : new Set())
              }
            />
            Select all
          </label>
          <span className="text-muted-foreground">{selected.size} selected</span>
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkDel.isPending}
              onClick={() => {
                if (confirm(`Delete ${selected.size} queries?`))
                  bulkDel.mutate(Array.from(selected));
              }}
            >
              <Trash2 className="h-3 w-3" /> Delete selected
            </Button>
          )}
          {dupOf.size > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-amber-700 bg-amber-500/10 rounded px-2 py-0.5">
              <MessageCircle className="h-3 w-3" />
              {groups.size < filtered.length
                ? `${filtered.length - groups.size} likely duplicates`
                : ""}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {filtered.length === 0 && (
          <div className="text-sm text-muted-foreground">Nothing here.</div>
        )}
        {filtered.map((q) => (
          <div key={q.id} className="paper-card rounded-xl p-5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.has(q.id)}
                onChange={() => toggle(q.id)}
              />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {q.status}
              </span>
              {dupOf.has(q.id) && (
                <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-500/10 rounded px-1.5 py-0.5">
                  {dupOf.get(q.id)}× duplicate
                </span>
              )}
              <button
                className="ml-auto text-xs text-muted-foreground hover:text-rose-600 flex items-center gap-1"
                onClick={() => {
                  if (confirm("Delete this query?")) delMut.mutate(q.id);
                }}
                disabled={delMut.isPending}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
            <div className="mt-1 font-display text-lg text-primary">{q.question}</div>
            {q.context && (
              <div className="mt-1 text-sm text-muted-foreground">{q.context}</div>
            )}
            {q.status !== "answered" ? (
              <div className="mt-3 space-y-2">
                <Textarea
                  rows={3}
                  placeholder="Write an answer…"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="ornate"
                  disabled={!answers[q.id] || mut.isPending}
                  onClick={() => mut.mutate({ id: q.id, answer: answers[q.id] })}
                >
                  {mut.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Send answer
                </Button>
              </div>
            ) : (
              <div className="mt-3 text-sm border-l-2 border-gold pl-4 whitespace-pre-wrap">
                {q.admin_answer}
              </div>
            )}
          </div>
        ))}
      </div>

      <CommentsModerationPanel />
    </section>
  );
}

function CommentsModerationPanel() {
  const listFn = useServerFn(adminRecentComments);
  const delFn = useServerFn(adminDeleteFaqComment);
  const qc = useQueryClient();
  const comments = useQuery({
    queryKey: ["adminRecentComments"],
    queryFn: () => listFn(),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Comment removed");
      qc.invalidateQueries({ queryKey: ["adminRecentComments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        <MessageCircle className="h-3 w-3" /> Recent comments
      </div>
      <div className="mt-3 space-y-2">
        {comments.isLoading && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}
        {comments.data && comments.data.length === 0 && (
          <div className="text-sm text-muted-foreground">No comments yet.</div>
        )}
        {comments.data?.map((c) => (
          <div
            key={c.id}
            className="paper-card rounded-xl p-4 flex items-start gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {c.author_name} ·{" "}
                <Link
                  to="/faq/$id"
                  params={{ id: c.faq_id }}
                  className="hover:text-primary underline"
                >
                  {c.faq_question ?? "FAQ"}
                </Link>{" "}
                · {new Date(c.created_at).toLocaleString()}
              </div>
              <div className="mt-1 text-sm text-primary whitespace-pre-wrap">
                {c.body}
              </div>
            </div>
            <button
              className="text-xs text-muted-foreground hover:text-rose-600 flex items-center gap-1"
              onClick={() => {
                if (confirm("Remove this comment?")) del.mutate(c.id);
              }}
              disabled={del.isPending}
            >
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------- FAQ Editor -------------------- */

function FaqEditor() {
  const catsFn = useServerFn(listCategories);
  const faqsFn = useServerFn(adminListFaqs);
  const upsertFn = useServerFn(adminUpsertFaq);
  const delFn = useServerFn(adminDeleteFaq);
  const bulkDelFn = useServerFn(adminBulkDeleteFaqs);
  const publishFn = useServerFn(adminSetFaqPublished);
  const qc = useQueryClient();

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => catsFn() });
  const faqs = useQuery({
    queryKey: ["adminAllFaqs"],
    queryFn: () => faqsFn(),
  });

  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [cat, setCat] = useState<string>("");
  const [published, setPublished] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "published" | "unpublished">("all");
  const [search, setSearch] = useState("");

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["adminAllFaqs"] });
    qc.invalidateQueries({ queryKey: ["adminFaqs"] });
    qc.invalidateQueries({ queryKey: ["faqs"] });
    qc.invalidateQueries({ queryKey: ["adminAnalytics"] });
  };

  const upsert = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: editingId ?? undefined,
          category_id: cat || null,
          question: q,
          answer: a,
          tags: [],
          is_published: published,
        },
      }),
    onSuccess: () => {
      toast.success(editingId ? "Updated" : "Created");
      setQ("");
      setA("");
      setEditingId(null);
      setPublished(true);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDel = useMutation({
    mutationFn: (ids: string[]) => bulkDelFn({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.count} FAQ${r.count === 1 ? "" : "s"}`);
      setSelected(new Set());
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePub = useMutation({
    mutationFn: (v: { id: string; is_published: boolean }) => publishFn({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(f: {
    id: string;
    question: string;
    answer: string;
    category_id: string | null;
    is_published?: boolean;
  }) {
    setEditingId(f.id);
    setQ(f.question);
    setA(f.answer);
    setCat(f.category_id ?? "");
    setPublished(f.is_published ?? true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filtered = (faqs.data ?? []).filter((f) => {
    if (filter === "published" && !f.is_published) return false;
    if (filter === "unpublished" && f.is_published) return false;
    if (search && !f.question.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((f) => f.id)));
  };

  return (
    <section>
      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
        Knowledge base
      </div>
      <h2 className="mt-2 font-display text-2xl text-primary">
        {editingId ? "Edit FAQ" : "Add a new FAQ"}
      </h2>

      <div className="paper-card mt-4 rounded-xl p-5 space-y-3">
        <div>
          <Label>Question</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Answer</Label>
          <Textarea rows={6} value={a} onChange={(e) => setA(e.target.value)} className="mt-1" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Category</Label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— None —</option>
              {cats.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <label className="mt-1 flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />
              {published ? "Published (live)" : "Draft (hidden)"}
            </label>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ornate"
            onClick={() => upsert.mutate()}
            disabled={upsert.isPending || q.length < 3 || a.length < 3}
          >
            {upsert.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : editingId ? (
              <Save className="h-3 w-3" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            {editingId ? "Save changes" : "Create & embed"}
          </Button>
          {editingId && (
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setQ("");
                setA("");
                setCat("");
                setPublished(true);
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-xl text-primary">All FAQs</h3>
        <span className="text-xs text-muted-foreground">{filtered.length} shown</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-40 text-xs"
          />
          <div className="flex gap-1 text-xs">
            {(["all", "published", "unpublished"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-2.5 py-1 rounded-md border ${
                  filter === k
                    ? "bg-gold/15 border-gold/50 text-primary"
                    : "border-border text-muted-foreground hover:text-primary"
                }`}
              >
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
          <span className="text-primary">{selected.size} selected</span>
          <Button
            size="sm"
            variant="destructive"
            className="ml-auto"
            disabled={bulkDel.isPending}
            onClick={() => {
              if (confirm(`Delete ${selected.size} FAQs? This cannot be undone.`))
                bulkDel.mutate(Array.from(selected));
            }}
          >
            <Trash2 className="h-3 w-3" /> Delete selected
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <div className="mt-3 paper-card rounded-xl p-2 max-h-[600px] overflow-auto">
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all"
            />
            <span>Select all</span>
          </div>
        )}
        {filtered.length === 0 && (
          <div className="text-sm text-muted-foreground p-4 text-center">No FAQs match.</div>
        )}
        <div className="space-y-1 mt-1">
          {filtered.map((f) => (
            <div
              key={f.id}
              className="rounded-lg p-3 flex items-start gap-3 hover:bg-muted/40"
            >
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(f.id);
                  else next.delete(f.id);
                  setSelected(next);
                }}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{f.categories?.name ?? "Uncategorized"}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full font-medium ${
                      f.is_published
                        ? "bg-emerald-500/10 text-emerald-700"
                        : "bg-amber-500/10 text-amber-700"
                    }`}
                  >
                    {f.is_published ? "Published" : "Draft"}
                  </span>
                  <span>· {f.view_count ?? 0} views</span>
                  <span className="inline-flex items-center gap-0.5 text-emerald-700">
                    <ThumbsUp className="h-3 w-3" /> {f.upvotes ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-rose-700">
                    <ThumbsDown className="h-3 w-3" /> {f.downvotes ?? 0}
                  </span>
                </div>
                <div className="text-sm text-primary truncate">{f.question}</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  togglePub.mutate({ id: f.id, is_published: !f.is_published })
                }
                disabled={togglePub.isPending}
                title={f.is_published ? "Unpublish" : "Publish"}
              >
                {f.is_published ? "Unpublish" : "Publish"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => edit(f)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (confirm("Delete this FAQ?")) del.mutate(f.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}



/* -------------------- Activity -------------------- */

function ActivityTab() {
  const fn = useServerFn(adminRecentActivity);
  const act = useQuery({ queryKey: ["adminActivity"], queryFn: () => fn() });

  if (act.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <ActivityCard title="Recent searches" icon={<Search className="h-4 w-4 text-gold" />}>
        {act.data?.searches.length === 0 && (
          <Empty>No searches yet.</Empty>
        )}
        {act.data?.searches.map((s) => (
          <Row key={s.id} label={s.query} time={s.created_at} />
        ))}
      </ActivityCard>

      <ActivityCard
        title="Recent queries"
        icon={<MessageCircle className="h-4 w-4 text-gold" />}
      >
        {act.data?.queries.length === 0 && <Empty>No queries yet.</Empty>}
        {act.data?.queries.map((q) => (
          <Row
            key={q.id}
            label={q.question}
            time={q.created_at}
            tag={q.status}
          />
        ))}
      </ActivityCard>

      <ActivityCard title="Recently updated FAQs" icon={<FileText className="h-4 w-4 text-gold" />}>
        {act.data?.faqs.length === 0 && <Empty>No FAQs yet.</Empty>}
        {act.data?.faqs.map((f) => (
          <Row key={f.id} label={f.question} time={f.updated_at} />
        ))}
      </ActivityCard>
    </div>
  );
}

function ActivityCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="paper-card rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-display text-base text-primary">{title}</h3>
      </div>
      <div className="space-y-2 max-h-[500px] overflow-auto">{children}</div>
    </div>
  );
}

function Row({ label, time, tag }: { label: string; time: string; tag?: string }) {
  return (
    <div className="border-b border-border/60 pb-2 last:border-0">
      <div className="text-sm text-primary line-clamp-2">{label}</div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-muted-foreground">
          {new Date(time).toLocaleString()}
        </span>
        {tag && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/15 text-gold font-medium uppercase tracking-wider">
            {tag}
          </span>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>;
}

/* -------------------- Audit Log -------------------- */

const AUDIT_ACTION_META: Record<string, { label: string; tone: string }> = {
  "role.grant": { label: "Role granted", tone: "bg-emerald-500/15 text-emerald-600" },
  "role.revoke": { label: "Role revoked", tone: "bg-rose-500/15 text-rose-600" },
  "faq.create": { label: "FAQ created", tone: "bg-blue-500/15 text-blue-600" },
  "faq.update": { label: "FAQ updated", tone: "bg-blue-500/15 text-blue-600" },
  "faq.delete": { label: "FAQ deleted", tone: "bg-rose-500/15 text-rose-600" },
  "faq.bulk_delete": { label: "FAQs bulk-deleted", tone: "bg-rose-500/15 text-rose-600" },
  "faq.publish": { label: "FAQ published", tone: "bg-emerald-500/15 text-emerald-600" },
  "faq.unpublish": { label: "FAQ unpublished", tone: "bg-amber-500/15 text-amber-600" },
  "query.answer": { label: "Query answered", tone: "bg-emerald-500/15 text-emerald-600" },
  "query.delete": { label: "Query deleted", tone: "bg-rose-500/15 text-rose-600" },
};

function AuditLogTab() {
  const fn = useServerFn(adminActivityLog);
  const [filter, setFilter] = useState<string>("all");
  const q = useQuery({
    queryKey: ["adminAuditLog"],
    queryFn: () => fn({ data: { limit: 200 } }),
  });

  const rows = q.data ?? [];
  const filtered = filter === "all" ? rows : rows.filter((r) => r.action.startsWith(filter));

  const filters = [
    { id: "all", label: "All" },
    { id: "role.", label: "Role changes" },
    { id: "faq.", label: "FAQ moderation" },
    { id: "query.", label: "Query moderation" },
  ];

  return (
    <section className="paper-card rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display text-lg text-primary flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-gold" />
            Admin Activity Log
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Timestamped record of role changes and moderation actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filter === f.id
                  ? "border-gold bg-gold/10 text-primary"
                  : "border-border text-muted-foreground hover:text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <Empty>No activity recorded yet.</Empty>
      ) : (
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Actor</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = AUDIT_ACTION_META[r.action] ?? {
                  label: r.action,
                  tone: "bg-muted text-muted-foreground",
                };
                const details = r.details as Record<string, unknown> | null;
                return (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {r.actor_email ?? (
                        <span className="text-muted-foreground">
                          {r.actor_id?.slice(0, 8) ?? "system"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider ${meta.tone}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {r.target_type ? (
                        <>
                          <span className="text-primary">{r.target_type}</span>
                          {r.target_id ? (
                            <span className="ml-1">#{r.target_id.slice(0, 8)}</span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {details && Object.keys(details).length > 0 ? (
                        <code className="text-[11px] break-all">
                          {Object.entries(details)
                            .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
                            .join(" · ")}
                        </code>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* -------------------- Site Alerts -------------------- */

function AlertsTab() {
  const listFn = useServerFn(listSiteAlerts);
  const upsertFn = useServerFn(upsertSiteAlert);
  const deleteFn = useServerFn(deleteSiteAlert);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["adminSiteAlerts"], queryFn: () => listFn() });

  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warning" | "danger">("info");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["adminSiteAlerts"] });
    qc.invalidateQueries({ queryKey: ["activeSiteAlerts"] });
  };

  const create = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          message: message.trim(),
          tone,
          active: true,
          link_url: linkUrl.trim() || null,
          link_label: linkLabel.trim() || null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Alert published");
      setMessage("");
      setLinkUrl("");
      setLinkLabel("");
      setExpiresAt("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (row: { id: string; active: boolean; message: string; tone: "info" | "success" | "warning" | "danger" }) =>
      upsertFn({
        data: { id: row.id, message: row.message, tone: row.tone, active: !row.active },
      }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Alert deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <section className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
      <div className="paper-card rounded-xl p-5">
        <h3 className="font-display text-lg text-primary flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-gold" /> New site alert
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Displays a dismissible banner at the top of every page.
        </p>
        <div className="grid gap-3 mt-4">
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Scheduled maintenance on Sunday from 2–4 AM IST."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tone</Label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as typeof tone)}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="danger">Danger</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Expires (optional)</Label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Link URL (optional)</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <Label className="text-xs">Link label</Label>
              <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Learn more" />
            </div>
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={!message.trim() || create.isPending}
            className="w-fit"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Publish alert
          </Button>
        </div>
      </div>

      <div className="paper-card rounded-xl p-5">
        <h3 className="font-display text-lg text-primary">All alerts</h3>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground mt-4">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground mt-4">No alerts yet.</div>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((a) => (
              <li key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full ${
                          a.tone === "danger"
                            ? "bg-rose-500/15 text-rose-600"
                            : a.tone === "warning"
                            ? "bg-amber-500/15 text-amber-600"
                            : a.tone === "success"
                            ? "bg-emerald-500/15 text-emerald-600"
                            : "bg-blue-500/15 text-blue-600"
                        }`}
                      >
                        {a.tone}
                      </span>
                      <span className={a.active ? "text-emerald-600" : "text-muted-foreground"}>
                        {a.active ? "Active" : "Inactive"}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                      {a.expires_at && (
                        <span className="text-muted-foreground">
                          · expires {new Date(a.expires_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-primary">{a.message}</div>
                    {a.link_url && (
                      <a
                        href={a.link_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        {a.link_label ?? a.link_url}
                      </a>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        toggle.mutate({ id: a.id, active: a.active, message: a.message, tone: a.tone })
                      }
                    >
                      {a.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this alert?")) remove.mutate(a.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}


function SelfHealTab() {
  const listFn = useServerFn(adminUnansweredClusters);
  const suggestFn = useServerFn(adminSuggestFaqDraft);
  const upsertFn = useServerFn(adminUpsertFaq);
  const catsFn = useServerFn(listCategories);
  const qc = useQueryClient();

  const clusters = useQuery({ queryKey: ["adminUnansweredClusters"], queryFn: () => listFn() });
  const cats = useQuery({ queryKey: ["listCategories"], queryFn: () => catsFn() });

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ question: string; answer: string; tags: string[] } | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");

  const suggestMut = useMutation({
    mutationFn: (query: string) => suggestFn({ data: { query } }),
    onSuccess: (r) => {
      setDraft({ question: r.question, answer: r.answer, tags: r.tags });
      toast.success("Draft generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          category_id: categoryId || null,
          question: draft!.question,
          answer: draft!.answer,
          tags: draft!.tags,
          is_published: true,
        },
      }),
    onSuccess: () => {
      toast.success("FAQ published");
      setDraft(null);
      setActiveKey(null);
      qc.invalidateQueries({ queryKey: ["adminListFaqs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = clusters.data ?? [];

  return (
    <section className="space-y-6">
      <div className="paper-card rounded-xl p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <h2 className="font-display text-xl text-primary">Self-healing suggestions</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Top student searches from the last 30 days that returned no FAQ match. Generate an AI draft, edit, and publish.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 paper-card rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
            Unanswered clusters ({rows.length})
          </div>
          {clusters.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No unmatched searches. </div>
          ) : (
            <ul className="space-y-2 max-h-[560px] overflow-auto pr-1">
              {rows.map((r) => (
                <li key={r.key}>
                  <button
                    onClick={() => {
                      setActiveKey(r.key);
                      setDraft(null);
                      suggestMut.mutate(r.query);
                    }}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      activeKey === r.key
                        ? "border-gold bg-muted/40"
                        : "border-border hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-primary truncate">{r.query}</div>
                      <span className="text-xs rounded-full bg-muted px-2 py-0.5 shrink-0">
                        {r.count}×
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      last {new Date(r.last).toLocaleDateString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-3 paper-card rounded-xl p-4">
          {!activeKey ? (
            <div className="text-sm text-muted-foreground">
              Pick an unmatched query on the left to generate a draft FAQ.
            </div>
          ) : suggestMut.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Drafting FAQ…
            </div>
          ) : draft ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Question</Label>
                <Input
                  value={draft.question}
                  onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Answer</Label>
                <Textarea
                  rows={10}
                  value={draft.answer}
                  onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Category</Label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">— None —</option>
                    {(cats.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Tags (comma-separated)</Label>
                  <Input
                    value={draft.tags.join(", ")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="ornate"
                  onClick={() => publishMut.mutate()}
                  disabled={publishMut.isPending || !draft.answer.trim()}
                >
                  {publishMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Publish FAQ
                </Button>
                <Button
                  variant="outline"
                  onClick={() => suggestMut.mutate(rows.find((r) => r.key === activeKey)!.query)}
                  disabled={suggestMut.isPending}
                >
                  <Sparkles className="h-4 w-4" /> Regenerate
                </Button>
                <Button variant="ghost" onClick={() => { setDraft(null); setActiveKey(null); }}>
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No draft yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}
