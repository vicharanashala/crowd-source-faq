import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { groupSearchResults, type SearchResultItem } from '../search.js';

function makeResult(
  id: string,
  title: string,
  score: number,
  source: SearchResultItem['source'] = 'faq',
): SearchResultItem {
  return {
    _id: new Types.ObjectId(id.padEnd(24, '0')),
    question: title,
    score,
    source,
  };
}

describe('groupSearchResults', () => {
  it('groups identical titles under one primary', () => {
    const r1 = makeResult('000000000000000000000001', 'How to register?', 0.9);
    const r2 = makeResult('000000000000000000000002', 'How to register?', 0.8);
    const r3 = makeResult('000000000000000000000003', 'How to register?', 0.7);

    const grouped = groupSearchResults([r1, r2, r3]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].primary._id).toEqual(r1._id);
    expect(grouped[0].similarCount).toBe(2);
    expect(grouped[0].similar).toHaveLength(2);
  });

  it('groups near-duplicates (slightly different wording)', () => {
    const r1 = makeResult('000000000000000000000001', 'What is Yaksha?', 0.9);
    const r2 = makeResult('000000000000000000000002', 'What is Yaksha', 0.85);

    const grouped = groupSearchResults([r1, r2]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].similarCount).toBe(1);
  });

  it('keeps unrelated results separate', () => {
    const r1 = makeResult('000000000000000000000001', 'How to register?', 0.9);
    const r2 = makeResult('000000000000000000000002', 'Payment methods accepted', 0.8);

    const grouped = groupSearchResults([r1, r2]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].similarCount).toBe(0);
    expect(grouped[1].similarCount).toBe(0);
  });

  it('picks highest-scoring result as primary', () => {
    const r1 = makeResult('000000000000000000000001', 'How to register?', 0.7);
    const r2 = makeResult('000000000000000000000002', 'How to register?', 0.95);

    const grouped = groupSearchResults([r1, r2]);

    expect(grouped).toHaveLength(1);
    // First in the input becomes primary since we iterate in order
    expect(grouped[0].primary._id).toEqual(r1._id);
  });

  it('does not assign a result to multiple groups', () => {
    const r1 = makeResult('000000000000000000000001', 'How to register for Yaksha?', 0.9);
    const r2 = makeResult('000000000000000000000002', 'How to register for Yaksha?', 0.85);
    const r3 = makeResult('000000000000000000000003', 'How to register for Yaksha?', 0.8);

    const grouped = groupSearchResults([r1, r2, r3]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].similarCount).toBe(2);
  });

  it('returns empty array for empty input', () => {
    expect(groupSearchResults([])).toEqual([]);
  });

  it('single result returns one group with no similar', () => {
    const r1 = makeResult('000000000000000000000001', 'How to register?', 0.9);
    const grouped = groupSearchResults([r1]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].similarCount).toBe(0);
  });

  it('respects custom threshold', () => {
    // Titles with one word different: similar but not identical
    const r1 = makeResult('000000000000000000000001', 'How to register for the Yaksha program?', 0.9);
    const r2 = makeResult('000000000000000000000002', 'How to register for the Yaksha programmes?', 0.8);

    // With default threshold (0.75), these should group (similar enough)
    const groupedDefault = groupSearchResults([r1, r2]);
    expect(groupedDefault).toHaveLength(1);

    // With very high threshold (0.99), they should NOT group
    const groupedHigh = groupSearchResults([r1, r2], 0.99);
    expect(groupedHigh).toHaveLength(2);
  });
});
