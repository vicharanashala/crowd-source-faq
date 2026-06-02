import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import SearchBar from '../components/ui/SearchBar';
import CategoryGrid, { categoryPills } from '../components/ui/CategoryGrid';
import TopSolved from '../components/ui/TopSolved';
import TrendingIssues from '../components/ui/TrendingIssues';
import FromMeetings from '../components/ui/FromMeetings';
import CTA from '../components/ui/CTA';
import api from '../utils/api';
import type { SearchResult, TrendingQuery } from '../types/ui';

// Hand-drawn doodle decorations
function DoodleElements(): React.ReactNode {
  return (
    <>
      {/* Curly bracket doodle */}
      <div className="absolute -top-6 -left-16 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="50" height="100" viewBox="0 0 50 100" fill="none" style={{ opacity: 0.3 }}>
          <path d="M40 8 C26 8, 22 18, 22 28 C22 38, 16 44, 6 46 C16 48, 22 54, 22 64 C22 74, 26 84, 40 84" stroke="#b8a080" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

      {/* "Let's solve it!" speech bubble */}
      <div className="absolute -top-8 left-[40px] hidden lg:block" style={{ pointerEvents: 'none', transform: 'rotate(-6deg)' }}>
        <svg width="105" height="80" viewBox="0 0 105 80" fill="none" style={{ opacity: 0.32 }}>
          <ellipse cx="52" cy="28" rx="42" ry="22" stroke="#b8a080" strokeWidth="2" strokeDasharray="6 4" fill="none"/>
          <path d="M68 46 L80 68 L62 44" stroke="#b8a080" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <text x="22" y="25" fontSize="11" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="#8a7560" opacity="0.85">Let&apos;s</text>
          <text x="18" y="38" fontSize="11" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="#8a7560" opacity="0.85">solve it!</text>
        </svg>
      </div>

      {/* Big sparkle */}
      <div className="absolute top-2 right-[28%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ opacity: 0.35 }}>
          <path d="M14 2 L14 26 M2 14 L26 14 M5 5 L23 23 M23 5 L5 23" stroke="#c4943a" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Small star */}
      <div className="absolute top-[20px] left-[16%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ opacity: 0.3 }}>
          <path d="M9 0 L9 18 M0 9 L18 9" stroke="#5a7a5a" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M3 3 L15 15 M15 3 L3 15" stroke="#5a7a5a" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Curved arrow */}
      <div className="absolute top-[120px] -left-10 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="70" height="70" viewBox="0 0 70 70" fill="none" style={{ opacity: 0.3 }}>
          <path d="M12 8 C24 30, 36 44, 58 54" stroke="#b8a080" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          <path d="M48 48 L58 54 L50 60" stroke="#b8a080" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Lightbulb doodle */}
      <div className="absolute -top-4 -right-14 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="55" height="75" viewBox="0 0 55 75" fill="none" style={{ opacity: 0.3 }}>
          <path d="M27 12 C16 12, 10 20, 10 28 C10 36, 16 40, 20 46 L34 46 C38 40, 44 36, 44 28 C44 20, 38 12, 27 12Z" stroke="#c4943a" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <line x1="20" y1="50" x2="34" y2="50" stroke="#c4943a" strokeWidth="2" strokeLinecap="round"/>
          <line x1="22" y1="54" x2="32" y2="54" stroke="#c4943a" strokeWidth="2" strokeLinecap="round"/>
          <line x1="27" y1="2" x2="27" y2="7" stroke="#c4943a" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="8" y1="12" x2="12" y2="16" stroke="#c4943a" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="46" y1="12" x2="42" y2="16" stroke="#c4943a" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="2" y1="28" x2="7" y2="28" stroke="#c4943a" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="47" y1="28" x2="52" y2="28" stroke="#c4943a" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Question mark doodle */}
      <div className="absolute top-[210px] -right-14 hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" style={{ opacity: 0.35 }}>
          <path d="M12 16 C12 6, 28 6, 28 16 C28 24, 20 26, 20 36" stroke="#b8a080" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <circle cx="20" cy="44" r="2.5" fill="#b8a080"/>
        </svg>
      </div>

      {/* Pencil doodle */}
      <div className="absolute top-[200px] left-[-20px] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="50" height="50" viewBox="0 0 50 50" fill="none" style={{ opacity: 0.28 }}>
          <path d="M38 5 L12 32 L10 42 L20 40 L46 13 Z" stroke="#8a7560" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="30" y1="12" x2="38" y2="20" stroke="#8a7560" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Code brackets */}
      <div className="absolute top-[330px] right-[-12px] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="45" height="55" viewBox="0 0 45 55" fill="none" style={{ opacity: 0.28 }}>
          <path d="M16 5 L6 27 L16 49" stroke="#8a7560" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M29 5 L39 27 L29 49" stroke="#8a7560" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="14" y1="20" x2="31" y2="20" stroke="#8a7560" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="14" y1="34" x2="31" y2="34" stroke="#8a7560" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Wavy squiggle */}
      <div className="absolute top-[170px] right-[12%] hidden lg:block" style={{ pointerEvents: 'none' }}>
        <svg width="90" height="16" viewBox="0 0 90 16" fill="none" style={{ opacity: 0.3 }}>
          <path d="M2 8 Q12 2, 22 8 Q32 14, 42 8 Q52 2, 62 8 Q72 14, 82 8" stroke="#5a7a5a" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
    </>
  );
}

