import React, { useEffect, useState, useCallback } from 'react';
import api from '../../utils/api';
import Avatar from './Avatar';
import Badge from './Badge';
import Button from './Button';
import { useAuth } from '../../hooks/useAuth';

export interface Comment {
  _id: string;
  author?: { name?: string; _id?: string };
  body: string;
  createdAt?: string;
  upvotes?: (string | { _id?: string })[];
  downvotes?: (string | { _id?: string })[];
  verified?: boolean;
  isExpertAnswer?: boolean;
  isFirstResponder?: boolean;
  firstResponderAwardedAt?: string | null;
  depth: number;
  parentId?: string | null;
  replies?: Comment[];
  solutionDNA?: {
    steps: string[];
    tools: string[];
    timeToComplete?: string;
    difficulty?: 'Easy' | 'Moderate' | 'Tricky';
  };
}

export interface ThreadPost {
  _id: string;
  title: string;
  body?: string;
  status?: 'answered' | 'unanswered' | string;
  author?: { name?: string; _id?: string };
  createdAt?: string;
  upvotes?: (string | { _id?: string })[];
  comments?: Comment[];
  timeTrialStatus?: 'none' | 'pending' | 'awarded';
  timeTrialStartedAt?: string | null;
  timeTrialFirstResponder?: string | null;
  timeTrialFirstResponderAt?: string | null;
  timeTrialHoursRemaining?: number | null;
  answer?: string | null;
  answerIsExpert?: boolean;
  answerAuthorId?: string;
  dna?: {
    steps: string[];
    tools: string[];
    timeToComplete?: string;
    difficulty?: 'Easy' | 'Moderate' | 'Tricky';
  };
  // Escalation fields
  escalationStatus?: 'none' | 'escalated' | 'resolved' | 'dismissed';
  escalatedAt?: string | null;
  escalationReason?: string | null;
  // Bookmarks
  bookmarks?: (string | { _id?: string })[];
  // Lifecycle pipeline
  lifecycle?: {
    status: string;
    statusHistory?: Array<{
      from: string;
      to: string;
      changedBy?: { name?: string; _id?: string };
      changedAt: string;
      note?: string;
    }>;
  };
  [key: string]: unknown;
}

interface ThreadDetailProps {
  postId: string;
  onClose: () => void;
}

const formatDate = (d: string | undefined) =>
  new Date(d ?? Date.now()).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

// Reddit-style depth colors — each nesting level gets a distinct accent
const DEPTH_COLORS = [
  'border-accent',
  'border-emerald-400',
  'border-amber-400',
  'border-rose-400',
  'border-violet-400',
];
const DEPTH_BARS  = [
  'bg-accent',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-rose-400',
  'bg-violet-400',
];

const LIFECYCLE_CONFIG: Record<string, { label: string; cls: string }> = {
  open:               { label: 'Open',              cls: 'bg-mist text-ink-soft border-border' },
  answered:           { label: 'Solved',            cls: 'bg-accent-light text-accent border-accent/30' },
  community_accepted: { label: 'Community ✓',       cls: 'bg-accent-light text-accent border-accent/30' },
  ai_validated:       { label: 'AI Validated',      cls: 'bg-[rgba(139,92,246,0.1)] text-[#8b5cf6] border-[rgba(139,92,246,0.3)]' },
  admin_accepted:     { label: 'Admin Approved',    cls: 'bg-accent-light text-accent border-accent/30' },
  converted_to_faq:   { label: 'Official FAQ',      cls: 'bg-mist text-ink-soft border-border' },
};

// Count total descendants recursively
function countReplies(comment: Comment): number {
  return (comment.replies?.length ?? 0) + (comment.replies ?? []).reduce((s, r) => s + countReplies(r), 0);
}

interface CommentNodeProps {
  comment: Comment;
  postId: string;
  currentUserId: string;
  userRole: string;
  onReplyAdded: (newComment: Comment, parentId: string | null) => void;
  depth?: number;
  threadColor?: string;
  barColor?: string;
}

