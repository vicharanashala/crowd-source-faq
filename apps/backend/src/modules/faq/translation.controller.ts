import { Request, Response } from 'express';
import FAQ from './faq.model.js';
import redisClient from '../../utils/db/redis.js';
import { resolveProviderAsync, chatWithConfig } from '../../utils/ai/aiProvider.js';
import { stripAllWrappers } from '../../utils/ai/aiResponseParsers.js';
import { logger } from '../../utils/http/logger.js';

export const translateFaq = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { targetLanguage } = req.body as { targetLanguage?: string };

    if (!targetLanguage?.trim()) {
      res.status(400).json({ message: 'targetLanguage is required.' });
      return;
    }

    const lang = targetLanguage.trim().toLowerCase();
    const redisKey = `faq:trans:${id}:${lang}`;

    // Try Redis cache retrieval first
    if (redisClient) {
      try {
        const cached = await redisClient.get(redisKey);
        if (cached) {
          res.json(JSON.parse(cached));
          return;
        }
      } catch (cacheErr) {
        logger.warn(`[translation] Redis get failed: ${(cacheErr as Error).message}`);
      }
    }

    const faq = await FAQ.findById(id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found.' });
      return;
    }

    const aiConfig = await resolveProviderAsync();
    let translated: { question: string; answer: string };

    if (aiConfig && aiConfig.apiKey) {
      const prompt = `You are a professional localization and translation assistant.
Translate the following FAQ question and answer into the language: "${targetLanguage}".
Ensure the tone remains helpful and the markdown formatting in the answer is completely preserved.

Respond ONLY with a raw JSON object containing these keys:
{
  "question": "Translated Question",
  "answer": "Translated Answer"
}

Do not include any other text or prose.

Question:
${faq.question}

Answer:
${faq.answer}`;

      const response = await chatWithConfig(aiConfig, [
        { role: 'user', content: prompt }
      ]);

      const cleanedJson = stripAllWrappers(response);
      translated = JSON.parse(cleanedJson);
    } else {
      // Basic fallback if AI is not configured
      translated = {
        question: `[Translated to ${targetLanguage}] ${faq.question}`,
        answer: `[Translated to ${targetLanguage}] ${faq.answer}`
      };
    }

    // Save translation response to Redis (30-day TTL)
    if (redisClient) {
      try {
        await redisClient.set(redisKey, JSON.stringify(translated), 'EX', 30 * 24 * 60 * 60);
      } catch (cacheErr) {
        logger.warn(`[translation] Redis set failed: ${(cacheErr as Error).message}`);
      }
    }

    res.json(translated);
  } catch (error) {
    logger.error(`[translation] translateFaq failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Failed to translate FAQ.' });
  }
};

/**
 * Pre-generates FAQ translations for Hindi (hi), Spanish (es), French (fr),
 * and Telugu (te) in the background and caches them in Redis for 30 days.
 */
export async function preGenerateFaqTranslations(
  faqId: string,
  question: string,
  answer: string
): Promise<void> {
  const languages = ['hi', 'es', 'fr', 'te'];
  try {
    const aiConfig = await resolveProviderAsync();
    if (!aiConfig || !aiConfig.apiKey || !redisClient) {
      return;
    }

    // Fire translation tasks for each language sequentially in the background
    for (const lang of languages) {
      const redisKey = `faq:trans:${faqId}:${lang}`;
      
      const existing = await redisClient.get(redisKey).catch(() => null);
      if (existing) continue;

      const prompt = `You are a professional localization and translation assistant.
Translate the following FAQ question and answer into the language code: "${lang}".
Ensure the tone remains helpful and the markdown formatting in the answer is completely preserved.

Respond ONLY with a raw JSON object containing these keys:
{
  "question": "Translated Question",
  "answer": "Translated Answer"
}

Do not include any other text or prose.

Question:
${question}

Answer:
${answer}`;

      const response = await chatWithConfig(aiConfig, [
        { role: 'user', content: prompt }
      ]).catch((err) => {
        logger.warn(`[translation] pre-generate failed for ${lang}: ${err.message}`);
        return null;
      });

      if (!response) continue;

      try {
        const cleanedJson = stripAllWrappers(response);
        const translated = JSON.parse(cleanedJson);
        await redisClient.set(redisKey, JSON.stringify(translated), 'EX', 30 * 24 * 60 * 60);
      } catch (err) {
        logger.warn(`[translation] pre-generate parse/set failed for ${lang}: ${(err as Error).message}`);
      }
    }
  } catch (error) {
    logger.warn(`[translation] preGenerateFaqTranslations failed: ${(error as Error).message}`);
  }
}