const fallbackPopular = [
  'offer letter',
  'noc request',
  'team formation',
  'project submission',
  'certificate',
];

const getConfidenceLevel = (result: SearchResult): string => {
  const vectorScore = Number(result.vectorScore || 0);
  const textScore = Number(result.textScore || 0);

  if (textScore >= 2 || vectorScore >= 0.9) return 'High';
  if (textScore > 0 || vectorScore >= 0.82) return 'Medium';
  return 'Low';
};

interface ConfidenceTagProps {
  level: string;
}

function ConfidenceTag({ level }: ConfidenceTagProps) {
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
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
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

interface ResultItemProps {
  result: SearchResult;
  expanded: boolean;
  onToggle: () => void;
  onShowHistory: (id: string, question: string) => void;
  navigate: ReturnType<typeof import('react-router-dom').useNavigate>;
}

function ResultItem({ result, expanded, onToggle, onShowHistory, navigate }: ResultItemProps) {
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
      if (helpful) {
        setHv(v => v + 1);
      } else {
        setUhv(v => v + 1);
      }
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
      setTimeout(() => {
        setShowSuggest(false);
        setSuggestSuccess('');
      }, 3000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to submit suggestion. Please try again.';
      setSuggestError(msg);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
      expanded ? 'border-accent/30 bg-cream' : 'border-border/70 bg-white/80 hover:bg-cream'
    }`}
      onClick={() => {
        if (isCommunity && result._id) {
          navigate(`/community?post=${result._id}`);
        } else {
          onToggle();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="w-full text-left p-4 flex items-start justify-between gap-3"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-[10px] mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-mist text-ink-soft font-semibold uppercase tracking-wider">
              {sourceLabel}
            </span>
            {result.category && (
              <span className="px-2.5 py-0.5 rounded-full bg-accent-light text-accent font-semibold uppercase tracking-wider">
                {result.category}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-ink leading-snug">
            {title}
          </p>
          {!expanded && fullContent && (
            <p className="mt-1.5 text-xs text-ink-soft leading-relaxed line-clamp-2">
              {fullContent}
            </p>
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
                <p className="text-sm text-ink/75 leading-relaxed whitespace-pre-wrap">
                  {result.answer}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-border/40 pt-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-ink-soft font-medium">Was this helpful?</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVote(true); }}
                    disabled={voted !== null}
                    title="Helpful"
                    className={`inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full border transition-all duration-200 ${
                      voted === 'helpful'
                        ? 'border-accent/40 bg-accent-light text-accent'
                        : 'border-border text-ink-faint hover:border-accent/40 hover:text-accent'
                    } disabled:cursor-default`}
                  >
                    <ThumbsUpIcon />
                    <span className="font-semibold">{hv}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVote(false); }}
                    disabled={voted !== null}
                    title="Not helpful"
                    className={`inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full border transition-all duration-200 ${
                      voted === 'unhelpful'
                        ? 'border-red-200 bg-red-50 text-red-600'
                        : 'border-border text-ink-faint hover:border-red-200 hover:text-red-500'
                    } disabled:cursor-default`}
                  >
                    <ThumbsDownIcon />
                    <span className="font-semibold">{uhv}</span>
                  </button>
                  {voted && <span className="text-xs text-ink-soft animate-fade-in font-medium ml-1">· Thanks for your feedback!</span>}
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); setShowSuggest(!showSuggest); }}
                  className="text-xs font-semibold text-accent hover:text-accent-dark hover:underline transition-colors"
                >
                  Suggest better answer
                </button>
              </div>

              {showSuggest && (
                <form onSubmit={handleSuggestSubmit} className="mt-3 bg-mist/60 border border-border/70 rounded-2xl p-4 space-y-3 animate-fade-in" onClick={e => e.stopPropagation()}>
                  <p className="text-xs font-semibold text-ink">Suggest a better answer</p>
                  <textarea
                    value={suggestion}
                    onChange={(e) => setSuggestion(e.target.value)}
                    placeholder="What would be a better or more accurate answer to this question?"
                    rows={3}
                    className="w-full text-xs p-3 rounded-xl border border-border bg-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y"
                    required
                  />
                  {suggestError && <p className="text-[11px] text-danger">{suggestError}</p>}
                  {suggestSuccess && <p className="text-[11px] text-success">{suggestSuccess}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSuggest(false)}
                      className="px-3 py-1.5 rounded-full border border-border bg-white text-[11px] font-semibold text-ink-soft hover:bg-cream transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={suggesting}
                      className="px-4 py-1.5 rounded-full bg-accent text-white text-[11px] font-semibold hover:bg-accent-dark transition-colors disabled:opacity-50"
                    >
                      {suggesting ? 'Submitting...' : 'Submit suggestion'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {isCommunity && result.body && (
            <div className="mt-3">
              <p className="text-sm text-ink/70 leading-relaxed">{result.body}</p>
            </div>
          )}

          {isCommunity && result.answer && (
            <div className="mt-3 rounded-xl bg-success-light border border-success/15 p-4">
              <p className="text-[11px] font-semibold text-success mb-2 uppercase tracking-wide">
                Official Answer
              </p>
              <p className="text-sm text-ink/75 leading-relaxed">{result.answer}</p>
            </div>
          )}
        </div>
      )}

      {/* Bottom Toggler Action Bar */}
      <div className="px-4 pb-4 flex items-center justify-between border-t border-border/10 pt-3 bg-mist/30">
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-accent transition-colors"
        >
          {expanded ? (
            <>
              Collapse answer
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </>
          ) : (
            <>
              Read full answer
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </>
          )}
        </button>

        {result.source === 'faq' && (
          <button
            onClick={(e) => { e.stopPropagation(); onShowHistory(result._id, title); }}
            title="View verification history log"
            className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink-soft transition-colors"
          >
            <ClockIcon />
            <span>History</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface HistoryModalProps {
  faqId: string;
  faqQuestion: string;
  onClose: () => void;
}

function HistoryModal({ faqId, faqQuestion, onClose }: HistoryModalProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    api.get(`/faq/${faqId}/history`)
      .then((res) => {
        if (isMounted) setLogs(res.data.logs || []);
      })
      .catch((err) => {
        console.error('Failed to load history', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [faqId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-float w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-serif font-semibold text-ink uppercase tracking-wide">FAQ Verification History</h3>
            <p className="text-xs text-ink-soft mt-1 line-clamp-1">{faqQuestion}</p>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink transition-colors p-1.5 rounded-full hover:bg-mist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="space-y-3 py-6 animate-pulse">
              <div className="h-4 bg-mist rounded w-1/3"></div>
              <div className="h-3 bg-mist rounded w-full"></div>
              <div className="h-3 bg-mist rounded w-2/3"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <span className="text-2xl">🌱</span>
              <p className="text-sm font-medium text-ink mt-2">No verification log events found</p>
              <p className="text-xs text-ink-soft mt-1">This FAQ has been verified and stable since its creation.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-border pl-5 ml-2.5 space-y-6">
              {logs.map((log) => {
                let title = '';
                let details = '';
                let icon = 'ℹ️';
                let iconBg = 'bg-mist';
                let iconColor = 'text-ink-soft';

                switch (log.event) {
                  case 'auto_flag':
                    title = 'Auto-Flagged';
                    details = 'System automatically marked this FAQ as stale and due for verification.';
                    icon = '🤖';
                    iconBg = 'bg-warning-light';
                    iconColor = 'text-warning';
                    break;
                  case 'manual_flag':
                    title = 'Flagged by User';
                    details = `Marked as outdated: "${log.metadata?.reason || 'No reason provided'}"`;
                    icon = '🚩';
                    iconBg = 'bg-danger-light';
                    iconColor = 'text-danger';
                    break;
                  case 'freshness_vote':
                    title = 'Peer Review Vote';
                    details = `Vote cast: ${log.metadata?.verdict === 'still_accurate' ? 'Accurate' : 'Needs Update'}${
                      log.metadata?.action ? ` (${log.metadata.action})` : ''
                    }`;
                    icon = '🗳️';
                    iconBg = 'bg-accent-light';
                    iconColor = 'text-accent';
                    break;
                  case 'auto_verified':
                    title = 'Auto-Verified';
                    details = `Verified as accurate by community consensus (${log.metadata?.voteCount || 0} votes).`;
                    icon = '✓';
                    iconBg = 'bg-success-light';
                    iconColor = 'text-success';
                    break;
                  case 'mod_verified':
                    title = 'Verified by Moderator';
                    details = 'A moderator verified and updated the FAQ content.';
                    icon = '🛡️';
                    iconBg = 'bg-success-light';
                    iconColor = 'text-success';
                    break;
                  case 'mod_dismissed':
                    title = 'Flag Dismissed';
                    details = 'Moderator reviewed the outdated flag and dismissed it.';
                    icon = '✓';
                    iconBg = 'bg-success-light';
                    iconColor = 'text-success';
                    break;
                  case 'escalated':
                    title = 'Escalated to Mod';
                    details = `Escalated for moderator review: "${log.metadata?.reason || 'Needs update votes cast'}"`;
                    icon = '⚠';
                    iconBg = 'bg-warning-light';
                    iconColor = 'text-warning';
                    break;
                  default:
                    title = log.event;
                    details = JSON.stringify(log.metadata || {});
                }

                return (
                  <div key={log._id} className="relative">
                    <span className={`absolute -left-[31px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${iconBg} ${iconColor} border-2 border-card`}>
                      {icon}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-ink">{title}</p>
                      {details && <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{details}</p>}
                      <p className="text-[10px] text-ink-faint mt-1">
                        {new Date(log.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [trending, setTrending] = useState<TrendingQuery[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyFaq, setHistoryFaq] = useState<{ id: string; question: string } | null>(null);
  const searchBarRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    api.get('/search/trending')
      .then((res) => {
        if (isMounted) setTrending(res.data.trending || []);
      })
      .catch(() => {
        if (isMounted) setTrending([]);
      })
      .finally(() => {
        if (isMounted) setTrendingLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setExpandedId(null);
  }, [results]);

  const normalizedQuery = query.trim().toLowerCase();
  const isTyping = normalizedQuery.length > 0;
  const isReadyForResults = query.trim().length >= 3;
  const showDropdown = isTyping || loading || Array.isArray(results);
  const showResultsPanel = loading || Array.isArray(results);
  const isSearchActive = showResultsPanel && isReadyForResults;

  let suggestionItems = normalizedQuery
    ? categoryPills.filter((cat) => cat.name.toLowerCase().includes(normalizedQuery))
    : categoryPills.slice(0, 5);
  if (normalizedQuery && suggestionItems.length === 0) {
    suggestionItems = categoryPills.slice(0, 5);
  }

  const popularItems = trending.length
    ? trending
    : fallbackPopular.map((item) => ({ query: item, count: undefined }));

  const matchingResults = Array.isArray(results) ? results : [];

  const handleQuickSearch = async (selectedQuery: string) => {
    const nextQuery = selectedQuery.trim();
    if (!nextQuery) return;

    setQuery(nextQuery);
    setExpandedId(null);
    setLoading(true);
    setResults(null);
    setSearchError(null);
    searchBarRef.current?.focus();
    window.scrollTo({ top: 200, behavior: 'smooth' });

    try {
      const res = await api.post('/search', { query: nextQuery });
      setResults(res.data.results);
    } catch (err: any) {
      if (axios.isCancel(err)) return;
      setResults([]);
      setSearchError('Search failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (categoryName: string) => {
    setActiveCategory(categoryName);
    handleQuickSearch(categoryName);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (activeCategory && value.trim().toLowerCase() !== activeCategory.toLowerCase()) {
      setActiveCategory('');
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setLoading(false);
    setSearchError(null);
    setActiveCategory('');
    setExpandedId(null);
  };

  return (
    <div className="min-h-screen bg-bg grid-bg">
      <Navbar />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-8">
        {/* Hero heading */}
        <section className="relative text-center mb-8">
          <DoodleElements />

          <h1 className="font-serif text-[1.75rem] sm:text-4xl md:text-5xl lg:text-[3.2rem] leading-[1.15] tracking-tight text-ink mb-3">
            Every intern doubt,{' '}
            <span className="doodle-underline font-serif" style={{ fontWeight: 700 }}>solved.</span>
            <svg className="inline-block ml-2 align-middle" width="24" height="18" viewBox="0 0 24 18" style={{ opacity: 0.18 }}>
              <path d="M2 12 Q6 4 12 9 Q18 14 22 6" stroke="#1f1f1f" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          </h1>

          <p className="text-sm sm:text-base text-ink-soft mb-6 sm:mb-8 max-w-lg leading-relaxed mx-auto px-2">
            Search a doubt, or read questions pulled straight from your team's Zoom sessions.
          </p>
        </section>

        {/* Backdrop blur overlay when search is active */}
        {showDropdown && (
          <div
            className="fixed inset-0 z-30 bg-ink/20 backdrop-blur-sm transition-opacity duration-300"
            onClick={handleClear}
            aria-hidden="true"
          />
        )}

        {/* Search + Categories */}
        <section className="relative mb-10 sm:mb-12">
          <div className={`relative max-w-3xl mx-auto ${showDropdown ? 'z-40' : 'z-20'}`}>
            <SearchBar
              ref={searchBarRef}
              value={query}
              onQueryChange={handleQueryChange}
              onResults={setResults}
              onLoading={setLoading}
              onError={setSearchError}
              disableSuggestions={true}
            />

            {showDropdown && (
              <div className="absolute left-0 right-0 top-full mt-3 z-40 animate-fade-in">
                <div className="rounded-3xl border border-border bg-card/95 backdrop-blur-xl shadow-float">
                  <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] text-ink-faint mb-1">
                        <button
                          onClick={handleClear}
                          className="hover:text-ink transition-colors flex items-center gap-1"
                        >
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 2L3 6L9 10" />
                          </svg>
                          Home
                        </button>
                        <span>›</span>
                        <span className="font-medium text-ink">
                          {showResultsPanel
                            ? `Results for "${query}"`
                            : `Suggestions for "${query}"`}
                        </span>
                      </div>
                      {!isTyping && (
                        <p className="text-sm text-ink mt-0.5">
                          Results for <span className="font-semibold">"{query}"</span>
                        </p>
                      )}
                    </div>
                    {isTyping && (
                      <button
                        onClick={handleClear}
                        className="text-xs font-medium text-ink-soft hover:text-ink transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[1.35fr_0.95fr]">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
                          Matching questions
                        </p>
                        {showResultsPanel && (
                          <span className="text-xs text-ink-faint">
                            {matchingResults.length} found
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {loading && (
                          [1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="h-[86px] rounded-2xl border border-border/60 bg-white/70 animate-pulse"
                            />
                          ))
                        )}

                        {!loading && matchingResults.length > 0 && matchingResults.map((result, idx) => {
                          const resultKey = result._id || `${result.source || 'result'}-${idx}`;
                          const isExpanded = expandedId === resultKey;
                          return (
                            <ResultItem
                              key={resultKey}
                              result={result}
                              expanded={isExpanded}
                              onToggle={() => setExpandedId(isExpanded ? null : resultKey)}
                              onShowHistory={(id, question) => setHistoryFaq({ id, question })}
                              navigate={navigate}
                            />
                          );
                        })}

                        {searchError && (
                          <div className="rounded-2xl bg-danger-light border border-danger/15 p-4 text-xs text-danger">
                            {searchError}
                          </div>
                        )}

                        {!loading && !searchError && matchingResults.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-border bg-white/70 p-4">
                            <p className="text-xs text-ink-soft">
                              {isReadyForResults
                                ? 'No matches found. Try a different phrase or ask the community.'
                                : 'Keep typing to see matching questions.'}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 rounded-2xl border border-border/70 bg-white/80 p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-ink">Need a human answer?</p>
                          <p className="text-[11px] text-ink-soft">Ask the community and get help faster.</p>
                        </div>
                        <button
                          onClick={() => navigate('/community')}
                          className="shrink-0 px-3 py-2 rounded-full bg-ink text-white text-[11px] font-semibold hover:bg-ink/85 transition-colors"
                        >
                          Ask community
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
                          Suggestions
                        </p>
                        <div className="mt-2 space-y-1">
                          {suggestionItems.map((cat) => (
                            <button
                              key={cat.name}
                              onClick={() => handleQuickSearch(cat.name)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl border border-border/60 bg-white/70 text-left hover:bg-cream transition-colors"
                            >
                              <span className="text-ink-faint">{cat.icon}</span>
                              <span className="text-sm text-ink">{cat.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
                          Popular searches
                        </p>
                        <div className="mt-2 space-y-1">
                          {trendingLoading && (
                            [1, 2, 3].map((i) => (
                              <div key={i} className="h-10 rounded-2xl border border-border/60 bg-white/70 animate-pulse" />
                            ))
                          )}

                          {!trendingLoading && popularItems.map((item) => (
                            <button
                              key={item.query}
                              onClick={() => handleQuickSearch(item.query)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-2xl border border-border/60 bg-white/70 text-left hover:bg-cream transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-ink-faint">
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4" />
                                    <path d="M6 3.5V6L8 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                  </svg>
                                </span>
                                <span className="text-sm text-ink capitalize">{item.query}</span>
                              </div>
                              {item.count !== undefined && (
                                <span className="text-[11px] text-ink-faint">{item.count}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={`mt-5 sm:mt-6 transition-all duration-300 ${
            showDropdown ? 'opacity-70 translate-y-1' : 'opacity-100'
          }`}>
            <CategoryGrid
              activeCategory={activeCategory}
              onSelect={handleCategorySelect}
            />
          </div>
        </section>

        {/* Top Solved + Trending Issues Row */}
        {!isSearchActive && (
          <section className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 sm:gap-8 items-start">
            <TopSolved />
            <div className="lg:mt-14 mt-0">
              <TrendingIssues />
            </div>
          </section>
        )}

        {/* From Zoom Meetings — the project's actual goal, surfaced for interns */}
        {!isSearchActive && <FromMeetings />}

        {/* CTA */}
        {!isSearchActive && <CTA />}

        {/* Footer */}
        <Footer />
      </main>

      {historyFaq && (
        <HistoryModal
          faqId={historyFaq.id}
          faqQuestion={historyFaq.question}
          onClose={() => setHistoryFaq(null)}
        />
      )}
    </div>
  );
}