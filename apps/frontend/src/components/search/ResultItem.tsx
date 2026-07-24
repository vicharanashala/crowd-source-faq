import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import type { SearchResult } from '../../types/ui';
import {
  confidenceHigh,
  confidenceLow,
  confidenceMedium,
  confidencePill,
  resultBody,
  resultBodyCommunity,
  resultBodyFaq,
  resultBodyFaqShort,
  resultCardCollapsed,
  resultCardExpanded,
  resultCommunityLabel,
  resultFaqLabel,
  resultHeaderCommunity,
  resultHeaderFaq,
  resultMetaCategory,
  resultMetaSource,
  resultTitle,
  suggestBtnCancel,
  suggestBtnSubmit,
  suggestCta,
  suggestCtaAccent,
  suggestCtaFaint,
  suggestError,
  suggestForm,
  suggestLabel,
  suggestSuccess,
  suggestTextarea,
  textXs,
  textXsFaint,
  voteDown,
  voteDownIdle,
  votePillBase,
  voteUp,
  voteUpIdle,
} from '../../styles/style_config';

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getConfidenceLevel(result: SearchResult): string {
  const vectorScore = Number(result.vectorScore || 0);
  const textScore = Number(result.textScore || 0);
  if (textScore >= 2 || vectorScore >= 0.9) return 'High';
  if (textScore > 0 || vectorScore >= 0.82) return 'Medium';
  return 'Low';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

export function ConfidenceTag({ level }: { level: string }) {
  const colorClass =
    level === 'High'
      ? confidenceHigh
      : level === 'Medium'
        ? confidenceMedium
        : confidenceLow;
  return (
    <span className={`${confidencePill} ${colorClass}`}>
      {level} Confidence
    </span>
  );
}

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 inline-block align-middle">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const ThumbsUpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);

const ThumbsDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm8-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
  </svg>
);

// ── ResultItem ─────────────────────────────────────────────────────────────────

interface ResultItemProps {
  result: SearchResult;
  expanded: boolean;
  onToggle: () => void;
  onShowHistory: (id: string, question: string) => void;
  navigate: ReturnType<typeof import('react-router-dom').useNavigate>;
}

