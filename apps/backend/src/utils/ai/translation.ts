import { chatWithProvider, resolveProviderAsync, hasAIKeyAsync } from './aiProvider.js';
import { stripAllWrappers, extractJsonSubstring } from './aiResponseParsers.js';
import { logger } from '../http/logger.js';

export interface TranslateQueryResponse {
  translatedQuery: string;
  isTranslated: boolean;
  detectedLanguage: string;
}

export interface SearchResultItemToTranslate {
  _id: any;
  question?: string;
  title?: string;
  answer?: string;
  body?: string;
  [key: string]: any;
}

function extractJsonArrayOrObject(s: string): string {
  const startArray = s.indexOf('[');
  const startObject = s.indexOf('{');

  if (startArray !== -1 && (startObject === -1 || startArray < startObject)) {
    const endArray = s.lastIndexOf(']');
    if (endArray !== -1) {
      return s.slice(startArray, endArray + 1);
    }
  }

  if (startObject !== -1) {
    const endObject = s.lastIndexOf('}');
    if (endObject !== -1) {
      return s.slice(startObject, endObject + 1);
    }
  }

  return s;
}

/**
 * Detect language of query and translate to English if not English.
 */
export async function translateQueryToEnglish(
  query: string,
  batchId?: string | null
): Promise<TranslateQueryResponse> {
  const defaultResponse = { translatedQuery: query, isTranslated: false, detectedLanguage: 'English' };

  try {
    const hasKey = await hasAIKeyAsync();
    if (!hasKey) {
      return defaultResponse;
    }

    const config = await resolveProviderAsync();
    if (!config || !config.apiKey) {
      return defaultResponse;
    }

    const systemPrompt = `You are a translation assistant.
Analyze the user query: "${query}"
If the query is already in English, return it exactly as is, set "isTranslated" to false, and "detectedLanguage" to "English".
If the query is in another language, translate it to English, set "isTranslated" to true, and "detectedLanguage" to the name of the language (e.g. "Spanish", "French", "Hindi", "Japanese").
Respond ONLY with a JSON object in this format:
{
  "translatedQuery": "the English query",
  "isTranslated": true,
  "detectedLanguage": "Spanish"
}
Do NOT include markdown fences, preamble, or any explanation. Return ONLY the JSON object.`;

    const userPrompt = `Translate the query: "${query}"`;

    const messages = config.needsAnthropicVersion
      ? [{ role: 'user' as const, content: systemPrompt + '\n\n' + userPrompt }]
      : [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userPrompt },
        ];

    // Use low temperature for deterministic translation
    const responseText = await chatWithProvider(config.provider, messages, config.modelName, 'autoTranslation');
    if (!responseText) {
      return defaultResponse;
    }

    const stripped = stripAllWrappers(responseText);
    const jsonStr = extractJsonArrayOrObject(stripped);
    const parsed = JSON.parse(jsonStr) as TranslateQueryResponse;

    return {
      translatedQuery: (parsed.translatedQuery || query).trim(),
      isTranslated: !!parsed.isTranslated,
      detectedLanguage: parsed.detectedLanguage || 'English',
    };
  } catch (err) {
    logger.warn(`[translation] Failed to translate query '${query}': ${(err as Error).message}`);
    return defaultResponse;
  }
}

/**
 * Translate search results back to the detected native language.
 */
export async function translateResultsToLanguage(
  results: SearchResultItemToTranslate[],
  targetLanguage: string,
  batchId?: string | null
): Promise<SearchResultItemToTranslate[]> {
  if (results.length === 0 || !targetLanguage || targetLanguage.toLowerCase() === 'english') {
    return results;
  }

  try {
    const hasKey = await hasAIKeyAsync();
    if (!hasKey) {
      return results;
    }

    const config = await resolveProviderAsync();
    if (!config || !config.apiKey) {
      return results;
    }

    // Only extract translatable fields to keep tokens low: _id, question, title, answer, body
    const itemsToTranslate = results.map(r => ({
      _id: String(r._id),
      question: r.question || '',
      title: r.title || '',
      answer: r.answer || '',
      body: r.body || '',
    }));

    const systemPrompt = `You are a professional translation assistant.
Translate all text fields (question, title, answer, body) in the provided JSON array of search results into ${targetLanguage}.
Keep all HTML, markdown formatting, code blocks, technical terms, and placeholders intact.
Do NOT translate or modify the "_id" field under any circumstances; keep it exactly as is.
Respond ONLY with a JSON array of objects containing the translated fields and the original "_id".
Do NOT include markdown fences, preamble, or any explanation. Return ONLY the JSON array.`;

    const userPrompt = JSON.stringify(itemsToTranslate);

    const messages = config.needsAnthropicVersion
      ? [{ role: 'user' as const, content: systemPrompt + '\n\n' + userPrompt }]
      : [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userPrompt },
        ];

    const responseText = await chatWithProvider(config.provider, messages, config.modelName, 'autoTranslation');
    if (!responseText) {
      return results;
    }

    const stripped = stripAllWrappers(responseText);
    const jsonStr = extractJsonArrayOrObject(stripped);
    const translatedItems = JSON.parse(jsonStr) as Array<{
      _id: string;
      question?: string;
      title?: string;
      answer?: string;
      body?: string;
    }>;

    if (!Array.isArray(translatedItems)) {
      throw new Error('LLM response is not a JSON array');
    }

    // Map translated content back to original results array
    const translatedMap = new Map(translatedItems.map(item => [item._id, item]));

    return results.map(r => {
      const translated = translatedMap.get(String(r._id));
      if (!translated) return r;
      return {
        ...r,
        question: translated.question || r.question,
        title: translated.title || r.title,
        answer: translated.answer || r.answer,
        body: translated.body || r.body,
        isTranslated: true,
        detectedLanguage: targetLanguage,
      };
    });
  } catch (err) {
    logger.warn(`[translation] Failed to translate results to ${targetLanguage}: ${(err as Error).message}`);
    return results;
  }
}