function CommentNode({
  comment,
  postId,
  currentUserId,
  userRole,
  onReplyAdded,
  depth = 0,
  threadColor,
  barColor,
}: CommentNodeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [localReplies, setLocalReplies] = useState<Comment[]>(comment.replies ?? []);
  const [localUpvotes, setLocalUpvotes] = useState(comment.upvotes ?? []);
  const [localDownvotes, setLocalDownvotes] = useState(comment.downvotes ?? []);

  const color = threadColor ?? DEPTH_COLORS[depth % DEPTH_COLORS.length];
  const bar  = barColor   ?? DEPTH_BARS[depth % DEPTH_BARS.length];
  const maxDepth = depth >= 4;

  const cUpvotes   = localUpvotes.length;
  const cDownvotes = localDownvotes.length;
  const netScore   = cUpvotes - cDownvotes;
  const hasUpvoted = localUpvotes.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);
  const hasDownvoted = localDownvotes.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);
  const commentOpacity = netScore >= 0 ? 1 : Math.max(0.15, 1 - Math.abs(netScore) * 0.2);
  const totalReplies = countReplies(comment) + localReplies.length;
  const isExpert = comment.isExpertAnswer;
  const isVerified = comment.verified;
  const isFirstResponder = comment.isFirstResponder;

  const doUpvote = () => {
    const previousUpvotes = localUpvotes;
    const previousDownvotes = localDownvotes;
    const isUpvoted = previousUpvotes.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);
    
    // Optimistically update states
    setLocalUpvotes(prev =>
      isUpvoted
        ? prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId)
        : [...prev, currentUserId]
    );
    setLocalDownvotes(prev =>
      prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId)
    );

    api.post<{ upvotedByMe: boolean }>(`/community/${postId}/comments/${comment._id}/upvote`)
          .then(res => {
            // Sync with server state — use current localUpvotes, not stale captured value
            setLocalUpvotes(res.data.upvotedByMe
              ? [...(localUpvotes.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)), currentUserId]
              : localUpvotes.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
            );
            setLocalDownvotes(prev =>
              prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
            );
          })
      .catch(err => {
        // Rollback
        setLocalUpvotes(previousUpvotes);
        setLocalDownvotes(previousDownvotes);
        console.error(err);
      });
  };

  const doDownvote = () => {
    const previousUpvotes = localUpvotes;
    const previousDownvotes = localDownvotes;
    const isDownvoted = previousDownvotes.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);

    // Optimistically update states
    setLocalDownvotes(prev =>
      isDownvoted
        ? prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId)
        : [...prev, currentUserId]
    );
    setLocalUpvotes(prev =>
      prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId)
    );

    api.post<{ deleted?: boolean; downvotedByMe: boolean }>(
      `/community/${postId}/comments/${comment._id}/downvote`
    ).then(res => {
      if (res.data.deleted) {
        try { new Audio('/fahhhhh.mp3').play(); } catch (_) {}
        const el = document.getElementById(`comment-${comment._id}`);
        if (el) { el.style.setProperty('--current-opacity', String(commentOpacity)); el.classList.add('comment-dying'); }
        return;
      }
      
      // Sync with server state — use current localDownvotes, not stale captured value
      setLocalDownvotes(res.data.downvotedByMe
        ? [...(localDownvotes.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)), currentUserId]
        : localDownvotes.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
      );
      setLocalUpvotes(prev =>
        prev.filter(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId)
      );
    }).catch(err => {
      // Rollback
      setLocalDownvotes(previousDownvotes);
      setLocalUpvotes(previousUpvotes);
      console.error(err);
    });
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || replyLoading) return;
    setReplyLoading(true);
    try {
      const res = await api.post<{ comment: Comment }>(
        `/community/${postId}/comments?parentId=${comment._id}`,
        { body: replyText }
      );
      setLocalReplies(prev => [...prev, res.data.comment]);
      setReplyText('');
      setShowReplyBox(false);
      onReplyAdded(res.data.comment, comment._id);
    } catch (e) { console.error(e); }
    finally { setReplyLoading(false); }
  };

  // Reddit-style: vote buttons sit on a vertical vote column left of the content
  return (
    <div
      id={`comment-${comment._id}`}
      className="flex items-stretch gap-0 transition-opacity duration-300 group/comment"
      style={{ opacity: commentOpacity }}
    >
      {/* Vote column */}
      <div className="flex flex-col items-center gap-0 mr-2 flex-shrink-0">
        <button
          onClick={doUpvote}
          className={`w-6 h-6 rounded flex items-center justify-center transition-all ${hasUpvoted ? 'text-warning' : 'text-ink-faint hover:text-orange-400'}`}
          title="Upvote"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill={hasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M5 1L9 7H1L5 1Z" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={`text-[10px] font-bold leading-none py-0.5 ${netScore > 0 ? 'text-warning' : netScore < 0 ? 'text-accent' : 'text-ink-faint'}`}>
          {netScore > 0 ? '+' : ''}{netScore || '0'}
        </span>
        <button
          onClick={doDownvote}
          className={`w-6 h-6 rounded flex items-center justify-center transition-all ${hasDownvoted ? 'text-accent' : 'text-ink-faint hover:text-accent'}`}
          title="Downvote"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill={hasDownvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M5 9L1 3H9L5 9Z" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Thread line + content column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Collapse toggle row */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-1.5 mb-0.5 text-left hover:opacity-80 transition-opacity"
          title={collapsed ? 'Expand thread' : 'Collapse thread'}
        >
          {/* Vertical tree line */}
          <div className={`w-0.5 h-4 flex-shrink-0 rounded-full ${bar} ${collapsed ? 'opacity-30' : 'opacity-100'} transition-all`} />
          <span className="text-[10px] text-ink-faint font-medium">
            {collapsed
              ? `[+${totalReplies + 1}]`
              : `[-]`
            }
          </span>
        </button>

        {!collapsed && (
          <>
            {/* Comment card */}
            <div
              className={`rounded-xl px-3 py-2.5 relative overflow-hidden ${
                isExpert ? 'bg-accent/5 border border-accent/20' : 'bg-mist'
              }`}
            >
              {netScore > 2 && <div className="comment-fire-glow" />}
              <div className="relative z-10">
                {/* Header: avatar + author + badge + time + score */}
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <Avatar name={comment.author?.name} size="xs" />
                  <span className="text-xs font-semibold text-ink">{comment.author?.name || 'User'}</span>
                  {isExpert && <Badge variant="accent">👑</Badge>}
                  {isVerified && <span className="text-[10px] text-emerald-500">✓</span>}
                  {isFirstResponder && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-warning-light border border-warning/30 text-warning text-[10px] font-bold">
                      🏅 First Responder
                    </span>
                  )}
                  <span className="text-[10px] text-ink-faint">·</span>
                  <span className="text-[10px] text-ink-faint">{formatDate(comment.createdAt)}</span>
                  {depth > 0 && (
                    <span className={`text-[10px] font-medium ml-1 px-1.5 py-0.5 rounded-full border ${color.replace('border-', 'border-')} ${color.replace('border-', 'text-')} ${color.replace('border-', 'bg-')}/10`}>
                      ↳ depth {depth}
                    </span>
                  )}
                  <span className={`ml-auto text-[10px] font-bold ${netScore > 0 ? 'text-warning' : netScore < 0 ? 'text-accent' : 'text-ink-faint'}`}>
                    {netScore > 0 ? '+' : ''}{netScore} pts
                  </span>
                </div>

                {/* Body */}
                <p className="text-sm text-ink/75 leading-relaxed whitespace-pre-wrap break-words">{comment.body}</p>

                {/* Actions */}
                <div className="flex items-center gap-1 mt-2">
                  <button
                    onClick={() => !hasUpvoted && doUpvote()}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${hasUpvoted ? 'text-warning bg-orange-500/10' : 'text-ink-faint hover:text-warning hover:bg-orange-500/10'}`}
                  >
                    {hasUpvoted ? '↑ Upvoted' : '↑ Upvote'}
                  </button>
                  <button
                    onClick={() => !hasDownvoted && doDownvote()}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${hasDownvoted ? 'text-accent bg-accent-light/10' : 'text-ink-faint hover:text-accent hover:bg-accent-light/10'}`}
                  >
                    {hasDownvoted ? '↓ Downvoted' : '↓ Downvote'}
                  </button>
                  {!maxDepth && (
                    <button
                      onClick={() => setShowReplyBox(v => !v)}
                      className="text-[10px] text-ink-faint hover:text-accent transition-colors px-1.5 py-0.5 rounded hover:bg-accent/10"
                    >
                      {showReplyBox ? '✕ Cancel' : '↩ Reply'}
                    </button>
                  )}
                  {(userRole === 'admin' || userRole === 'moderator') && (
                    <button
                      onClick={() =>
                        api.patch<{ verified: boolean }>(`/community/${postId}/comments/${comment._id}/verify`)
                          .then(res => { comment.verified = res.data.verified; })
                          .catch(console.error)
                      }
                      className="ml-auto text-[10px] text-ink-faint hover:text-emerald-500 transition-colors"
                    >
                      {isVerified ? 'Unverify' : '✅ Verify'}
                    </button>
                  )}
                </div>

                {/* Reply form */}
                {showReplyBox && (
                  <form onSubmit={handleReply} className="mt-2 flex gap-1.5 items-start">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={2}
                      placeholder={`Reply to ${comment.author?.name || 'user'}…`}
                      className="flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none"
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={!replyText.trim()} loading={replyLoading} className="flex-shrink-0 mt-0.5">
                      Post
                    </Button>
                  </form>
                )}
              </div>
            </div>

            {/* Children */}
            {localReplies.length > 0 && (
              <div className={`mt-1 border-l-2 ${color.replace('border-', 'border-')}/40 rounded-bl ml-1 pl-2 space-y-1`}>
                {localReplies.map(reply => (
                  <CommentNode
                    key={reply._id}
                    comment={reply}
                    postId={postId}
                    currentUserId={currentUserId}
                    userRole={userRole}
                    onReplyAdded={onReplyAdded}
                    depth={depth + 1}
                    threadColor={DEPTH_COLORS[(depth + 1) % DEPTH_COLORS.length]}
                    barColor={DEPTH_BARS[(depth + 1) % DEPTH_BARS.length]}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── ThreadDetail Modal ───────────────────────────────────────────────────────

export default function ThreadDetail({ postId, onClose }: ThreadDetailProps) {
  const { user } = useAuth();
  const currentUserId = user?._id ?? '';
  const userRole = user?.role ?? '';

  const [post, setPost] = useState<ThreadPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [upvoteLoading, setUpvoteLoading] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolveText, setResolveText] = useState('');
  const [resolveLoading, setResolveLoading] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [related, setRelated] = useState<{
    relatedQuestions: Array<{ _id: string; title: string; tags: string[]; matchScore: number; upvotes: number; url: string }>;
    similarFaqs:      Array<{ _id: string; title: string; tags: string[]; matchScore: number; upvotes: number; url: string }>;
  }>({ relatedQuestions: [], similarFaqs: [] });

  const isAnswered = post?.status === 'answered';
  const upvoteCount = post?.upvotes?.length ?? 0;
  const hasUpvoted = post?.upvotes?.some(
    (id) => (typeof id === 'object' ? (id as { _id?: string })._id || id : id)?.toString() === currentUserId
  );
  const canResolve = userRole === 'admin' || userRole === 'moderator' || userRole === 'expert';
  const isPrivileged = userRole === 'admin' || userRole === 'moderator';
  const topLevelComments = post?.comments ?? [];

  useEffect(() => {
    setLoading(true);
    api.get<ThreadPost>(`/community/${postId}`)
      .then((res) => setPost(res.data))
      .catch(() => setError('Failed to load post.'))
      .finally(() => setLoading(false));
  }, [postId]);

  // Load related questions + similar FAQs (per spec thread-detail sections)
  useEffect(() => {
    if (!postId) return;
    api.get<typeof related>(`/community/${postId}/related`)
      .then(r => setRelated(r.data))
      .catch(() => setRelated({ relatedQuestions: [], similarFaqs: [] }));
  }, [postId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleUpvote = async () => {
    if (!post) return;
    
    const previousUpvotes = post.upvotes ?? [];
    const isUpvoted = previousUpvotes.some(
      (id) => (typeof id === 'object' ? (id as { _id?: string })._id || id : id)?.toString() === currentUserId
    );

    // Optimistic state update
    const nextUpvotes = isUpvoted
      ? previousUpvotes.filter((u) => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
      : [...previousUpvotes, currentUserId];

    setPost((prev) =>
      prev ? {
        ...prev,
        upvotes: nextUpvotes,
      } : prev
    );

    try {
      const res = await api.post<{ upvotedByMe: boolean }>(`/community/${post._id}/upvote`);
      // Sync with server state
      setPost((prev) =>
        prev ? {
          ...prev,
          upvotes: res.data.upvotedByMe
            ? [...previousUpvotes.filter((u) => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId), currentUserId]
            : previousUpvotes.filter((u) => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() !== currentUserId),
        } : prev
      );
    } catch (e) {
      // Rollback
      setPost((prev) =>
        prev ? {
          ...prev,
          upvotes: previousUpvotes,
        } : prev
      );
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Upvote failed. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || commentLoading || !post) return;
    setCommentLoading(true);
    try {
      const res = await api.post<{ comment: Comment }>(`/community/${post._id}/comments`, { body: commentText });
      setPost((prev) =>
        prev ? { ...prev, comments: [...(prev.comments ?? []), res.data.comment] } : prev
      );
      setCommentText('');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Comment failed. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    }
    finally { setCommentLoading(false); }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveText.trim() || resolveLoading || !post) return;
    setResolveLoading(true);
    try {
      await api.patch(`/community/${post._id}/resolve`, { answer: resolveText });
      setPost((prev) =>
        prev ? { ...prev, status: 'answered', answer: resolveText.trim() } : prev
      );
      setShowResolveForm(false);
      setResolveText('');
    } catch (e) { console.error(e); }
    finally { setResolveLoading(false); }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim() || reportLoading || !post) return;
    setReportLoading(true);
    try {
      await api.post(`/community/${post._id}/report`, { reason: reportReason.trim() });
      setReportDone(true);
      setShowReportForm(false);
    } catch (e) { console.error(e); }
    finally { setReportLoading(false); }
  };

  const handleReplyAdded = useCallback((newComment: Comment, parentId: string | null) => {
    if (newComment.depth === 0) {
      setPost((prev) => {
        if (!prev) return prev;
        const exists = (prev.comments ?? []).some((c) => c._id === newComment._id);
        if (exists) return prev;
        return { ...prev, comments: [...(prev.comments ?? []), newComment] };
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/40 backdrop-blur-sm">
        <p className="text-ink-faint">{error || 'Post not found.'}</p>
        <Button variant="secondary" onClick={onClose}>← Back</Button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-float overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}>
        {/* Action error banner */}
        {actionError && (
          <div className="mx-5 mt-4 px-4 py-2.5 bg-danger-light border border-danger/20 rounded-xl text-xs text-danger flex items-center justify-between gap-2">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-danger/60 hover:text-danger font-bold text-sm leading-none">✕</button>
          </div>
        )}
        {/* Sticky header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card flex-shrink-0">
          <button onClick={onClose} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-mist text-sm font-medium text-ink-soft hover:text-ink hover:bg-border transition-all">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Community
          </button>
          <Badge variant={isAnswered ? 'success' : 'warning'}>
            {isAnswered ? '✓ Answered' : '○ Open'}
          </Badge>
          {post.lifecycle?.status && LIFECYCLE_CONFIG[post.lifecycle.status] && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${LIFECYCLE_CONFIG[post.lifecycle.status].cls}`}>
              {LIFECYCLE_CONFIG[post.lifecycle.status].label}
            </span>
          )}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {/* Post */}
          <div className="px-5 py-4">
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5 ${isAnswered ? 'bg-success-light text-success' : 'bg-warning-light text-warning'}`}>
                {isAnswered ? (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3.5 9L7.5 13L14.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.7"/>
                    <path d="M9 6V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                    <circle cx="9" cy="12.5" r="0.9" fill="currentColor"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-semibold text-ink leading-snug">{post.title}</h1>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs text-ink-soft">by {post.author?.name || 'Student'}</span>
                  <span className="text-xs text-ink-faint">·</span>
                  <span className="text-xs text-ink-faint">{formatDate(post.createdAt)}</span>
                  {isPrivileged && post.timeTrialStatus === 'pending' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger-light border border-danger/30 text-danger text-xs font-semibold">
                      ⚡ Time-Trial Active
                      {post.timeTrialHoursRemaining != null && (
                        <span className="font-mono"> · {post.timeTrialHoursRemaining}h left</span>
                      )}
                    </span>
                  )}
                  {isPrivileged && post.timeTrialStatus === 'awarded' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-light border border-warning/30 text-warning text-xs font-semibold">
                      🏅 First Responder Challenge — Resolved
                    </span>
                  )}
                  {isPrivileged && post.escalationStatus === 'escalated' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger-light border border-danger/30 text-danger text-xs font-semibold">
                      ⚠ Escalated{post.escalationReason ? ` — ${post.escalationReason}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm text-ink/70 leading-relaxed pl-[3.25rem]">{post.body}</p>
            <div className="flex items-center gap-2 mt-3 pl-[3.25rem]">
              <button
                onClick={handleUpvote}
                disabled={upvoteLoading}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${hasUpvoted ? 'bg-accent text-white' : 'bg-mist text-ink-soft hover:text-ink hover:bg-border'}`}
              >
                <span className="text-sm">{hasUpvoted ? '🔥' : '🤌'}</span>
                {upvoteCount > 0 && <span>{upvoteCount}</span>}
                <span className="text-[10px] opacity-70">{hasUpvoted ? 'Upvoted' : 'Upvote'}</span>
              </button>

              {reportDone ? (
                <span className="text-xs text-success font-medium">✓ Reported</span>
              ) : showReportForm ? (
                <form onSubmit={handleReport} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Reason for reporting…"
                    maxLength={200}
                    autoFocus
                    className="rounded-lg border border-border bg-mist px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-danger/30 w-44"
                  />
                  <button type="submit" disabled={reportLoading || !reportReason.trim()} className="rounded-lg bg-danger text-white px-2.5 py-1.5 text-xs font-medium hover:bg-danger/80 transition-all disabled:opacity-50">
                    {reportLoading ? '…' : 'Send'}
                  </button>
                  <button type="button" onClick={() => { setShowReportForm(false); setReportReason(''); }} className="rounded-lg bg-mist text-ink-soft px-2.5 py-1.5 text-xs hover:text-ink transition-all">
                    ✕
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowReportForm(true)}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-ink-faint hover:text-danger hover:bg-danger-light transition-all"
                  title="Report this post"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2h8v5.5L7 10.5 5.5 9.5V8H2V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    <path d="M4.5 5.5h3M4.5 7h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Report
                </button>
              )}
              {post.bookmarks != null && (
                <button
                  onClick={() => api.post(`/community/${post._id}/bookmark`).then(() => {
                    setPost(prev => prev ? {
                      ...prev,
                      bookmarks: prev.bookmarks?.some(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId)
                        ? prev.bookmarks.filter(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() !== currentUserId)
                        : [...(prev.bookmarks ?? []), currentUserId]
                    } : prev);
                  }).catch(console.error)}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-all ${
                    post.bookmarks.some(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId)
                      ? 'bg-accent text-white'
                      : 'bg-mist text-ink-soft hover:text-accent hover:bg-border'
                  }`}
                  title={post.bookmarks.some(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId) ? 'Remove bookmark' : 'Bookmark this'}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill={post.bookmarks.some(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 2.5C2 1.67 2.67 1 3.5 1h5C9.33 1 10 1.67 10 2.5v7.5L7 8.5 4 10V2.5z" strokeLinejoin="round"/>
                  </svg>
                  {post.bookmarks.length > 0 && post.bookmarks.length}
                  {post.bookmarks.some(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId) ? 'Saved' : 'Save'}
                </button>
              )}
            </div>
          </div>

          {/* Official answer */}
          {isAnswered && post.answer && (
            <div className="mx-5 mb-4 bg-success-light/30 border border-success/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-success uppercase tracking-wider">✓ Official Answer</span>
                {post.answerIsExpert && <Badge variant="success">👑 Expert</Badge>}
              </div>
              <p className="text-sm text-ink/80 leading-relaxed">{post.answer}</p>

              {/* DNA Strip */}
              {post.dna && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">Solution DNA</span>
                  {post.dna.steps.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-xs font-medium text-accent">
                      {post.dna.steps.length} step{post.dna.steps.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {post.dna.tools.map((tool, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mist border border-border text-xs text-ink-soft">
                      {tool}
                    </span>
                  ))}
                  {post.dna.timeToComplete && (
                    <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <circle cx="5" cy="5" r="4"/>
                        <path d="M5 3V5L6.5 6.5" strokeLinecap="round"/>
                      </svg>
                      {post.dna.timeToComplete}
                    </span>
                  )}
                  {post.dna.difficulty && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      post.dna.difficulty === 'Easy' ? 'bg-accent-light text-accent border border-accent/30' :
                      post.dna.difficulty === 'Moderate' ? 'bg-warning-light text-warning border border-warning/30' :
                      'bg-danger-light text-danger border border-danger/30'
                    }`}>
                      {post.dna.difficulty}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Resolve form */}
          {canResolve && !isAnswered && !showResolveForm && (
            <div className="px-5 pb-4">
              <button onClick={() => setShowResolveForm(true)} className="text-xs text-accent hover:text-accent/70 transition-colors">
                ✏️ Write an answer
              </button>
            </div>
          )}
          {showResolveForm && (
            <form onSubmit={handleResolve} className="px-5 pb-4 space-y-2">
              <label className="text-xs font-medium text-ink-soft">Official Answer</label>
              <textarea value={resolveText} onChange={(e) => setResolveText(e.target.value)} rows={3}
                placeholder="Write an official answer…"
                className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none" />
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={resolveLoading} disabled={!resolveText.trim()}>Save Answer</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowResolveForm(false)}>Cancel</Button>
              </div>
            </form>
          )}

          {/* Lifecycle Activity Timeline */}
          {post.lifecycle?.statusHistory && post.lifecycle.statusHistory.length > 0 && (
            <div className="px-5 py-4 border-t border-border/30">
              <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <circle cx="6" cy="6" r="5"/>
                  <path d="M6 3V6.5L8 8" strokeLinecap="round"/>
                </svg>
                Lifecycle History
              </h3>
              <div className="relative pl-4">
                {/* Vertical timeline line */}
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                <div className="space-y-3">
                  {post.lifecycle.statusHistory.map((entry, i) => {
                    const lcTo = LIFECYCLE_CONFIG[entry.to];
                    return (
                      <div key={i} className="relative flex items-start gap-3">
                        {/* Dot */}
                        <div className="relative z-10 w-3 h-3 rounded-full border-2 border-border bg-card flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {LIFECYCLE_CONFIG[entry.from] && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${LIFECYCLE_CONFIG[entry.from].cls}`}>
                                {LIFECYCLE_CONFIG[entry.from].label}
                              </span>
                            )}
                            <span className="text-xs text-ink-faint">→</span>
                            {lcTo && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${lcTo.cls}`}>
                                {lcTo.label}
                              </span>
                            )}
                          </div>
                          {entry.note && <p className="text-xs text-ink-soft mt-0.5">{entry.note}</p>}
                          <p className="text-[10px] text-ink-faint mt-0.5">
                            by {entry.changedBy?.name || 'System'} · {formatDate(entry.changedAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Related Questions + Similar FAQs (per spec) */}
          {(related.relatedQuestions.length > 0 || related.similarFaqs.length > 0) && (
            <div className="px-5 py-4 border-t border-border/30 grid sm:grid-cols-2 gap-4">
              {related.relatedQuestions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M2 4h6M2 6h6M2 8h4"/>
                      <path d="M9 3l2 1.5L9 6"/>
                    </svg>
                    Related Questions
                  </h3>
                  <div className="space-y-1.5">
                    {related.relatedQuestions.map((q) => (
                      <button
                        key={q._id}
                        onClick={() => window.location.href = q.url}
                        className="w-full text-left rounded-lg bg-mist/50 hover:bg-mist px-2.5 py-2 transition-colors group"
                      >
                        <p className="text-xs text-ink line-clamp-2 group-hover:text-accent transition-colors">{q.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-ink-faint">{q.upvotes}↑</span>
                          <span className="text-[10px] text-accent">· {q.matchScore} match</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {related.similarFaqs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M2 3h8v6H2z M2 6h8"/>
                    </svg>
                    Similar FAQs
                  </h3>
                  <div className="space-y-1.5">
                    {related.similarFaqs.map((f) => (
                      <button
                        key={f._id}
                        onClick={() => window.location.href = f.url}
                        className="w-full text-left rounded-lg bg-mist/50 hover:bg-mist px-2.5 py-2 transition-colors group"
                      >
                        <p className="text-xs text-ink line-clamp-2 group-hover:text-accent transition-colors">{f.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-ink-faint">{f.upvotes} helpful</span>
                          <span className="text-[10px] text-accent">· {f.matchScore} match</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comments — Reddit-style threaded */}
          <div className="px-5 py-4 border-t border-border/30">
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3">
              Discussion ({topLevelComments.length})
            </h3>
            {topLevelComments.length === 0 ? (
              <p className="text-sm text-ink-faint text-center py-6">No comments yet. Be the first to comment!</p>
            ) : (
              <div className="space-y-2">
                {topLevelComments.map((comment: Comment) => (
                  <CommentNode
                    key={comment._id}
                    comment={comment}
                    postId={post._id}
                    currentUserId={currentUserId}
                    userRole={userRole}
                    onReplyAdded={handleReplyAdded}
                    depth={0}
                    threadColor={DEPTH_COLORS[0]}
                    barColor={DEPTH_BARS[0]}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer — new comment */}
        <form onSubmit={handleComment} className="px-4 pt-3 pb-5 border-t border-border bg-card flex-shrink-0">
          <div className="flex gap-2 items-start">
            <Avatar name={user?.name} size="sm" />
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={2}
              placeholder="Add to the discussion…"
              className="flex-1 rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!commentLoading) handleComment(e); }
              }} />
            <Button type="submit" size="md" disabled={!commentText.trim()} loading={commentLoading} className="flex-shrink-0 mt-0.5">
              Post
            </Button>
          </div>
          <p className="text-xs text-ink-faint mt-1.5 ml-10">Enter to post · Shift+Enter for newline · Esc to close</p>
        </form>
      </div>
    </div>
  );
}