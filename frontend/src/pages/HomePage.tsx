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

// Hand-drawn doodle decorations — green glow in dark mode, warm muted in light
const doodleStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
  pointerEvents: 'none' as const,
  opacity: 'var(--doodle-opacity)' as unknown as number,
  filter: 'var(--doodle-glow)' as string,
  ...extra,
});

function DoodleElements(): React.ReactNode {
  return (
    <>
      {/* Curly bracket — left of hero */}
      <div className="absolute -top-6 -left-16 hidden lg:block" style={doodleStyle()}>
        <svg width="60" height="120" viewBox="0 0 60 120" fill="none">
          <path d="M48 10 C30 10, 26 22, 26 34 C26 46, 18 52, 6 55 C18 58, 26 64, 26 76 C26 88, 30 100, 48 100" stroke="var(--doodle-primary)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

      {/* "Let's solve it!" speech bubble */}
      <div className="absolute -top-10 left-[30px] hidden lg:block" style={doodleStyle({ transform: 'rotate(-6deg)' })}>
        <svg width="120" height="90" viewBox="0 0 120 90" fill="none">
          <ellipse cx="58" cy="32" rx="48" ry="26" stroke="var(--doodle-primary)" strokeWidth="2" strokeDasharray="6 4" fill="none"/>
          <path d="M76 54 L90 78 L70 52" stroke="var(--doodle-primary)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <text x="24" y="28" fontSize="12" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="var(--doodle-muted)">Let&apos;s</text>
          <text x="20" y="43" fontSize="12" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="var(--doodle-muted)">solve it!</text>
        </svg>
      </div>

      {/* Big sparkle — top right area */}
      <div className="absolute top-[-10px] right-[24%] hidden lg:block" style={doodleStyle()}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <path d="M18 2 L18 34 M2 18 L34 18 M6 6 L30 30 M30 6 L6 30" stroke="var(--doodle-accent)" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Small star cluster — left side */}
      <div className="absolute top-[15px] left-[14%] hidden lg:block" style={doodleStyle()}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 0 L12 24 M0 12 L24 12" stroke="var(--doodle-green)" strokeWidth="2" strokeLinecap="round"/>
          <path d="M4 4 L20 20 M20 4 L4 20" stroke="var(--doodle-green)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Another small sparkle — right of heading */}
      <div className="absolute top-[5px] right-[8%] hidden lg:block" style={doodleStyle()}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 1 L10 19 M1 10 L19 10" stroke="var(--doodle-green)" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M4 4 L16 16 M16 4 L4 16" stroke="var(--doodle-green)" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Curved arrow — below bracket */}
      <div className="absolute top-[130px] -left-10 hidden lg:block" style={doodleStyle()}>
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <path d="M14 10 C28 34, 42 50, 66 62" stroke="var(--doodle-primary)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M54 56 L66 62 L58 70" stroke="var(--doodle-primary)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Lightbulb doodle — top right */}
      <div className="absolute -top-4 -right-16 hidden lg:block" style={doodleStyle()}>
        <svg width="65" height="85" viewBox="0 0 65 85" fill="none">
          <path d="M32 14 C18 14, 12 24, 12 33 C12 42, 18 47, 23 54 L41 54 C46 47, 52 42, 52 33 C52 24, 46 14, 32 14Z" stroke="var(--doodle-accent)" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          <line x1="23" y1="59" x2="41" y2="59" stroke="var(--doodle-accent)" strokeWidth="2.2" strokeLinecap="round"/>
          <line x1="26" y1="64" x2="38" y2="64" stroke="var(--doodle-accent)" strokeWidth="2.2" strokeLinecap="round"/>
          {/* Rays */}
          <line x1="32" y1="2" x2="32" y2="8" stroke="var(--doodle-accent)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="9" y1="14" x2="14" y2="19" stroke="var(--doodle-accent)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="55" y1="14" x2="50" y2="19" stroke="var(--doodle-accent)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="2" y1="33" x2="8" y2="33" stroke="var(--doodle-accent)" strokeWidth="2" strokeLinecap="round"/>
          <line x1="56" y1="33" x2="62" y2="33" stroke="var(--doodle-accent)" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Question mark — far right */}
      <div className="absolute top-[220px] -right-16 hidden lg:block" style={doodleStyle()}>
        <svg width="44" height="68" viewBox="0 0 44 68" fill="none">
          <path d="M12 18 C12 6, 32 6, 32 18 C32 28, 22 30, 22 42" stroke="var(--doodle-primary)" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
          <circle cx="22" cy="52" r="3" fill="var(--doodle-primary)"/>
        </svg>
      </div>

      {/* Pencil — left side lower */}
      <div className="absolute top-[210px] left-[-24px] hidden lg:block" style={doodleStyle()}>
        <svg width="55" height="55" viewBox="0 0 55 55" fill="none">
          <path d="M42 5 L14 36 L12 48 L24 44 L52 15 Z" stroke="var(--doodle-muted)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="34" y1="13" x2="42" y2="21" stroke="var(--doodle-muted)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Code brackets — right side lower */}
      <div className="absolute top-[340px] right-[-16px] hidden lg:block" style={doodleStyle()}>
        <svg width="50" height="60" viewBox="0 0 50 60" fill="none">
          <path d="M18 5 L6 30 L18 55" stroke="var(--doodle-muted)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M32 5 L44 30 L32 55" stroke="var(--doodle-muted)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="15" y1="22" x2="35" y2="22" stroke="var(--doodle-muted)" strokeWidth="1.8" strokeLinecap="round"/>
          <line x1="15" y1="38" x2="35" y2="38" stroke="var(--doodle-muted)" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Wavy squiggle — mid-right */}
      <div className="absolute top-[175px] right-[10%] hidden lg:block" style={doodleStyle()}>
        <svg width="100" height="18" viewBox="0 0 100 18" fill="none">
          <path d="M2 9 Q14 2, 26 9 Q38 16, 50 9 Q62 2, 74 9 Q86 16, 98 9" stroke="var(--doodle-green)" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
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
      expanded ? 'border-accent/30 bg-cream' : 'border-border/70 bg-card/80 hover:bg-cream'
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
                        ? 'border-danger/30 bg-danger-light text-danger'
                        : 'border-border text-ink-faint hover:border-danger/30 hover:text-danger'
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
                    className="w-full text-xs p-3 rounded-xl border border-border bg-card focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y"
                    required
                  />
                  {suggestError && <p className="text-[11px] text-danger">{suggestError}</p>}
                  {suggestSuccess && <p className="text-[11px] text-success">{suggestSuccess}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSuggest(false)}
                      className="px-3 py-1.5 rounded-full border border-border bg-card text-[11px] font-semibold text-ink-soft hover:bg-cream transition-colors"
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
  const [showAllPopular, setShowAllPopular] = useState(false);
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
            Ask. Discover. Get{' '}
            <span className="doodle-underline font-serif text-accent" style={{ fontWeight: 700 }}>Solved.</span>
          </h1>

          <p className="text-sm sm:text-base text-ink-soft mb-6 sm:mb-8 max-w-lg leading-relaxed mx-auto px-2">
            Search your doubt or explore solved questions from the community.
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
                              className="h-[86px] rounded-2xl border border-border/60 bg-card/70 animate-pulse"
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

                        {!loading && !searchError && matchingResults.length === 0 && isReadyForResults && (
                          <div className="rounded-2xl border border-dashed border-border bg-card/70 p-4">
                            <p className="text-xs text-ink-soft">
                              No matches found. Try a different phrase or ask the community.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 rounded-2xl border border-border/70 bg-card/80 p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-ink">Need a human answer?</p>
                          <p className="text-[11px] text-ink-soft">Ask the community and get help faster.</p>
                        </div>
                        <button
                          onClick={() => navigate(`/community?ask=true&title=${encodeURIComponent(query.trim())}`)}
                          className="shrink-0 px-3 py-2 rounded-full bg-ink text-bg text-[11px] font-semibold hover:bg-ink/85 transition-colors"
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
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl border border-border/60 bg-card/70 text-left hover:bg-cream transition-colors"
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
                        <div className="mt-2 flex flex-wrap gap-2">
                          {trendingLoading && (
                            [1, 2, 3].map((i) => (
                              <div key={i} className="h-8 w-24 rounded-full border border-border/60 bg-card/70 animate-pulse" />
                            ))
                          )}

                          {!trendingLoading && (showAllPopular ? popularItems : popularItems.slice(0, 5)).map((item) => (
                            <button
                              key={item.query}
                              onClick={() => handleQuickSearch(item.query)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-card/70 hover:bg-cream transition-colors group"
                            >
                              <span className="text-ink-faint group-hover:text-leaf transition-colors">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4" />
                                  <path d="M6 3.5V6L8 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                </svg>
                              </span>
                              <span className="text-sm text-ink capitalize whitespace-nowrap">{item.query}</span>
                              {item.count !== undefined && (
                                <span className="text-[11px] text-ink-faint ml-1">{item.count}</span>
                              )}
                            </button>
                          ))}

                          {!trendingLoading && popularItems.length > 5 && (
                            <button
                              onClick={() => setShowAllPopular(!showAllPopular)}
                              className="text-[11px] font-semibold text-leaf hover:underline px-2 py-1.5"
                            >
                              {showAllPopular ? 'Show less' : 'View more'}
                            </button>
                          )}
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