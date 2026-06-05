import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDismissed(false);
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
      <div className="bg-card rounded-2xl border border-border shadow-float p-4">
        {phase === 'prompt' ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-ink">Did this answer your question?</p>
            <button
              onClick={handleYes}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors"
            >
              <span>👍</span> Yes, I am good
            </button>
            <button
              onClick={handleNo}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border bg-card text-xs font-semibold text-ink hover:bg-mist transition-colors"
            >
              No, I need more help
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">What specifically did not work?</p>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-ink-faint hover:text-ink transition-colors"
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
              className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
              autoFocus
            />
            {error && (
              <p className="text-xs text-danger">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={feedback.trim().length < 10 || loading}
                className="flex-1 py-2.5 rounded-full bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin inline-block" /> Submitting...</>
                ) : 'Submit'}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="px-4 py-2.5 rounded-full border border-border text-xs font-semibold text-ink hover:bg-mist transition-colors"
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
