import React, { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '../ui/Badge';
import api from '../../utils/api';
import type { SearchResult } from '../../types/ui';

interface SourceBadgeProps {
  source: string;
}

const SourceBadge = ({ source }: SourceBadgeProps): ReactNode => {
  return source === 'faq' ? (
    <Badge variant="info">FAQ</Badge>
  ) : (
    <Badge variant="accent" className="bg-warning-light text-warning">Community</Badge>
  );
};

interface ResultCardProps {
  result: SearchResult;
}

const ResultCard = ({ result }: ResultCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const title = result.question || result.title || '';
  const fullContent = result.answer || result.body || '';
  const hasContent = !!fullContent;
  const isAnswered = result.status === 'answered';
  const isCommunity = result.source === 'community';
  const isFAQ = result.source === 'faq';

  const handleCardClick = () => {
    setExpanded((v) => !v);
  };

  const handleViewFull = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFAQ) {
      sessionStorage.setItem('yaksha_faq_highlight', JSON.stringify(result));
      navigate('/faq');
    } else {
      navigate(`/community?post=${result._id}`);
    }
  };

  return (
    <div
      className={`bg-card rounded-2xl border shadow-subtle card-hover transition-all duration-300 overflow-hidden
        ${expanded ? 'border-accent/25 shadow-card-hover' : 'border-border hover:border-accent/15'}`}
      onClick={handleCardClick}
    >
      <button
        onClick={handleCardClick}
        className="w-full text-left p-4 flex items-start justify-between gap-3 group"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="text-sm font-medium text-ink leading-snug group-hover:text-accent transition-colors">
              {title}
            </p>
          </div>

          {!expanded && hasContent && (
            <p className="mt-1.5 text-xs text-ink-soft leading-relaxed line-clamp-2">
              {fullContent}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <SourceBadge source={result.source || 'faq'} />
            {result.status && (
              <Badge variant={isAnswered ? 'success' : 'warning'}>
                {isAnswered ? '✓ Answered' : '○ Open'}
              </Badge>
            )}
            {result.category && (
              <span className="text-xs text-ink-faint">{result.category}</span>
            )}
          </div>
        </div>

        <span className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200
          ${expanded ? 'bg-accent-light text-accent rotate-180' : 'bg-mist text-ink-faint group-hover:text-ink-soft'}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          {isFAQ && fullContent && (
            <div className="mt-3 rounded-xl bg-accent-light border border-accent/15 p-4">
              <p className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">Answer</p>
              <p className="text-sm text-ink/75 leading-relaxed whitespace-pre-wrap">{fullContent}</p>
              <button
                onClick={handleViewFull}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-dark transition-colors"
              >
                View full answer
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 6H10M7 3L10 6L7 9" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          )}

          {isCommunity && result.body && (
            <div className="mt-3">
              <p className="text-sm text-ink/70 leading-relaxed">{result.body}</p>
            </div>
          )}

          {isCommunity && result.answer && (
            <div className="mt-3 rounded-xl bg-success-light border border-success/15 p-4">
              <p className="text-xs font-semibold text-success mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <path d="M5 0L6.2 3.5H10L7 5.5L8 9L5 7L2 9L3 5.5L0 3.5H3.8L5 0Z"/>
                </svg>
                Official Answer
              </p>
              <p className="text-sm text-ink/75 leading-relaxed">{result.answer}</p>
            </div>
          )}

          {isCommunity && !result.answer && (
            <div className="mt-3 rounded-xl bg-warning-light border border-warning/15 p-3">
              <p className="text-xs text-warning">
                This question hasn't been answered yet. Head to the Community Board to help!
              </p>
            </div>
          )}

          {isCommunity && (
            <button
              onClick={handleViewFull}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-dark transition-colors"
            >
              Join discussion
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 6H10M7 3L10 6L7 9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface CommunityBoardCardProps {
  query?: string;
}

const CommunityBoardCard = ({ query }: CommunityBoardCardProps) => {
  const navigate = useNavigate();
  const href = query ? `/community?ask=true&query=${encodeURIComponent(query)}` : '/community';

  return (
    <button
      onClick={() => navigate(href)}
      className="bg-card rounded-2xl border border-border shadow-subtle p-4 flex items-center justify-between group card-hover w-full text-left"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center text-accent">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 3h12v8H9l-3 2v-2H2V3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Ask the community</p>
          <p className="text-xs text-ink-soft">Couldn't find what you needed? Ask a question</p>
        </div>
      </div>
      <span className="text-ink-faint group-hover:text-accent transition-colors">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    </button>
  );
};

interface AlternativePost {
  _id: string;
  title: string;
  body: string;
  authorName?: string;
  upvotes?: unknown[];
  comments?: unknown[];
  answer?: string;
  status: string;
}

interface SearchResultsProps {
  results: SearchResult[] | null;
  loading: boolean;
  searchQuery?: string;
}

export default function SearchResults({ results, loading, searchQuery }: SearchResultsProps) {
  const navigate = useNavigate();
  const [alternatives, setAlternatives] = useState<AlternativePost[]>([]);

  // Fetch alternatives when results are 0
  React.useEffect(() => {
    if (results && results.length === 0 && searchQuery) {
      api.get<{ posts: AlternativePost[] }>('/community/solved?limit=3')
        .then(r => setAlternatives(r.data.posts ?? []))
        .catch(() => {});
    } else if (results && results.length > 0) {
      setAlternatives([]);
    }
  }, [results, searchQuery]);

  if (loading) {
    return (
      <div className="mt-6 w-full max-w-2xl mx-auto space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-2xl border border-border shadow-subtle p-4 animate-pulse">
            <div className="h-3.5 bg-mist rounded w-3/4 mb-2" />
            <div className="h-3 bg-mist rounded w-full mb-1" />
            <div className="h-3 bg-mist rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (!results) return null;

  if (results.length === 0) {
    return (
      <div className="mt-6 w-full max-w-2xl mx-auto space-y-4">
        {/* No results state */}
        <div className="text-center py-6">
          <p className="text-base font-medium text-ink mb-1">No results{searchQuery ? ` for "${searchQuery}"` : ''}</p>
          <p className="text-sm text-ink-soft">Couldn't find what you needed? Ask the community!</p>
        </div>

        <CommunityBoardCard query={searchQuery} />

        {/* Alternative answered posts */}
        {alternatives.length > 0 && (
          <div>
            <p className="text-xs text-ink-faint font-medium uppercase tracking-wide mb-3">
              Recently answered questions you might find useful
            </p>
            <div className="space-y-2">
              {alternatives.map((post) => (
                <button
                  key={post._id}
                  onClick={() => navigate(`/community?post=${post._id}`)}
                  className="w-full bg-card rounded-xl border border-border p-4 text-left hover:border-accent/20 hover:shadow-subtle transition-all duration-200"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-success-light flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink line-clamp-1">{post.title}</p>
                      {post.answer && (
                        <p className="text-xs text-ink-soft mt-1 line-clamp-1">{post.answer}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 w-full max-w-2xl mx-auto space-y-3">
      <p className="text-xs text-ink-faint font-medium uppercase tracking-wide">
        Top results — click to expand
      </p>
      {results.map((result, idx) => (
        <ResultCard key={result._id || idx} result={result} />
      ))}
      <CommunityBoardCard />
    </div>
  );
}