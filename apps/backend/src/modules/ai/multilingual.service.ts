/**
 * multilingual.service.ts
 *
 * Person 3 — Multilingual Layer
 * Unified language detection & translation service for the Yaksha FAQ Portal.
 *
 * Features:
 *   - translateToEnglish(text): Translates non-English questions to English using AiClient.
 *   - translateFromEnglish(text, targetLang): Translates English answers to target language.
 *   - detectLanguage(text): Identifies input text language and returns language info.
 *   - processMultilingualQuery(text): Main pipeline entry point returning { translatedText, detectedLanguage }.
 *   - Full fallback to English on any failure or unsupported language.
 */

import AiClient from './ai-client.service.js';
import { logger } from '../../utils/http/logger.js';

export interface LanguageDetectionResult {
  language: string;
  isEnglish: boolean;
  confidence: number;
}

export interface MultilingualProcessResult {
  translatedText: string;
  detectedLanguage: string;
  isEnglish: boolean;
}

/** Lazy singleton for AiClient */
let aiClientInstance: AiClient | null = null;

function getAiClient(): AiClient {
  if (!aiClientInstance) {
    aiClientInstance = new AiClient();
  }
  return aiClientInstance;
}

/**
 * Detect language of the input text using AiClient.
 * Safe fallback to English ('en') on any error.
 */
export async function detectLanguage(text: unknown): Promise<LanguageDetectionResult> {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input || input.length < 3) {
    return { language: 'en', isEnglish: true, confidence: 1.0 };
  }

  try {
    const client = getAiClient();
    const systemPrompt = `You are a fast, precise language identifier.
Analyze the user's text and identify the language.
Output ONLY a valid JSON object with keys:
  "language": string (language name or ISO code, e.g. "hi", "es", "fr", "te", "en"),
  "isEnglish": boolean (true if the text is primarily in English, false otherwise),
  "confidence": number (between 0.0 and 1.0).`;

    const result = await client.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input.slice(0, 1000) },
      ],
      'translation',
      { temperature: 0.1, maxTokens: 128 }
    );

    const clean = result.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      return { language: 'en', isEnglish: true, confidence: 1.0 };
    }

    const parsed = JSON.parse(match[0]) as Partial<LanguageDetectionResult>;
    const language = (parsed.language ?? 'en').toLowerCase().trim();
    const isEnglish = parsed.isEnglish ?? (language === 'en' || language === 'english');
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.8));

    return { language, isEnglish, confidence };
  } catch (err) {
    logger.warn(`[multilingual] detectLanguage failed, falling back to English: ${(err as Error).message}`);
    return { language: 'en', isEnglish: true, confidence: 1.0 };
  }
}

/**
 * Translate non-English text to English.
 * Returns original text if already English or if translation fails.
 */
export async function translateToEnglish(
  text: unknown,
  existingDetection?: LanguageDetectionResult
): Promise<string> {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input) return '';

  try {
    const detection = existingDetection ?? (await detectLanguage(input));
    if (detection.isEnglish) {
      return input;
    }

    const client = getAiClient();
    const systemPrompt = `You are a professional translator for an educational & internship FAQ portal.
Translate the input text into clear, fluent English.
Preserve technical terms, proper nouns, and original formatting.
Output ONLY the English translation without any quotes or explanations.`;

    const result = await client.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ],
      'translation',
      { temperature: 0.2, maxTokens: 1024 }
    );

    const translated = result.content.trim();
    return translated.length > 0 ? translated : input;
  } catch (err) {
    logger.warn(`[multilingual] translateToEnglish failed, falling back to original: ${(err as Error).message}`);
    return input;
  }
}

/**
 * Translate English text into target language.
 * Returns original text if target language is English ('en') or if translation fails.
 */
export async function translateFromEnglish(text: unknown, targetLang: string): Promise<string> {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input || !targetLang) return input;

  const normalizedLang = targetLang.toLowerCase().trim();
  if (normalizedLang === 'en' || normalizedLang === 'english') {
    return input;
  }

  try {
    const client = getAiClient();
    const systemPrompt = `You are a professional translator for an educational & internship FAQ portal.
Translate the following English text accurately into target language: "${targetLang}".
Maintain a helpful, friendly, and clear tone.
Output ONLY the translated text without disclaimers, quotes, or explanations.`;

    const result = await client.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ],
      'translation',
      { temperature: 0.3, maxTokens: 1536 }
    );

    const translated = result.content.trim();
    return translated.length > 0 ? translated : input;
  } catch (err) {
    logger.warn(`[multilingual] translateFromEnglish failed, falling back to original English: ${(err as Error).message}`);
    return input;
  }
}

/**
 * Full multilingual processing pipeline for incoming questions.
 * Specification output format: { translatedText, detectedLanguage, isEnglish }
 */
export async function processMultilingualQuery(text: unknown): Promise<MultilingualProcessResult> {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input) {
    return { translatedText: '', detectedLanguage: 'en', isEnglish: true };
  }

  try {
    const detection = await detectLanguage(input);
    if (detection.isEnglish) {
      return {
        translatedText: input,
        detectedLanguage: detection.language || 'en',
        isEnglish: true,
      };
    }

    const translatedText = await translateToEnglish(input, detection);
    return {
      translatedText,
      detectedLanguage: detection.language,
      isEnglish: false,
    };
  } catch (err) {
    logger.warn(`[multilingual] processMultilingualQuery failed: ${(err as Error).message}`);
    return {
      translatedText: input,
      detectedLanguage: 'en',
      isEnglish: true,
    };
  }
}
