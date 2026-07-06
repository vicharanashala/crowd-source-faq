import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../utils/api';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface ZoomAssessmentModalProps {
  onClose: () => void;
}

interface Question {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex?: number;
}

export default function ZoomAssessmentModal({ onClose }: ZoomAssessmentModalProps) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  
  const [status, setStatus] = useState<'checking' | 'active' | 'passed'>('checking');
  const [zoomDetails, setZoomDetails] = useState<any>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  // Lock body scroll while the modal is open
  useBodyScrollLock(true);

  const checkStatus = async () => {
    try {
      const res = await api.get('/welcome/zoom-assessment/status');
      if (!res.data.active) {
        setError(res.data.message || 'Zoom onboarding is not currently active.');
        setStatus('active');
        setLoading(false);
        return;
      }

      if (res.data.passed) {
        setStatus('passed');
        setZoomDetails(res.data.zoomDetails);
        setLoading(false);
      } else {
        fetchQuestions();
      }
    } catch (err) {
      setError('Failed to check zoom status.');
      setLoading(false);
    }
  };

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/welcome/zoom-assessment/questions');
      setQuestions(res.data.questions || []);
      setAnswers(res.data.answers || {});
      setCurrentIdx(res.data.currentIdx || 0);
      setStatus('active');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch assessment questions.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (idx: number) => {
    const qId = questions[currentIdx].id;
    const nextAnswers = { ...answers, [qId]: idx };
    setAnswers(nextAnswers);

    try {
      await api.post('/welcome/zoom-assessment/submit', {
        answers: nextAnswers,
        currentIdx,
        progressOnly: true
      });
    } catch (err) {
      console.error('Failed to save assessment progress:', err);
    }
  };

  const handleNext = async () => {
    const nextIdx = Math.min(questions.length - 1, currentIdx + 1);
    setCurrentIdx(nextIdx);

    try {
      await api.post('/welcome/zoom-assessment/submit', {
        answers,
        currentIdx: nextIdx,
        progressOnly: true
      });
    } catch (err) {
      console.error('Failed to save assessment progress:', err);
    }
  };

  const handleBack = async () => {
    const prevIdx = Math.max(0, currentIdx - 1);
    setCurrentIdx(prevIdx);

    try {
      await api.post('/welcome/zoom-assessment/submit', {
        answers,
        currentIdx: prevIdx,
        progressOnly: true
      });
    } catch (err) {
      console.error('Failed to save assessment progress:', err);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      
      const res = await api.post('/welcome/zoom-assessment/submit', {
        answers,
        currentIdx
      });

      if (res.data.passed) {
        setStatus('passed');
        setZoomDetails(res.data.zoomDetails);
        setResultMessage(res.data.message);
      } else {
        setResultMessage(res.data.message);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit assessment.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-stretch justify-stretch sm:items-center sm:justify-center p-0 sm:p-4 animate-fade-in"
      style={{
        backgroundColor: 'rgba(15, 15, 15, 0.45)',
        backdropFilter: 'blur(14px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="w-full h-full sm:h-[min(820px,90vh)] sm:max-h-[90vh] sm:w-[min(900px,90vw)] bg-card rounded-none sm:rounded-2xl border-0 sm:border border-border shadow-card flex flex-col overflow-hidden"
        style={{
          boxSizing: 'border-box'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* ========================================
            HEADER (STICKY / FIXED)
            ======================================== */}
        <div 
          className="px-[32px] pb-[20px] border-b border-border flex flex-col bg-card flex-shrink-0 z-10"
          style={{ paddingTop: 'calc(28px + env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex justify-between items-center mb-[12px]">
            <h2 className="text-[11px] font-bold text-ink uppercase tracking-wider">Zoom Onboarding Assessment</h2>
            <button 
              onClick={onClose} 
              aria-label="Close"
              className="w-7 h-7 flex items-center justify-center rounded-full text-ink-faint hover:text-ink hover:bg-black/[0.04] transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18"/>
                <line x1="18" y1="6" x2="6" y2="18"/>
              </svg>
            </button>
          </div>

          {questions.length > 0 && status === 'active' && !resultMessage && (
            <div>
              <div className="flex justify-between items-end mb-[12px] text-xs font-semibold text-ink-soft">
                <span>Question {currentIdx + 1} of {questions.length}</span>
                <span>{Math.round(((currentIdx + 1) / questions.length) * 100)}%</span>
              </div>
              
              <div className="w-full bg-border h-2 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ========================================
            NON-SCROLLING CONTENT CONTAINER
            ======================================== */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {loading && status !== 'checking' ? (
            <div className="flex flex-col items-center justify-center p-[32px] flex-1 min-h-0">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-ink-soft text-sm sm:text-base leading-relaxed">Loading assessment state...</p>
            </div>
          ) : error ? (
            <div className="text-center p-[32px] flex-1 flex flex-col justify-center items-center overflow-y-auto gap-[20px]">
              <p className="text-red-500 font-medium text-sm sm:text-base leading-relaxed">{error}</p>
              <button onClick={onClose} className="btn-base bg-black/5 hover:bg-black/10 cursor-pointer rounded-xl px-6 py-2.5 text-sm font-semibold text-ink-soft">Close</button>
            </div>
          ) : status === 'passed' ? (
            <div className="text-center p-[32px] overflow-y-auto flex-1 flex flex-col justify-center items-center gap-[20px]">
              <div className="w-16 h-16 bg-accent/15 text-accent rounded-full flex items-center justify-center mx-auto flex-shrink-0">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-ink">Congratulations!</h3>
                <p className="text-sm sm:text-base text-ink-soft leading-relaxed">{resultMessage || 'You passed the onboarding assessment.'}</p>
              </div>
              
              {zoomDetails && (
                <div className="bg-mist p-[24px] sm:p-[32px] rounded-2xl text-left border border-border/50 max-w-md w-full">
                  <h4 className="font-serif text-lg font-semibold text-ink">{zoomDetails.zoomTitle}</h4>
                  <p className="text-sm text-ink-soft mt-2 leading-relaxed">{zoomDetails.zoomDescription}</p>
                  <p className="text-sm font-semibold mt-3 text-accent">Duration: {zoomDetails.zoomDuration}</p>
                </div>
              )}

              <div className="max-w-md w-full">
                <a 
                  href={zoomDetails?.zoomUrl || '#'} 
                  target="_blank" 
                  rel="noreferrer"
                  className="btn-base btn-primary w-full text-center block py-3 rounded-full text-sm font-semibold transition-all duration-200"
                >
                  Join Zoom Session
                </a>
              </div>
            </div>
          ) : resultMessage && !loading ? (
            <div className="text-center p-[32px] flex-1 flex flex-col justify-center items-center overflow-y-auto gap-[20px]">
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-ink">Assessment Results</h3>
              <p className="text-sm sm:text-base text-ink-soft leading-relaxed">{resultMessage}</p>
              <button
                onClick={() => {
                  // M55: keep the user's existing answers + cursor — only reset
                  // the result message and re-fetch the question set. Otherwise
                  // "Try Again" wipes everything they already entered.
                  setResultMessage(null);
                  fetchQuestions();
                }}
                className="btn-base btn-primary cursor-pointer px-8 py-2.5 font-semibold text-sm rounded-full"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {questions.length > 0 && (
                <>
                  {/* QUESTION BLOCK (Always visible, non-scrolling, wraps naturally) */}
                  <div className="px-[32px] py-[32px] border-b border-border bg-mist/30 flex-shrink-0 flex items-center">
                    <h3 className="text-ink w-full max-w-3xl font-semibold text-[20px] leading-[1.6]">
                      {questions[currentIdx].question}
                    </h3>
                  </div>
                  
                  {/* OPTIONS LIST (Scrollable Section Only) */}
                  <div className="flex-1 overflow-y-auto px-[32px] py-[32px] flex flex-col gap-[16px]">
                    {questions[currentIdx].options.map((opt, idx) => {
                      const isSelected = answers[questions[currentIdx].id] === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelect(idx)}
                          className={`w-full text-left px-[24px] py-[20px] rounded-2xl border transition-all duration-200 cursor-pointer flex items-center min-h-[72px] ${
                            isSelected 
                              ? 'border-success bg-success/5 text-success ring-1 ring-success' 
                              : 'border-border hover:border-success/40 hover:bg-black/[0.01]'
                          }`}
                        >
                          <div className="flex items-center gap-[16px] w-full">
                            <div className={`w-6 h-6 rounded-full border flex flex-shrink-0 items-center justify-center ${isSelected ? 'border-success bg-success' : 'border-border'}`}>
                              {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                            <span className={`text-[16px] leading-[1.5] font-medium flex-1 ${isSelected ? 'text-success font-semibold' : 'text-ink-soft'}`}>{opt}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ========================================
            FOOTER (STICKY / FIXED)
            ======================================== */}
        {questions.length > 0 && status === 'active' && !resultMessage && !loading && (
          <div 
            className="px-[32px] pt-[24px] border-t border-border flex justify-between items-center bg-card flex-shrink-0"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
          >
            <button
              onClick={handleBack}
              disabled={currentIdx === 0}
              className="px-6 py-2.5 text-sm font-semibold text-ink-soft hover:bg-mist rounded-xl transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            >
              Back
            </button>
            
            <span className="text-xs font-semibold text-ink-faint">
              Question {currentIdx + 1} of {questions.length}
            </span>

            {currentIdx === questions.length - 1 ? (
              <button
                onClick={handleSubmit}
                disabled={answers[questions[currentIdx].id] === undefined}
                className="btn-base btn-primary px-8 py-2.5 font-semibold text-sm cursor-pointer rounded-full"
              >
                Submit
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={answers[questions[currentIdx].id] === undefined}
                className="btn-base bg-ink text-white hover:bg-ink-soft px-8 py-2.5 font-semibold text-sm cursor-pointer rounded-full"
              >
                Next
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
