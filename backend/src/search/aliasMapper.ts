/**
 * aliasMapper.ts — Search query expansion engine.
 *
 * This is the single module that the search controller imports. It owns
 * the master alias map and exposes two public functions:
 *
 *   expandQuery(query)              — call on every search request
 *   initAcronymExtractor(faqTexts) — call once at server startup
 *   learnFromText(text)            — call after FAQ create/update/view
 *
 * # Alias map structure
 * Map<normalized-key, Set<normalized-expansions>>
 * One key can expand to multiple known forms (e.g. "sp" → {"spurti points"}).
 *
 * # How entries are added
 * Layer 1 — Manual: aliases.json loaded at module import (one-way; author
 *            controls direction, so typo corrections are not reversed).
 * Layer 2 — Generated: acronyms auto-derived from multi-word values via
 *            generateAcronym(); both directions inserted (bidirectional).
 * Layer 3 — Extracted: parenthetical patterns in FAQ text; both directions
 *            already explicit in the returned Map from extractAcronymsFromText.
 *
 * # Performance contract
 * - All disk I/O and map construction happens at startup.
 * - After startup, expandQuery runs O(n_tokens) Map lookups — no I/O.
 * - learnFromText updates memory synchronously then defers any disk write
 *   via setImmediate so it never blocks the response path.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateAcronym } from './acronymGenerator.js';
import { buildExtractedAliases, extractAcronymsFromText } from './acronymExtractor.js';
import { normalizeTypos } from './typoNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let ALIASES_PATH = join(__dirname, 'aliases.json');
if (!existsSync(ALIASES_PATH)) {
  const srcPath = join(__dirname, '../../../src/search/aliases.json');
  if (existsSync(srcPath)) {
    ALIASES_PATH = srcPath;
  }
}

// ── Master alias table ────────────────────────────────────────────────────────

/** Map<normalized-key, Set<normalized-expansions>> */
const aliasMap = new Map<string, Set<string>>();

/**
 * Keys explicitly present in aliases.json on disk.
 * Separate from aliasMap which also contains in-memory-only generated entries.
 * Used by learnFromText and initAcronymExtractor to decide what to persist.
 */
const persistedKeys = new Set<string>();

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalize a string for consistent map storage and lookup.
 * Lowercases, converts hyphens/underscores to spaces, collapses whitespace.
 */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Map mutation helpers ──────────────────────────────────────────────────────

/**
 * Add a one-way alias: key → value only.
 * Used for manual aliases (aliases.json) so typo corrections are never reversed
 * and the JSON author retains full control over which directions are active.
 */
function addUnidirectional(rawKey: string, rawValue: string): void {
  const k = normalize(rawKey);
  const v = normalize(rawValue);
  if (!k || !v || k === v) return;
  if (!aliasMap.has(k)) aliasMap.set(k, new Set());
  aliasMap.get(k)!.add(v);
}

/**
 * Add both directions: key → value AND value → key.
 * Used for auto-generated entries (acronym generation) where both directions
 * are always semantically valid.
 */
function addBidirectional(rawKey: string, rawValue: string): void {
  addUnidirectional(rawKey, rawValue);
  addUnidirectional(rawValue, rawKey);
}

// ── Layer 1: load manual aliases ──────────────────────────────────────────────

(function loadManualAliases(): void {
  try {
    const raw = readFileSync(ALIASES_PATH, 'utf-8');
    const data = JSON.parse(raw) as Record<string, string>;
    for (const [key, value] of Object.entries(data)) {
      addUnidirectional(key, value);
      persistedKeys.add(normalize(key));
    }
  } catch (err) {
    process.stderr.write(
      `[aliasMapper] WARNING: Could not load aliases.json: ${(err as Error).message}\n`
    );
  }
})();

// ── Layer 2: auto-generate acronyms from map values ───────────────────────────

/**
 * For every multi-word value currently in the map, derive its acronym via
 * generateAcronym and insert both acronym→phrase and phrase→acronym.
 * Safe to call multiple times — Set storage is idempotent.
 */
function buildGeneratedAcronyms(): void {
  const snapshot = [...aliasMap.entries()];
  for (const [, valueSet] of snapshot) {
    for (const value of valueSet) {
      if (!value.includes(' ')) continue;
      const acronym = generateAcronym(value);
      if (!acronym) continue;
      addBidirectional(acronym.toLowerCase(), value);
    }
  }
}

// Run once at module load on the initial aliases.json values.
buildGeneratedAcronyms();

// ── Persistence helper ────────────────────────────────────────────────────────

