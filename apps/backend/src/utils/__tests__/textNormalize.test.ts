import { describe, it, expect } from 'vitest';
import {
  normalizeForExactMatch,
  normalizeForFuzzyMatch,
  tokenize,
  levenshteinDistance,
  normalizedLevenshtein,
  jaccardSimilarity,
} from '../textNormalize.js';

describe('normalizeForExactMatch', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeForExactMatch('What is Yaksha?')).toBe('what is yaksha');
  });

  it('treats "What is yaksha?" identically', () => {
    expect(normalizeForExactMatch('What is yaksha?')).toBe(normalizeForExactMatch('What is Yaksha?'));
  });

  it('treats "WHAT IS YAKSHA" identically', () => {
    expect(normalizeForExactMatch('WHAT IS YAKSHA')).toBe(normalizeForExactMatch('What is Yaksha?'));
  });

  it('collapses multiple spaces', () => {
    expect(normalizeForExactMatch('What   is    Yaksha?')).toBe('what is yaksha');
  });

  it('strips unicode diacritics', () => {
    expect(normalizeForExactMatch('résumé')).toBe('resume');
  });

  it('handles empty string', () => {
    expect(normalizeForExactMatch('')).toBe('');
  });
});

describe('normalizeForFuzzyMatch', () => {
  it('removes stop words', () => {
    const result = normalizeForFuzzyMatch('What is Yaksha?');
    expect(result).not.toContain('what');
    expect(result).not.toContain('is');
    expect(result).toContain('yaksha');
  });

  it('preserves significant words', () => {
    const result = normalizeForFuzzyMatch('What exactly is the internship doing?');
    expect(result).toContain('exactly');
    expect(result).toContain('internship');
    expect(result).toContain('doing');
  });

  it('handles contractions and hyphens', () => {
    const result = normalizeForFuzzyMatch("don't re-use it");
    expect(result).toContain("don't");
    expect(result).toContain('re-use');
  });

  it('filters words shorter than 2 chars', () => {
    const result = normalizeForFuzzyMatch('I am a');
    expect(result).toBe('');
  });

  it('is case-insensitive', () => {
    const result = normalizeForFuzzyMatch('YAKSHA PROGRAM');
    expect(result).toContain('yaksha');
    expect(result).toContain('program');
  });
});

describe('tokenize', () => {
  it('returns only significant tokens (length >= 3)', () => {
    const tokens = tokenize('What is Yaksha internship?');
    expect(tokens).toContain('yaksha');
    expect(tokens).toContain('internship');
    expect(tokens).not.toContain('what');
    expect(tokens).not.toContain('is');
  });

  it('returns empty array for stop-word-only input', () => {
    expect(tokenize('I am the')).toEqual([]);
  });
});

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('computes single-character edit', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  it('computes insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('computes deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });
});

describe('normalizedLevenshtein', () => {
  it('returns 1 for identical strings', () => {
    expect(normalizedLevenshtein('hello', 'hello')).toBe(1);
  });

  it('returns 1 for case-different identical strings', () => {
    expect(normalizedLevenshtein('Hello', 'hello')).toBe(1);
  });

  it('returns ~0.8 for single-char difference', () => {
    const score = normalizedLevenshtein('hello', 'hallo');
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThan(1);
  });

  it('returns low score for very different strings', () => {
    expect(normalizedLevenshtein('cat', 'elephant')).toBeLessThan(0.5);
  });

  it('returns 1 for both empty', () => {
    expect(normalizedLevenshtein('', '')).toBe(1);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('computes partial overlap correctly', () => {
    // intersection = {a}, union = {a,b,c} => 1/3
    const score = jaccardSimilarity(['a', 'b'], ['a', 'c']);
    expect(score).toBeCloseTo(1 / 3, 5);
  });

  it('handles duplicate tokens within arrays', () => {
    expect(jaccardSimilarity(['a', 'a'], ['a'])).toBe(1);
  });

  it('returns 0 for both empty', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });
});