export default function ResultItem({ result, expanded, onToggle, onShowHistory, navigate }: ResultItemProps) {
  const title = result.question || result.title || 'Untitled';
  const fullContent = result.answer || result.body || '';
  const isCommunity = result.source === 'community';
  const sourceLabel = result.source === 'faq' ? 'FAQ' : 'Community';
  const confidence = getConfidenceLevel(result);

  const [voted, setVoted] = useState<'helpful' | 'unhelpful' | null>(null);
  const [hv, setHv] = useState(0);
  const [uhv, setUhv] = useState(0);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestSuccess, setSuggestSuccess] = useState('');
  const [suggestError, setSuggestError] = useState('');

  useEffect(() => {
    setHv(Number(result.helpfulVotes || 0));
    setUhv(Number(result.unhelpfulVotes || 0));
    setVoted(null);
    setShowSuggest(false);
    setSuggestion('');
    setSuggestSuccess('');
    setSuggestError('');
  }, [result]);

  const handleVote = async (helpful: boolean) => {
    if (voted) return;
    try {
      const res = await api.patch<{ helpfulVotes: number; unhelpfulVotes: number }>(`/faq/${result._id}/feedback`, { helpful });
      setHv(res.data.helpfulVotes);
      setUhv(res.data.unhelpfulVotes);
      setVoted(helpful ? 'helpful' : 'unhelpful');
    } catch {
      if (helpful) setHv(v => v + 1);
      else setUhv(v => v + 1);
      setVoted(helpful ? 'helpful' : 'unhelpful');
    }
  };

  const handleSuggestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestion.trim()) return;
    setSuggesting(true);
    setSuggestError('');
    setSuggestSuccess('');
    try {
      await api.post(`/faq/${result._id}/suggest`, { suggestion: suggestion.trim() });
      setSuggestSuccess('Thank you! Your suggestion has been recorded.');
      setSuggestion('');
      setTimeout(() => { setShowSuggest(false); setSuggestSuccess(''); }, 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to submit suggestion. Please try again.';
      setSuggestError(msg);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div
      className={`${expanded ? resultCardExpanded : resultCardCollapsed}`}
      onClick={() => {
        if (isCommunity && result._id) navigate(`/community?post=${result._id}`);
        else onToggle();
      }}
      style={{ cursor: 'pointer' }}
    >
      <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="w-full text-left p-4 flex items-start justify-between gap-3"
        aria-expanded={expanded}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-[10px] mb-1.5">
            <span className={resultMetaSource}>{sourceLabel}</span>
            {result.category && (
              <span className={resultMetaCategory}>{result.category}</span>
            )}
          </div>
          <p className={resultTitle}>{title}</p>
          {!expanded && fullContent && (
            <p className={resultBody}>{fullContent}</p>
          )}
        </div>
        <ConfidenceTag level={confidence} />
      </button>

      {expanded && fullContent && (
        <div className="px-4 pb-4 border-t border-border/40">
          {result.source === 'faq' && result.answer && (
            <div className="mt-3 space-y-4">
              <div className={resultHeaderFaq}>
                <p className={resultFaqLabel}>Answer</p>
                <p className={resultBodyFaq}>{result.answer}</p>
              </div>
              <div className="flex items-center justify-between border-t border-border/40 pt-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-ink-soft font-medium">Was this helpful?</span>
                  <button onClick={(e) => { e.stopPropagation(); handleVote(true); }} disabled={voted !== null}
                    className={`${votePillBase} ${voted === 'helpful' ? voteUp : voteUpIdle}`}>
                    <ThumbsUpIcon /><span className="font-semibold">{hv}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleVote(false); }} disabled={voted !== null}
                    className={`${votePillBase} ${voted === 'unhelpful' ? voteDown : voteDownIdle}`}>
                    <ThumbsDownIcon /><span className="font-semibold">{uhv}</span>
                  </button>
                  {voted && <span className="text-xs text-ink-soft animate-fade-in font-medium ml-1">· Thanks for your feedback!</span>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); setShowSuggest(!showSuggest); }}
                  className={suggestCtaAccent}>
                  Suggest better answer
                </button>
              </div>
              {showSuggest && (
                <form onSubmit={handleSuggestSubmit}
                  className={suggestForm}
                  onClick={e => e.stopPropagation()}>
                  <p className={suggestLabel}>Suggest a better answer</p>
                  <textarea value={suggestion} onChange={e => setSuggestion(e.target.value)}
                    placeholder="What would be a better or more accurate answer to this question?"
                    rows={3}
                    className={suggestTextarea}
                    required />
                  {suggestError && <p className={suggestError}>{suggestError}</p>}
                  {suggestSuccess && <p className={suggestSuccess}>{suggestSuccess}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowSuggest(false)}
                      className={suggestBtnCancel}>Cancel</button>
                    <button type="submit" disabled={suggesting}
                      className={suggestBtnSubmit}>
                      {suggesting ? 'Submitting...' : 'Submit suggestion'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
          {isCommunity && result.body && (
            <div className="mt-3"><p className={resultBodyCommunity}>{result.body}</p></div>
          )}
          {isCommunity && result.answer && (
            <div className={resultHeaderCommunity}>
              <p className={resultCommunityLabel}>Official Answer</p>
              <p className={resultBodyFaqShort}>{result.answer}</p>
            </div>
          )}
        </div>
      )}

      <div className="px-4 pb-4 flex items-center justify-between border-t border-border/10 pt-3 bg-mist/30">
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={suggestCta}>
          {expanded ? (
            <>Collapse answer <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg></>
          ) : (
            <>Read full answer <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></>
          )}
        </button>
        {result.source === 'faq' && (
          <button onClick={(e) => { e.stopPropagation(); onShowHistory(result._id, title); }}
            className={suggestCtaFaint}>
            <ClockIcon /><span>History</span>
          </button>
        )}
      </div>
    </div>
  );
}
