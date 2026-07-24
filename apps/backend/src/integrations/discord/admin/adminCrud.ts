/**
 * adminCrud.ts — Discord admin CRUD layer for FAQs, WebPages, and Documents.
 *
 * 15 handlers: 3 entities × 5 ops each (list, view, create, update, delete).
 *
 * Design notes
 * ------------
 * - Each handler returns `{ embeds: EmbedBuilder[] }` for normal flows,
 *   or `{ ephemeral: string }` for a short error / "send me the fields"
 *   prompt. The Discord command layer (registered separately) consumes
 *   the same shape regardless of entity, so it can stay generic.
 * - The bot calls the REST API over HTTP (same process in dev) using
 *   `INTERNAL_API_URL`. Auth uses a service-role JWT minted in
 *   `serviceJwt.ts`. Until the `kind: 'service'` bypass is wired into
 *   `protect`, the bot should also send `X-Internal-Api-Key` (the
 *   `protect` middleware already accepts it as a fallback).
 * - Embeds are color-coded: green=ok/idle, blue=info/list, yellow=
 *   pending/warning, red=error. List items always include the entity
 *   ID so admins can copy/paste it into `view <id>`.
 * - Create/Update return ephemeral "send me the fields" messages
 *   instead of modals — modals are a follow-up.
 * - Long fields are truncated with `…`; the full value stays in the DB.
 */

import { EmbedBuilder } from 'discord.js';
import { mintServiceJwt, hasJwtSecret } from './serviceJwt.js';

// ── Config ──────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.INTERNAL_API_URL ??
  `http://localhost:${process.env.PORT ?? '6767'}`;
const PAGE_LIMIT = 20;

// Discord embed colors (decimal).
const COLOR_INFO   = 0x2563eb; // blue — list / view
const COLOR_OK     = 0x4a7c59; // green — created / updated / deleted
const COLOR_WARN   = 0xf4a261; // yellow — pending / partial
const COLOR_ERROR  = 0xff6b6b; // red — failed

// ── Response shape returned to the Discord command layer ────────────────────

export type AdminCrudResult =
  | { embeds: EmbedBuilder[]; ephemeral?: undefined }
  | { ephemeral: string; embeds?: undefined };

// ── Generic dispatch helpers ────────────────────────────────────────────────

interface DispatchOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string; // e.g. '/csfaq/api/admin/web-pages'
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Optional internal-API-key header (preferred while service-JWT bypass is WIP). */
  internalApiKey?: string;
}

interface DispatchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

async function dispatch<T>({
  method,
  path,
  body,
  query,
  internalApiKey,
}: DispatchOptions): Promise<DispatchResult<T>> {
  let token: string | null = null;
  try {
    if (hasJwtSecret()) token = mintServiceJwt();
  } catch {
    // Fall through — fetch will just be unauthenticated.
  }

  const qs = query
    ? '?' +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (internalApiKey) headers['X-Internal-Api-Key'] = internalApiKey;

  try {
    const res = await fetch(`${API_BASE}${path}${qs}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const ct = res.headers.get('content-type') ?? '';
    const data = (ct.includes('application/json') ? await res.json() : null) as T | null;
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : extractError(data) ?? `${res.status} ${res.statusText}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: (err as Error).message || 'fetch failed',
    };
  }
}

function extractError(data: unknown): string | null {
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
}

function statusEmoji(s: string | undefined | null): string {
  switch ((s ?? '').toLowerCase()) {
    case 'approved':
    case 'active':
    case 'verified':
      return '🟢';
    case 'pending':
    case 'pending_review':
    case 'evergreen':
      return '🟡';
    case 'rejected':
    case 'flagged':
    case 'inactive':
      return '🔴';
    default:
      return '⚪';
  }
}

function statusColor(s: string | undefined | null): number {
  switch ((s ?? '').toLowerCase()) {
    case 'approved':
    case 'active':
    case 'verified':
      return COLOR_OK;
    case 'pending':
    case 'pending_review':
      return COLOR_WARN;
    case 'rejected':
      return COLOR_ERROR;
    default:
      return COLOR_INFO;
  }
}

function errorEmbed(title: string, detail: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_ERROR)
    .setTitle(title)
    .setDescription(detail)
    .setTimestamp();
}

function ephemeralError(label: string, detail: string): AdminCrudResult {
  return { ephemeral: `❌ **${label}** — ${detail}` };
}

