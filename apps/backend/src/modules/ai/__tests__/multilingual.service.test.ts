import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectLanguage,
  translateToEnglish,
  translateFromEnglish,
  processMultilingualQuery,
} from '../multilingual.service.js';

const mockChat = vi.fn();

vi.mock('../ai-client.service.js', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: (...args: unknown[]) => mockChat(...args),
    })),
  };
});

describe('Multilingual Service (Person 3)', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  describe('detectLanguage', () => {
    it('returns English immediately for short/empty text', async () => {
      const res = await detectLanguage('');
      expect(res).toEqual({ language: 'en', isEnglish: true, confidence: 1.0 });
    });

    it('detects Hindi correctly from LLM response', async () => {
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ language: 'hi', isEnglish: false, confidence: 0.95 }),
      });

      const res = await detectLanguage('ऑफर लेटर कब मिलेगा?');
      expect(res.language).toBe('hi');
      expect(res.isEnglish).toBe(false);
      expect(res.confidence).toBe(0.95);
    });

    it('falls back to English when LLM throws an error', async () => {
      mockChat.mockRejectedValueOnce(new Error('AI API rate limit'));
      const res = await detectLanguage('¿Dónde está mi certificado?');
      expect(res).toEqual({ language: 'en', isEnglish: true, confidence: 1.0 });
    });
  });

  describe('translateToEnglish', () => {
    it('returns input unchanged if already English', async () => {
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ language: 'en', isEnglish: true, confidence: 0.99 }),
      });

      const text = 'When will I receive my offer letter?';
      const res = await translateToEnglish(text);
      expect(res).toBe(text);
    });

    it('translates Hindi question to English', async () => {
      // detectLanguage mock response
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ language: 'hi', isEnglish: false, confidence: 0.95 }),
      });
      // translateToEnglish mock response
      mockChat.mockResolvedValueOnce({
        content: 'When will I get the offer letter?',
      });

      const res = await translateToEnglish('ऑफर लेटर कब मिलेगा?');
      expect(res).toBe('When will I get the offer letter?');
    });

    it('falls back to original text on failure', async () => {
      mockChat.mockRejectedValueOnce(new Error('Network error'));
      const res = await translateToEnglish('कॉल कब होगी?');
      expect(res).toBe('कॉल कब होगी?');
    });
  });

  describe('translateFromEnglish', () => {
    it('returns text unchanged if targetLang is English', async () => {
      const res = await translateFromEnglish('Hello world', 'en');
      expect(res).toBe('Hello world');
    });

    it('translates English text to Spanish', async () => {
      mockChat.mockResolvedValueOnce({
        content: 'Hola mundo, tu carta de oferta está lista.',
      });

      const res = await translateFromEnglish('Hello world, your offer letter is ready.', 'es');
      expect(res).toBe('Hola mundo, tu carta de oferta está lista.');
    });

    it('falls back to original English on error', async () => {
      mockChat.mockRejectedValueOnce(new Error('Translation failed'));
      const res = await translateFromEnglish('Your certificate is approved.', 'hi');
      expect(res).toBe('Your certificate is approved.');
    });
  });

  describe('processMultilingualQuery', () => {
    it('returns output format { translatedText, detectedLanguage, isEnglish } for English query', async () => {
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ language: 'en', isEnglish: true, confidence: 1.0 }),
      });

      const res = await processMultilingualQuery('How to reset my password?');
      expect(res).toEqual({
        translatedText: 'How to reset my password?',
        detectedLanguage: 'en',
        isEnglish: true,
      });
    });

    it('returns output format { translatedText, detectedLanguage, isEnglish } for non-English query', async () => {
      // detectLanguage
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({ language: 'hi', isEnglish: false, confidence: 0.98 }),
      });
      // translateToEnglish
      mockChat.mockResolvedValueOnce({
        content: 'How to download the internship certificate?',
      });

      const res = await processMultilingualQuery('इंटरनशिप सर्टिफिकेट कैसे डाउनलोड करें?');
      expect(res).toEqual({
        translatedText: 'How to download the internship certificate?',
        detectedLanguage: 'hi',
        isEnglish: false,
      });
    });
  });
});
