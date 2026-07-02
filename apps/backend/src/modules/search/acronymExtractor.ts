/**
 * acronymExtractor.ts — Automatic acronym extraction from FAQ text.
 *
 * Scans free-form text (FAQ questions and answers) for the two canonical
 * patterns used in technical writing to introduce abbreviations:
 *
 *   Pattern A — long form first:   "No Objection Certificate (NOC)"
 *   Pattern B — short form first:  "NOC (No Objection Certificate)"
 *
 * For every match, both directions of the alias are recorded:
 *   "noc"                     → "no objection certificate"
 *   "no objection certificate" → "noc"
 *
 * Results are returned as a plain Map so the caller (aliasMapper) can
 * merge them into the master alias table. No I/O is performed here.
 */

/**
 * Matches:  Long Form (ABBREV)
 * Long form: 1–6 words (fixed repetition prevents greedy runaway).
 * Abbreviation: 2–8 uppercase letters/digits/dots.
 *
 * Example: "No Objection Certificate (NOC)" matches; a full sentence before
 * the parenthesis no longer matches because of the {0,5} word cap.
 */
const LONG_THEN_SHORT =
  /\b([A-Za-z]+(?:\s+[A-Za-z]+){0,5})\s*\(\s*([A-Z][A-Z0-9\.]{1,7})\s*\)/g;

/**
 * Matches:  ABBREV (Long Form)
 * Abbreviation: 2–8 uppercase letters/digits/dots.
 * Long form: 1–6 words.
 *
 * Example: "NOC (No Objection Certificate)" matches.
 */
const SHORT_THEN_LONG =
  /\b([A-Z][A-Z0-9\.]{1,7})\s*\(\s*([A-Za-z]+(?:\s+[A-Za-z]+){0,5})\s*\)/g;

/**
 * Extract acronym↔long-form pairs from a single piece of text.
 *
 * For Pattern A (Long Form before abbreviation), the greedy regex may capture
 * leading context words (e.g. "Uses a Large Language Model (LLM)" → captures
 * the full sentence prefix). We strip leading words whose first letter doesn't
 * match the abbreviation's first letter so we recover "Large Language Model".
 *
 * @param text - Any string (FAQ question, answer, title, etc.)
 * @returns A Map where both directions of each discovered alias are present,
 *          with keys and values already lowercased and trimmed.
 */
export function extractAcronymsFromText(text: string): Map<string, string> {
  const aliases = new Map<string, string>();
  if (!text || typeof text !== 'string') return aliases;

  // Pattern A: "No Objection Certificate (NOC)"
  for (const match of text.matchAll(LONG_THEN_SHORT)) {
    const rawLong = match[1].trim().toLowerCase();
    const shortForm = match[2].trim().toLowerCase();
    if (!rawLong || !shortForm) continue;

    // Strip any leading context words that don't start with the same letter as
    // the abbreviation. "Uses a Large Language Model" + "LLM" → strip "Uses", "a"
    // → "Large Language Model".
    const words = rawLong.split(' ');
    while (words.length > 1 && words[0][0] !== shortForm[0]) words.shift();
    const longForm = words.join(' ');

    if (!longForm || longForm === shortForm || longForm[0] !== shortForm[0]) continue;

    aliases.set(shortForm, longForm);
    aliases.set(longForm, shortForm);
  }

  // Pattern B: "NOC (No Objection Certificate)"
  for (const match of text.matchAll(SHORT_THEN_LONG)) {
    const shortForm = match[1].trim().toLowerCase();
    const longForm = match[2].trim().toLowerCase();
    if (!longForm || !shortForm || longForm === shortForm) continue;

    // For Pattern B the long form is inside the parentheses, so it's usually
    // the exact phrase. A first-letter check is still a useful sanity filter.
    if (longForm[0] !== shortForm[0]) continue;

    aliases.set(shortForm, longForm);
    aliases.set(longForm, shortForm);
  }

  return aliases;
}

/**
 * Build an extracted alias map from an array of FAQ text strings.
 *
 * Called once at startup with all FAQ question+answer content. Merges
 * the results of `extractAcronymsFromText` across every entry.
 *
 * @param faqTexts - Array of strings, each containing FAQ question and/or answer text.
 * @returns A unified Map of all discovered abbreviation↔long-form pairs.
 */
export function buildExtractedAliases(faqTexts: string[]): Map<string, string> {
  const merged = new Map<string, string>();
  for (const text of faqTexts) {
    const found = extractAcronymsFromText(text);
    for (const [k, v] of found) {
      // Manual aliases (loaded first in aliasMapper) take priority —
      // do not overwrite existing entries here; the caller controls priority.
      if (!merged.has(k)) {
        merged.set(k, v);
      }
    }
  }
  return merged;
}
