import { Request, Response } from 'express';
import FAQ from './faq.model.js';
import QuizLog from './quiz.model.js';
import { resolveProviderAsync, chatWithConfig } from '../../utils/ai/aiProvider.js';
import { stripAllWrappers } from '../../utils/ai/aiResponseParsers.js';
import { Types } from 'mongoose';
import { logger } from '../../utils/http/logger.js';

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const generateQuiz = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.query as { category?: string };
    if (!category) {
      res.status(400).json({ message: 'Category parameter is required.' });
      return;
    }

    // Fetch up to 10 approved FAQs in the category
    let faqs = await FAQ.find({ category, status: 'approved' }).limit(10);
    
    // Fallback: If no FAQs in the specific category, fetch any approved FAQs
    if (faqs.length === 0) {
      faqs = await FAQ.find({ status: 'approved' }).limit(10);
    }

    if (faqs.length === 0) {
      res.status(404).json({ message: 'No FAQs available to generate a quiz.' });
      return;
    }

    let quizQuestions: QuizQuestion[] = [];
    let generatedByAi = false;

    // Try AI generation first
    try {
      const aiConfig = await resolveProviderAsync();
      if (aiConfig && aiConfig.apiKey) {
        const prompt = `You are a helpful quiz generation assistant.
Based on the following FAQ items, generate exactly 5 multiple-choice questions (MCQs) to test the user's knowledge on the category "${category}".
Each MCQ must have:
- "question": The quiz question
- "options": An array of exactly 4 choices
- "correctIndex": The 0-based index of the correct choice
- "explanation": A short explanation of why it is correct

Return ONLY a raw JSON array matching this format:
[
  {
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Why Option A is correct..."
  }
]

Do not include any formatting, markdown, or other text.

FAQs:
${faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}`;

        const response = await chatWithConfig(aiConfig, [
          { role: 'user', content: prompt }
        ]);

        const cleanedJson = stripAllWrappers(response);
        quizQuestions = JSON.parse(cleanedJson);
        if (Array.isArray(quizQuestions) && quizQuestions.length > 0) {
          generatedByAi = true;
        }
      }
    } catch (aiErr) {
      logger.warn(`[quiz] AI quiz generation failed, using local fallback: ${(aiErr as Error).message}`);
    }

    // Fallback: Algorithmic Quiz Generation if AI fails or is not configured
    if (!generatedByAi) {
      const count = Math.min(5, faqs.length);
      const shuffledFaqs = [...faqs].sort(() => 0.5 - Math.random());
      
      for (let i = 0; i < count; i++) {
        const target = shuffledFaqs[i];
        const correctText = target.answer.slice(0, 100) + (target.answer.length > 100 ? '...' : '');
        
        // Find distractors from other FAQs
        const distractors = shuffledFaqs
          .filter(f => f._id.toString() !== target._id.toString())
          .map(f => f.answer.slice(0, 100) + (f.answer.length > 100 ? '...' : ''));
        
        while (distractors.length < 3) {
          distractors.push(`Alternative information matching topic option ${distractors.length + 1}`);
        }
        
        // Shuffle options and find correct index
        const options = [correctText, ...distractors.slice(0, 3)].sort(() => 0.5 - Math.random());
        const correctIndex = options.indexOf(correctText);

        quizQuestions.push({
          question: `Regarding "${target.question}", which statement is correct?`,
          options,
          correctIndex,
          explanation: `As documented: ${target.answer.slice(0, 150)}...`
        });
      }
    }

    res.json({
      category,
      questions: quizQuestions,
      generatedByAi
    });
  } catch (error) {
    logger.error(`[quiz] generateQuiz failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Failed to generate quiz.' });
  }
};

export const logQuizCompletion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, score, totalQuestions, batchId } = req.body as {
      category?: string;
      score?: number;
      totalQuestions?: number;
      batchId?: string;
    };

    if (!category || score === undefined || !totalQuestions) {
      res.status(400).json({ message: 'category, score, and totalQuestions are required.' });
      return;
    }

    const quizLog = await QuizLog.create({
      category,
      score,
      totalQuestions,
      batchId: batchId && Types.ObjectId.isValid(batchId) ? new Types.ObjectId(batchId) : null,
    });

    res.status(201).json({ message: 'Quiz session logged successfully.', quizLog });
  } catch (error) {
    logger.error(`[quiz] logQuizCompletion failed: ${(error as Error).message}`);
    res.status(500).json({ message: 'Failed to log quiz completion.' });
  }
};
