import React, { useEffect, useState, useCallback } from 'react';
import api, { friendlyError } from '../../utils/api';
import Avatar from './Avatar';
import Badge from './Badge';
import Button from './Button';
import CommentNode from './CommentNode';
import type { Post } from '../../types/ui';
import type { CloudinaryAsset } from '../../hooks/useCloudinaryUpload';
import { buildTransformedUrl } from '../../hooks/useCloudinaryUpload';
import { useAuth } from '../../hooks/useAuth';
import { useAuthGate } from '../../context/AuthModalContext';
import { LIFECYCLE_CONFIG, formatDate, DEPTH_COLORS, DEPTH_BARS } from './threadUtils';

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
  downvotes?: (string | { _id?: string })[];
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



// ─── ThreadDetail Modal ───────────────────────────────────────────────────────

export default function ThreadDetail({ postId, onClose }: ThreadDetailProps) {
  const { user } = useAuth();
  const gate = useAuthGate();
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

  const doUpvotePost = async () => {
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
      // friendlyError ensures no raw backend strings reach the user.
      setActionError(friendlyError(e, 'Upvote failed. Please try again.'));
      setTimeout(() => setActionError(null), 3000);
    }
  };

  const handleUpvote = gate(doUpvotePost, 'Sign in to upvote this post.');

  const doComment = async () => {
    if (!commentText.trim() || commentLoading || !post) return;
    setCommentLoading(true);
    try {
      const res = await api.post<{ comment: Comment }>(`/community/${post._id}/comments`, { body: commentText });
      setPost((prev) =>
        prev ? { ...prev, comments: [...(prev.comments ?? []), res.data.comment] } : prev
      );
      setCommentText('');
    } catch (e) {
      setActionError(friendlyError(e, 'Comment failed. Please try again.'));
      setTimeout(() => setActionError(null), 3000);
    }
    finally { setCommentLoading(false); }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    gate(doComment, 'Sign in to join the discussion.')();
  };

  const doResolve = async () => {
    if (!resolveText.trim() || resolveLoading || !post) return;
    setResolveLoading(true);
    try {
      await api.patch(`/community/${post._id}/resolve`, { answer: resolveText });
      setPost((prev) =>
        prev ? { ...prev, status: 'answered', answer: resolveText.trim() } : prev
      );
      setShowResolveForm(false);
      setResolveText('');
    } catch (e) {
      setActionError(friendlyError(e, 'Could not save your answer. Please try again.'));
      setTimeout(() => setActionError(null), 3000);
    }
    finally { setResolveLoading(false); }
  };

  const handleResolve = (e: React.FormEvent) => {
    e.preventDefault();
    gate(doResolve, 'Sign in to write an answer.')();
  };

  const doReport = async () => {
    if (!reportReason.trim() || reportLoading || !post) return;
    setReportLoading(true);
    try {
      await api.post(`/community/${post._id}/report`, { reason: reportReason.trim() });
      setReportDone(true);
      setShowReportForm(false);
    } catch (e) {
      setActionError(friendlyError(e, 'Could not submit report. Please try again.'));
      setTimeout(() => setActionError(null), 3000);
    }
    finally { setReportLoading(false); }
  };

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    gate(doReport, 'Sign in to report a post.')();
  };

  const doBookmark = () => {
    if (!post) return;
    const isBookmarked = post.bookmarks?.some(
      b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId
    );
    setPost(prev => prev ? {
      ...prev,
      bookmarks: isBookmarked
        ? (prev.bookmarks ?? []).filter(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() !== currentUserId)
        : [...(prev.bookmarks ?? []), currentUserId],
    } : prev);
    api.post(`/community/${post._id}/bookmark`).catch(e => {
      setPost(prev => prev ? { ...prev, bookmarks: post.bookmarks } : prev);
      setActionError(friendlyError(e, 'Could not update bookmark. Please try again.'));
      setTimeout(() => setActionError(null), 3000);
    });
  };

  const handleBookmark = gate(doBookmark, 'Sign in to save posts.');

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

  const handleCommentDeleted = useCallback((commentId: string, parentId: string | null) => {
    setPost((prev) => {
      if (!prev) return prev;
      const filterOut = (comments: Comment[]): Comment[] =>
        comments
          .filter((c) => c._id !== commentId)
          .map((c) => ({ ...c, replies: filterOut(c.replies ?? []) }));
      return { ...prev, comments: filterOut(prev.comments ?? []) };
    });
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
    <>
      {/* Background overlay that matches the search-overlay / chat-overlay premium blur */}
      <div className="search-overlay !z-40" aria-hidden="true" onClick={onClose} />
      
      {/* Scrollable container for the modal itself */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto pointer-events-none"
      >
        <div
          className="relative w-full max-w-3xl bg-card rounded-2xl border border-border shadow-float animate-fade-in overflow-hidden flex flex-col pointer-events-auto"
          style={{ maxHeight: 'calc(100vh - 3rem)' }}
        >
        {/* Action error banner */}
        {actionError && (
          <div className="mx-5 mt-4 px-4 py-2.5 bg-danger-light border border-danger/20 rounded-xl text-xs text-danger flex items-center justify-between gap-2">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-danger/60 hover:text-danger font-bold text-sm leading-none">✕</button>
          </div>
        )}
        {/* ── Sticky modal header ── */}
        <div className="flex-shrink-0 border-b border-border bg-card">
          <div className="flex items-center justify-between px-6 sm:px-8 py-4">
            {/* Left: close + status */}
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-mist hover:bg-border flex items-center justify-center text-ink-soft hover:text-ink transition-all"
                title="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                isAnswered
                  ? 'bg-success-light text-success border-success/20'
                  : 'bg-warning-light text-warning border-warning/20'
              }`}>
                {isAnswered ? (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5L4.5 8L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5.5 4V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                )}
                {isAnswered ? 'Answered' : 'Open'}
              </span>
              {post.lifecycle?.status && LIFECYCLE_CONFIG[post.lifecycle.status] && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${LIFECYCLE_CONFIG[post.lifecycle.status].cls}`}>
                  {LIFECYCLE_CONFIG[post.lifecycle.status].label}
                </span>
              )}
            </div>

            {/* Right: essential actions */}
            <div className="flex items-center gap-1.5">
              {/* Upvote pill */}
              <button
                onClick={handleUpvote}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${
                  hasUpvoted
                    ? 'bg-accent/10 text-accent border-accent/20'
                    : 'bg-mist text-ink-soft border-border hover:border-accent/30 hover:text-ink'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 10V2M6 2L2 6M6 2L10 6"/>
                </svg>
                {upvoteCount}
              </button>

              {/* Comment count */}
              <span className="flex items-center gap-1.5 text-xs text-ink-faint px-2.5 py-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 2h8v6H7L5 10H2V2z"/>
                </svg>
                {post.comments?.length ?? 0}
              </span>

              {/* Bookmark */}
              <button
                onClick={handleBookmark}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                  post.bookmarks?.some(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId)
                    ? 'bg-accent/10 text-accent'
                    : 'bg-mist text-ink-soft hover:bg-border hover:text-ink'
                }`}
                title="Bookmark"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill={post.bookmarks?.some(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4">
                  <path d="M3.5 2h7v10l-3.5-2.5-3.5 2.5V2z"/>
                </svg>
              </button>

              {/* Share */}
              <button
                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/community?post=${post._id}`); setActionError('Post link copied to clipboard'); setTimeout(() => setActionError(null), 2000); }}
                className="w-8 h-8 rounded-xl bg-mist text-ink-soft hover:bg-border hover:text-ink flex items-center justify-center transition-all"
                title="Copy link"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M5.5 3.5H3.5a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1v-2M8.5 1.5h4v4M6 8l4.5-4.5"/>
                </svg>
              </button>

              {/* Author / privileged actions */}
              {(currentUserId === post.author?._id || isPrivileged) && (
                <>
                  <div className="w-px h-5 bg-border mx-1" />
                  <button
                    onClick={() => { setShowResolveForm(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 text-xs font-semibold border border-accent/20 transition-all"
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M8.5 1.5L10 3L4 9H2V7L8.5 1.5Z" strokeLinejoin="round"/>
                    </svg>
                    {isAnswered ? 'Edit Answer' : 'Answer'}
                  </button>
                </>
              )}

              {/* Privileged delete */}
              {isPrivileged && (
                <button
                  onClick={async () => {
                    if (!confirm(`Delete post "${post.title}"? This cannot be undone.`)) return;
                    try {
                      await api.delete(`/community/${post._id}`);
                      onClose();
                    } catch (e) {
                      setActionError(friendlyError(e, 'Delete failed. Please try again.'));
                      setTimeout(() => setActionError(null), 3000);
                    }
                  }}
                  className="w-8 h-8 rounded-xl bg-mist text-ink-soft hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-all"
                  title="Delete post"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M2 3.5h9M4 3.5V2.5a.5.5 0 01.5-.5h4a.5.5 0 01.5.5v1M5 6v3.5M8 6v3.5M3 3.5l.5 7a.5.5 0 00.5.5h5a.5.5 0 00.5-.5l.5-7"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
                <div className="overflow-y-auto flex-1">
                  {/* Post hero */}
                  <div className="px-6 sm:px-8 py-6">
                    <div className="flex items-start gap-3.5 mb-4">
                      <Avatar name={post.author?.name} size="md" className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <h1 className="text-base sm:text-lg font-semibold text-ink leading-snug">{post.title}</h1>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-sm font-medium text-ink-soft">{post.author?.name || 'Student'}</span>
                          <span className="text-xs text-ink-faint">·</span>
                          <span className="text-xs text-ink-faint">{formatDate(post.createdAt)}</span>
                          {isPrivileged && post.timeTrialStatus === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-[10px] font-semibold">
                              ⚡ Time-Trial · {post.timeTrialHoursRemaining}h left
                            </span>
                          )}
                          {isPrivileged && post.escalationStatus === 'escalated' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-[10px] font-semibold">
                              ⚠ Escalated
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <p className="text-sm text-ink/80 leading-relaxed mt-1">{post.body}</p>

                    {/* Attachment thumbnails */}
                    {(() => {
                      const atts = (post as unknown as { attachments?: CloudinaryAsset[] }).attachments;
                      if (!atts?.length) return null;
                      return (
                        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(atts.length, 2)}, 1fr)` }}>
                          {atts.map((a, i) => (
                            <button
                              key={a.publicId}
                              onClick={() => {/* lightbox — future */}}
                              className="relative rounded-xl overflow-hidden border border-border bg-mist aspect-video hover:opacity-85 transition-opacity"
                            >
                              <img
                                src={buildTransformedUrl(a.url, 'w_800,h_450,c_fill,q_auto,f_auto')}
                                alt="attachment"
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Action row under post */}
                    <div className="flex items-center gap-2 mt-4">
                      <button
                        onClick={handleUpvote}
                        disabled={upvoteLoading}
                        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all ${
                          hasUpvoted
                            ? 'bg-accent text-accent-text border-accent/30'
                            : 'bg-mist text-ink-soft border-border hover:border-accent/30 hover:text-ink'
                        }`}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M6 10V2M6 2L2 6M6 2L10 6"/>
                        </svg>
                        {hasUpvoted ? 'Upvoted' : 'Upvote'}
                      </button>

                      {reportDone ? (
                        <span className="text-xs text-success font-medium px-2">✓ Reported</span>
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
                          <Button type="submit" size="sm" loading={reportLoading}>Send</Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => setShowReportForm(false)}>Cancel</Button>
                        </form>
                      ) : (
                        <button
                          onClick={() => setShowReportForm(true)}
                          className="flex items-center gap-1 text-xs text-ink-faint hover:text-danger px-2 py-1.5 rounded-full hover:bg-red-50 transition-all"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                            <path d="M6 2L10 10H2L6 2Z"/>
                          </svg>
                          Report
                        </button>
                      )}
                    </div>
                  </div>

          {/* Official answer — visual separator */}
          {isAnswered && post.answer && (
            <div className="mx-6 sm:mx-8 mb-5 bg-success-light/30 border border-success/20 rounded-xl p-5">
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
                      post.dna.difficulty === 'Easy' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                      post.dna.difficulty === 'Moderate' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                      'bg-red-100 text-red-600 border border-red-200'
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
            <div className="px-6 sm:px-8 pb-5">
              <button onClick={() => setShowResolveForm(true)} className="text-xs text-accent hover:text-accent/70 transition-colors">
                ✏️ Write an answer
              </button>
            </div>
          )}
          {showResolveForm && (
            <form onSubmit={handleResolve} className="px-6 sm:px-8 pb-5 space-y-3">
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
            <div className="px-6 sm:px-8 py-5 border-t border-border/30">
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
            <div className="px-6 sm:px-8 py-5 border-t border-border/30 grid sm:grid-cols-2 gap-5">
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
          <div className="px-6 sm:px-8 py-6 border-t border-border/40">
            <h3 className="text-sm font-semibold text-ink uppercase tracking-wide mb-4 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-faint">
                <path d="M1 3C1 2.17 1.67 1.5 2.5 1.5h9C12.33 1.5 13 2.17 13 3v6C13 9.83 12.33 10.5 11.5 10.5H8.5L5.5 13V10.5H2.5C1.67 10.5 1 9.83 1 9V3z" strokeLinejoin="round"/>
              </svg>
              Discussion ({topLevelComments.length})
            </h3>
            {topLevelComments.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-2xl bg-mist flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-faint">
                    <path d="M2 4c0-1.1.9-2 2-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4H4a2 2 0 01-2-2V4z" strokeLinejoin="round"/>
                    <path d="M7 8h6M7 11h4" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-sm text-ink-faint">No comments yet. Be the first to comment!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topLevelComments.map((comment: Comment) => (
                                  <CommentNode
                                    key={comment._id}
                                    comment={comment}
                                    postId={post?._id ?? ''}
                                    currentUserId={user?._id ?? ''}
                                    userRole={userRole}
                                    onReplyAdded={handleReplyAdded}
                                    onCommentDeleted={handleCommentDeleted}
                                    threadColor={DEPTH_COLORS[0]}
                                    barColor={DEPTH_BARS[0]}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sticky footer — new comment */}
                        <form onSubmit={handleCommentSubmit} className="px-6 sm:px-8 pt-4 pb-6 border-t border-border bg-card flex-shrink-0">
                          <div className="flex gap-3 items-start">
                            <Avatar name={user?.name} size="sm" className="mt-1" />
                            <div className="flex-1 min-w-0">
                              <textarea
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (commentText.trim() && !commentLoading) {
                                      handleCommentSubmit(e as unknown as React.FormEvent);
                                    }
                                  }
                                }}
                                rows={2}
                                placeholder="Add a comment…"
                                className="w-full rounded-xl border border-border bg-mist px-4 py-3 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card resize-none transition-all"
                              />
                              <div className="flex items-center justify-end mt-2">
                                <Button type="submit" size="md" disabled={!commentText.trim() || commentLoading} loading={commentLoading}>
                                  Post
                                </Button>
                              </div>
                            </div>
                          </div>
                          {actionError && (
                            <p className="text-danger text-xs mt-2 pl-10">{actionError}</p>
                          )}
                        </form>
      </div>
    </div>
    </>
  );
};