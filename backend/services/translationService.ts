import { Types } from 'mongoose';
import { getPipelineProviderConfig, chatWithConfig, hasAIKeyAsync } from '../utils/ai/aiProvider.js';
import { logger } from '../utils/http/logger.js';
import FAQ from '../models/FAQ.js';
import CommunityPost from '../models/CommunityPost.js';

export const translateText = async (text: string, targetLang: 'Hindi' | 'English'): Promise<string> => {
  if (!text || !text.trim()) return '';
  
  try {
    const hasKey = await hasAIKeyAsync();
    if (!hasKey) {
      logger.warn(`[translationService] No AI key configured. Falling back to original text.`);
      return text;
    }

    const config = await getPipelineProviderConfig('auto_answer');
    if (!config || !config.apiKey) {
      logger.warn(`[translationService] Resolved provider configuration has no api key. Falling back to original text.`);
      return text;
    }

    const systemPrompt = `You are an expert translator. Translate the given text to ${targetLang}. Only return the direct translation. Do not include any explanations, side notes, or extra conversational text. Preserve the original formatting, lists, linebreaks, and code blocks exactly as they are.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ];

    const translated = await chatWithConfig(config, messages);
    return translated.trim() || text;
  } catch (error) {
    logger.error(`[translationService] Translation failed: ${(error as Error).message}. Falling back to original text.`);
    return text;
  }
};

export const translateFAQInBackground = (faqId: string | Types.ObjectId): void => {
  Promise.resolve().then(async () => {
    try {
      const faq = await FAQ.findById(faqId);
      if (!faq) return;
      
      logger.info(`[translationService] Starting background translation for FAQ: ${faqId}`);
      const [questionHindi, answerHindi] = await Promise.all([
        translateText(faq.question, 'Hindi'),
        translateText(faq.answer, 'Hindi')
      ]);

      await FAQ.findByIdAndUpdate(faqId, {
        $set: { questionHindi, answerHindi }
      });
      logger.info(`[translationService] Successfully translated FAQ ${faqId} to Hindi.`);
    } catch (err) {
      logger.error(`[translationService] Failed to translate FAQ ${faqId}: ${(err as Error).message}`);
    }
  });
};

export const translatePostInBackground = (postId: string | Types.ObjectId): void => {
  Promise.resolve().then(async () => {
    try {
      const post = await CommunityPost.findById(postId);
      if (!post) return;
      
      logger.info(`[translationService] Starting background translation for Post: ${postId}`);
      const [titleHindi, bodyHindi] = await Promise.all([
        translateText(post.title, 'Hindi'),
        translateText(post.body || '', 'Hindi')
      ]);

      await CommunityPost.findByIdAndUpdate(postId, {
        $set: { titleHindi, bodyHindi }
      });
      logger.info(`[translationService] Successfully translated Community Post ${postId} to Hindi.`);
    } catch (err) {
      logger.error(`[translationService] Failed to translate Community Post ${postId}: ${(err as Error).message}`);
    }
  });
};
