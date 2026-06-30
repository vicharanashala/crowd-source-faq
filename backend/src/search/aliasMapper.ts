/**
 * aliasMapper.ts — Search query expansion engine.
 *
 * This is the single module that the search controller imports. It owns
 * the master alias map and exposes two public functions:
 *
 *   expandQuery(query)              — call on every search request
 *   initAcronymExtractor(faqTexts) — call once at server startup
 *   learnFromText(text)            — call after each FAQ create/update
 *
 * # Alias Priority (highest → lowest)
 * 1. Manual entries from aliases.json
 * 2. Auto-generated acronyms derived from alias values (generateAcronym)
 * 3. FAQ-extracted aliases from initAcronymExtractor (buildExtractedAliases)
 *
 * Later sources never overwrite earlier ones, so manual entries always win.
 *
 * # Performance
 * - aliases.json is loaded once synchronously at module import time.
 * - The master Map is built once; no file I/O occurs per request.
 * - Per-request cost is O(n_tokens) Map lookups — negligible latency.
 * - Thread-safe: Node.js is single-threaded; the Map is mutated only at
 *   startup via initAcronymExtractor (before traffic begins).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateAcronym } from './acronymGenerator.js';
import { buildExtractedAliases } from './acronymExtractor.js';
import { normalizeTypos } from './typoNormalizer.js';

// ── Resolve the JSON path relative to this file ───────────────────────────────
// Using import.meta.url keeps this compatible with ESM (the project's module type).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let ALIASES_PATH = join(__dirname, 'aliases.json');
if (!existsSync(ALIASES_PATH)) {
  const srcPath = join(__dirname, '../../../src/search/aliases.json');
  if (existsSync(srcPath)) {
    ALIASES_PATH = srcPath;
  }
}

// ── Build the master alias map ────────────────────────────────────────────────

/**
 * The master alias table.
 *
 * Keys and values are always lowercase. Populated at module load time
 * (manual + generated acronyms) and enriched once at startup (FAQ-extracted).
 */
const aliasMap = new Map<string, string>();

/**
 * Normalise a key/value before insertion so the Map is always lowercase.
 */
function setAlias(key: string, value: string): void {
  const k = key.trim().toLowerCase();
  const v = value.trim().toLowerCase();
  if (k && v && k !== v && !aliasMap.has(k)) {
    aliasMap.set(k, v);
  }
}

// Step 1 — Load manual aliases from aliases.json
(function loadManualAliases(): void {
  try {
    const raw = readFileSync(ALIASES_PATH, 'utf-8');
    const data = JSON.parse(raw) as Record<string, string>;
    for (const [key, value] of Object.entries(data)) {
      setAlias(key, value);
    }
  } catch (err) {
    // Non-fatal: the search pipeline continues without alias expansion.
    // This can happen in test environments where the JSON path differs.
    process.stderr.write(
      `[aliasMapper] WARNING: Could not load aliases.json: ${(err as Error).message}\n`
    );
  }
})();

// Step 2 — Auto-generate acronyms for every multi-word value in the map
//           (e.g. value "no objection certificate" → generate "NOC" → add noc → "no objection certificate")
(function buildGeneratedAcronyms(): void {
  // Snapshot keys/values at this point (manual aliases only) so we don't
  // iterate over our own insertions.
  const snapshot = [...aliasMap.entries()];
  for (const [, value] of snapshot) {
    // Only attempt generation for multi-word values
    if (!value.includes(' ')) continue;
    const acronym = generateAcronym(value);
    if (!acronym) continue;
    const acronymLower = acronym.toLowerCase();
    // Add: acronym → long form  AND  long form → acronym
    setAlias(acronymLower, value);
    setAlias(value, acronymLower);
  }
})();

// ── Startup hook ──────────────────────────────────────────────────────────────

/**
 * Enrich the alias map with acronyms extracted from FAQ text at startup.
 *
 * Call this ONCE from server.ts after the FAQ data is available. It is
 * intentionally synchronous and fast — no I/O is performed.
 *
 * @param faqTexts - Array of strings (FAQ question + answer concatenated).
 */
export function initAcronymExtractor(faqTexts: string[]): void {
  const extracted = buildExtractedAliases(faqTexts);
  for (const [key, value] of extracted) {
    setAlias(key, value);  // manual entries (already in map) take priority
  }
}

