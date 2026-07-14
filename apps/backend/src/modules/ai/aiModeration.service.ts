import { resolveProviderAsync, chatWithConfig } from '../../utils/ai/aiProvider.js';
import { logger } from '../../utils/http/logger.js';

/**
 * Checks if a block of text is toxic, spam, or abusive using the active AI provider.
 * Returns { isToxic: true, reason } if flagged, else { isToxic: false }.
 * Fail-safes to { isToxic: false } if the provider is unconfigured or errors.
 */
export async function checkContentToxicity(text: string): Promise<{ isToxic: boolean; reason?: string }> {
  try {
    const aiConfig = await resolveProviderAsync();
    if (!aiConfig || !aiConfig.apiKey) {
      return { isToxic: false };
    }

    const systemPrompt = `You are an automated content moderation agent for a student Q&A forum.
Your task is to classify if the following submission contains:
- Severe profanity, hate speech, cyberbullying, or harassment.
- Heavy advertising spam, promotional spam, or scam links.
- Nonsensical gibberish intended to flood the database.

Submission text:
"""
${text}
"""

Instructions:
Evaluate the text. Respond with exactly one of these two formats:
1. SAFE - if the text is safe and appropriate for a student forum.
2. TOXIC: <brief reason> - if the text violates the rules.

Do not include any other markdown, introductory, or concluding sentences.`;

    const response = await chatWithConfig(aiConfig, [
      { role: 'user', content: systemPrompt }
    ]);

    const result = response.trim();
    if (result.toUpperCase().startsWith('TOXIC')) {
      const parts = result.split(':');
      const reason = parts.slice(1).join(':').trim() || 'AI Moderation Flag';
      return { isToxic: true, reason };
    }

    return { isToxic: false };
  } catch (error) {
    logger.warn(`[ai-moderation] checkContentToxicity failed: ${(error as Error).message}`);
    return { isToxic: false };
  }
}
