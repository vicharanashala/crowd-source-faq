/**
 * webCrawler — Phase 8.
 *
 * Auto-discover mode for the WebPage collection. A small BFS crawler
 * that starts from a hardcoded list of "seed" URLs and follows same-
 * domain links to depth 1 (bounded by MAX_PER_SEED).
 *
 * Behaviour
 * ---------
 *  - Seed URLs are returned by `getCrawlSeeds()`. Phase 8 hardcodes
 *    them inside this file so the cron works out of the box; a
 *    future phase can replace this with admin-managed seeds.
 *  - For each seed we call `fetchAndExtractPage(url)` from webFetcher
 *    which returns `{ title, text, statusCode, finalUrl, links }`.
 *  - The seed page itself is upserted into WebPage as a row with:
 *      source         = 'auto_discovered'
 *      approved       = false           (gate: webTextSource filter)
 *      lastFetchError = <set on failure>
 *      text           = ''              (set on failure)
 *  - We then iterate the returned same-domain `links` (depth 1), each
 *    fetched + upserted the same way, capped by MAX_PER_SEED.
 *  - Re-crawling an existing row is a no-op — the model has a unique
 *    index on `url` so the upsert just touches `lastFetchError` /
 *    `fetchedAt` / `text` / `title` and doesn't disturb the admin's
 *    `approved` flag (that's only set/unset by the explicit
 *    /admin/web-pages/:id/(un)approve endpoints).
 *
 * Concurrency
 * -----------
 * The function is invoked from the `cronManager` (registered in
 * bootstrap/startup.ts, gated by the `webAutoDiscover` feature flag).
 * The cron itself provides the concurrency lock (Phase 3 R3), so two
 * ticks cannot overlap here.
 *
 * Test surface
 * ------------
 *   runAutoDiscover()       — production entry point (uses getCrawlSeeds)
 *   _runWithSeeds(seeds)    — test helper; skips hardcoded seeds so
 *                             unit tests don't hit the network.
 */

import { fetchAndExtractPage } from './webFetcher.js';
import WebPage from '../models/WebPage.js';
import { adminLog } from '../utils/http/logger.js';

const MAX_PER_SEED = 10;        // depth-1 cap per seed URL
const FOLLOW_LINKS = true;      // toggle for the "depth 1 follow" shape

export interface CrawlSeed {
  url: string;
  label?: string;
}

/**
 * Seed list. Phase 8 starts with an intentionally small, well-known
 * set of public pages that exemplify the shape we want indexed. The
 * team can swap this list for an admin-managed collection later
 * without touching the cron / cron / fetch logic.
 *
 * NOTE: each entry must be HTTPS, fetchable by a `shamagama-bot/1.0`
 * user agent, and serve HTML (not a JS SPA shell). The current list
 * uses example.com — a stable IANA-managed placeholder.
 */
export function getCrawlSeeds(): CrawlSeed[] {
  return [
    { url: 'https://example.com/', label: 'example.com root' },
    { url: 'https://www.iana.org/', label: 'IANA root' },
  ];
}

export interface CrawlStats {
  visited: number;
  inserted: number;
  failed: number;
}

/** Empty stats — used when no seeds are supplied. */
function emptyStats(): CrawlStats {
  return { visited: 0, inserted: 0, failed: 0 };
}

/**
 * Upsert a single WebPage row for an auto-discovered URL.
 *   - On success: text/title populated, lastFetchError=null, source=auto_discovered,
 *     approved=false. existingRows keep their `approved` flag untouched (no $set on it).
 *   - On fetch failure: row is upserted with empty text and a populated
 *     lastFetchError so the admin UI shows it as broken.
 *   - approved defaults to false on insert; existing rows may have been
 *     toggled to true by an admin (which we must NOT clobber here).
 */