function persistNewAliases(newEntries: Record<string, string>): void {
  try {
    const raw = readFileSync(ALIASES_PATH, 'utf-8');
    const existing = JSON.parse(raw) as Record<string, string>;
    const merged = { ...existing, ...newEntries };
    writeFileSync(ALIASES_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    for (const key of Object.keys(newEntries)) {
      persistedKeys.add(key);
    }
    process.stdout.write(
      `[aliasMapper] Persisted ${Object.keys(newEntries).length} new alias(es) to aliases.json\n`
    );
  } catch (err) {
    process.stderr.write(
      `[aliasMapper] WARNING: Could not persist new aliases: ${(err as Error).message}\n`
    );
  }
}

// ── Layer 3: startup FAQ corpus scan ─────────────────────────────────────────

/**
 * Enrich the alias map with acronyms extracted from FAQ text at startup,
 * then re-run acronym generation so any newly discovered long-forms also
 * get their abbreviations auto-derived.
 *
 * New entries from the FAQ corpus (not already in aliases.json) are persisted
 * so they survive restarts. Layer 2 entries are not persisted because they
 * are regenerated deterministically at every boot.
 *
 * @param faqTexts - Array of strings (FAQ question + answer concatenated).
 */
export function initAcronymExtractor(faqTexts: string[]): void {
  // Step 3a: extract parenthetical pairs from the FAQ corpus.
  // buildExtractedAliases already returns both directions for each match.
  const extracted = buildExtractedAliases(faqTexts);

  // Collect pairs that are genuinely new (not yet on disk) before inserting,
  // so we persist only the FAQ-extracted discoveries, not Layer 2 re-runs.
  const newEntries: Record<string, string> = {};
  for (const [key, value] of extracted) {
    const k = normalize(key);
    if (!persistedKeys.has(k)) newEntries[k] = normalize(value);
    addUnidirectional(key, value);
  }

  // Step 3b: re-run acronym generation on ALL values now in the map
  // (covers values from aliases.json AND newly extracted from the corpus).
  buildGeneratedAcronyms();

  if (Object.keys(newEntries).length > 0) {
    persistNewAliases(newEntries);
  }
}

// ── Core expansion logic ──────────────────────────────────────────────────────

/**
 * Produce a display-friendly form of an expansion string.
 * Short single words (≤5 chars, e.g. "sp", "noc", "llm") are returned in
 * UPPERCASE because they are abbreviations. Longer single words get
 * title-cased; multi-word phrases get title-cased word-by-word.
 */
function displayForm(expansion: string): string {
  if (!expansion.includes(' ') && expansion.length <= 5) return expansion.toUpperCase();
  if (!expansion.includes(' ')) return expansion.charAt(0).toUpperCase() + expansion.slice(1);
  return expansion.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Expand a user query with aliases, acronyms, and typo corrections.
 *
 * Rules:
 * - The original query is ALWAYS preserved as the first line of the output.
 * - Terms are only APPENDED — never removed or replaced.
 * - Duplicates of terms already in the query are omitted.
 * - Empty / whitespace-only queries are returned as-is.
 *
 * @param query - The raw user query (any case, any length).
 * @returns The original query followed by unique expansion terms separated
 *          by newlines. Returns the original query unchanged if no expansion found.
 */
export function expandQuery(query: string): string {
  if (!query || !query.trim()) return query;

  // Typo-correct using the alias map, but keep the original string for output.
  const corrected = normalizeTypos(query, aliasMap);
  const queryForOutput = query;
  const normalizedCorrected = normalize(corrected);

  // Build the set of terms already present in the query (for deduplication).
  const originalTermsLower = new Set(normalizedCorrected.split(/\s+/).filter(Boolean));

  const expansions: string[] = [];
  const seenExpansions = new Set<string>();

  function tryExpand(lookupKey: string): void {
    // lookupKey is already normalized (lowercase, hyphens→spaces, etc.)
    const expansionSet = aliasMap.get(lookupKey);
    if (!expansionSet) return;

    for (const expansion of expansionSet) {
      // Skip if all words of the expansion are already in the query.
      const expansionWords = expansion.split(/\s+/);
      if (expansionWords.every((w) => originalTermsLower.has(w))) continue;

      if (seenExpansions.has(expansion)) continue;
      seenExpansions.add(expansion);

      expansions.push(displayForm(expansion));
    }
  }

  // Normalize the corrected query to produce clean tokens for lookup.
  const tokens = normalizedCorrected.split(/\s+/).filter(Boolean);

  // Token-level lookup (handles "noc", "vins", "llm", "sp", etc.)
  for (const token of tokens) {
    tryExpand(token);
  }

  // Phrase-level lookup for bigrams through 5-grams.
  const MAX_PHRASE_TOKENS = 5;
  for (let start = 0; start < tokens.length; start++) {
    for (let len = 2; len <= Math.min(MAX_PHRASE_TOKENS, tokens.length - start); len++) {
      tryExpand(tokens.slice(start, start + len).join(' '));
    }
  }

  if (expansions.length === 0) return queryForOutput;
  return [queryForOutput, ...expansions].join('\n');
}

// ── Live learning ─────────────────────────────────────────────────────────────

/**
 * Extract abbreviation↔long-form pairs from FAQ text and add them to the
 * in-memory alias map immediately. Any pairs not yet on disk are persisted
 * via a deferred (setImmediate) write so the response path is never blocked.
 *
 * @param text - FAQ question + answer concatenated.
 */
export function learnFromText(text: string): void {
  const extracted = extractAcronymsFromText(text);
  const newEntries: Record<string, string> = {};

  for (const [key, value] of extracted) {
    const k = normalize(key);
    if (!persistedKeys.has(k)) newEntries[k] = normalize(value);
    addUnidirectional(key, value);
  }

  if (Object.keys(newEntries).length > 0) {
    // Defer disk write to after the current request cycle — keeps I/O off the hot path.
    setImmediate(() => persistNewAliases(newEntries));
  }
}

// ── Diagnostic ────────────────────────────────────────────────────────────────

export function getAliasMapSize(): number {
  return aliasMap.size;
}
