/**
 * webFetcher — Phase 5.
 *
 * Minimal HTML → main-text extractor for admin-pasted URLs.
 *
 * Why no cheerio / readability?
 *  - Phase 5 scope is "admins paste a URL, we index it". A full
 *    readbility.js pipeline would 5x our extraction cost and pull in
 *    a third-party HTML parser. For the current shape of data (curated
 *    landing pages, blog posts, docs) a regex strip + entity decode is
 *    good enough — the text index tolerates noise well, and admin
 *    review catches junk pages.
 *
 * Constraints (Phase 5):
 *  - 2 MB body cap (avoid loading huge pages).
 *  - 10 s timeout on both headers and body.
 *  - 3 redirects max.
 *  - HTML/XHTML only — we won't try to extract text from PDFs / JSON.
 *  - Title extracted from <title> tag, stripped of inner tags,
 *    collapsed whitespace, capped at 500 chars.
 *  - Main text: strip <script>/<style>/<noscript>/<svg>, then strip
 *    all tags, decode common HTML entities, collapse whitespace, cap
 *    at 200_000 chars (~50k tokens worst case).
 */

import { request } from 'undici';

const MAX_BYTES = 2_000_000; // 2MB
const TIMEOUT_MS = 10_000;
const USER_AGENT = 'shamagama-bot/1.0 (+web-pages)';

export interface FetchedPage {
  title: string;
  text: string;
  statusCode: number;
}

export async function fetchAndExtract(url: string): Promise<FetchedPage> {
  const res = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
    },
    bodyTimeout: TIMEOUT_MS,
    headersTimeout: TIMEOUT_MS,
    maxRedirections: 3,
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
  return { title, text, statusCode: res.statusCode };
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
