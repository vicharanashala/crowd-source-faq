/**
 * fetchFaqsFromSite.ts — scrape the latest FAQs from
 * https://samagama.in/internship/faq and write them to
 * backend/faqs.json in the format the seed script expects.
 *
 * Run:  npm run fetch:faqs
 *
 * Strategy: launch a headless Chromium via Playwright,
 * open the page, expand all <details> accordions, then
 * walk the DOM and extract (question, answer) pairs.
 * The current local file is v21.0.0 (126 FAQs, 13
 * sections); the live page is v24.4.0 (141 FAQs, 14
 * sections). The script is idempotent — running it
 * overwrites the local file with the live version, and
 * the seed script is `findOne` based so re-seeding only
 * inserts the new ones.
 *
 * What it does:
 *   1. Launch headless Chromium (or use existing browser)
 *   2. Navigate to https://samagama.in/internship/faq
 *   3. Extract version + last_updated metadata
 *   4. Walk all <details> accordions, get summary +
 *      inner content (the answer)
 *   5. Build the v{version} JSON in the same shape as
 *      the existing local file
 *   6. Write backend/faqs.json
 *
 * Notes:
 *   - The live site prefixes questions with a "section.n
 *     number" like "3.10" — we strip the trailing " §" anchor
 *     and keep the numbering as the `id` field.
 *   - Questions end with "?". Answers are full text.
 *   - Sections (the page's left-sidebar TOC) are taken
 *     verbatim as the `sections` array.
 *
 * Requires:
 *   - playwright (devDep — already in the workspace)
 *   - The user's system to have the chromium browser
 *     installed (npx playwright install chromium).
 */

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { chromium } from 'playwright';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_URL = 'https://samagama.in/internship/faq';
const OUTPUT_PATH = path.join(__dirname, '..', 'faqs.json');

interface ScrapedFAQ {
  id: string;            // "3.10"
  section: string;       // "3. NOC (No Objection Certificate)"
  question: string;      // "What dates do I put on the NOC?"
  answer: string;
}

interface FaqsJson {
  source: string;
  version: string;
  last_updated: string;
  total_faqs: number;
  sections: string[];
  faqs: ScrapedFAQ[];
}

