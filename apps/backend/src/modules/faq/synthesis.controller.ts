import { Request, Response } from 'express';
import FAQ from './faq.model.js';
import { resolveProviderAsync, chatWithConfig } from '../../utils/ai/aiProvider.js';
import { stripAllWrappers } from '../../utils/ai/aiResponseParsers.js';
import { Types } from 'mongoose';
import { logger } from '../../utils/http/logger.js';

export const synthesizeFaqFromTranscript = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transcript, batchId } = req.body as { transcript?: string; batchId?: string };
    if (!transcript?.trim()) {
      res.status(400).json({ message: 'Transcript is required.' });
      return;
    }

    const aiConfig = await resolveProviderAsync();
    if (!aiConfig || !aiConfig.apiKey) {
      res.status(503).json({ message: 'AI provider is not configured.' });
      return;
    }

    const prompt = `You are an expert Q&A synthesis assistant.
You will be given a resolved chat transcript. Your task is to:
1. Extract the core question that was asked.
2. Extract the correct final resolution or answer.
3. Suggest a relevant category (e.g. Technical, Logistics, General, Homework).
4. Suggest a list of up to 3 relevant tags (e.g. github, zoom, docker, submission).

Respond ONLY with a raw JSON object containing these keys:
{
  "question": "Synthesized Question",
  "answer": "Structured Markdown Answer",
  "category": "Suggested Category",
  "tags": ["tag1", "tag2"]
}

Do not include any other text or prose.

Transcript:
${transcript}`;

    const response = await chatWithConfig(aiConfig, [
      { role: 'user', content: prompt }
    ]);

    const cleanedJson = stripAllWrappers(response);
    let parsed: { question: string; answer: string; category: string; tags: string[] };
    try {
      parsed = JSON.parse(cleanedJson);
    } catch (parseErr) {
      logger.warn(`[synthesis] Failed to parse AI JSON response: ${response}`);
      res.status(422).json({ message: 'AI did not return valid JSON. Please try again.', raw: response });
      return;
    }

    if (!parsed.question || !parsed.answer) {
      res.status(422).json({ message: 'AI failed to synthesize a complete question or answer.', parsed });
      return;
    }

    const faq = await FAQ.create({
      question: parsed.question.trim(),
      answer: parsed.answer.trim(),
      category: (parsed.category || 'General').trim(),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(t => t.trim().toLowerCase()).filter(Boolean) : [],
      status: 'pending',
      batchId: batchId && Types.ObjectId.isValid(batchId) ? new Types.ObjectId(batchId) : null,
      freshnessTier: 'evergreen',
      reviewIntervalDays: 0,
      reviewStatus: 'pending_review',
      lastVerifiedDate: new Date(),
    });

    res.status(201).json({
      message: 'FAQ synthesized successfully as draft.',
      faq
    });
  } catch (error) {
    logger.error(`[synthesis] FAQ synthesis failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Failed to synthesize FAQ.' });
  }
};
