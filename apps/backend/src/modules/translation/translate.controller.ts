import { Request, Response } from 'express';
import crypto from 'node:crypto';
import z from 'zod';
import TranslationCache from './translation-cache.model.js';
import { generateChatCompletion } from '../ai/ai-client.service.js';
import { httpLog } from '../../utils/http/logger.js';

const translateSchema = z.object({
  text: z.string().min(1).max(5000),
  targetLang: z.string().min(2).max(10),
  sourceLang: z.string().optional().default('en'),
});

const batchTranslateSchema = z.object({
  texts: z.array(z.string().min(1).max(5000)).min(1).max(50),
  targetLang: z.string().min(2).max(10),
  sourceLang: z.string().optional().default('en'),
});

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  kn: 'Kannada',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  bn: 'Bengali',
};

function getHash(targetLang: string, text: string): string {
  return crypto.createHash('sha256').update(`${targetLang.toLowerCase().trim()}:${text.trim()}`).digest('hex');
}

/**
 * Translate a single text string
 */
async function performTranslation(text: string, targetLang: string, sourceLang = 'en'): Promise<{ translatedText: string; provider: string }> {
  // 1. If target is same as source (e.g. en -> en), return original
  if (targetLang.toLowerCase() === sourceLang.toLowerCase()) {
    return { translatedText: text, provider: 'identity' };
  }

  const langName = LANGUAGE_NAMES[targetLang.toLowerCase()] || targetLang;

  // 2. Attempt translation via AI Client Service
  try {
    const prompt = `Translate the following text accurately into ${langName} (${targetLang}). Provide ONLY the translated text without any explanation, intro, quotes, or notes.\n\nText:\n${text}`;
    const result = await generateChatCompletion([
      { role: 'system', content: `You are a professional, accurate translator translating content into ${langName}.` },
      { role: 'user', content: prompt }
    ], { temperature: 0.1, maxTokens: 1000 });

    if (result && result.text && result.text.trim()) {
      return { translatedText: result.text.trim(), provider: result.provider || 'ai-service' };
    }
  } catch (err) {
    httpLog.info(`[Translate] AI translation failed, switching to public fallback API: ${(err as Error).message}`);
  }

  // 3. Fallback: Free translation API (MyMemory)
  try {
    const langpair = `${sourceLang}|${targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${langpair}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json() as { responseData?: { translatedText?: string } };
      if (data?.responseData?.translatedText) {
        return { translatedText: data.responseData.translatedText, provider: 'mymemory-fallback' };
      }
    }
  } catch (err) {
    httpLog.alert(`[Translate] Fallback translation API error: ${(err as Error).message}`);
  }

  // 4. Ultimate fallback if all APIs are unavailable
  return { translatedText: text, provider: 'fallback-raw' };
}

/**
 * POST /csfaq/api/translate
 */
export async function translateTextHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = translateSchema.parse(req.body);
    const { text, targetLang, sourceLang } = parsed;

    if (targetLang.toLowerCase() === sourceLang.toLowerCase()) {
      res.json({ translatedText: text, targetLang, cached: true });
      return;
    }

    const hash = getHash(targetLang, text);
    const cached = await TranslationCache.findOne({ hash });

    if (cached) {
      res.json({
        translatedText: cached.translatedText,
        targetLang: cached.targetLang,
        cached: true,
        provider: cached.provider,
      });
      return;
    }

    const { translatedText, provider } = await performTranslation(text, targetLang, sourceLang);

    // Cache the result
    await TranslationCache.create({
      hash,
      sourceText: text,
      targetLang,
      translatedText,
      provider,
    }).catch((err) => httpLog.info(`[Translate] Cache write skipped: ${(err as Error).message}`));

    res.json({
      translatedText,
      targetLang,
      cached: false,
      provider,
    });
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: 'Translation request failed', message: err.message });
  }
}

/**
 * POST /csfaq/api/translate/batch
 */
export async function batchTranslateHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = batchTranslateSchema.parse(req.body);
    const { texts, targetLang, sourceLang } = parsed;

    if (targetLang.toLowerCase() === sourceLang.toLowerCase()) {
      res.json({ translations: texts, targetLang });
      return;
    }

    const results: string[] = [];

    for (const text of texts) {
      const hash = getHash(targetLang, text);
      const cached = await TranslationCache.findOne({ hash });

      if (cached) {
        results.push(cached.translatedText);
      } else {
        const { translatedText, provider } = await performTranslation(text, targetLang, sourceLang);
        await TranslationCache.create({
          hash,
          sourceText: text,
          targetLang,
          translatedText,
          provider,
        }).catch(() => null);
        results.push(translatedText);
      }
    }

    res.json({
      translations: results,
      targetLang,
    });
  } catch (error) {
    const err = error as Error;
    res.status(400).json({ error: 'Batch translation request failed', message: err.message });
  }
}
