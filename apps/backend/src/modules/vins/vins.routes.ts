import { Router, type Request, type Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

interface VinsFAQ {
  id: number;
  category: string;
  question: string;
  answer: string;
}

interface ChatPayload {
  message?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

interface FeedbackPayload {
  question?: string;
  answer?: string;
  rating?: number;
  feedback?: string;
}

interface FeedbackEntry {
  id: number;
  question: string;
  answer: string;
  rating: number;
  feedback: string;
  createdAt: string;
}

const feedbackStore: FeedbackEntry[] = [];
let cachedFaqs: VinsFAQ[] | null = null;

async function loadFaqs(): Promise<VinsFAQ[]> {
  if (cachedFaqs) return cachedFaqs;

  const filePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../../faqproj_vins/faqs.json'
  );

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as VinsFAQ[];
    cachedFaqs = parsed;
    return parsed;
  } catch (error) {
    const fallback: VinsFAQ[] = [
      {
        id: 1,
        category: 'About the internship',
        question: 'What is VINS?',
        answer: 'VINS is the Vicharanashala Internship programme for students who clear the selection process.',
      },
      {
        id: 2,
        category: 'Timing and dates',
        question: 'How long is the internship?',
        answer: 'The internship lasts two months from the chosen start date, with an optional grace period if required.',
      },
      {
        id: 3,
        category: 'NOC (No Objection Certificate)',
        question: 'How do I upload my NOC?',
        answer: 'You upload the signed NOC from your dashboard after your result is released.',
      },
    ];
    cachedFaqs = fallback;
    return fallback;
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreMatch(query: string, faq: VinsFAQ): number {
  const normalizedQuery = normalize(query);
  const normalizedQuestion = normalize(faq.question);
  const normalizedAnswer = normalize(faq.answer);
  const questionTokens = new Set(normalizedQuestion.split(' '));
  const answerTokens = new Set(normalizedAnswer.split(' '));
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);

  let score = 0;
  if (normalizedQuery.includes(normalizedQuestion)) score += 8;
  if (normalizedQuestion.includes(normalizedQuery)) score += 8;

  for (const token of queryTokens) {
    if (!token) continue;
    if (questionTokens.has(token)) score += 3;
    if (answerTokens.has(token)) score += 1;
    if (faq.category.toLowerCase().includes(token)) score += 1;
  }

  return score;
}

async function answerQuestion(message: string): Promise<{ answer: string; matchedFaq?: VinsFAQ }> {
  const faqs = await loadFaqs();
  if (!message || !message.trim()) {
    return { answer: 'Please ask a question about the VINS internship, deadlines, or NOC process.' };
  }

  const ranked = faqs
    .map((faq) => ({ faq, score: scoreMatch(message, faq) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length > 0) {
    const best = ranked[0];
    return {
      answer: best.faq.answer,
      matchedFaq: best.faq,
    };
  }

  return {
    answer: "I don't have a direct answer for that yet. Please check the VINS FAQ or raise a query for the team.",
  };
}

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'vins-assistant' });
});

router.post('/chat', async (req: Request<{}, {}, ChatPayload>, res: Response) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ success: false, message: 'A message is required.' });
      return;
    }

    const { answer, matchedFaq } = await answerQuestion(message);
    const updatedHistory = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: answer },
    ];

    res.json({
      success: true,
      reply: answer,
      updatedHistory,
      question: message,
      answer,
      matchedFaq: matchedFaq ? { id: matchedFaq.id, category: matchedFaq.category, question: matchedFaq.question } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message: `Failed to answer request: ${message}` });
  }
});

router.post('/feedback', (req: Request<{}, {}, FeedbackPayload>, res: Response) => {
  try {
    const { question = '', answer = '', rating, feedback = '' } = req.body;

    const normalizedRating = Number(rating);
    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      res.status(400).json({ success: false, message: 'rating must be an integer from 1 to 5.' });
      return;
    }

    const entry: FeedbackEntry = {
      id: Date.now(),
      question: question.trim(),
      answer: answer.trim(),
      rating: normalizedRating,
      feedback: feedback.trim(),
      createdAt: new Date().toISOString(),
    };

    feedbackStore.push(entry);
    res.json({ success: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message: `Unable to save feedback: ${message}` });
  }
});

router.get('/feedback/stats', (_req: Request, res: Response) => {
  if (feedbackStore.length === 0) {
    res.json({ total: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    return;
  }

  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;

  for (const entry of feedbackStore) {
    breakdown[entry.rating as keyof typeof breakdown] += 1;
    total += entry.rating;
  }

  res.json({
    total: feedbackStore.length,
    average: Number((total / feedbackStore.length).toFixed(2)),
    breakdown,
  });
});

export default router;