async function main(): Promise<void> {
  console.log('Yaksha FAQ fetcher');
  console.log('===================');
  console.log(`Source: ${SOURCE_URL}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // Extract metadata: version + last_updated from the header
    // Use the string form of page.evaluate so the browser-side
    // code (which references `document` and `HTMLElement`) isn't
    // type-checked by tsc (the project doesn't have DOM lib
    // enabled). Playwright accepts both Function and string.
    const meta = await page.evaluate(`(function() {
      const fullText = document.body.innerText;
      const vMatch = fullText.match(/Version:\\s*(v[\\d.]+)/i);
      const dMatch = fullText.match(/Last updated:\\s*([^\\n]+)/i);
      return {
        version: vMatch && vMatch[1] ? vMatch[1].trim() : null,
        lastUpdated: dMatch && dMatch[1] ? dMatch[1].trim() : null,
      };
    })()`) as { version: string | null; lastUpdated: string | null };
    if (!meta.version) {
      throw new Error('Could not find "Version: v..." in the page text. The page structure may have changed.');
    }
    console.log(`  Detected: version=${meta.version}  last_updated=${meta.lastUpdated}`);

    // Expand every <details> so the answer text is in the DOM
    await page.evaluate(`(function() {
      document.querySelectorAll('details').forEach(function(d) { d.open = true; });
    })()`);

    // Walk the DOM and extract each (question, answer) pair
    const faqs = await page.evaluate(`(function() {
      // The first <details> per section is the section heading
      // (e.g. "1. About the internship"); the rest are FAQ pairs
      // with questions prefixed by "section.number ".
      // Use the TOC in the sidebar to derive section names from numbers.
      var sectionTOC = {};
      var tocLinks = Array.from(document.querySelectorAll('a'));
      for (var i = 0; i < tocLinks.length; i++) {
        var t = (tocLinks[i].textContent || '').trim();
        var m = t.match(/^(\\d+)\\.\\s+(.+)$/);
        if (m && t.length < 100) {
          sectionTOC[m[1]] = m[1] + '. ' + m[2];
        }
      }
      // Now walk <details>
      var out = [];
      var allDetails = Array.from(document.querySelectorAll('details'));
      for (var j = 0; j < allDetails.length; j++) {
        var d = allDetails[j];
        var summary = d.querySelector('summary');
        if (!summary) continue;
        var fullSummary = (summary.textContent || '').replace(/\\s+/g, ' ').trim();
        // Skip non-FAQ details (sidebar / TOC items, etc.)
        // An FAQ summary has a "section.number" prefix like "3.10"
        var numMatch = fullSummary.match(/^(\\d+)\\.(\\d+)\\s+(.+)$/);
        if (!numMatch) continue;
        var sectionNum = numMatch[1];
        var itemNum = numMatch[2];
        var rest = numMatch[3];
        // Strip the trailing " §" anchor character
        var question = rest.replace(/\\s*§\\s*$/, '').trim();
        // Answer = full <details> text minus the <summary>
        var clone = d.cloneNode(true);
        var sumClone = clone.querySelector('summary');
        if (sumClone) sumClone.remove();
        var answer = (clone.textContent || '').replace(/\\s+/g, ' ').trim();
        var section = sectionTOC[sectionNum] || (sectionNum + '.');
        out.push({
          id: sectionNum + '.' + itemNum,
          section: section,
          question: question,
          answer: answer,
        });
      }
      return out;
    })()`) as { id: string; section: string; question: string; answer: string }[];

    if (faqs.length === 0) {
      throw new Error('Parsed 0 FAQs. The page structure may have changed (no <details> with "N.M Question?" pattern found).');
    }

    // Also extract the section list in order from the TOC
    const sections = await page.evaluate(`(function() {
      var seen = new Set();
      var out = [];
      var tocLinks = Array.from(document.querySelectorAll('a'));
      for (var i = 0; i < tocLinks.length; i++) {
        var t = (tocLinks[i].textContent || '').trim();
        var m = t.match(/^(\\d+)\\.\\s+(.+)$/);
        if (m && t.length < 100 && !seen.has(m[1])) {
          seen.add(m[1]);
          out.push(m[1] + '. ' + m[2]);
        }
      }
      return out;
    })()`) as string[];

    // Build the JSON in the same shape as the existing file
    const out: FaqsJson = {
      source: SOURCE_URL,
      version: meta.version,
      last_updated: meta.lastUpdated ?? new Date().toISOString(),
      total_faqs: faqs.length,
      sections,
      faqs,
    };

    // Compare with the current file
    let oldCount = 0;
    let oldVersion = '<none>';
    try {
      const old = JSON.parse(await fs.readFile(OUTPUT_PATH, 'utf-8')) as { version?: string; total_faqs?: number; faqs?: { id: string }[] };
      oldVersion = old.version ?? '<none>';
      oldCount = old.faqs?.length ?? 0;
      // Diff by id
      const newIds = new Set(faqs.map((f) => f.id));
      const oldIds = new Set((old.faqs ?? []).map((f) => f.id));
      const added = [...newIds].filter((id) => !oldIds.has(id));
      const removed = [...oldIds].filter((id) => !newIds.has(id));
      console.log(`  Current local: ${oldCount} FAQs (${oldVersion})`);
      console.log(`  Live site:     ${faqs.length} FAQs (${meta.version})`);
      console.log(`  Diff: +${added.length} added, -${removed.length} removed`);
      if (added.length) console.log(`    added: ${added.slice(0, 10).join(', ')}${added.length > 10 ? '…' : ''}`);
      if (removed.length) console.log(`    removed: ${removed.slice(0, 10).join(', ')}${removed.length > 10 ? '…' : ''}`);
    } catch {
      console.log(`  No existing local file (or invalid JSON) — writing fresh.`);
    }

    // Write the new file
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
    console.log(`\n✅ Wrote ${faqs.length} FAQs to ${OUTPUT_PATH}`);
    console.log(`   Next: npm run seed (will upsert — only new IDs are inserted; the seed is idempotent).`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
