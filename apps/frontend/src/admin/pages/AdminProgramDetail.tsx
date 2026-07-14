/**
 * v1.69 — Phase 10: Admin Program Detail.
 *
 * Single-program management view with tabbed navigation:
 *   - Overview  — at-a-glance stats (members, FAQs, courses, support tickets)
 *   - Settings  — ProgramSettings (theme / hero / sections / branding)
 *   - Courses   — per-program course list + quick "new course" action
 *   - Members   — enrollment roster + role management
 *   - AI        — per-program AI config (resolves to global fallback if not set)
 *   - Zoom      — per-program Zoom OAuth credentials
 *   - Discord   — per-program Discord bot
 *   - Features  — per-program feature flag overrides
 *   - Support   — per-program app settings (Golden Ticket cooldown / SP cost /
 *                  penalty multiplier) + per-program SupportCategory overrides
 *
 * Each tab is a thin wrapper around the existing per-program admin
 * endpoints added in Phases 4-9. The detail page is purely a
 * navigation shell + per-program summary card.
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router-dom';
import adminApi from '../utils/adminApi';
import { useBatch } from '../../context/BatchContext';
import { slugifyProgramName } from '../../utils/programSlug';
// v1.69 — Phase 8 admin UI: real interactive widget for the
// per-program feature flag toggle. Replaces the previous
// placeholder curl snippet on the Features tab.
import ProgramFeatureFlagsTab from '../components/program/ProgramFeatureFlagsTab';
// v1.69 — Phase 9 admin UI: per-program support category CRUD widget.
import ProgramSupportCategoriesTab from '../components/program/ProgramSupportCategoriesTab';
// v1.69 — Phase 9 admin UI: per-program app settings widget
// (Golden Ticket cooldown / SP cost / penalty multiplier).
import ProgramAppSettingsTab from '../components/program/ProgramAppSettingsTab';

type Tab = 'overview' | 'settings' | 'courses' | 'members' | 'ai' | 'zoom' | 'discord' | 'features' | 'support' | 'appSettings' | 'categories';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'settings', label: 'Settings' },
  { key: 'courses',  label: 'Courses' },
  { key: 'members',  label: 'Members' },
  { key: 'ai',       label: 'AI' },
  { key: 'zoom',     label: 'Zoom' },
  { key: 'discord',  label: 'Discord' },
  { key: 'features', label: 'Features' },
  { key: 'support',  label: 'Support' },
  { key: 'appSettings', label: 'App' },
  // v1.70 — Dynamic Categories tab. Clicking navigates to
  // /admin/programs/:id/categories (a dedicated page), since
  // the cluster editor has its own state and refresh loop.
  { key: 'categories', label: 'Categories' },
];
interface ProgramInfo {
  _id: string;
  name: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  status: 'draft' | 'active' | 'archived' | 'completed';
  enrollmentMode: 'open' | 'invite_only' | 'closed';
  startDate: string;
  endDate: string;
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="text-2xl font-serif text-ink mt-1">{value}</p>
    </div>
  );
}

export default function AdminProgramDetail(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { availablePrograms } = useBatch();
  // The route param is `id` but we accept both an ObjectId and a slug.
  // The previous behaviour was to assume ObjectId — any non-id route
  // (or an id that was deleted/renamed) surfaced a generic "Program
  // not found" with no recovery path. Now we resolve slugs to ids via
  // the slug-by-slug endpoint and fall back to the in-memory program
  // list when the slug is just slightly out of sync.
  const rawParam = params.id ?? '';
  const isObjectId = /^[a-f0-9]{24}$/i.test(rawParam);

  const [tab, setTab] = useState<Tab>('overview');
  const [info, setInfo] = useState<ProgramInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string>(isObjectId ? rawParam : '');

  // Resolve the param to a real program id. Tries three sources in
  // order so the admin always lands on the right detail page:
  //   1. Already an ObjectId — use as-is and verify via API.
  //   2. Slug → id via /api/batches/by-slug/:slug.
  //   3. Slug → id via the in-memory availablePrograms list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let id = isObjectId ? rawParam : '';
        if (!id) {
          // Try the by-slug endpoint (works for any program, even if
          // not in the cached availablePrograms list).
          try {
            const slugRes = await adminApi.get<{ _id: string }>(`/batches/by-slug/${encodeURIComponent(rawParam)}`);
            id = slugRes.data._id;
          } catch {
            // Fall back to the cached list — covers the case where
            // the network is slow / API is down but we already have
            // the program in memory.
            const fromList = availablePrograms.find((p) => p.name && slugifyProgramName(p.name) === rawParam);
            if (fromList) id = fromList._id;
          }
        }
        if (cancelled) return;
        if (!id) {
          setError(`We couldn't find a program with id or slug "${rawParam}". It may have been deleted or renamed.`);
          setLoading(false);
          return;
        }
        setProgramId(id);
        const res = await adminApi.get<{ batch: ProgramInfo }>(`/batches/${id}`);
        if (!cancelled) setInfo(res.data.batch);
      } catch (err) {
        if (!cancelled) setError('Failed to load program. It may have been deleted or you may not have access.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rawParam, isObjectId, availablePrograms]);

  if (loading && !info) {
    return <div className="text-sm text-ink-soft py-12 text-center">Loading program…</div>;
  }
  if (error || !info) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <p className="font-medium mb-1">{error ?? 'Program not found.'}</p>
        <p className="text-xs text-rose-600 mb-2">
          Tried id lookup, slug lookup, and the in-memory program list — none matched.
        </p>
        <Link to="/admin/programs" className="underline">Back to Programs Hub</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <Link
              to="/admin/programs"
              className="text-[11px] text-ink-faint hover:text-ink"
            >
              ← All programs
            </Link>
            <h1 className="text-xl font-semibold text-ink mt-1">{info.name}</h1>
            {info.description && (
              <p className="text-sm text-ink-soft mt-1 max-w-3xl">{info.description}</p>
            )}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {info.isDefault && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  ★ Default program
                </span>
              )}
              <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${
                info.status === 'active'    ? 'bg-emerald-100 text-emerald-700' :
                info.status === 'draft'     ? 'bg-mist text-ink-soft' :
                info.status === 'completed' ? 'bg-amber-100 text-amber-700' :
                                              'bg-rose-100 text-rose-700'
              }`}>
                {info.status}
              </span>
              <span className="text-[11px] text-ink-faint">
                {new Date(info.startDate).toLocaleDateString()} → {new Date(info.endDate).toLocaleDateString()}
              </span>
              <span className="text-[11px] text-ink-faint">
                Enrollment: <span className="font-medium text-ink">{info.enrollmentMode}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* v1.69 — multi-program provisioning: empty-state onboarding
          panel. Visible on freshly-created programs that haven't been
          populated yet. Gives the admin a single click-through for
          every populate action so they don't need to hunt through the
          tabs. */}
      <GettingStartedPanel programId={programId} />

      {/* Tab strip */}
      <div className="border-b border-border/60">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const isActive = tab === t.key;
            // The 'categories' tab navigates to a dedicated
            // route rather than rendering inline — the cluster
            // editor has its own load/save/refresh state.
            const onClick = t.key === 'categories'
              ? () => navigate(`/admin/programs/${programId}/categories`)
              : () => setTab(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={onClick}
                className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-transparent text-ink-soft hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        {tab === 'overview' && <OverviewTab programId={programId} />}
        {tab === 'settings' && (
          <SettingsTab programId={programId} />
        )}
        {tab === 'courses' && (
          <CoursesTab programId={programId} />
        )}
        {tab === 'members' && (
          <MembersTab programId={programId} />
        )}
        {tab === 'ai' && (
          <AiTab programId={programId} />
        )}
        {tab === 'zoom' && (
          <ZoomTab programId={programId} />
        )}
        {tab === 'discord' && (
          <DiscordTab programId={programId} />
        )}
        {tab === 'features' && (
          <FeaturesTab programId={programId} />
        )}
        {tab === 'support' && (
          <SupportTab programId={programId} />
        )}
        {tab === 'appSettings' && (
          <AppSettingsTab programId={programId} />
        )}
      </motion.div>
    </div>
  );
}