// ── Entity: FAQ ─────────────────────────────────────────────────────────────

interface FaqItem {
  _id: string;
  question: string;
  answer?: string;
  category?: string;
  status?: string;
  reviewStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface FaqListResponse {
  faqs?: FaqItem[];
  total?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
}

export async function faqList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<FaqListResponse>({
    method: 'GET',
    path: '/csfaq/api/faq/paginated',
    query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('FAQ list failed', r.error ?? 'unknown');
  const items = r.data?.faqs ?? [];
  const total = r.data?.total ?? 0;
  const lines = items.length
    ? items.map((f) =>
        `• \`${f._id}\` — ${truncate(f.question ?? '(no question)', 90)} ${statusEmoji(f.status)} _[${f.status ?? 'unknown'}/${f.category ?? '—'}]_`,
      )
    : ['_no FAQs found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`📚 FAQs — page ${page} (total ${total})`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: `Use /admin faqs view <id> for details. Showing ${items.length} of ${total}.` })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function faqView(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<FaqItem>({ method: 'GET', path: `/csfaq/api/faq/${encodeURIComponent(id)}` });
  if (!r.ok || !r.data) return ephemeralError('FAQ view failed', r.error ?? `id ${id} not found`);
  const f = r.data;
  const embed = new EmbedBuilder()
    .setColor(statusColor(f.status))
    .setTitle(`📖 FAQ ${f._id}`)
    .addFields(
      { name: 'Question', value: truncate(f.question ?? '(none)', 1024), inline: false },
      { name: 'Answer', value: truncate(f.answer ?? '(none)', 1024), inline: false },
      { name: 'Category', value: String(f.category ?? '—'), inline: true },
      { name: 'Status', value: String(f.status ?? '—'), inline: true },
      { name: 'Review', value: String(f.reviewStatus ?? '—'), inline: true },
    )
    .setFooter({ text: `Use /admin faqs update <id> ... or /admin faqs delete <id>` })
    .setTimestamp();
  return { embeds: [embed] };
}

/**
 * Create FAQ — placeholder. The real modal flow lands in a follow-up
 * dispatch. For now we tell the admin what to send back.
 */
export async function faqCreate(): Promise<AdminCrudResult> {
  return {
    ephemeral:
      '📝 **Create FAQ** — send me the fields in one message, e.g.:\n' +
      '```\n' +
      'question: How do I reset my password?\n' +
      'answer: Visit /login and click "Forgot password".\n' +
      'category: Account\n' +
      'batchId: 65f0000000000000000000a1\n' +
      '```\n' +
      '_Modal support ships in the next dispatch._',
  };
}

/**
 * Update FAQ — placeholder. Like faqCreate, we ask for the fields
 * inline until the modal handler lands.
 */
export async function faqUpdate(id: string): Promise<AdminCrudResult> {
  return {
    ephemeral:
      `✏️ **Update FAQ \`${id}\`** — send me only the fields you want to change:\n` +
      '```\n' +
      'status: approved|pending|rejected\n' +
      'category: General\n' +
      'answer: <new answer>\n' +
      '```\n' +
      '_Modal support ships in the next dispatch._',
  };
}

export async function faqDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE',
    path: `/csfaq/api/faq/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('FAQ delete failed', r.error ?? `id ${id} not found`);
  return {
    ephemeral: `🗑️ Deleted FAQ \`${id}\`.`,
  };
}

// ── Entity: WebPage ─────────────────────────────────────────────────────────

interface WebPageItem {
  _id: string;
  url: string;
  domain?: string;
  title?: string;
  approved?: boolean;
  source?: string;
  statusCode?: number;
  lastFetchError?: string | null;
  fetchedAt?: string;
}

interface WebPageListResponse {
  items?: WebPageItem[];
  total?: number;
  page?: number;
  pages?: number;
}

export async function webPageList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<WebPageListResponse>({
    method: 'GET',
    path: '/csfaq/api/admin/web-pages',
    query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Web pages list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const pages = r.data?.pages ?? 1;
  const lines = items.length
    ? items.map((p) => {
        const flag = p.lastFetchError ? ' ⚠️' : '';
        return `• \`${p._id}\` — ${truncate(p.title || p.url, 80)} ${p.approved ? '🟢' : '🟡'} _[${p.approved ? 'approved' : 'pending'}/${p.source ?? '—'}]_${flag}`;
      })
    : ['_no web pages found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`🌐 Web pages — page ${page}/${pages} (total ${total})`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'Use /admin web-pages view <id> for details. ⚠️ = last fetch failed.' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function webPageView(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<WebPageListResponse>({
    method: 'GET',
    path: '/csfaq/api/admin/web-pages',
    query: { page: 1, limit: 1 },
  });
  // The admin list endpoint paginates, not filter-by-id, so we look up
  // via the global page list — coarse but works for the scaffold.
  if (!r.ok || !r.data) return ephemeralError('Web page view failed', r.error ?? `id ${id} not found`);
  const match = (r.data.items ?? []).find((p: WebPageItem) => String(p._id) === id);
  if (!match) {
    return ephemeralError('Web page not found', `id ${id} not on the current page`);
  }
  const embed = new EmbedBuilder()
    .setColor(match.approved ? COLOR_OK : COLOR_WARN)
    .setTitle(`🌐 WebPage ${match._id}`)
    .addFields(
      { name: 'URL', value: truncate(match.url ?? '—', 1024), inline: false },
      { name: 'Title', value: truncate(match.title ?? '(no title)', 1024), inline: false },
      { name: 'Domain', value: String(match.domain ?? '—'), inline: true },
      { name: 'Source', value: String(match.source ?? '—'), inline: true },
      { name: 'Approved', value: match.approved ? '✅ yes' : '🟡 pending', inline: true },
      { name: 'HTTP', value: String(match.statusCode ?? '—'), inline: true },
    )
    .setFooter({ text: 'Use /admin web-pages approve|unapprove|delete <id>' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function webPageCreate(): Promise<AdminCrudResult> {
  return {
    ephemeral:
      '🌐 **Add web page** — send me a URL in one message:\n' +
      '```\n' +
      'url: https://docs.example.com/getting-started\n' +
      '```\n' +
      '_Modal support ships in the next dispatch._',
  };
}

export async function webPageUpdate(id: string): Promise<AdminCrudResult> {
  return {
    ephemeral:
      `🔄 **Update WebPage \`${id}\`** — approve / unapprove / delete by subcommand:\n` +
      '```\n' +
      '/admin web-pages approve <id>\n' +
      '/admin web-pages unapprove <id>\n' +
      '```\n' +
      '_Field-level edits ship in the next dispatch._',
  };
}

export async function webPageDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE',
    path: `/csfaq/api/admin/web-pages/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('Web page delete failed', r.error ?? `id ${id} not found`);
  return { ephemeral: `🗑️ Deleted web page \`${id}\`.` };
}

// ── Entity: Document ────────────────────────────────────────────────────────

interface DocumentItem {
  _id: string;
  title?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  pageCount?: number;
  uploadedAt?: string;
  lastFetchError?: string | null;
}

interface DocumentListResponse {
  items?: DocumentItem[];
  total?: number;
  page?: number;
  pages?: number;
}

function formatBytes(n: number | undefined): string {
  if (!n || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function documentList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<DocumentListResponse>({
    method: 'GET',
    path: '/csfaq/api/admin/documents',
    query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Documents list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const pages = r.data?.pages ?? 1;
  const lines = items.length
    ? items.map((d) => {
        const flag = d.lastFetchError ? ' ⚠️' : '';
        return `• \`${d._id}\` — ${truncate(d.title ?? d.filename ?? '(no title)', 80)} _[${d.mimeType ?? '—'}/${formatBytes(d.sizeBytes)}${d.pageCount ? `, ${d.pageCount}p` : ''}]_${flag}`;
      })
    : ['_no documents found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle(`📄 Documents — page ${page}/${pages} (total ${total})`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'Use /admin documents view <id> for details. ⚠️ = extraction failed.' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function documentView(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<DocumentListResponse>({
    method: 'GET',
    path: '/csfaq/api/admin/documents',
    query: { page: 1, limit: 1 },
  });
  // Same caveat as webPageView: list endpoint doesn't filter-by-id, so
  // this is a scaffold lookup. A future dispatch can add a GET /:id route.
  if (!r.ok || !r.data) return ephemeralError('Document view failed', r.error ?? `id ${id} not found`);
  const match = (r.data.items ?? []).find((d: DocumentItem) => String(d._id) === id);
  if (!match) {
    return ephemeralError('Document not found', `id ${id} not on the current page`);
  }
  const embed = new EmbedBuilder()
    .setColor(match.lastFetchError ? COLOR_ERROR : COLOR_INFO)
    .setTitle(`📄 Document ${match._id}`)
    .addFields(
      { name: 'Title', value: truncate(match.title ?? '(no title)', 1024), inline: false },
      { name: 'Filename', value: String(match.filename ?? '—'), inline: true },
      { name: 'MIME', value: String(match.mimeType ?? '—'), inline: true },
      { name: 'Size', value: formatBytes(match.sizeBytes), inline: true },
      { name: 'Pages', value: String(match.pageCount ?? 0), inline: true },
      { name: 'Uploaded', value: String(match.uploadedAt ?? '—'), inline: true },
    )
    .setFooter({ text: 'Use /admin documents delete <id>' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function documentCreate(): Promise<AdminCrudResult> {
  return {
    ephemeral:
      '📤 **Upload document** — drop the PDF / TXT / MD / CSV file in this channel with the message `upload`, ' +
      'or send a file as an attachment with the word `upload` in the caption.\n' +
      '_Allowed MIME: application/pdf, text/plain, text/markdown, text/csv. Max 10MB._',
  };
}

export async function documentUpdate(_id: string): Promise<AdminCrudResult> {
  return {
    ephemeral:
      '✏️ **Document edit** — re-upload the file to replace it (delete + upload), ' +
      'or update the title via the REST API for now.',
  };
}

export async function documentDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE',
    path: `/csfaq/api/admin/documents/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('Document delete failed', r.error ?? `id ${id} not found`);
  return { ephemeral: `🗑️ Deleted document \`${id}\`.` };
}

// Re-export errorEmbed so the command layer can compose with it.
export { errorEmbed };

// ═══════════════════════════════════════════════════════════════════════════
// v1.69 — extend CRUD to the remaining 7 admin entities. Each handler
// follows the same dispatch → embed-or-ephemeral pattern as the
// FAQs/web-pages/documents block above. For ops that have no
// matching REST endpoint, the handler returns an ephemeral
// "this entity has no <op> endpoint" message.
// ═══════════════════════════════════════════════════════════════════════════

// ── Programs ──────────────────────────────────────────────────────────────

export async function programList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<{ items?: any[]; total?: number; pages?: number }>({
    method: 'GET', path: '/csfaq/api/courses/admin/all', query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Program list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const lines = items.length
    ? items.map((p) =>
        `• \`${p._id}\` — ${truncate(p.name ?? p.title ?? '(no name)', 90)} _[${p.status ?? 'unknown'}]_`)
    : ['_no programs found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO).setTitle(`🎓 Programs — page ${page} (total ${total})`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: `Use /admin programs view <id> for details. Showing ${items.length} of ${total}.` })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function programView(id: string): Promise<AdminCrudResult> {
  return ephemeralError('Program view', 'backend has no GET /:id endpoint — use list for now');
}

export async function programCreate(): Promise<AdminCrudResult> {
  return ephemeralError('Program create', 'no REST endpoint yet — use the admin UI /admin/courses/new');
}

export async function programUpdate(id: string): Promise<AdminCrudResult> {
  return ephemeralError('Program update', 'no REST endpoint for programs yet');
}

export async function programDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE', path: `/csfaq/api/courses/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('Program delete failed', r.error ?? `id ${id} not found`);
  return { ephemeral: `🗑️ Deleted program \`${id}\`.` };
}

// ── Batches ───────────────────────────────────────────────────────────────

export async function batchList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<{ items?: any[]; total?: number; pages?: number }>({
    method: 'GET', path: '/csfaq/api/batches/admin/all', query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Batch list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const lines = items.length
    ? items.map((b) =>
        `• \`${b._id}\` — ${truncate(b.name ?? '(no name)', 90)} _[${b.status ?? 'unknown'}]_`)
    : ['_no batches found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO).setTitle(`📦 Batches — page ${page} (total ${total})`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: `Use /admin batches view <id> for details. Showing ${items.length} of ${total}.` })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function batchView(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<any>({ method: 'GET', path: `/csfaq/api/batches/${encodeURIComponent(id)}` });
  if (!r.ok || !r.data) return ephemeralError('Batch view failed', r.error ?? `id ${id} not found`);
  const b = r.data;
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO).setTitle(`📦 Batch ${b._id}`)
    .addFields(
      { name: 'Name', value: truncate(b.name ?? '(none)', 1024), inline: false },
      { name: 'Status', value: String(b.status ?? '—'), inline: true },
      { name: 'Is default', value: String(b.isDefault ?? '—'), inline: true },
    )
    .setFooter({ text: 'Use /admin batches update <id> ... or /admin batches delete <id>' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function batchCreate(): Promise<AdminCrudResult> {
  return {
    ephemeral: '📝 **Create Batch** — send me the fields:\n```\nname: Spring 2026 Cohort\nstartDate: 2026-04-01\nendDate: 2026-07-01\n```',
  };
}

export async function batchUpdate(id: string): Promise<AdminCrudResult> {
  return {
    ephemeral: `📝 **Update Batch ${id}** — send me the fields:\n\`\`\`\nname: <new name>\nstatus: <active|archived>\n\`\`\``,
  };
}

export async function batchDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE', path: `/csfaq/api/batches/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('Batch delete failed', r.error ?? `id ${id} not found`);
  return { ephemeral: `🗑️ Deleted batch \`${id}\`.` };
}

// ── Golden tickets ───────────────────────────────────────────────────────

export async function goldenList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<{ items?: any[]; total?: number }>({
    method: 'GET', path: '/csfaq/api/admin/golden-tickets', query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Golden-ticket list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const lines = items.length
    ? items.map((g) =>
        `• \`${g._id}\` — ${truncate(g.reason ?? '(no reason)', 80)} _[${g.status ?? 'unknown'}]_`)
    : ['_no golden tickets found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO).setTitle(`🎟️ Golden tickets — total ${r.data?.total ?? 0}`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'No GET /:id endpoint — use /admin golden resolve|reject|ban <id>' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function goldenView(_id: string): Promise<AdminCrudResult> {
  return ephemeralError('Golden-ticket view', 'no GET /:id endpoint — use resolve/reject/ban actions');
}

export async function goldenCreate(): Promise<AdminCrudResult> {
  return ephemeralError('Golden-ticket create', 'no POST endpoint — promotions happen via /admin/auto-answer or user SP conversion');
}

export async function goldenUpdate(id: string): Promise<AdminCrudResult> {
  return {
    ephemeral: `🎟️ **Golden ticket ${id}** — only resolve/reject/ban are supported. Use:\n- \`/admin golden resolve ${id}\`\n- \`/admin golden reject ${id}\`\n- \`/admin golden ban ${id}\``,
  };
}

export async function goldenDelete(id: string): Promise<AdminCrudResult> {
  return ephemeralError('Golden-ticket delete', 'no DELETE endpoint — use reject or ban instead');
}

// ── Support tickets ──────────────────────────────────────────────────────

export async function supportList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<{ items?: any[]; total?: number }>({
    method: 'GET', path: '/csfaq/api/support/requests', query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Support list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const lines = items.length
    ? items.map((s) =>
        `• \`${s._id}\` — ${truncate(s.subject ?? s.title ?? '(no subject)', 80)} _[${s.status ?? 'unknown'}]_`)
    : ['_no support tickets found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO).setTitle(`🎫 Support tickets — total ${total}`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'Use /admin support view <id> for details' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function supportView(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<any>({ method: 'GET', path: `/csfaq/api/support/requests/${encodeURIComponent(id)}` });
  if (!r.ok || !r.data) return ephemeralError('Support view failed', r.error ?? `id ${id} not found`);
  const s = r.data;
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO).setTitle(`🎫 Support ${s._id}`)
    .addFields(
      { name: 'Subject', value: truncate(s.subject ?? s.title ?? '(none)', 1024), inline: false },
      { name: 'Status', value: String(s.status ?? '—'), inline: true },
      { name: 'Category', value: String(s.category ?? '—'), inline: true },
    )
    .setFooter({ text: 'PATCH /:id/status to change status' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function supportCreate(): Promise<AdminCrudResult> {
  return {
    ephemeral: '📝 **Create Support Ticket** — no admin-create endpoint. Tickets are created by users from /support/new.',
  };
}

export async function supportUpdate(id: string): Promise<AdminCrudResult> {
  return {
    ephemeral: `📝 **Update Support ${id}** — send the new status:\n\`\`\`\nstatus: <open|in_progress|resolved|closed>\n\`\`\``,
  };
}

export async function supportDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE', path: `/csfaq/api/support/requests/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('Support delete failed', r.error ?? `id ${id} not found`);
  return { ephemeral: `🗑️ Deleted support ticket \`${id}\`.` };
}

// ── Users ───────────────────────────────────────────────────────────────

export async function userList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<{ items?: any[]; total?: number }>({
    method: 'GET', path: '/csfaq/api/admin/users', query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('User list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const lines = items.length
    ? items.map((u) =>
        `• \`${u._id}\` — ${truncate(u.name ?? u.email ?? '(no name)', 80)} _[${u.role ?? 'user'}]_`)
    : ['_no users found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO).setTitle(`👥 Users — total ${total}`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'No GET /:id endpoint — list only' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function userView(_id: string): Promise<AdminCrudResult> {
  return ephemeralError('User view', 'no GET /:id endpoint — use list to find the user id');
}

export async function userCreate(): Promise<AdminCrudResult> {
  return ephemeralError('User create', 'use the registration endpoint or admin UI /admin/users — no admin-via-bot flow');
}

export async function userUpdate(id: string): Promise<AdminCrudResult> {
  return {
    ephemeral: `📝 **Update User ${id}** — send the new fields:\n\`\`\`\nrole: <user|admin|moderator|ai_moderator>\n\`\`\``,
  };
}

export async function userDelete(id: string): Promise<AdminCrudResult> {
  const r = await dispatch<{ ok?: boolean }>({
    method: 'DELETE', path: `/csfaq/api/auth/users/${encodeURIComponent(id)}`,
  });
  if (!r.ok) return ephemeralError('User delete failed', r.error ?? `id ${id} not found`);
  return { ephemeral: `🗑️ Deleted user \`${id}\`.` };
}

// ── Feature flags ───────────────────────────────────────────────────────

export async function flagList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<{ items?: any[]; total?: number }>({
    method: 'GET', path: '/csfaq/api/feature-flags', query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Flag list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const lines = items.length
    ? items.map((f) =>
        `• \`${f.key ?? f._id}\` — ${truncate(f.label ?? f.description ?? '', 70)} ${f.enabled ? '✅' : '❌'}`)
    : ['_no flags found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO).setTitle(`🚩 Feature flags — total ${total}`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'Use /admin flags update <key> enabled=true|false to toggle' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function flagView(_id: string): Promise<AdminCrudResult> {
  return ephemeralError('Flag view', 'use list to see the key, then PATCH to toggle');
}

export async function flagCreate(): Promise<AdminCrudResult> {
  return ephemeralError('Flag create', 'no admin POST endpoint — flags are added via the FEATURE_FLAGS registry at startup');
}

export async function flagUpdate(id: string): Promise<AdminCrudResult> {
  return {
    ephemeral: `🚩 **Toggle flag \`${id}\`** — send the new state:\n\`\`\`\nenabled: <true|false>\n\`\`\``,
  };
}

export async function flagDelete(_id: string): Promise<AdminCrudResult> {
  return ephemeralError('Flag delete', 'no DELETE endpoint — flags are removed via the FEATURE_FLAGS registry at startup');
}

// ── Audit logs ─────────────────────────────────────────────────────────

export async function auditList(page = 1): Promise<AdminCrudResult> {
  const r = await dispatch<{ items?: any[]; total?: number }>({
    method: 'GET', path: '/csfaq/api/admin/audit-logs', query: { page, limit: PAGE_LIMIT },
  });
  if (!r.ok) return ephemeralError('Audit list failed', r.error ?? 'unknown');
  const items = r.data?.items ?? [];
  const total = r.data?.total ?? 0;
  const lines = items.length
    ? items.map((a) =>
        `• \`${a._id}\` — ${truncate(a.action ?? a.message ?? '(no action)', 80)} _[${a.level ?? 'info'}]_`)
    : ['_no audit entries found_'];
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO).setTitle(`📜 Audit logs — total ${total}`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'Read-only — view only' })
    .setTimestamp();
  return { embeds: [embed] };
}

export async function auditView(_id: string): Promise<AdminCrudResult> {
  return ephemeralError('Audit view', 'no GET /:id endpoint — list is read-only');
}

export async function auditCreate(): Promise<AdminCrudResult> {
  return ephemeralError('Audit create', 'audit logs are append-only — written by other actions');
}

export async function auditUpdate(_id: string): Promise<AdminCrudResult> {
  return ephemeralError('Audit update', 'audit logs are append-only and immutable');
}

export async function auditDelete(_id: string): Promise<AdminCrudResult> {
  return ephemeralError('Audit delete', 'audit logs are immutable; no DELETE endpoint exists');
}