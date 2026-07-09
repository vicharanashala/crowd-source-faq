import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow, format } from "date-fns";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  MessageCircle,
  Search,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  Mail,
  CalendarDays,
  ShieldCheck,
  Pencil,
  Save,
  X,
  Upload,
  Bookmark,
  Bell,
  Trash2,
  Check,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { SiteHeader, SiteFooter, Container } from "@/components/site";
import {
  myLikedFaqs,
  myProfile,
  myQueries,
  myRecentSearches,
  myStats,
  updateMyProfile,
  myBookmarks,
  myNotifications,
  markNotificationRead,
  deleteNotification,
} from "@/lib/faq.functions";
import { DashboardNav } from "./courses";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My Dashboard — Vidyā" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const statsFn = useServerFn(myStats);
  const queriesFn = useServerFn(myQueries);
  const likedFn = useServerFn(myLikedFaqs);
  const searchesFn = useServerFn(myRecentSearches);
  const profileFn = useServerFn(myProfile);
  const bookmarksFn = useServerFn(myBookmarks);
  const notifsFn = useServerFn(myNotifications);

  const stats = useQuery({ queryKey: ["myStats"], queryFn: () => statsFn() });
  const queries = useQuery({ queryKey: ["myQueries"], queryFn: () => queriesFn() });
  const liked = useQuery({ queryKey: ["myLiked"], queryFn: () => likedFn() });
  const searches = useQuery({ queryKey: ["myRecentSearches"], queryFn: () => searchesFn() });
  const profile = useQuery({ queryKey: ["myProfile"], queryFn: () => profileFn() });
  const bookmarks = useQuery({ queryKey: ["myBookmarks"], queryFn: () => bookmarksFn() });
  const notifs = useQuery({ queryKey: ["myNotifications"], queryFn: () => notifsFn(), refetchInterval: 30000 });

  const s = stats.data;
  const p = profile.data;
  const [showProfile, setShowProfile] = useState(false);

  return (
    <div className="min-h-screen">
      <SiteHeader
        profileAction={{
          avatarUrl: p?.avatar_url,
          fullName: p?.full_name,
          email: p?.email,
          loading: profile.isLoading,
          onClick: () => setShowProfile((v) => !v),
        }}
      />
      <Container className="py-12">
        <DashboardNav active="dashboard" />
        {/* Hero */}
        <div className="mt-8" />
        <ProfileHero greetingName={p?.full_name ?? s?.profile?.full_name ?? "friend"} />

        {/* Profile side panel */}
        <Sheet open={showProfile} onOpenChange={setShowProfile}>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" /> My Profile
              </SheetTitle>
              <SheetDescription>
                View and edit your profile details.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              <ProfileSection
                profile={p}
                loading={profile.isLoading}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Stats row */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat icon={<ThumbsUp className="h-4 w-4" />} label="Likes" value={s?.likeCount ?? 0} accent="text-emerald-600" />
          <Stat icon={<ThumbsDown className="h-4 w-4" />} label="Dislikes" value={s?.dislikeCount ?? 0} accent="text-rose-600" />
          <Stat icon={<Search className="h-4 w-4" />} label="Searches" value={s?.searchCount ?? 0} accent="text-violet-600" />
          <Stat icon={<HelpCircle className="h-4 w-4" />} label="Queries" value={s?.queryCount ?? 0} accent="text-amber-600" />
          <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Answered" value={s?.answeredCount ?? 0} accent="text-primary" />
        </div>


        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notifications — full width */}
          <div className="lg:col-span-2">
            <NotificationsPanel
              data={notifs.data ?? []}
              loading={notifs.isLoading}
            />
          </div>

          {/* Bookmarks */}
          <Panel
            icon={<Bookmark className="h-3.5 w-3.5 text-primary" />}
            title="My Bookmarks"
          >
            {bookmarks.isLoading ? (
              <Skeleton />
            ) : !bookmarks.data?.length ? (
              <Empty text="No bookmarks yet. Save FAQs from any answer page." />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {bookmarks.data.map((f) => (
                  <Link
                    key={f.id}
                    to="/faq/$id"
                    params={{ id: f.id }}
                    className="block rounded-lg border border-border bg-background/60 p-3 hover:border-primary/40 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {f.question}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                      {f.category ?? "General"} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          {/* Liked FAQs */}
          <Panel
            icon={<ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />}
            title="Liked FAQs"
          >
            {liked.isLoading ? (
              <Skeleton />
            ) : !liked.data?.length ? (
              <Empty text="No liked FAQs yet. Upvote answers you find useful." />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {liked.data.map((f) => (
                  <Link
                    key={f.id}
                    to="/faq/$id"
                    params={{ id: f.id }}
                    className="block rounded-lg border border-border bg-background/60 p-3 hover:border-primary/40 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {f.question}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                      {f.category ?? "General"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          {/* Recent Searches */}
          <Panel
            icon={<Search className="h-3.5 w-3.5 text-violet-600" />}
            title="Recent Searches"
          >
            {searches.isLoading ? (
              <Skeleton />
            ) : !searches.data?.length ? (
              <Empty text="No searches yet. Try the Ask AI page." />
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {searches.data.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50"
                  >
                    <span className="text-xs text-foreground/85 truncate mr-2">
                      {row.query}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* My Queries — spans full width */}
          <div className="lg:col-span-2">
            <Panel
              icon={<MessageCircle className="h-3.5 w-3.5 text-amber-600" />}
              title="My Queries"
              action={
                <Link
                  to="/queries"
                  className="text-xs text-primary hover:underline"
                >
                  Ask one →
                </Link>
              }
            >
              {queries.isLoading ? (
                <Skeleton />
              ) : !queries.data?.length ? (
                <Empty text="You haven't raised any queries yet." />
              ) : (
                <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                  {queries.data.map((q) => (
                    <div
                      key={q.id}
                      className="rounded-xl border border-border bg-background/60 p-4"
                    >
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {q.status === "answered" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Answered
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 px-2 py-0.5">
                            <Clock className="h-2.5 w-2.5" /> {q.status}
                          </span>
                        )}
                        <span className="ml-auto">
                          {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="mt-2 font-display text-lg text-primary">
                        {q.question}
                      </div>
                      {q.admin_answer && (
                        <div className="mt-3 text-sm text-foreground/85 border-l-2 border-primary/60 pl-4 whitespace-pre-wrap">
                          {q.admin_answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </Container>
      <SiteFooter />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="paper-card rounded-xl p-5">
      <div className={`${accent} mb-1`}>{icon}</div>
      <div className="font-display text-3xl text-primary">{value}</div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="paper-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {icon} {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-center py-8 text-xs text-muted-foreground">{text}</div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-8 rounded-md bg-muted/60 animate-pulse" />
      <div className="h-8 rounded-md bg-muted/40 animate-pulse" />
      <div className="h-8 rounded-md bg-muted/30 animate-pulse" />
    </div>
  );
}

type ProfileData = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string | null;
  updated_at: string | null;
  roles: string[];
} | undefined;

function ProfileHero({ greetingName }: { greetingName: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-amber-500/5 p-6 md:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-amber-500/15 blur-3xl"
      />

      <div className="relative">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Your journey
        </div>
        <h1 className="font-display text-4xl md:text-5xl text-primary mt-2">
          Namaste, {greetingName}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Welcome back to your Vidyā space.
        </p>
      </div>
    </div>
  );
}

function ProfileSection({
  profile,
  loading,
}: {
  profile: ProfileData;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMyProfile);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (profile && !editing) {
      setFullName(profile.full_name ?? "");
      setBio(profile.bio ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
    }
  }, [profile, editing]);

  if (loading || !profile) {
    return (
      <div className="mt-6 paper-card rounded-xl p-6">
        <div className="h-40 rounded-md bg-muted/40 animate-pulse" />
      </div>
    );
  }

  const initials = (profile.full_name ?? profile.email ?? "U")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel = profile.roles.includes("admin")
    ? "Admin"
    : profile.roles.includes("moderator")
      ? "Moderator"
      : "Student";

  const save = async () => {
    setSaving(true);
    try {
      await updateFn({ data: { full_name: fullName.trim() || null, bio: bio.trim() || null, avatar_url: avatarUrl.trim() || null } });
      toast.success("Profile updated");
      await qc.invalidateQueries({ queryKey: ["myProfile"] });
      await qc.invalidateQueries({ queryKey: ["myStats"] });
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      toast.success("Avatar uploaded — click Save to apply");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex gap-2">
          {!editing ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex flex-col items-center md:items-start gap-3">
          <Avatar className="h-24 w-24">
            <AvatarImage src={editing ? avatarUrl : profile.avatar_url ?? undefined} alt={profile.full_name ?? "avatar"} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          {editing && (
            <>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Uploading…" : "Upload photo"}
                </span>
              </label>
              {avatarUrl && (
                <button
                  type="button"
                  className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-rose-600"
                  onClick={() => setAvatarUrl("")}
                >
                  Remove photo
                </button>
              )}
            </>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-wider px-2 py-1">
            <ShieldCheck className="h-3 w-3" /> {roleLabel}
          </span>
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name">
            {editing ? (
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            ) : (
              <div className="text-sm text-foreground">{profile.full_name ?? "—"}</div>
            )}
          </Field>

          <Field label="Email" icon={<Mail className="h-3 w-3" />}>
            <div className="text-sm text-foreground break-all">{profile.email ?? "—"}</div>
          </Field>

          <Field label="Joined" icon={<CalendarDays className="h-3 w-3" />}>
            <div className="text-sm text-foreground">
              {profile.created_at ? format(new Date(profile.created_at), "MMM d, yyyy") : "—"}
            </div>
          </Field>

          <Field label="Last updated" icon={<CalendarDays className="h-3 w-3" />}>
            <div className="text-sm text-foreground">
              {profile.updated_at
                ? formatDistanceToNow(new Date(profile.updated_at), { addSuffix: true })
                : "—"}
            </div>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Bio">
              {editing ? (
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Tell others a little about yourself…" />
              ) : (
                <div className="text-sm text-foreground/85 whitespace-pre-wrap">
                  {profile.bio ?? <span className="text-muted-foreground italic">No bio yet.</span>}
                </div>
              )}
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

function NotificationsPanel({ data, loading }: { data: Notif[]; loading: boolean }) {
  const qc = useQueryClient();
  const markFn = useServerFn(markNotificationRead);
  const delFn = useServerFn(deleteNotification);
  const unread = data.filter((n) => !n.is_read).length;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["myNotifications"] });

  const markAll = useMutation({
    mutationFn: () => markFn({ data: { all: true } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: invalidate,
  });

  return (
    <Panel
      icon={<Bell className="h-3.5 w-3.5 text-primary" />}
      title={`Notifications${unread ? ` · ${unread} new` : ""}`}
      action={
        unread > 0 ? (
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            Mark all read
          </button>
        ) : null
      }
    >
      {loading ? (
        <Skeleton />
      ) : !data.length ? (
        <Empty text="You're all caught up." />
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {data.map((n) => (
            <div
              key={n.id}
              className={`rounded-lg border p-3 transition-colors ${
                n.is_read
                  ? "border-border bg-background/60"
                  : "border-primary/40 bg-primary/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.body && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3 whitespace-pre-wrap">
                      {n.body}
                    </p>
                  )}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!n.is_read && (
                    <button
                      className="text-muted-foreground hover:text-primary"
                      onClick={() => markOne.mutate(n.id)}
                      aria-label="Mark read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    className="text-muted-foreground hover:text-rose-600"
                    onClick={() => remove.mutate(n.id)}
                    aria-label="Delete notification"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}


