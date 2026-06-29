/**
 * typoNormalizer.ts — Alias-driven typo correction.
 *
 * Rather than using edit-distance fuzzy matching (which is expensive and
 * non-deterministic), typo correction here is alias-driven: misspellings
 * are registered as manual entries in aliases.json and are treated the same
 * way as any other alias during query expansion.
 *
 * This module exposes a single helper that can be used for pre-processing
 * before the main alias lookup — it corrects tokens whose exact spelling
 * exists as an alias key pointing to a canonical form, enabling downstream
 * multi-word alias lookups to work correctly after correction.
 *
 * Example:
 *   "vicharnashala" → "vicharanashala"  (registered in aliases.json)
 *   "no object certificate" → "no objection certificate"  (phrase alias)
 *
 * The function is intentionally O(n_tokens) — it makes one Map lookup per
 * token plus one full-phrase lookup, with no external I/O.
 */

/** Same normalization as aliasMapper — inlined to avoid circular imports. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Apply alias-driven typo correction to a raw query string at the token level and phrase level.
 *
 * With a `Map<string, Set<string>>` alias map, a key may have multiple known expansions.
 * Typo correction is only applied when a key maps to exactly ONE value and that value
 * is a single word (unambiguous correction). Multi-value or multi-word mappings are
 * skipped here and handled by the expansion step in aliasMapper.
 *
 * @param query    - The raw user query.
 * @param aliasMap - The master alias map (built by aliasMapper at startup).
 * @returns        The query with any known typos corrected, preserving
 *                 the token ordering and spacing.
 */
export function normalizeTypos(query: string, aliasMap: Map<string, Set<string>>): string {
  if (!query || !query.trim()) return query;

  // 1. Phrase-level typo correction (only if the query has multiple words).
  //    Applied only when the phrase maps to exactly one multi-word correction
  //    (e.g. "no object certificate" → "no objection certificate").
  if (query.includes(' ')) {
    const normalizedPhrase = normalize(query);
    const expansionSet = aliasMap.get(normalizedPhrase);
    if (expansionSet && expansionSet.size === 1) {
      const mapped = [...expansionSet][0];
      if (mapped.includes(' ')) return mapped;
    }
  }

  // 2. Token-level correction.
  const corrected = query
    .trim()
    .split(/\s+/)
    .map((token) => {
      const norm = normalize(token);
      const mapped = aliasMap.get(norm);

      // Only apply when there is exactly one unambiguous single-word correction.
      // Multi-value sets or multi-word values are expansions, not typo corrections.
      if (!mapped || mapped.size !== 1) return token;
      const correction = [...mapped][0];
      if (correction.includes(' ')) return token;

      // Preserve the original capitalisation pattern of the token.
      if (token === token.toUpperCase()) return correction.toUpperCase();
      if (token[0] === token[0].toUpperCase()) {
        return correction[0].toUpperCase() + correction.slice(1);
      }
      return correction;
    })
    .join(' ');

  return corrected;
}
