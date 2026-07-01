import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import type { SearchResult } from '../../types/ui';

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
      ? 'bg-success-light text-success'
      : level === 'Medium'
        ? 'bg-warning-light text-warning'
        : 'bg-mist text-ink-faint';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${colorClass}`}>
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
      className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
        expanded ? 'border-accent/30 bg-cream' : 'border-border/70 bg-card/80 hover:bg-cream'
      }`}
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
            <span className="px-2.5 py-0.5 rounded-full bg-mist text-ink-soft font-semibold uppercase tracking-wider">{sourceLabel}</span>
            {result.category && (
              <span className="px-2.5 py-0.5 rounded-full bg-accent-light text-accent font-semibold uppercase tracking-wider">{result.category}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-ink leading-snug">{title}</p>
          {!expanded && fullContent && (
            <p className="mt-1.5 text-xs text-ink-soft leading-relaxed line-clamp-2">{fullContent}</p>
          )}
        </div>
        <ConfidenceTag level={confidence} />
      </button>

      {expanded && fullContent && (
        <div className="px-4 pb-4 border-t border-border/40">
          {result.source === 'faq' && result.answer && (
            <div className="mt-3 space-y-4">
              <div className="rounded-xl bg-accent-light border border-accent/15 p-4">
                <p className="text-[11px] font-semibold text-accent mb-2 uppercase tracking-wide">Answer</p>
                <p className="text-sm text-ink/75 leading-relaxed whitespace-pre-wrap">{result.answer}</p>
              </div>
              <div className="flex items-center justify-between border-t border-border/40 pt-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-ink-soft font-medium">Was this helpful?</span>
                  <button onClick={(e) => { e.stopPropagation(); handleVote(true); }} disabled={voted !== null}
                    className={`inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full border transition-all duration-200 ${
                      voted === 'helpful' ? 'border-accent/40 bg-accent-light text-accent' : 'border-border text-ink-faint hover:border-accent/40 hover:text-accent'
                    } disabled:cursor-default`}>
                    <ThumbsUpIcon /><span className="font-semibold">{hv}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleVote(false); }} disabled={voted !== null}
                    className={`inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full border transition-all duration-200 ${
                      voted === 'unhelpful' ? 'border-red-200 bg-red-50 text-red-600' : 'border-border text-ink-faint hover:border-red-200 hover:text-red-500'
                    } disabled:cursor-default`}>
                    <ThumbsDownIcon /><span className="font-semibold">{uhv}</span>
                  </button>
                  {voted && <span className="text-xs text-ink-soft animate-fade-in font-medium ml-1">· Thanks for your feedback!</span>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); setShowSuggest(!showSuggest); }}
                  className="text-xs font-semibold text-accent hover:text-accent-dark hover:underline transition-colors">
                  Suggest better answer
                </button>
              </div>
              {showSuggest && (
                <form onSubmit={handleSuggestSubmit}
                  className="mt-3 bg-mist/60 border border-border/70 rounded-2xl p-4 space-y-3 animate-fade-in"
                  onClick={e => e.stopPropagation()}>
                  <p className="text-xs font-semibold text-ink">Suggest a better answer</p>
                  <textarea value={suggestion} onChange={e => setSuggestion(e.target.value)}
                    placeholder="What would be a better or more accurate answer to this question?"
                    rows={3}
                    className="w-full text-xs p-3 rounded-xl border border-border bg-card focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y"
                    required />
                  {suggestError && <p className="text-[11px] text-danger">{suggestError}</p>}
                  {suggestSuccess && <p className="text-[11px] text-success">{suggestSuccess}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowSuggest(false)}
                      className="px-3 py-1.5 rounded-full border border-border bg-card text-[11px] font-semibold text-ink-soft hover:bg-cream transition-colors">Cancel</button>
                    <button type="submit" disabled={suggesting}
                      className="px-4 py-1.5 rounded-full bg-accent text-accent-text text-[11px] font-semibold hover:bg-accent-dark transition-colors disabled:opacity-50">
                      {suggesting ? 'Submitting...' : 'Submit suggestion'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
          {isCommunity && result.body && (
            <div className="mt-3"><p className="text-sm text-ink/70 leading-relaxed">{result.body}</p></div>
          )}
          {isCommunity && result.answer && (
            <div className="mt-3 rounded-xl bg-success-light border border-success/15 p-4">
              <p className="text-[11px] font-semibold text-success mb-2 uppercase tracking-wide">Official Answer</p>
              <p className="text-sm text-ink/75 leading-relaxed">{result.answer}</p>
            </div>
          )}
        </div>
      )}

      <div className="px-4 pb-4 flex items-center justify-between border-t border-border/10 pt-3 bg-mist/30">
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-accent transition-colors">
          {expanded ? (
            <>Collapse answer <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg></>
          ) : (
            <>Read full answer <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></>
          )}
        </button>
        {result.source === 'faq' && (
          <button onClick={(e) => { e.stopPropagation(); onShowHistory(result._id, title); }}
            className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink-soft transition-colors">
            <ClockIcon /><span>History</span>
          </button>
        )}
      </div>
    </div>
  );
}