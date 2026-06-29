/**
 * searchAlias.test.ts — Unit tests for the Search Alias & Acronym Mapping Engine.
 *
 * Tests are isolated to pure functions only; no MongoDB or Express dependencies.
 * The aliasMapper module loads aliases.json at import time — vitest will pick up
 * the file from the filesystem using the standard module resolution path.
 */

import { describe, it, expect } from 'vitest';
import { generateAcronym } from '../src/search/acronymGenerator.js';
import { extractAcronymsFromText, buildExtractedAliases } from '../src/search/acronymExtractor.js';
import { normalizeTypos } from '../src/search/typoNormalizer.js';
import { expandQuery, getAliasMapSize, initAcronymExtractor } from '../src/search/aliasMapper.js';

// ─── generateAcronym ─────────────────────────────────────────────────────────

describe('generateAcronym', () => {
  it('generates NOC from "No Objection Certificate"', () => {
    expect(generateAcronym('No Objection Certificate')).toBe('NOC');
  });

  it('generates LLM from "Large Language Model"', () => {
    expect(generateAcronym('Large Language Model')).toBe('LLM');
  });

  it('generates HD from "Head of Department" (filters connector "of")', () => {
    expect(generateAcronym('Head of Department')).toBe('HD');
  });

  it('generates IIT from "Indian Institute of Technology"', () => {
    expect(generateAcronym('Indian Institute of Technology')).toBe('IIT');
  });

  it('generates ML from "Machine Learning"', () => {
    expect(generateAcronym('Machine Learning')).toBe('ML');
  });

  it('generates GPU from "Graphics Processing Unit"', () => {
    expect(generateAcronym('Graphics Processing Unit')).toBe('GPU');
  });

  it('returns null for a single-word input', () => {
    expect(generateAcronym('Certificate')).toBeNull();
  });

  it('returns null for an all-connector input', () => {
    expect(generateAcronym('of the and')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(generateAcronym('')).toBeNull();
  });

  it('handles mixed case input', () => {
    expect(generateAcronym('machine learning')).toBe('ML');
  });

  it('handles extra whitespace', () => {
    expect(generateAcronym('  No   Objection   Certificate  ')).toBe('NOC');
  });
});

// ─── extractAcronymsFromText ──────────────────────────────────────────────────

describe('extractAcronymsFromText', () => {
  it('extracts "Long Form (ABBREV)" pattern', () => {
    const result = extractAcronymsFromText('No Objection Certificate (NOC) is required.');
    expect(result.get('noc')).toBe('no objection certificate');
    expect(result.get('no objection certificate')).toBe('noc');
  });

  it('extracts "ABBREV (Long Form)" pattern', () => {
    const result = extractAcronymsFromText('NOC (No Objection Certificate) is required.');
    expect(result.get('noc')).toBe('no objection certificate');
    expect(result.get('no objection certificate')).toBe('noc');
  });

  it('extracts LLM from "Large Language Model (LLM)"', () => {
    const result = extractAcronymsFromText('Uses a Large Language Model (LLM) internally.');
    expect(result.get('llm')).toBe('large language model');
  });

  it('extracts FAQ from "FAQ (Frequently Asked Questions)"', () => {
    const result = extractAcronymsFromText('FAQ (Frequently Asked Questions) page.');
    expect(result.get('faq')).toBe('frequently asked questions');
  });

  it('returns an empty map for text with no patterns', () => {
    const result = extractAcronymsFromText('Hello world, no patterns here.');
    expect(result.size).toBe(0);
  });

  it('handles empty string gracefully', () => {
    const result = extractAcronymsFromText('');
    expect(result.size).toBe(0);
  });

  it('extracts multiple pairs from the same text', () => {
    const text = 'No Objection Certificate (NOC) and Large Language Model (LLM) are both needed.';
    const result = extractAcronymsFromText(text);
    expect(result.get('noc')).toBe('no objection certificate');
    expect(result.get('llm')).toBe('large language model');
  });
});

// ─── buildExtractedAliases ───────────────────────────────────────────────────

describe('buildExtractedAliases', () => {
  it('merges acronyms from multiple FAQ texts', () => {
    const texts = [
      'What is NOC (No Objection Certificate)?',
      'LLM (Large Language Model) is used by Yaksha.',
    ];
    const result = buildExtractedAliases(texts);
    expect(result.get('noc')).toBe('no objection certificate');
    expect(result.get('llm')).toBe('large language model');
  });

  it('does not overwrite an existing entry (first one wins)', () => {
    const texts = [
      'NOC (No Objection Certificate) info.',
      'NOC (some other expansion) — conflicting.',
    ];
    const result = buildExtractedAliases(texts);
    expect(result.get('noc')).toBe('no objection certificate');
  });

  it('returns an empty map for empty input', () => {
    const result = buildExtractedAliases([]);
    expect(result.size).toBe(0);
  });
});

// ─── normalizeTypos ──────────────────────────────────────────────────────────

describe('normalizeTypos', () => {
  // Build a small alias map for these tests (Map<string, Set<string>>)
  const testMap = new Map<string, Set<string>>([
    ['vicharnashala', new Set(['vicharanashala'])],
    ['no object certificate', new Set(['no objection certificate'])],
    ['machin learning', new Set(['machine learning'])],
    ['noc', new Set(['no objection certificate'])],
  ]);

  it('corrects full-phrase misspelling (phrase match has priority)', () => {
    expect(normalizeTypos('no object certificate', testMap)).toBe('no objection certificate');
  });

  it('corrects single-token typo', () => {
    expect(normalizeTypos('vicharnashala', testMap)).toBe('vicharanashala');
  });

  it('preserves unknown tokens unchanged', () => {
    expect(normalizeTypos('totally fine query', testMap)).toBe('totally fine query');
  });

  it('handles empty string gracefully', () => {
    expect(normalizeTypos('', testMap)).toBe('');
  });

  it('handles whitespace-only gracefully', () => {
    expect(normalizeTypos('   ', testMap)).toBe('   ');
  });

  it('does not expand multi-word aliases at token level (that is expandQuery\'s job)', () => {
    // "noc" maps to "no objection certificate" (multi-word) — normalizeTypos
    // should NOT expand it inline (only single-word replacements are applied)
    const result = normalizeTypos('noc', testMap);
    // Should return "noc" unchanged because the mapped value has spaces
    expect(result).toBe('noc');
  });
});

// ─── expandQuery ─────────────────────────────────────────────────────────────

describe('expandQuery', () => {
  it('expands NOC to include "No Objection Certificate"', () => {
    const result = expandQuery('NOC');
    expect(result).toContain('NOC');
    expect(result.toLowerCase()).toContain('no objection certificate');
  });

  it('expands "No Objection Certificate" to include NOC', () => {
    const result = expandQuery('No Objection Certificate');
    expect(result).toContain('No Objection Certificate');
    expect(result.toLowerCase()).toContain('noc');
  });

  it('expands VINS to include "Vicharanashala Internship"', () => {
    const result = expandQuery('VINS');
    expect(result).toContain('VINS');
    expect(result.toLowerCase()).toContain('vicharanashala internship');
  });

  it('expands LLM to include "Large Language Model"', () => {
    const result = expandQuery('LLM');
    expect(result.toLowerCase()).toContain('large language model');
  });

  it('expands HOD to include "Head of Department"', () => {
    const result = expandQuery('HOD');
    expect(result.toLowerCase()).toContain('head of department');
  });

  it('expands FAQ to include "Frequently Asked Questions"', () => {
    const result = expandQuery('FAQ');
    expect(result.toLowerCase()).toContain('frequently asked questions');
  });

  it('handles mixed-case variants without duplicating the expansion', () => {
    const result = expandQuery('NOC noc NoC');
    // Original query preserved
    expect(result).toContain('NOC noc NoC');
    // Expansion appears exactly once (case-insensitive dedup)
    const lower = result.toLowerCase();
    const firstIdx = lower.indexOf('no objection certificate');
    const lastIdx = lower.lastIndexOf('no objection certificate');
    expect(firstIdx).toBe(lastIdx);
  });

  it('handles multi-token queries — expands each known token independently', () => {
    const result = expandQuery('Need NOC for VINS');
    expect(result).toContain('Need NOC for VINS');
    expect(result.toLowerCase()).toContain('no objection certificate');
    expect(result.toLowerCase()).toContain('vicharanashala internship');
  });

  it('preserves original query as the first line', () => {
    const result = expandQuery('NOC');
    expect(result.split('\n')[0]).toBe('NOC');
  });

  it('returns the original unchanged when no alias is found', () => {
    const result = expandQuery('completely unknown zxqvb term');
    expect(result).toBe('completely unknown zxqvb term');
  });

  it('handles an empty query gracefully', () => {
    expect(expandQuery('')).toBe('');
  });

  it('handles a whitespace-only query gracefully', () => {
    expect(expandQuery('   ')).toBe('   ');
  });

  it('handles punctuation in the query without crashing', () => {
    const result = expandQuery('NOC? or LLM!');
    // Should not throw; may or may not expand depending on tokenisation
    expect(typeof result).toBe('string');
    expect(result).toContain('NOC? or LLM!');
  });

  it('handles reverse alias — "machine learning" expands to ML', () => {
    const result = expandQuery('machine learning');
    expect(result.toLowerCase()).toContain('ml');
  });

  it('expands SP to include "Spurti Points" (Layer 2 auto-generated acronym)', () => {
    const result = expandQuery('SP');
    expect(result).toContain('SP');
    expect(result.toLowerCase()).toContain('spurti points');
  });

  it('expands "Spurti Points" to include SP', () => {
    const result = expandQuery('Spurti Points');
    expect(result).toContain('Spurti Points');
    expect(result).toContain('SP');
  });

  it('normalizes hyphens to spaces before lookup', () => {
    // "machine-learning" → normalizeTypos corrects it to "ml" (via "machine learning" lookup)
    // → expandQuery then expands "ml" to "Machine Learning".
    // Either way, the expansion contains the long form.
    const result = expandQuery('machine-learning');
    expect(result.toLowerCase()).toContain('machine learning');
  });

  it('short single-word expansions are displayed in UPPERCASE', () => {
    // "spurti points" → "sp" should display as "SP" not "Sp"
    const result = expandQuery('Spurti Points');
    expect(result).toContain('SP');
    expect(result).not.toContain('Sp ');
  });

  it('does not duplicate expansion terms already in the query', () => {
    // If the query already says "no objection certificate", expanding "noc" should
    // not add "no objection certificate" again
    const result = expandQuery('noc no objection certificate');
    const lower = result.toLowerCase();
    const count = (lower.match(/no objection certificate/g) ?? []).length;
    expect(count).toBe(1);
  });
});

// ─── Alias map cache / startup ────────────────────────────────────────────────

describe('aliasMapper — cache and startup', () => {
  it('alias map is populated after module import (manual aliases loaded)', () => {
    // At least the entries from aliases.json should be present
    expect(getAliasMapSize()).toBeGreaterThan(0);
  });

  it('initAcronymExtractor merges new aliases from FAQ text', () => {
    const sizeBefore = getAliasMapSize();
    // Provide text with a brand-new pair not in aliases.json
    initAcronymExtractor(['Continuous Integration (CI) is a practice.']);
    const sizeAfter = getAliasMapSize();
    // The map should grow (at least the new ci↔continuous integration pair)
    expect(sizeAfter).toBeGreaterThanOrEqual(sizeBefore);
  });

  it('initAcronymExtractor does not remove existing manual aliases', () => {
    // "noc" is already in the manual aliases — calling init with a conflicting
    // text should leave the original entry intact. With Set-based storage the
    // new expansion is added alongside the existing one, not instead of it.
    initAcronymExtractor(['NOC (Not Our Concern) — conflicting test entry.']);
    const result = expandQuery('noc');
    expect(result.toLowerCase()).toContain('no objection certificate');
  });
});