/**
 * Learn new acronym↔long-form pairs from a single FAQ's text (question + answer).
 * Safe to call on every FAQ create/update — I/O is deferred off the hot path.
 *
 * @param text - Concatenated question and answer string of one FAQ.
 */
export function learnFromText(text: string): void {
  if (!text || !text.trim()) return;
  setImmediate(() => {
    const extracted = buildExtractedAliases([text]);
    for (const [key, value] of extracted) {
      setAlias(key, value);
    }
  });
}

// ── Core expansion logic ──────────────────────────────────────────────────────

/**
 * Expand a user query with aliases, acronyms, and typo corrections.
 *
 * Rules:
 * - The original query is ALWAYS preserved as the first line of the output.
 * - Terms are only APPENDED — never removed or replaced.
 * - Duplicates (case-insensitive) of terms already in the query are omitted.
 * - Empty / whitespace-only queries are returned as-is.
 *
 * @param query - The raw user query (any case, any length).
 * @returns The original query followed by any unique expansion terms,
 *          separated by newlines. If no expansions are found, returns
 *          the original query unchanged.
 *
 * @example
 * expandQuery("Need NOC for VINS")
 * // → "Need NOC for VINS\nNo Objection Certificate\nVicharanashala Internship"
 *
 * @example
 * expandQuery("NOC noc NoC")
 * // → "NOC noc NoC\nNo Objection Certificate"  (deduplicated)
 */
export function expandQuery(query: string): string {
  if (!query || !query.trim()) return query;

  // Step 1 — Apply typo correction but preserve original for output
  const corrected = normalizeTypos(query, aliasMap);
  // The original query is preserved exactly as input for the first line of output
  const queryForOutput = query;

  // Step 2 — Collect all unique terms already in the (corrected) query
  //           for deduplication (case-insensitive)
  const originalTermsLower = new Set(
    corrected.toLowerCase().split(/\s+/).filter(Boolean)
  );

  // Step 3 — Also capture multi-word chunks (bigrams, trigrams, the full phrase)
  //          so "No Objection Certificate" can be matched as a phrase alias
  const expansions: string[] = [];
  const seenExpansions = new Set<string>(); // dedup expansions among themselves

  /**
   * Attempt to resolve a lowercase lookup key against the alias map.
   * If found and not already present in the query, queue the expansion.
   */
  function tryExpand(lookupKey: string): void {
    const expansion = aliasMap.get(lookupKey);
    if (!expansion) return;

    // Check if the expansion is already semantically present in the query
    const expansionLower = expansion.toLowerCase();
    const expansionWords = expansionLower.split(/\s+/);

    // Consider it "already present" if ALL words of the expansion appear in the query
    const alreadyInQuery = expansionWords.every((w) => originalTermsLower.has(w));
    if (alreadyInQuery) return;

    // Deduplicate across multiple expansions triggered in the same call
    if (seenExpansions.has(expansionLower)) return;
    seenExpansions.add(expansionLower);

    // Title-case the expansion for readability
    const titleCased = expansion
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    expansions.push(titleCased);
  }

  // Step 4a — Token-level lookup (handles single-token aliases like "noc", "vins", "llm")
  const tokens = corrected.trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    tryExpand(token.toLowerCase());
  }

  // Step 4b — Phrase-level lookup (handles multi-word aliases like "no objection certificate")
  //           We check every contiguous subsequence of 2 to 5 tokens.
  const MAX_PHRASE_TOKENS = 5;
  for (let start = 0; start < tokens.length; start++) {
    for (let len = 2; len <= Math.min(MAX_PHRASE_TOKENS, tokens.length - start); len++) {
      const phrase = tokens
        .slice(start, start + len)
        .map((t) => t.toLowerCase())
        .join(' ');
      tryExpand(phrase);
    }
  }

  // Step 5 — Compose the result
  // Always preserve the original query as-is on the first line, then add expansions
  if (expansions.length === 0) return queryForOutput;
  return [queryForOutput, ...expansions].join('\n');
}

// ── Diagnostic export (test / admin use only) ─────────────────────────────────

/**
 * Returns the current size of the master alias map.
 * Useful in unit tests to verify that the map was populated.
 */
export function getAliasMapSize(): number {
  return aliasMap.size;
}
