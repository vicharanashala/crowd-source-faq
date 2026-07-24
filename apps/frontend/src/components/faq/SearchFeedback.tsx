import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import {
  buttonGhost,
  buttonPrimary,
  cardSectionPad,
  flexGrow,
  iconBtnSm,
  inputError,
  stackMd,
  suggestError,
  textBody,
  textLabel,
} from '../../styles/style_config';

interface SearchFeedbackProps {
  searchQuery: string;
  resultFaqId?: string;
}

export default function SearchFeedback({ searchQuery, resultFaqId }: SearchFeedbackProps) {
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<'prompt' | 'form' | 'done'>('prompt');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1.5 (MEDIUM) — the previous 8-second timer unconditionally reset
  // dismissed back to false, so the prompt popped back up after the
  // user had explicitly closed it. Track dismissal in a ref so the
  // timer callback can bail early and never re-show the prompt after
  // an explicit "Yes, I am good" / Cancel / close click.
  const dismissedRef = useRef(false);
  useEffect(() => { dismissedRef.current = dismissed; }, [dismissed]);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Only re-show the prompt if the user has not explicitly
      // dismissed it. We read the latest value through the ref so
      // this effect (keyed on searchQuery/resultFaqId) doesn't need
      // dismissed in its dep array.
      if (dismissedRef.current) return;
      setPhase('prompt');
    }, 8000);
    return () => clearTimeout(timer);
  }, [searchQuery, resultFaqId]);

  useEffect(() => {
    setDismissed(false);
    setPhase('prompt');
    setFeedback('');
    setError('');
  }, [searchQuery]);

  const handleYes = () => {
    setDismissed(true);
    setPhase('done');
  };

  const handleNo = () => {
    setPhase('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/search/unresolved', {
        query: searchQuery,
        faqId: resultFaqId || undefined,
        feedback: feedback.trim(),
      });
      setPhase('done');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (dismissed || phase === 'done') return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
      <div className={cardSectionPad}>
        {phase === 'prompt' ? (
          <div className="flex items-center gap-3">
            <p className={`${flexGrow} ${textBody}`}>Did this answer your question?</p>
            <button
              onClick={handleYes}
              className={buttonPrimary}
            >
              <span>👍</span> Yes, I am good
            </button>
            <button
              onClick={handleNo}
              className={buttonGhost}
            >
              No, I need more help
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={stackMd}>
            <div className="flex items-center justify-between">
              <p className={textLabel}>What specifically did not work?</p>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className={iconBtnSm}
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="e.g. This FAQ did not mention deadlines for submissions..."
              className={inputError}
              autoFocus
            />
            {error && (
              <p className={suggestError}>{error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={feedback.trim().length < 10 || loading}
                className={`${buttonPrimary} flex-1 py-2.5 rounded-full disabled:opacity-50`}
              >
                {loading ? (
                  <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin inline-block" /> Submitting...</>
                ) : 'Submit'}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className={`${buttonGhost} px-4 py-2.5 rounded-full`}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}