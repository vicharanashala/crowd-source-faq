import React from 'react';
import Badge from '../ui/Badge';
import { useAuth } from '../../hooks/useAuth';
import type { Post } from '../../types/ui';
import { buildGcsTransformedUrl } from '../../utils/gcsTransform';
import { idMatches } from '../../utils/idMatch';

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ─── Lifecycle chip config ────────────────────────────────────────────────────
const LIFECYCLE_CONFIG: Record<string, { label: string; cls: string }> = {
  open:               { label: 'Open',              cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  answered:           { label: 'Solved',            cls: 'bg-accent/10 text-accent border-accent/30' },
  community_accepted: { label: 'Community ✓',       cls: 'bg-accent/10 text-accent border-accent/30' },
  ai_validated:       { label: 'AI Validated',      cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  admin_accepted:     { label: 'Admin Approved',    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  converted_to_faq:   { label: 'Official FAQ',      cls: 'bg-stone-100 text-stone-700 border-stone-300' },
};

interface CommunityPostCardProps {
  post: Post;
  onClick?: (post: Post) => void;
  currentUserId?: string;
  /** Called when the user clicks the bookmark toggle. Card does NOT update its own bookmark state. */
  onToggleBookmark?: (postId: string) => void;
}

export default function CommunityPostCard({ post, onClick, currentUserId, onToggleBookmark }: CommunityPostCardProps) {
  const isAnswered = post.status === 'answered';
  const upvoteCount = (post.upvotes?.length ?? 0) as number;
  const commentCount = (post.comments?.length ?? 0) as number;
  const hasUpvoted = post.upvotes?.some((id) => idMatches(id, currentUserId)) ?? false;

  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'moderator';

  // Time-Trial countdown is hidden on the public community list — only admins see it inside a thread.
  // (was: showTimeTrial = isPrivileged && timeTrial === 'pending')
  const showAwardedTrial = isPrivileged && post.timeTrialStatus === 'awarded';
  const showEscalated = isPrivileged && post.escalationStatus === 'escalated';

  // Card border color — gold for awarded, red-striped for escalated
  const cardBorder = showAwardedTrial
    ? 'border-l-4 border-l-yellow-400'
    : showEscalated
    ? 'border-l-4 border-l-red-500'
    : '';

  return (
    <div
      onClick={() => onClick?.(post)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(post);
        }
      }}
      role="button"
      tabIndex={0}
      className={`bg-card rounded-2xl border border-border shadow-subtle w-full text-left p-4 flex items-start gap-4
                 card-hover group transition-all duration-300 cursor-pointer ${cardBorder}`}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5
                       ${isAnswered ? 'bg-success-light text-success' : 'bg-warning-light text-warning'}`}>
        {isAnswered ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
        {(() => {
          const programName = typeof post.batchId === 'object' && post.batchId !== null && 'name' in post.batchId
            ? (post.batchId as { name: string }).name
            : null;
          if (!programName) return null;
          return (
            <div className="mb-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-accent/10 border border-accent/25 text-[9px] font-bold text-accent uppercase tracking-wider">
                {programName}
              </span>
            </div>
          );
        })()}
        <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors leading-snug">
          {post.title}
        </p>
        <p className="mt-1 text-xs text-ink-soft leading-relaxed line-clamp-1">{post.body}</p>

        {post.tags && post.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {post.tags.slice(0, 3).map((tag: string) => (
              <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[11px] font-medium text-accent">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Image attachments — Cloudinary thumbnails */}
        {(() => {
          const atts = (post as Post & { attachments?: Array<{ url: string; objectPath?: string; publicId?: string }> }).attachments;
          if (!Array.isArray(atts) || atts.length === 0) return null;
          return (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {atts.slice(0, 4).map((a) => (
                <div key={a.objectPath ?? a.publicId} className="w-14 h-14 rounded-lg overflow-hidden border border-border bg-mist">
                  <img
                    src={buildGcsTransformedUrl(a.url, 'w_120,h_120,c_fill,q_auto,f_auto')}
                    alt="attachment"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
              {atts.length > 4 && (
                <div className="w-14 h-14 rounded-lg border border-border bg-mist flex items-center justify-center text-xs font-semibold text-ink-soft">
                  +{atts.length - 4}
                </div>
              )}
            </div>
          );
        })()}

        <div className="mt-2 flex items-center gap-2 flex-wrap">
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
          {post.lifecycle?.status && LIFECYCLE_CONFIG[post.lifecycle.status] && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${LIFECYCLE_CONFIG[post.lifecycle.status].cls}`}>
              {LIFECYCLE_CONFIG[post.lifecycle.status].label}
            </span>
          )}
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
          {post.bookmarks && post.bookmarks.length > 0 && onToggleBookmark && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleBookmark(post._id); }}
              className="flex items-center gap-1 text-xs text-accent font-medium"
              title="Remove bookmark"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 2.5C2 1.67 2.67 1 3.5 1h5C9.33 1 10 1.67 10 2.5v7.5L7 8.5 4 10V2.5z" strokeLinejoin="round"/>
              </svg>
              {post.bookmarks.length}
            </button>
          )}
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
                post.dna.difficulty === 'Easy' ? 'bg-accent/10 text-accent border border-accent/30' :
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
    </div>
  );
}