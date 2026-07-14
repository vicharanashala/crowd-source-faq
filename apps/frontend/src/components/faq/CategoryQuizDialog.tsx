import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useBatch } from '../../context/BatchContext';

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface CategoryQuizDialogProps {
  category: string;
  onClose: () => void;
}

export default function CategoryQuizDialog({ category, onClose }: CategoryQuizDialogProps) {
  const { currentBatch } = useBatch();
  const batchId = currentBatch?._id ?? null;

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadQuiz() {
      try {
        const res = await api.get<{ questions: QuizQuestion[] }>(`/faq/quiz?category=${encodeURIComponent(category)}`);
        setQuestions(res.data.questions);
      } catch (err) {
        setError('Failed to load quiz. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    loadQuiz();
  }, [category]);

  const handleOptionSelect = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
  };

  const handleAnswerSubmit = () => {
    if (selectedOption === null || isAnswered) return;
    
    const isCorrect = selectedOption === questions[currentIndex].correctIndex;
    if (isCorrect) {
      setScore(prev => prev + 1);
    }
    setIsAnswered(true);
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      setShowSummary(true);
      try {
        await api.post('/faq/quiz/log', {
          category,
          score,
          totalQuestions: questions.length,
          batchId
        });
      } catch {
        // Silent catch for logs
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-xl rounded-3xl border border-border/80 bg-card p-6 shadow-2xl relative overflow-hidden transition-all duration-300">
        
        {/* Background glow decorator */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-accent/10 rounded-full blur-2xl pointer-events-none" />
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-5">
          <div>
            <h3 className="text-base font-semibold text-ink">Category Practice Quiz</h3>
            <p className="text-xs text-ink-soft">Test your knowledge on: {category}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-mist flex items-center justify-center text-ink-soft hover:text-ink hover:bg-border transition-all"
            aria-label="Close Quiz"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
            <p className="text-sm text-ink-soft font-medium animate-pulse">Generating your quiz questions...</p>
          </div>
        )}

        {error && (
          <div className="py-8 text-center">
            <p className="text-sm text-danger font-medium mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-accent text-accent-text rounded-xl text-xs font-semibold hover:bg-accent-hover transition-colors"
            >
              Close Quiz
            </button>
          </div>
        )}

        {!loading && !error && !showSummary && questions.length > 0 && (
          <div>
            {/* Progress indicator */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs font-semibold text-ink-faint mb-1.5">
                <span>Question {currentIndex + 1} of {questions.length}</span>
                <span>Score: {score}</span>
              </div>
              <div className="w-full h-1.5 bg-mist rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Question title */}
            <h4 className="text-sm font-semibold text-ink mb-4 leading-snug">
              {questions[currentIndex].question}
            </h4>

            {/* Options list */}
            <div className="space-y-2.5 mb-5">
              {questions[currentIndex].options.map((opt, index) => {
                let optionStyle = "border-border hover:border-accent/40 bg-card hover:bg-mist/30";
                
                if (selectedOption === index) {
                  optionStyle = "border-accent bg-accent/5 ring-1 ring-accent";
                }
                
                if (isAnswered) {
                  if (index === questions[currentIndex].correctIndex) {
                    optionStyle = "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500";
                  } else if (selectedOption === index) {
                    optionStyle = "border-danger bg-danger-light/50 dark:bg-danger-dark/10 text-danger ring-1 ring-danger";
                  } else {
                    optionStyle = "border-border/60 opacity-60 bg-card";
                  }
                }

                return (
                  <button
                    key={index}
                    disabled={isAnswered}
                    onClick={() => handleOptionSelect(index)}
                    className={`w-full text-left p-3.5 rounded-xl border text-xs font-medium transition-all flex items-start gap-2.5 ${optionStyle}`}
                  >
                    <span className="shrink-0 w-5 h-5 rounded-lg bg-mist flex items-center justify-center text-[10px] font-bold text-ink-soft">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>

            {/* Explanation box */}
            {isAnswered && (
              <div className="p-3.5 rounded-xl bg-accent-light/40 border border-accent/15 mb-5 animate-slide-up">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent uppercase tracking-wider mb-1">
                  <span>💡</span> Explanation
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">
                  {questions[currentIndex].explanation}
                </p>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-2">
              {!isAnswered ? (
                <button
                  disabled={selectedOption === null}
                  onClick={handleAnswerSubmit}
                  className="flex-1 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-text rounded-xl text-xs font-bold transition-all shadow-md"
                >
                  Verify Answer
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-accent-text rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1"
                >
                  {currentIndex < questions.length - 1 ? 'Next Question' : 'See Results'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Summary / Completion screen */}
        {showSummary && (
          <div className="text-center py-6 animate-fade-in">
            <div className="text-4xl mb-3">
              {score >= questions.length * 0.8 ? '🎉' : score >= questions.length * 0.5 ? '👍' : '📚'}
            </div>
            
            <h4 className="text-base font-bold text-ink mb-1">Quiz Completed!</h4>
            <p className="text-xs text-ink-soft mb-5">
              You scored <span className="font-bold text-accent">{score}</span> out of <span className="font-bold">{questions.length}</span> correct.
            </p>

            <div className="max-w-xs mx-auto p-4 rounded-2xl bg-mist/60 border border-border/80 mb-6">
              <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider">Score Breakdown</p>
              <div className="text-2xl font-black text-ink mt-1">
                {((score / questions.length) * 100).toFixed(0)}%
              </div>
              <p className="text-xs text-ink-soft mt-2 leading-relaxed">
                {score === questions.length 
                  ? 'Perfect! You have completely mastered this category!'
                  : score >= questions.length * 0.7 
                    ? 'Excellent job! You are very well informed about this topic.'
                    : 'Keep studying! Review the FAQs in this category to improve your understanding.'}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCurrentIndex(0);
                  setSelectedOption(null);
                  setIsAnswered(false);
                  setScore(0);
                  setShowSummary(false);
                  setLoading(true);
                  // Trigger reload
                  api.get<{ questions: QuizQuestion[] }>(`/faq/quiz?category=${encodeURIComponent(category)}`)
                    .then(res => { setQuestions(res.data.questions); setLoading(false); });
                }}
                className="flex-1 py-2.5 bg-mist hover:bg-border text-ink rounded-xl text-xs font-bold transition-all"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-accent-text rounded-xl text-xs font-bold transition-all shadow-md"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