function OverviewTab({ programId }: { programId: string }) {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  // H29: the previous version shipped 8 literal "—" placeholders. Replace
  // with a real fetch from the existing /admin/batches/:id endpoint which
  // already returns faqCount. Other counts (members, courses, support,
  // community, zoom, KB, badges) require backend stats aggregation that
  // isn't built yet — show "—" for those with a "pending" hint.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi
      .get<{ batch?: { faqCount?: number; memberCount?: number } }>(`/admin/batches/${programId}`)
      .then((res) => {
        if (cancelled) return;
        const b = res.data.batch ?? {};
        setStats({
          members: b.memberCount ?? 0,
          faqs: b.faqCount ?? 0,
        });
      })
      .catch(() => {
        if (!cancelled) setStats({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  const render = (key: string, label: string) => (
    <StatBox label={label} value={loading && !stats?.[key] ? '…' : (stats?.[key] ?? '—')} />
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        At-a-glance counts for this program. Detailed per-tab views are in the tabs above.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {render('members', 'Members')}
        <StatBox label="FAQs" value={loading && !stats?.faqs ? '…' : (stats?.faqs ?? '—')} />
        <StatBox label="Courses" value="—" />
        <StatBox label="Open support" value="—" />
        <StatBox label="Open community" value="—" />
        <StatBox label="Zoom meetings" value="—" />
        <StatBox label="Knowledge base" value="—" />
        <StatBox label="Badges awarded" value="—" />
      </div>
      <p className="text-[11px] text-ink-faint">
        Program id: <code className="px-1 py-0.5 rounded bg-mist">{programId}</code>
        <span className="ml-2">· counts marked — are pending the per-program stats endpoint.</span>
      </p>
    </div>
  );
}

function SettingsTab({ programId }: { programId: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
      <p className="text-sm text-ink-soft mb-3">
        Per-program theme, hero copy, sections, and branding.
      </p>
      <Link
        to={`/admin/programs/${programId}/settings`}
        className="admin-btn-primary text-sm"
      >
        Open settings editor →
      </Link>
    </div>
  );
}

function CoursesTab({ programId: _programId }: { programId: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
      <p className="text-sm text-ink-soft mb-3">
        Per-program courses. Manage them on the courses page — the program filter pills
        narrow the view to this program's courses.
      </p>
      <Link
        to="/admin/courses"
        className="admin-btn-primary text-sm"
      >
        Open courses →
      </Link>
    </div>
  );
}

function MembersTab({ programId: _programId }: { programId: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
      <p className="text-sm text-ink-soft mb-3">
        Enrollment roster for this program. Admins can invite / remove / change role
        for each member. The migration auto-enrolls every existing user in the
        default program; new users join via self-enroll (or invite link for
        invite-only programs).
      </p>
      <Link
        to="/admin/programs"
        className="admin-btn-ghost text-sm"
      >
        View full roster
      </Link>
    </div>
  );
}

function AiTab({ programId: _programId }: { programId: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-3">
      <p className="text-sm text-ink-soft">
        Per-program AI config — provider / API key / model / per-feature
        temperature. Resolves to the global default when no per-program override
        is set.
      </p>
      <p className="text-[11px] text-ink-faint">
        The admin AI Settings page accepts ?batchId=... — open it with this
        program preselected to edit the override.
      </p>
      <a
        href={`/admin/ai-config?batchId=${_programId}`}
        className="admin-btn-primary text-sm"
      >
        Open AI config →
      </a>
    </div>
  );
}

function ZoomTab({ programId: _programId }: { programId: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-3">
      <p className="text-sm text-ink-soft">
        Per-program Zoom OAuth credentials (client ID / secret / webhook secret /
        access / refresh tokens, encrypted at rest). Each program registers its
        own Zoom Marketplace app; the runtime resolver picks the per-program
        credentials for meetings in this program.
      </p>
      <code className="block text-[11px] bg-mist rounded-md p-2 text-ink-soft break-all">
        GET /api/admin/programs/{_programId}/zoom
      </code>
      <code className="block text-[11px] bg-mist rounded-md p-2 text-ink-soft break-all">
        PUT /api/admin/programs/{_programId}/zoom  body: {'{ clientId, clientSecret, webhookSecretToken?, authCode? }'}
      </code>
    </div>
  );
}

function SupportTab({ programId }: { programId: string }) {
  // v1.69 — Phase 9 admin UI: real interactive widget for
  // the per-program support category CRUD. Replaces the
  // previous placeholder curl snippet. Calls
  // GET/POST/PATCH/DELETE /api/support/categories with the
  // program's batchId in the params (read) or body (write).
  return <ProgramSupportCategoriesTab programId={programId} />;
}

function FeaturesTab({ programId }: { programId: string }) {
  // v1.69 — Phase 8 admin UI: the placeholder curl snippet has
  // been replaced with a real interactive widget. The
  // per-program feature flag toggle lives in
  // ProgramFeatureFlagsTab; it calls the GET / PUT / DELETE
  // endpoints that were added when the resolver chain was
  // shipped in Phase 8.
  return <ProgramFeatureFlagsTab programId={programId} />;
}

function DiscordTab({ programId: _programId }: { programId: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6 space-y-3">
      <p className="text-sm text-ink-soft">
        Per-program Discord bot — application ID / guild ID / bot token
        (encrypted) / webhook URL / notification channel. The
        runtime BotManager spawns one bot per program on
        server boot.
      </p>
      <code className="block text-[11px] bg-mist rounded-md p-2 text-ink-soft break-all">
        GET    /api/admin/programs/{_programId}/discord
      </code>
      <code className="block text-[11px] bg-mist rounded-md p-2 text-ink-soft break-all">
        PUT    /api/admin/programs/{_programId}/discord
      </code>
      <code className="block text-[11px] bg-mist rounded-md p-2 text-ink-soft break-all">
        POST   /api/admin/programs/{_programId}/discord/enable
      </code>
      <code className="block text-[11px] bg-mist rounded-md p-2 text-ink-soft break-all">
        POST   /api/admin/programs/{_programId}/discord/disable
      </code>
    </div>
  );
}

function AppSettingsTab({ programId }: { programId: string }) {
  // v1.69 — Phase 9 admin UI: real interactive widget for
  // the per-program app settings (Golden Ticket cooldown /
  // SP cost / penalty multiplier). Calls the existing
  // /api/admin/programs/:id/settings endpoints that were
  // added in Phase 9+.
  return <ProgramAppSettingsTab programId={programId} />;
}

/**
 * GettingStartedPanel — onboarding card for newly-provisioned programs.
 *
 * Polls a handful of read-only count endpoints in parallel. If every
 * count is 0, the panel renders with one-click links into each
 * populate action (categories, FAQs, welcome kit, Zoom, AI, Discord).
 * The moment any of those counts go above zero, the panel hides
 * itself so it doesn't become clutter for established programs.
 */
function GettingStartedPanel({ programId }: { programId: string }): React.ReactElement | null {
  const [counts, setCounts] = useState<{
    faqs: number;
    courses: number;
    members: number;
    zoomMeetings: number;
    communityPosts: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Per-endpoint typed shapes so the catch fallback doesn't widen to {}.
    type BatchRes = { batch?: { faqCount?: number; memberCount?: number } };
    type ListRes<T> = { [k: string]: T[] | undefined };
    const empty = <T,>(data: T = {} as T) => ({ data });

    Promise.all([
      adminApi.get<BatchRes>(`/admin/batches/${programId}`).catch(() => empty<BatchRes>()),
      adminApi.get<ListRes<unknown>>(`/faq?batchId=${programId}`).catch(() => empty<ListRes<unknown>>()),
      adminApi.get<ListRes<unknown>>(`/admin/programs/${programId}/courses`).catch(() => empty<ListRes<unknown>>()),
      adminApi.get<ListRes<unknown>>(`/zoom/meetings`).catch(() => empty<ListRes<unknown>>()),
      adminApi.get<ListRes<unknown>>(`/community/posts?batchId=${programId}&limit=1`).catch(() => empty<ListRes<unknown>>()),
    ]).then(([batch, faqs, courses, zoom, community]) => {
      if (cancelled) return;
      const arrLen = (v: unknown): number => Array.isArray(v) ? v.length : 0;
      setCounts({
        faqs: batch.data.batch?.faqCount ?? arrLen(faqs.data.faqs),
        courses: arrLen(courses.data.courses),
        members: batch.data.batch?.memberCount ?? 0,
        zoomMeetings: arrLen(zoom.data.meetings),
        communityPosts: arrLen(community.data.posts),
      });
    });
    return () => { cancelled = true; };
  }, [programId]);

  // Show only when the program is essentially empty.
  const isEmpty = counts !== null
    && counts.faqs === 0
    && counts.courses === 0
    && counts.members === 0
    && counts.communityPosts === 0;
  if (!isEmpty) return null;

  const actions: Array<{ label: string; sub: string; to: string }> = [
    { label: 'Add a category',          sub: 'Group FAQs by topic',                          to: `/admin/programs/${programId}/categories` },
    { label: 'Create your first FAQ',    sub: 'Knowledge starts with one answer',             to: `/admin/faqs?programId=${programId}` },
    { label: 'Build the welcome kit',    sub: 'Orientation, projects, mentors, timeline',     to: `/admin/programs/${programId}/welcome` },
    { label: 'Connect Zoom',             sub: 'OAuth credentials + meetings',                 to: `/admin/programs/${programId}/zoom` },
    { label: 'Configure AI',             sub: 'Providers, pipelines, thresholds',             to: `/admin/programs/${programId}/ai` },
    { label: 'Enable Discord',           sub: 'Bot token + guild + notifications',           to: `/admin/programs/${programId}/discord` },
  ];

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-accent/15 text-accent shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">Get started</h2>
          <p className="text-xs text-ink-soft mt-0.5">
            This program was just provisioned and is empty. Pick the first thing to populate:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
            {actions.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="block rounded-xl border border-border/60 bg-card p-3 hover:border-accent/40 hover:bg-accent/5 transition-colors"
              >
                <p className="text-xs font-medium text-ink">{a.label}</p>
                <p className="text-[10px] text-ink-soft mt-0.5">{a.sub}</p>
              </Link>
            ))}
          </div>
          <p className="text-[10px] text-ink-faint mt-3">
            This card hides itself the moment the program has any content. You can always come back via the tabs above.
          </p>
        </div>
      </div>
    </div>
  );
}
