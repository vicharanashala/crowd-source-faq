/**
 * webFetcher — Phase 5, extended in Phase 8.
 *
 * Two flavours of fetch + extract:
 *
 *  1. `fetchAndExtract(url)` — Phase 5 path for admin uploads where
 *     the page content has just been fetched by the caller. Returns
 *     `{ title, text, statusCode }`. No link extraction.
 *
 *  2. `fetchAndExtractPage(url)` — Phase 8 helper for the auto-discover
 *     webCrawler. Goes out, hits the URL, extracts text AND same-domain
 *     links (depth 1) so the crawler can decide what else to fetch.
 *     Returns `{ title, text, statusCode, finalUrl, links }`. The
 *     caller (webCrawler) is responsible for recursing into `links`
 *     up to its own per-seed cap.
 *
 * Why no cheerio / readability?
 *  - Phase 5 scope is "admins paste a URL, we index it". A full
 *    readability.js pipeline would 5x our extraction cost and pull
 *    in a third-party HTML parser. For the current shape of data (curated
 *    landing pages, blog posts, docs) a regex strip + entity decode is
 *    good enough — the text index tolerates noise well, and admin
 *    review catches junk pages.
 *
 * Constraints (Phase 5 → 8):
 *  - 2 MB body cap (avoid loading huge pages).
 *  - 10 s timeout on both headers and body.
 *  - 3 redirects max.
 *  - HTML/XHTML only — we won't try to extract text from PDFs / JSON.
 *  - Title extracted from <title> tag, stripped of inner tags,
 *    collapsed whitespace, capped at 500 chars.
 *  - Main text: strip <script>/<style>/<noscript>/<svg>, then strip
 *    all tags, decode common HTML entities, collapse whitespace, cap
 *    at 200_000 chars (~50k tokens worst case).
 *  - Phase 8: same-domain links are collected from <a href="..."> via
 *    a regex (not a full parser) — sufficient for the "depth-1 follow"
 *    shape the crawler needs.
 */

import { Agent, request, interceptors } from 'undici';

const MAX_BYTES = 2_000_000; // 2MB
const TIMEOUT_MS = 10_000;
const USER_AGENT = 'shamagama-bot/1.0 (+web-pages)';

// Phase 5 constraint: 3 redirects max. undici v6 doesn't accept
// `maxRedirections` as a top-level request option — redirects are
// opt-in via an interceptor on the dispatcher. A shared Agent is
// cheaper than a one-off Client per fetch (connection pooling) and
// keeps the redirect policy in one place.
//
// The `interceptors` shape `{ Agent: [...] }` is correct at runtime
// (verified against undici 6.24.1 lib/dispatcher/agent.js:42), but
// the Agent.Options type extends Pool.Options['interceptors'] which
// requires a `Client` key. Cast through the constructor options to
// satisfy the type checker without weakening the runtime contract.
const fetchAgent = new Agent({
  interceptors: {
    Agent: [interceptors.redirect({ maxRedirections: 3 })],
  },
} as unknown as ConstructorParameters<typeof Agent>[0]);

export interface FetchedPage {
  title: string;
  text: string;
  statusCode: number;
}

export interface FetchedAndLinked extends FetchedPage {
  /** Where we ended up after redirects. */
  finalUrl: string;
  /** Same-domain <a href> targets. Capped at ~200 entries. */
  links: string[];
}

export async function fetchAndExtract(url: string): Promise<FetchedPage> {
  const { title, text, statusCode } = await fetchAndExtractPage(url);
  return { title, text, statusCode };
}

/**
 * Fetch + extract a single page AND its same-domain links (depth 1).
 *
 * Internal shape used by both:
 *  - adminWebPages.controller addWebPage (which only reads title/text/statusCode)
 *  - webCrawler runAutoDiscover (which iterates over `links` next)
 *
 * The two callers see different shape contracts via the wrappers
 * above / `runAutoDiscover`. This function intentionally does no
 * cap math on links — it's the caller's job to bound recursion.
 */
export async function fetchAndExtractPage(url: string): Promise<FetchedAndLinked> {
  const res = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
    },
    bodyTimeout: TIMEOUT_MS,
    headersTimeout: TIMEOUT_MS,
    dispatcher: fetchAgent,
  });
  if (res.statusCode >= 400) {
    throw new Error(`HTTP ${res.statusCode}`);
  }
  const ct = String(res.headers['content-type'] ?? '');
  if (!/text\/html|application\/xhtml/.test(ct)) {
    throw new Error(`unsupported content-type: ${ct}`);
  }
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of res.body) {
    bytes += (chunk as Buffer).length;
    if (bytes > MAX_BYTES) {
      res.body.destroy();
      throw new Error(`page exceeds ${MAX_BYTES} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  const html = Buffer.concat(chunks).toString('utf8');
  const title = extractTitle(html);
  const text = extractMainText(html);
  const finalUrl = url; // undici's request doesn't expose final URL on this version; we don't track redirects here
  const links = extractSameDomainLinks(html, finalUrl);
  return { title, text, statusCode: res.statusCode, finalUrl, links };
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1]
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function extractMainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 200_000);
}

/**
 * Pull same-domain <a href> targets out of an HTML blob. Approximate
 * regex — anchors with relative paths get absolutised against `baseUrl`,
 * anchors on other origins are dropped. Intentionally capped at 200
 * entries so a single page can't blow up the BFS queue.
 */
function extractSameDomainLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const hrefs = new Set<string>();
  const re = /<a\s+[^>]*href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('javascript:')) continue;
    let abs: URL;
    try { abs = new URL(raw, base); } catch { continue; }
    if (abs.hostname !== base.hostname) continue;
    if (!/^https?:$/.test(abs.protocol)) continue;
    // Strip the fragment — same-page anchors don't make sense as fetch targets.
    abs.hash = '';
    hrefs.add(abs.toString());
    if (hrefs.size >= 200) break;
  }
  return Array.from(hrefs);
}
