import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateQueryToEnglish, translateResultsToLanguage } from '../utils/ai/translation.js';
import * as aiProvider from '../utils/ai/aiProvider.js';

vi.mock('../utils/ai/aiProvider.js', () => {
  return {
    hasAIKeyAsync: vi.fn(),
    resolveProviderAsync: vi.fn(),
    chatWithProvider: vi.fn(),
  };
});

describe('translation utility tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('translateQueryToEnglish', () => {
    it('returns original query if AI key is missing', async () => {
      vi.mocked(aiProvider.hasAIKeyAsync).mockResolvedValue(false);

      const res = await translateQueryToEnglish('¿Qué es el Yaksha?');
      expect(res.translatedQuery).toBe('¿Qué es el Yaksha?');
      expect(res.isTranslated).toBe(false);
      expect(res.detectedLanguage).toBe('English');
      expect(aiProvider.chatWithProvider).not.toHaveBeenCalled();
    });

    it('translates non-English query to English when AI is configured', async () => {
      vi.mocked(aiProvider.hasAIKeyAsync).mockResolvedValue(true);
      vi.mocked(aiProvider.resolveProviderAsync).mockResolvedValue({
        provider: 'openai',
        apiKey: 'fake-key',
        baseURL: 'https://api.openai.com/v1',
        modelName: 'gpt-4o-mini',
        authHeader: 'Authorization',
        needsAnthropicVersion: false,
      });
      vi.mocked(aiProvider.chatWithProvider).mockResolvedValue(`
        {
          "translatedQuery": "What is Yaksha?",
          "isTranslated": true,
          "detectedLanguage": "Spanish"
        }
      `);

      const res = await translateQueryToEnglish('¿Qué es el Yaksha?');
      expect(res.translatedQuery).toBe('What is Yaksha?');
      expect(res.isTranslated).toBe(true);
      expect(res.detectedLanguage).toBe('Spanish');
      expect(aiProvider.chatWithProvider).toHaveBeenCalled();
    });

    it('falls back gracefully to original query on parsing/network error', async () => {
      vi.mocked(aiProvider.hasAIKeyAsync).mockResolvedValue(true);
      vi.mocked(aiProvider.resolveProviderAsync).mockResolvedValue({
        provider: 'openai',
        apiKey: 'fake-key',
        baseURL: 'https://api.openai.com/v1',
        modelName: 'gpt-4o-mini',
        authHeader: 'Authorization',
        needsAnthropicVersion: false,
      });
      vi.mocked(aiProvider.chatWithProvider).mockRejectedValue(new Error('API failure'));

      const res = await translateQueryToEnglish('¿Qué es el Yaksha?');
      expect(res.translatedQuery).toBe('¿Qué es el Yaksha?');
      expect(res.isTranslated).toBe(false);
      expect(res.detectedLanguage).toBe('English');
    });
  });

  describe('translateResultsToLanguage', () => {
    const originalResults = [
      {
        _id: '60c72b2f9b1d8a0015f8e57d',
        question: 'What is the Yaksha research internship?',
        answer: 'Yaksha is a two-month research internship program.',
        source: 'faq' as const,
      },
    ];

    it('returns original results if target language is English', async () => {
      const res = await translateResultsToLanguage(originalResults, 'English');
      expect(res).toEqual(originalResults);
      expect(aiProvider.chatWithProvider).not.toHaveBeenCalled();
    });

    it('returns original results if AI key is missing', async () => {
      vi.mocked(aiProvider.hasAIKeyAsync).mockResolvedValue(false);

      const res = await translateResultsToLanguage(originalResults, 'Spanish');
      expect(res).toEqual(originalResults);
      expect(aiProvider.chatWithProvider).not.toHaveBeenCalled();
    });

    it('translates fields of search results when target language is Spanish', async () => {
      vi.mocked(aiProvider.hasAIKeyAsync).mockResolvedValue(true);
      vi.mocked(aiProvider.resolveProviderAsync).mockResolvedValue({
        provider: 'openai',
        apiKey: 'fake-key',
        baseURL: 'https://api.openai.com/v1',
        modelName: 'gpt-4o-mini',
        authHeader: 'Authorization',
        needsAnthropicVersion: false,
      });
      vi.mocked(aiProvider.chatWithProvider).mockResolvedValue(`
        [
          {
            "_id": "60c72b2f9b1d8a0015f8e57d",
            "question": "¿Qué es la pasantía de investigación Yaksha?",
            "answer": "Yaksha es un programa de pasantías de investigación de dos meses.",
            "title": "",
            "body": ""
          }
        ]
      `);

      const res = await translateResultsToLanguage(originalResults, 'Spanish');
      expect(res[0].question).toBe('¿Qué es la pasantía de investigación Yaksha?');
      expect(res[0].answer).toBe('Yaksha es un programa de pasantías de investigación de dos meses.');
      expect(res[0].isTranslated).toBe(true);
      expect(res[0].detectedLanguage).toBe('Spanish');
      expect(aiProvider.chatWithProvider).toHaveBeenCalled();
    });

    it('falls back gracefully to original results on LLM error', async () => {
      vi.mocked(aiProvider.hasAIKeyAsync).mockResolvedValue(true);
      vi.mocked(aiProvider.resolveProviderAsync).mockResolvedValue({
        provider: 'openai',
        apiKey: 'fake-key',
        baseURL: 'https://api.openai.com/v1',
        modelName: 'gpt-4o-mini',
        authHeader: 'Authorization',
        needsAnthropicVersion: false,
      });
      vi.mocked(aiProvider.chatWithProvider).mockRejectedValue(new Error('Batch API Failure'));

      const res = await translateResultsToLanguage(originalResults, 'Spanish');
      expect(res).toEqual(originalResults);
    });
  });
});
