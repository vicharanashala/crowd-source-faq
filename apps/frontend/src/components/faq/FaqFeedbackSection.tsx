import React, { useState, useEffect } from 'react';
import { flexRow, textBodySoft, flexCol, textLabelBold, surfaceCardPadded } from '../../styles/style_config';
import api from '../../utils/api';

interface FaqFeedbackSectionProps {
  faqId: string;
}

export default function FaqFeedbackSection({ faqId }: FaqFeedbackSectionProps) {
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const sessionId = getSessionId();

  useEffect(() => {
    // Check if user has already submitted feedback for this FAQ in this session
    const submitted = localStorage.getItem(`faq_feedback_${faqId}`);
    if (submitted) {
      setHasSubmitted(true);
    }
  }, [faqId]);

  const handleYes = async () => {
    setIsSubmitting(true);
    try {
      await api.post(`/public/faqs/${faqId}/feedback`, {
        isHelpful: true,
        sessionId,
      });
      localStorage.setItem(`faq_feedback_${faqId}`, 'true');
      setHasSubmitted(true);
    } catch (err: any) {
      console.error('Failed to submit feedback:', err);
      setError(err.response?.data?.message || 'Failed to submit feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNo = () => {
    setShowForm(true);
  };

  const handleSubmitNegative = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post(`/public/faqs/${faqId}/feedback`, {
        isHelpful: false,
        reason: selectedReason,
        comments,
        sessionId,
      });
      localStorage.setItem(`faq_feedback_${faqId}`, 'true');
      setHasSubmitted(true);
      setShowForm(false);
    } catch (err: any) {
      console.error('Failed to submit negative feedback:', err);
      setError(err.response?.data?.message || 'Failed to submit feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasSubmitted) {
    return (
      <div className={`mt-6 ${surfaceCardPadded} border-border bg-emerald-50/50 dark:bg-emerald-900/10`}>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Thank you! Your feedback helps us improve.
        </p>
      </div>
    );
  }

  return (
    <div className={`mt-6 ${flexCol} gap-4 pt-6 border-t border-border`}>
      {!showForm ? (
        <div className={`${flexRow} items-center gap-4`}>
          <span className={textBodySoft}>Was this answer helpful?</span>
          <div className="flex gap-2">
            <button
              onClick={handleYes}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-full border border-border/70 bg-card text-sm text-ink hover:border-emerald-500/50 hover:text-emerald-600 transition-colors disabled:opacity-50"
            >
              👍 Yes
            </button>
            <button
              onClick={handleNo}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-full border border-border/70 bg-card text-sm text-ink hover:border-rose-500/50 hover:text-rose-600 transition-colors disabled:opacity-50"
            >
              👎 No
            </button>
          </div>
          {error && <span className="text-sm text-rose-500">{error}</span>}
        </div>
      ) : (
        <form onSubmit={handleSubmitNegative} className={`${surfaceCardPadded} border-border bg-rose-50/30 dark:bg-rose-900/5`}>
          <p className={textLabelBold}>We're sorry this answer wasn't helpful.</p>
          <p className={`mt-1 mb-4 ${textBodySoft}`}>What was the issue?</p>
          
          <div className={`${flexCol} gap-2 mb-4`}>
            {['Missing information', 'Hard to understand', 'Incorrect answer', 'Outdated information', 'Other'].map(reason => (
              <label key={reason} className="flex items-center gap-2 cursor-pointer text-sm text-ink">
                <input
                  type="radio"
                  name="reason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-4 h-4 text-accent border-border focus:ring-accent"
                />
                {reason}
              </label>
            ))}
          </div>

          <div className="mb-4">
            <label className={`block mb-1 text-sm font-medium text-ink`}>
              Additional comments (optional)
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full p-2 text-sm border border-border rounded-lg bg-card text-ink focus:ring-2 focus:ring-accent focus:outline-none"
              rows={3}
              placeholder="Tell us how we can improve this answer..."
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting || !selectedReason}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
            >
              Submit Feedback
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={isSubmitting}
              className="px-4 py-2 bg-mist text-ink rounded-lg text-sm font-medium hover:bg-mist-hover disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
        </form>
      )}
    </div>
  );
}

// Helper to get or create a session ID for anonymous users
function getSessionId() {
  let sessionId = localStorage.getItem('yaksha_session_id');
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('yaksha_session_id', sessionId);
  }
  return sessionId;
}
