import { describe, it, expect } from 'vitest';
import {
  faqToCitation,
  communityToCitation,
  knowledgeToCitation,
  finalizeCitations,
  buildCitations,
  citationIcon,
} from '../citations.js';

describe('faqToCitation', () => {
  it('returns null for missing _id', () => {
    expect(faqToCitation({})).toBeNull();
  });

  it('produces FAQ citation with url', () => {
    const c = faqToCitation({ _id: 'abc123', question: 'Test?', answer: 'Answer.', score: 0.85 });
    expect(c).not.toBeNull();
    expect(c!.sourceType).toBe('FAQ');
    expect(c!.title).toBe('Test?');
    expect(c!.similarity).toBe(0.85);
    expect(c!.url).toBe('/faq/abc123');
    expect(c!.provenance).toBe('from FAQ');
  });

  it('truncates title to 200 chars', () => {
    const long = 'A'.repeat(300);
    const c = faqToCitation({ _id: 'x', question: long });
    expect(c!.title.length).toBe(200);
  });
});

describe('communityToCitation', () => {
  it('returns null for missing _id', () => {
    expect(communityToCitation({})).toBeNull();
  });

  it('produces KnowledgeBase citation with url', () => {
    const c = communityToCitation({ _id: 'def456', title: 'My Post', body: 'Body text', score: 0.72 });
    expect(c).not.toBeNull();
    expect(c!.sourceType).toBe('KnowledgeBase');
    expect(c!.url).toBe('/community?post=def456');
    expect(c!.similarity).toBe(0.72);
  });

  it('prefers answer over body for snippet', () => {
    const c = communityToCitation({ _id: 'x', title: 'T', answer: 'Answer', body: 'Body' });
    expect(c!.snippet).toContain('Answer');
  });
});

describe('knowledgeToCitation', () => {
  it('returns null for missing _id', () => {
    expect(knowledgeToCitation({})).toBeNull();
  });

  it('detects Zoom source', () => {
    const c = knowledgeToCitation({ _id: 'z1', question: 'Q', source: 'zoom', meetingId: 'm1', score: 0.9 });
    expect(c!.sourceType).toBe('Zoom');
    expect(c!.provenance).toBe('from Zoom meeting');
  });

  it('detects Document source', () => {
    const c = knowledgeToCitation({ _id: 'd1', question: 'Q', sourceType: 'pdf', score: 0.6 });
    expect(c!.sourceType).toBe('Document');
    expect(c!.provenance).toBe('from document');
  });

  it('passes through url and page', () => {
    const c = knowledgeToCitation({ _id: 'k1', url: 'https://example.com', page: 42, score: 0.5 });
    expect(c!.url).toBe('https://example.com');
    expect(c!.page).toBe(42);
  });
});

describe('finalizeCitations', () => {
  it('removes null/undefined entries', () => {
    const result = finalizeCitations([null, undefined, { id: '1', title: 'A', similarity: 0.5, sourceType: 'FAQ' } as any]);
    expect(result).toHaveLength(1);
  });

  it('deduplicates by sourceType + title', () => {
    const result = finalizeCitations([
      { id: '1', title: 'Foo', similarity: 0.9, sourceType: 'FAQ' } as any,
      { id: '2', title: 'Foo', similarity: 0.8, sourceType: 'FAQ' } as any,
      { id: '3', title: 'Bar', similarity: 0.7, sourceType: 'FAQ' } as any,
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1'); // higher similarity kept
  });

  it('sorts by similarity descending', () => {
    const result = finalizeCitations([
      { id: '1', title: 'A', similarity: 0.3, sourceType: 'FAQ' } as any,
      { id: '2', title: 'B', similarity: 0.9, sourceType: 'FAQ' } as any,
    ]);
    expect(result[0].id).toBe('2');
  });

  it('respects maxCitations', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), title: `Item ${i}`, similarity: 1 - i * 0.01, sourceType: 'FAQ',
    } as any));
    expect(finalizeCitations(items, 3)).toHaveLength(3);
  });

  it('returns at least 1 even with maxCitations=0', () => {
    const items = [{ id: '1', title: 'A', similarity: 0.5, sourceType: 'FAQ' } as any];
    expect(finalizeCitations(items, 0)).toHaveLength(1);
  });
});

describe('buildCitations', () => {
  it('runs all three converters and deduplicates', () => {
    const faq = [{ _id: 'f1', question: 'Q1', score: 0.9 }];
    const community = [{ _id: 'c1', title: 'C1', score: 0.8 }];
    const kb = [{ _id: 'k1', question: 'K1', score: 0.7 }];
    const result = buildCitations(faq, community, kb);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.every((c) => c.id)).toBe(true);
  });

  it('handles null arrays gracefully', () => {
    const result = buildCitations(null, null, null);
    expect(result).toEqual([]);
  });
});

describe('citationIcon', () => {
  it('returns correct icon per type', () => {
    expect(citationIcon('FAQ')).toBe('❓');
    expect(citationIcon('Zoom')).toBe('🎥');
    expect(citationIcon('KnowledgeBase')).toBe('📚');
    expect(citationIcon('Document')).toBe('📄');
  });
});
