import { describe, it, expect } from 'vitest';
import { computeConfidence, buildExplainability, emptyExplainability, summarizeRetrieval } from '../explainability.js';
import type { ProviderConfig } from '../aiProvider.js';

const mockProvider: ProviderConfig = {
  provider: 'openai',
  apiKey: 'sk-test',
  baseURL: 'https://api.openai.com/v1',
  modelName: 'gpt-4o',
  authHeader: 'Authorization',
  needsAnthropicVersion: false,
};

describe('computeConfidence', () => {
  it('returns 0 for all-zero input', () => {
    expect(computeConfidence({
      documentsRetrieved: 0, documentsUsed: 0, vectorScore: 0, keywordScore: 0,
    })).toBe(0);
  });

  it('returns near 1 for perfect input', () => {
    expect(computeConfidence({
      documentsRetrieved: 5, documentsUsed: 5, vectorScore: 1, keywordScore: 1,
    })).toBeCloseTo(1, 4);
  });

  it('clamps negative values to 0', () => {
    expect(computeConfidence({
      documentsRetrieved: -1, documentsUsed: -1, vectorScore: -0.5, keywordScore: -0.3,
    })).toBe(0);
  });

  it('retrievalCoverage is capped at 5 documents', () => {
    const r = computeConfidence({
      documentsRetrieved: 5, documentsUsed: 5, vectorScore: 0, keywordScore: 0,
    });
    // confidence = 0.45*0 + 0.25*0 + 0.20*1 + 0.10*1 = 0.30
    expect(r).toBeCloseTo(0.30, 4);
  });

  it('handles NaN gracefully', () => {
    expect(computeConfidence({
      documentsRetrieved: NaN, documentsUsed: NaN, vectorScore: NaN, keywordScore: NaN,
    })).toBe(0);
  });
});

describe('buildExplainability', () => {
  it('produces the expected shape with modelName', () => {
    const now = new Date('2026-07-10T12:00:00Z');
    const result = buildExplainability(mockProvider, 1234, {
      documentsRetrieved: 10, documentsUsed: 4, vectorScore: 0.85, keywordScore: 0.5,
    }, now);

    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4o');
    expect(result.modelName).toBe('gpt-4o');
    expect(result.latencyMs).toBe(1234);
    expect(result.documentsRetrieved).toBe(10);
    expect(result.documentsUsed).toBe(4);
    expect(result.vectorScore).toBe(0.85);
    expect(result.generatedAt).toEqual(now);
  });

  it('defaults to now when date omitted', () => {
    const result = buildExplainability(mockProvider, 100, {
      documentsRetrieved: 3, documentsUsed: 3, vectorScore: 0.5, keywordScore: 0.5,
    });
    expect(result.generatedAt.getTime()).toBeGreaterThan(0);
  });
});

describe('emptyExplainability', () => {
  it('returns zeroed sentinel with _reason', () => {
    const e = emptyExplainability('provider_error');
    expect(e.confidence).toBe(0);
    expect(e.provider).toBe('unknown');
    expect(e.model).toBe('unknown');
    expect(e.modelName).toBe('unknown');
    expect(e.documentsRetrieved).toBe(0);
    expect((e as unknown as { _reason: string })._reason).toBe('provider_error');
  });

  it('accepts overrides', () => {
    const e = emptyExplainability('no_retrieval', { latencyMs: 500, documentsRetrieved: 3 });
    expect(e.latencyMs).toBe(500);
    expect(e.documentsRetrieved).toBe(3);
    expect(e.confidence).toBe(0);
  });
});

describe('summarizeRetrieval', () => {
  it('returns zeros for null input', () => {
    const s = summarizeRetrieval(null);
    expect(s.documentsRetrieved).toBe(0);
    expect(s.documentsUsed).toBe(0);
    expect(s.vectorScore).toBe(0);
  });

  it('computes max score from hits', () => {
    const s = summarizeRetrieval([{ score: 0.3 }, { score: 0.9 }, { }]);
    expect(s.documentsRetrieved).toBe(3);
    expect(s.documentsUsed).toBe(3);
    expect(s.vectorScore).toBe(0.9);
  });

  it('caps documentsUsed to 5', () => {
    const s = summarizeRetrieval(Array.from({ length: 20 }, () => ({ score: 0.5 })));
    expect(s.documentsRetrieved).toBe(20);
    expect(s.documentsUsed).toBe(5);
  });

  it('uses fallbackKeywordScore when provided', () => {
    const s = summarizeRetrieval([], 0.75);
    expect(s.keywordScore).toBe(0.75);
  });
});
