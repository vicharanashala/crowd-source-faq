import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBatch } from '../context/BatchContext';
import {
  startQuizSession,
  submitQuizAnswer,
  completeQuizSession,
  type QuizQuestion,
} from '../components/quiz/api';

function friendlyError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message || fallback;
}

type Phase = 'loading' | 'error' | 'quiz' | 'summary';

export default function QuizPage() {
  const { currentBatch } = useBatch();
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealCorrect, setRevealCorrect] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finalScore, setFinalScore] = useState<{ score: number; total: number } | null>(null);
  const questionStartedAt = useRef<number>(Date.now());

  const loadQuiz = useCallback(async () => {
    setPhase('loading');
    setError('');
    try {
      const { sessionId: id, questions: qs } = await startQuizSession(currentBatch?._id ?? null);
      setSessionId(id);
      setQuestions(qs);
      setIndex(0);
      setSelected(null);
      setRevealCorrect(null);
      setCorrectCount(0);
      questionStartedAt.current = Date.now();
      setPhase('quiz');
    } catch (err) {
      setError(friendlyError(err, 'Could not start a quiz right now.'));
      setPhase('error');
    }
  }, [currentBatch?._id]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const current = questions[index];

  async function handleSelect(optIndex: number) {
    if (!sessionId || !current || revealCorrect !== null) return;
    setSelected(optIndex);
    const timeTakenMs = Date.now() - questionStartedAt.current;
    try {
      const { correct, correctIndex } = await submitQuizAnswer(sessionId, current.faqId, optIndex, timeTakenMs);
      setRevealCorrect(correctIndex);
      if (correct) setCorrectCount((c) => c + 1);
    } catch (err) {
      setError(friendlyError(err, 'Could not submit that answer.'));
    }
  }

  async function handleNext() {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setSelected(null);
      setRevealCorrect(null);
      questionStartedAt.current = Date.now();
      return;
    }
    // Last question — wrap up the session.
    if (!sessionId) return;
    try {
      const result = await completeQuizSession(sessionId);
      setFinalScore({ score: result.score, total: result.totalQuestions });
      setPhase('summary');
    } catch (err) {
      setError(friendlyError(err, 'Could not finish the quiz session.'));
    }
  }

  if (phase === 'loading') {
    return <div className="min-h-[50vh] flex items-center justify-center text-muted">Loading quiz...</div>;
  }

  if (phase === 'error') {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={loadQuiz} className="nav-pill">Try again</button>
      </div>
    );
  }

  if (phase === 'summary' && finalScore) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Quiz complete!</h1>
        <p className="text-lg">
          You got <span className="font-bold">{finalScore.score}</span> out of{' '}
          <span className="font-bold">{finalScore.total}</span> correct.
        </p>
        <div className="flex items-center justify-center gap-3 pt-4">
          <button onClick={loadQuiz} className="nav-pill">Take another quiz</button>
          <Link to="/faq" className="nav-pill">Back to FAQ</Link>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="max-w-xl mx-auto mt-10 space-y-6">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Question {index + 1} of {questions.length}</span>
        <span>Score so far: {correctCount}</span>
      </div>

      <h2 className="text-xl font-medium">{current.question}</h2>

      <div className="space-y-3">
        {current.options.map((opt, i) => {
          const isSelected = selected === i;
          const isRevealed = revealCorrect !== null;
          const isRight = isRevealed && i === revealCorrect;
          const isWrongPick = isRevealed && isSelected && i !== revealCorrect;

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={isRevealed}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors
                ${isRight ? 'border-green-500 bg-green-500/10' : ''}
                ${isWrongPick ? 'border-red-500 bg-red-500/10' : ''}
                ${!isRevealed ? 'border-[rgb(var(--border-rgb)_/_0.6)] hover:bg-[rgb(var(--bg-card-rgb)_/_0.6)]' : ''}
              `}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {revealCorrect !== null && (
        <div className="flex justify-end">
          <button onClick={handleNext} className="nav-pill">
            {index + 1 < questions.length ? 'Next question' : 'Finish quiz'}
          </button>
        </div>
      )}
    </div>
  );
}
