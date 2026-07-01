/**
 * acronymGenerator.ts — Automatic acronym generation from multi-word phrases.
 *
 * Takes a phrase and derives its abbreviation by taking the first letter of
 * each content word (filtering out common connector/stop words). The result
 * is always uppercase.
 *
 * Examples:
 *   "No Objection Certificate"       → "NOC"
 *   "Large Language Model"           → "LLM"
 *   "Indian Institute of Technology" → "IIT"
 *   "Machine Learning"               → "ML"
 *   "Graphics Processing Unit"       → "GPU"
 *
 * This is a pure function — no I/O, no side effects, cacheable by the caller.
 */

/** Words that are ignored when building an acronym. */
const CONNECTOR_WORDS = new Set([
  'of', 'the', 'for', 'to', 'in', 'on', 'and', 'with', 'a', 'an',
  'at', 'by', 'from', 'or', 'as', 'is', 'are', 'was', 'were',
]);

/**
 * Generate an acronym from a multi-word phrase.
 *
 * @param phrase - The input phrase (any case).
 * @returns The generated acronym in uppercase, or `null` if the phrase
 *          has fewer than two content words (single-word inputs can't
 *          form a meaningful acronym).
 */
export function generateAcronym(phrase: string): string | null {
  if (!phrase || typeof phrase !== 'string') return null;

  const contentWords = phrase
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .filter((word) => !CONNECTOR_WORDS.has(word.toLowerCase()));

  // Need at least 2 content words to form a useful acronym
  if (contentWords.length < 2) return null;

  return contentWords.map((w) => w[0].toUpperCase()).join('');
}
