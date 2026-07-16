import api from '../../utils/api';

export interface QuizQuestion {
  faqId: string;
  question: string;
  options: string[];
}

export interface StartSessionResponse {
  sessionId: string;
  questions: QuizQuestion[];
}

export interface AnswerResponse {
  correct: boolean;
  correctIndex: number;
}

export interface CompleteResponse {
  score: number;
  totalQuestions: number;
}

export async function startQuizSession(batchId?: string | null, category?: string | null): Promise<StartSessionResponse> {
  const res = await api.post<StartSessionResponse>('/quiz/sessions', {
    batchId: batchId ?? undefined,
    category: category ?? undefined,
    limit: 10,
  });
  return res.data;
}

export async function submitQuizAnswer(
  sessionId: string,
  faqId: string,
  selectedIndex: number,
  timeTakenMs: number
): Promise<AnswerResponse> {
  const res = await api.post<AnswerResponse>(`/quiz/sessions/${sessionId}/answer`, {
    faqId,
    selectedIndex,
    timeTakenMs,
  });
  return res.data;
}

export async function completeQuizSession(sessionId: string): Promise<CompleteResponse> {
  const res = await api.post<CompleteResponse>(`/quiz/sessions/${sessionId}/complete`);
  return res.data;
}
