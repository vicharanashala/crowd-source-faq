/**
 * textNormalize.ts — Normalization utilities for duplicate detection
 *
 * Provides consistent text normalization for:
 * - Exact match comparison
 * - Fuzzy matching
 * - Semantic similarity preprocessing
 *
 * Usage:
 *   import { normalizeForExactMatch, normalizeForFuzzyMatch, tokenize } from '../utils/textNormalize.js';
 */

/**
 * Strip all punctuation, normalize unicode, lowercase, and collapse whitespace.
 * Used for exact-match comparison (e.g., "What is Yaksha?" === "what is yaksha").
 */
export function normalizeForExactMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')                        // Decompose unicode (e.g., é → e + combining accent)
    .replace(/[\u0300-\u036f]/g, '')          // Remove combining diacritical marks
    .replace(/[^\w\s]/g, '')                  // Remove all punctuation
    .replace(/\s+/g, ' ')                     // Collapse multiple spaces
    .trim();
}

/**
 * Remove stop words and normalize word forms for fuzzy matching.
 * Preserves more structure than exact match for Jaccard/overlap comparison.
 */
export function normalizeForFuzzyMatch(text: string): string {
  const STOP_WORDS = new Set([
    'i', 'a', 'an', 'the', 'is', 'it', 'to', 'of', 'in', 'for', 'on', 'with',
    'my', 'we', 'you', 'do', 'can', 'be', 'are', 'as', 'at', 'by', 'if', 'or',
    'not', 'how', 'what', 'when', 'where', 'why', 'will', 'get', 'got', 'have',
    'has', 'had', 'this', 'that', 'these', 'those', 'from', 'up', 'out', 'about',
    'who', 'which', 'but', 'they', 'he', 'she', 'his', 'her', 'all', 'some',
    'any', 'would', 'could', 'should', 'there', 'here', 'their', 'them', 'been',
    'being', 'am', 'was', 'were', 'so', 'no', 'yes', 'may', 'please', 'thanks',
  ]);

  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s'-]/g, ' ')              // Keep apostrophes and hyphens
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w))
    .join(' ')
    .trim();
}

/**
 * Tokenize text into significant words for overlap/Jaccard comparison.
 * Returns lowercased, stemmed words with stop words removed.
 */
export function tokenize(text: string): string[] {
  return normalizeForFuzzyMatch(text)
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

/**
 * Compute Levenshtein distance between two strings.
 * Used for edit-distance based fuzzy matching.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

/**
 * Compute normalized similarity score between two strings using Levenshtein.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function normalizedLevenshtein(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / maxLen;
}

/**
 * Jaccard similarity between two token sets.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}
