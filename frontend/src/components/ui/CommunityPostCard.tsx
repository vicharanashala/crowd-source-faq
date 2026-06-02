import React from 'react';
import Badge from './Badge';
import { useAuth } from '../../hooks/useAuth';
import type { Post } from '../../types/ui';

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface CommunityPostCardProps {
  post: Post;
  onClick?: (post: Post) => void;
  currentUserId?: string;
}

export default function CommunityPostCard({ post, onClick, currentUserId }: CommunityPostCardProps) {
  const isAnswered = post.status === 'answered';
  const upvoteCount = (post.upvotes?.length ?? 0) as number;
  const commentCount = (post.comments?.length ?? 0) as number;
  const hasUpvoted = post.upvotes?.some((id) => {
    const idStr = typeof id === 'object' ? (id as { _id?: string })._id || String(id) : String(id);
    return idStr === currentUserId;
  }) ?? false;

  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'moderator';

  const timeTrial = post.timeTrialStatus;
  const showTimeTrial = isPrivileged && timeTrial === 'pending';
  const showAwardedTrial = isPrivileged && timeTrial === 'awarded';
  const showEscalated = isPrivileged && post.escalationStatus === 'escalated';

  // Card border color — urgent red for active time-trial, gold for awarded, red-striped for escalated
  const cardBorder = showTimeTrial
    ? 'border-l-4 border-l-red-400'
    : showAwardedTrial
    ? 'border-l-4 border-l-yellow-400'
    : showEscalated
    ? 'border-l-4 border-l-red-500'
    : '';

  return (
    <button
      onClick={() => onClick?.(post)}
      className={`bg-card rounded-2xl border border-border shadow-subtle w-full text-left p-4 flex items-start gap-4
                 card-hover group transition-all duration-300 ${cardBorder}`}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5
                       ${isAnswered ? 'bg-success-light text-success' : showTimeTrial ? 'bg-red-50 text-red-400' : 'bg-warning-light text-warning'}`}>
        {isAnswered ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : showTimeTrial ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L9 6H13L9.5 8.5L10.5 12.5L8 10L5.5 12.5L6.5 8.5L3 6H7L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="0.75" fill="currentColor"/>
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors leading-snug">
          {post.title}
        </p>
        <p className="mt-1 text-xs text-ink-soft leading-relaxed line-clamp-1">{post.body}</p>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {showTimeTrial && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
              ⚡ Time-Trial
              {post.timeTrialHoursRemaining != null && (
                <span className="font-mono"> {post.timeTrialHoursRemaining}h left</span>
              )}
            </span>
          )}
          {showAwardedTrial && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-50 border border-yellow-300 text-yellow-700 text-xs font-semibold">
              🏅 First Responder Won
            </span>
          )}
          {showEscalated && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
              ⚠ Escalated
            </span>
          )}
          <Badge variant={isAnswered ? 'success' : 'warning'}>
            {isAnswered ? '✓ Answered' : '○ Open'}
          </Badge>
          <span className="text-xs text-ink-faint">{post.author?.name || 'Student'}</span>
          <span className="text-ink-faint text-xs">·</span>
          <span className="text-xs text-ink-faint">{formatDate(post.createdAt || '')}</span>
          <span className={`ml-auto flex items-center gap-1 text-xs ${hasUpvoted ? 'text-accent font-medium' : 'text-ink-faint'}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill={hasUpvoted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
              <path d="M6 1L7.5 4H11L8.5 6.5L9.5 10L6 7.5L2.5 10L3.5 6.5L1 4H4.5L6 1Z" strokeLinejoin="round"/>
            </svg>
            {upvoteCount}
          </span>
          <span className="flex items-center gap-1 text-xs text-ink-faint">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 2.5C1 1.67 1.67 1 2.5 1h7C10.33 1 11 1.67 11 2.5v5C11 8.33 10.33 9 9.5 9H7L4.5 11V9H2.5C1.67 9 1 8.33 1 7.5v-5z" strokeLinejoin="round"/>
            </svg>
            {commentCount}
          </span>
        </div>

        {/* DNA Strip for answered posts */}
        {isAnswered && post.dna && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {post.dna.steps.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[11px] font-medium text-accent">
                {post.dna.steps.length} step{post.dna.steps.length !== 1 ? 's' : ''}
              </span>
            )}
            {post.dna.tools.slice(0, 3).map((tool, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mist border border-border text-[11px] text-ink-faint">
                {tool}
              </span>
            ))}
            {post.dna.tools.length > 3 && (
              <span className="text-[10px] text-ink-faint">+{post.dna.tools.length - 3}</span>
            )}
            {post.dna.difficulty && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                post.dna.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                post.dna.difficulty === 'Moderate' ? 'bg-yellow-50 text-yellow-600 border border-yellow-200' :
                'bg-red-50 text-red-500 border border-red-200'
              }`}>
                {post.dna.difficulty}
              </span>
            )}
          </div>
        )}
      </div>

      <span className="flex-shrink-0 text-ink-faint group-hover:text-accent transition-colors mt-2">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M4.5 2.5L9.5 7L4.5 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    </button>
  );
}