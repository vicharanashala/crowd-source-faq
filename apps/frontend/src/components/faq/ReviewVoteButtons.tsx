import React, { useState } from 'react';
import api, { friendlyError } from '../../utils/api';

interface ReviewVoteButtonsProps {
  faqId: string;
  reviewCycle: number;
  initialAccurate?: number;
  initialNeedsUpdate?: number;
  onVoteUpdate?: (accurate: number, needsUpdate: number) => void;
}

export default function ReviewVoteButtons({
  faqId,
  reviewCycle,
  initialAccurate = 0,
  initialNeedsUpdate = 0,
  onVoteUpdate,
}: ReviewVoteButtonsProps) {
  const [accurate, setAccurate] = useState(initialAccurate);
  const [needsUpdate, setNeedsUpdate] = useState(initialNeedsUpdate);
  const [myVote, setMyVote] = useState<'still_accurate' | 'needs_update' | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [loading, setLoading] = useState(false);

  const castVote = async (verdict: 'still_accurate' | 'needs_update', sugg?: string) => {
    setLoading(true);
    try {
      const res = await api.post<{
        accurateVotes: number;
        needsUpdateVotes: number;
        currentVote: string | null;
      }>(`/faq/${faqId}/vote-review`, {
        verdict,
        suggestion: sugg?.trim() || undefined,
      });
      const { accurateVotes, needsUpdateVotes } = res.data;
      setAccurate(accurateVotes);
      setNeedsUpdate(needsUpdateVotes);
      onVoteUpdate?.(accurateVotes, needsUpdateVotes);
    } catch (e) {
      console.error(friendlyError(e, 'Vote failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleAccurate = () => {
    if (myVote === 'still_accurate') {
      // Remove vote
      castVote('still_accurate');
      setMyVote(null);
    } else {
      if (myVote === 'needs_update') {
        setSuggestion('');
        setShowSuggestion(false);
      }
      castVote('still_accurate');
      setMyVote('still_accurate');
    }
  };

  const handleNeedsUpdate = () => {
    if (myVote === 'needs_update') {
      castVote('needs_update');
      setMyVote(null);
    } else {
      setShowSuggestion(true);
      if (myVote === null) {
        // Just open suggestion box first time — submit on next click with text
      }
      setMyVote('needs_update');
    }
  };

  const handleSubmitNeedsUpdate = () => {
    castVote('needs_update', suggestion);
    setShowSuggestion(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={handleAccurate}
          disabled={loading}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all
            ${myVote === 'still_accurate'
              ? 'border-green-400 bg-green-50 text-green-700'
              : 'border-border text-ink-soft hover:border-green-300 hover:text-green-600'
            }`}
        >
          <span>👍</span>
          <span>Still Accurate</span>
          {accurate > 0 && <span className="ml-auto opacity-60">({accurate})</span>}
        </button>

        <button
          onClick={handleNeedsUpdate}
          disabled={loading}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all
            ${myVote === 'needs_update'
              ? 'border-red-400 bg-red-50 text-red-700'
              : 'border-border text-ink-soft hover:border-red-300 hover:text-red-600'
            }`}
        >
          <span>🔄</span>
          <span>Needs Update</span>
          {needsUpdate > 0 && <span className="ml-auto opacity-60">({needsUpdate})</span>}
        </button>
      </div>

      {showSuggestion && (
        <div className="space-y-1.5">
          <textarea
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value.slice(0, 300))}
            placeholder="What's wrong with this answer? (optional, max 300 chars)"
            rows={2}
            className="w-full rounded-xl border border-border bg-mist px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowSuggestion(false); setMyVote(null); }}
              className="flex-1 py-1.5 text-xs rounded-lg border border-border text-ink-soft hover:bg-mist transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitNeedsUpdate}
              disabled={loading}
              className="flex-1 py-1.5 text-xs rounded-lg bg-red-500 text-accent-text hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}