async function upsertDiscovered(
  url: string,
  payload: { title?: string; text?: string; statusCode?: number; error?: string },
): Promise<void> {
  let domain: string;
  try { domain = new URL(url).hostname; } catch { return; }

  const set: Record<string, unknown> = {
    url,
    domain,
    title: payload.title ?? '',
    text: payload.text ?? '',
    statusCode: payload.statusCode ?? 0,
    lastFetchError: payload.error ?? null,
    fetchedAt: new Date(),
  };
  await WebPage.findOneAndUpdate(
    { url },
    {
      $set: set,
      $setOnInsert: { source: 'auto_discovered' as const, approved: false },
    },
    { upsert: true, new: true },
  );
}

/**
 * Test-only entry point. Runs the auto-discover pipeline against an
 * explicit list of seeds so unit tests don't reach the hardcoded
 * `getCrawlSeeds()` list (which would try to hit example.com /
 * iana.org from CI).
 *
 * NOT exported in the public cron / admin surface — used by
 * services/__tests__/webCrawler.test.ts.
 */
export async function _runWithSeeds(seeds: CrawlSeed[]): Promise<CrawlStats> {
  const stats: CrawlStats = emptyStats();
  if (!seeds || seeds.length === 0) return stats;

  // Track the per-host "visited so far" cap so a single seed page
  // can't pull in more than MAX_PER_SEED siblings.
  const perSeedVisited = new Map<string, number>();

  for (const seed of seeds) {
    let seedDomain: string;
    try {
      seedDomain = new URL(seed.url).hostname;
    } catch {
      adminLog.warn(`[webCrawler] invalid seed url: ${seed.url}`);
      stats.failed += 1;
      continue;
    }

    // Process the seed itself. Cache the result for the depth-1
    // follow so we don't issue a second fetch for the same URL.
    let seedFetched: Awaited<ReturnType<typeof fetchAndExtractPage>> | null = null;
    try {
      const fetched = await fetchAndExtractPage(seed.url);
      seedFetched = fetched;
      if (!fetched.text || fetched.text.length < 1) {
        await upsertDiscovered(seed.url, {
          title: fetched.title,
          text: '',
          statusCode: fetched.statusCode,
          error: 'empty body',
        });
        adminLog.warn(`[webCrawler] empty body for ${seed.url}`);
        stats.failed += 1;
        continue;
      }
      await upsertDiscovered(seed.url, {
        title: fetched.title,
        text: fetched.text,
        statusCode: fetched.statusCode,
      });
      stats.visited += 1;
      stats.inserted += 1;
    } catch (err) {
      adminLog.warn(`[webCrawler] failed ${seed.url}: ${(err as Error).message}`);
      await upsertDiscovered(seed.url, { error: (err as Error).message });
      stats.failed += 1;
      continue; // no point iterating links if the seed failed
    }

    if (!FOLLOW_LINKS || !seedFetched) continue;

    // Depth-1 follow: same-domain links only, capped.
    const linkBudget = Math.max(0, MAX_PER_SEED - 1);
    const siblingUrls = seedFetched.links
      .filter((link) => {
        try { return new URL(link).hostname === seedDomain; } catch { return false; }
      })
      .slice(0, linkBudget);

    for (const link of siblingUrls) {
      try {
        const inner = await fetchAndExtractPage(link);
        await upsertDiscovered(link, {
          title: inner.title,
          text: inner.text,
          statusCode: inner.statusCode,
        });
        stats.visited += 1;
        stats.inserted += 1;
      } catch (err) {
        adminLog.warn(`[webCrawler] failed linked ${link}: ${(err as Error).message}`);
        await upsertDiscovered(link, { error: (err as Error).message });
        stats.failed += 1;
      }
    }
  }

  return stats;
}

/**
 * Production entry point. Runs against `getCrawlSeeds()`.
 * Returns an empty stats object if the seed list is empty (no-op).
 */
export async function runAutoDiscover(): Promise<CrawlStats> {
  const seeds = getCrawlSeeds();
  return _runWithSeeds(seeds);
}
