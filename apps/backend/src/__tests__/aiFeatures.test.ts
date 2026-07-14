import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkContentToxicity } from '../modules/ai/aiModeration.service.js';
import { preGenerateFaqTranslations } from '../modules/faq/translation.controller.js';

const mockChatWithConfig = vi.fn();
const mockResolveProviderAsync = vi.fn();

vi.mock('../utils/ai/aiProvider.js', () => ({
  resolveProviderAsync: () => mockResolveProviderAsync(),
  chatWithConfig: (...args: any[]) => mockChatWithConfig(...args),
}));

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();

vi.mock('../utils/db/redis.js', () => ({
  default: {
    get: (...args: any[]) => mockRedisGet(...args),
    set: (...args: any[]) => mockRedisSet(...args),
  },
}));

describe('AI/ML Features backend services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkContentToxicity', () => {
    it('should return isToxic: false if AI provider is not configured', async () => {
      mockResolveProviderAsync.mockResolvedValue(null);
      const res = await checkContentToxicity('some content');
      expect(res.isToxic).toBe(false);
    });

    it('should return isToxic: true with reason if model flags content', async () => {
      mockResolveProviderAsync.mockResolvedValue({ apiKey: 'key123' });
      mockChatWithConfig.mockResolvedValue('TOXIC: spam and bad language');

      const res = await checkContentToxicity('bad content');
      expect(res.isToxic).toBe(true);
      expect(res.reason).toBe('spam and bad language');
    });

    it('should return isToxic: false if model classifies as SAFE', async () => {
      mockResolveProviderAsync.mockResolvedValue({ apiKey: 'key123' });
      mockChatWithConfig.mockResolvedValue('SAFE');

      const res = await checkContentToxicity('good content');
      expect(res.isToxic).toBe(false);
    });
  });

  describe('preGenerateFaqTranslations', () => {
    it('should skip if Redis or AI is unconfigured', async () => {
      mockResolveProviderAsync.mockResolvedValue(null);
      await preGenerateFaqTranslations('faqId', 'question', 'answer');
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should translate and cache in Redis for Hindi, Spanish, French, Telugu', async () => {
      mockResolveProviderAsync.mockResolvedValue({ apiKey: 'key123' });
      mockRedisGet.mockResolvedValue(null); // No existing translations in cache
      mockChatWithConfig.mockResolvedValue(JSON.stringify({
        question: 'translated question',
        answer: 'translated answer'
      }));

      await preGenerateFaqTranslations('faq1', 'hello', 'world');
      expect(mockRedisSet).toHaveBeenCalledTimes(4);
      expect(mockRedisSet).toHaveBeenCalledWith('faq:trans:faq1:hi', expect.any(String), 'EX', 30 * 24 * 60 * 60);
    });
  });
});
