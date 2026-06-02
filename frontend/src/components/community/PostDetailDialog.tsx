import React, { useEffect, useRef, useState } from 'react';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import api from '../../utils/api';
import type { Post, Comment } from '../../types/ui';

const formatDate = (d: string | undefined) =>
  new Date(d ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

interface PostDetailDialogProps {
  post: Post;
  onClose: () => void;
  currentUserId: string;
  userRole: string;
}

export default function PostDetailDialog({ post: initialPost, onClose, currentUserId, userRole }: PostDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [post, setPost] = useState<Post>(initialPost);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [upvoteLoading, setUpvoteLoading] = useState(false);
  const [resolveText, setResolveText] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [expertHelpLoading, setExpertHelpLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDnaEditor, setShowDnaEditor] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [dnaSteps, setDnaSteps] = useState('');
  const [dnaTools, setDnaTools] = useState('');
  const [dnaTime, setDnaTime] = useState('');
  const [dnaDifficulty, setDnaDifficulty] = useState<'Easy' | 'Moderate' | 'Tricky'>('Moderate');
  const [dnaSaving, setDnaSaving] = useState(false);

  const isAnswer = userRole === 'admin' || userRole === 'moderator' || post.answerAuthorId === currentUserId;

  const isAnswered = post.status === 'answered';
  const upvoteCount = (post.upvotes?.length ?? 0);
  const hasUpvoted = post.upvotes?.some(
    (id) => (typeof id === 'object' ? (id as { _id?: string })._id || id : id)?.toString() === currentUserId
  );
  const canResolve = userRole === 'admin' || userRole === 'moderator';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (e: MouseEvent) => {
        if (e.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isContent =
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
        if (!isContent) dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('click', handleBackdropClick);
      };
    }

    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const handleUpvote = async () => {
    const previousUpvotes = post.upvotes || [];
    const isUpvoted = previousUpvotes.some(
      (id) => (typeof id === 'object' ? (id as { _id?: string })._id || id : id)?.toString() === currentUserId
    );

    // Optimistic local state update
    const nextUpvotes = isUpvoted
      ? previousUpvotes.filter((u) => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
      : [...previousUpvotes, currentUserId];

    setPost((prev) => ({
      ...prev,
      upvotes: nextUpvotes,
    }));

    try {
      const res = await api.post<{ upvotedByMe: boolean }>(`/community/${post._id}/upvote`);
      // Sync with server state
      setPost((prev) => ({
        ...prev,
        upvotes: res.data.upvotedByMe
          ? [...previousUpvotes.filter((u) => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId), currentUserId]
          : previousUpvotes.filter((u) => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId),
      }));
    } catch (e) {
      // Rollback on failure
      setPost((prev) => ({
        ...prev,
        upvotes: previousUpvotes,
      }));
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Upvote failed. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || commentLoading) return;
    setCommentLoading(true);
    try {
      const res = await api.post<{ comment: Comment }>(`/community/${post._id}/comments`, { body: commentText });
      setPost((prev) => ({ ...prev, comments: [...(prev.comments || []), res.data.comment] }));
      setCommentText('');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Comment failed. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveText.trim() || resolveLoading) return;
    setResolveLoading(true);
    try {
      await api.patch(`/community/${post._id}/resolve`, { answer: resolveText });
      setPost((prev) => ({ ...prev, status: 'answered', answer: resolveText.trim() }));
      setShowResolveForm(false);
      setResolveText('');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Could not mark as resolved. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setResolveLoading(false);
    }
  };

  const handleRequestExpertHelp = async () => {
    if (expertHelpLoading) return;
    setExpertHelpLoading(true);
    try {
      await api.post(`/community/${post._id}/request-expert`);
      setPost((prev) => ({ ...prev, _expertHelpRequested: true } as any));
    } catch (e) {
      console.error(e);
    } finally {
      setExpertHelpLoading(false);
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim()) return;
    setReportLoading(true);
    try {
      await api.post(`/community/${post._id}/report`, { reason: reportReason });
      setShowReportModal(false);
      setReportReason('');
      setActionError(null);
      // Show success feedback
      const banner = document.createElement('div');
      banner.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium shadow-lg';
      banner.textContent = 'Report submitted. Thank you.';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 3000);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to submit report.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="post-dialog-title"
      className="m-auto w-full max-w-2xl rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
      style={{ maxHeight: '90vh' }}
    >
      {/* Action error banner */}
      {actionError && (
        <div className="mx-6 mt-4 px-4 py-2.5 bg-danger-light border border-danger/20 rounded-xl text-xs text-danger flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-danger/60 hover:text-danger font-bold text-sm leading-none">✕</button>
        </div>
      )}
      <div className="flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
        <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-border">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5
              ${isAnswered ? 'bg-success-light text-success' : 'bg-warning-light text-warning'}`}>
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
            <div className="min-w-0">
              <h2 id="post-dialog-title" className="text-base font-semibold text-ink leading-snug">
                {post.title}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant={isAnswered ? 'success' : 'warning'}>
                  {isAnswered ? '✓ Answered' : '○ Open'}
                </Badge>
                <span className="text-xs text-ink-soft">by {post.author?.name || 'Student'}</span>
                <span className="text-xs text-ink-faint">·</span>
                <span className="text-xs text-ink-soft">{formatDate(post.createdAt)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => dialogRef.current?.close()}
            aria-label="Close dialog"
            className="flex-shrink-0 w-8 h-8 rounded-full bg-mist flex items-center justify-center text-ink-soft hover:text-ink hover:bg-border transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="px-6 py-4">
            <p className="text-sm text-ink/70 leading-relaxed">{post.body}</p>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="px-6 pb-4 flex flex-wrap items-center gap-2 mt-3">
              {post.tags.map((tag: string) => (
                <span key={tag} className="inline-flex items-center px-2.5 py-1 rounded-full bg-mist border border-border text-xs font-medium text-ink-soft">
                  #{tag}
                </span>
              ))}
            </div>
          )}
          </div>

          <div className="px-6 pb-4 flex items-center gap-3">
            <button
              onClick={handleUpvote}
              disabled={upvoteLoading}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200
                ${hasUpvoted
                  ? 'bg-accent-light text-accent hover:bg-accent/15'
                  : 'bg-mist text-ink-soft hover:bg-border hover:text-ink'
                } disabled:opacity-50`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill={hasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M7 1L8.8 4.8H13L9.8 7.6L11 12L7 9.2L3 12L4.2 7.6L1 4.8H5.2L7 1Z" strokeLinejoin="round"/>
              </svg>
              {hasUpvoted ? 'Upvoted' : 'Upvote'}
              <span className="font-semibold">{upvoteCount}</span>
            </button>
            <span className="text-xs text-ink-faint flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 2.5C1 1.67 1.67 1 2.5 1h7C10.33 1 11 1.67 11 2.5v5C11 8.33 10.33 9 9.5 9H7L4.5 11V9H2.5C1.67 9 1 8.33 1 7.5v-5z" strokeLinejoin="round"/>
              </svg>
              {post.comments?.length ?? 0} comments
            </span>

            {canResolve && !isAnswered && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowResolveForm((v) => !v)}
                className="ml-auto"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 6L5 9L10 3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mark as Resolved
              </Button>
            )}

            {!canResolve && !isAnswered && currentUserId && post.author?._id !== currentUserId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRequestExpertHelp}
                loading={expertHelpLoading}
                className="ml-auto"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 1L7.5 4.5H11.5L8.5 7.5L9.5 11L6 8.5L2.5 11L3.5 7.5L0.5 4.5H4.5L6 1Z"/>
                </svg>
                Request Expert Help
              </Button>
            )}

            {currentUserId && post.author?._id !== currentUserId && (
              <button
                onClick={() => setShowReportModal(true)}
                className="ml-2 text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
                title="Report this post"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 1L7.5 4.5H11.5L8.5 7.5L9.5 11L6 8.5L2.5 11L3.5 7.5L0.5 4.5H4.5L6 1Z"/>
                </svg>
                Report
              </button>
            )}
          </div>

          {isAnswered && post.answer && (
            <div className={`mx-6 mb-4 rounded-xl border p-4 ${
              post.answerIsExpert
                ? 'bg-amber-light border-amber/20'
                : 'bg-success-light border-success/20'
            }`}>
              <p className={`text-xs font-semibold mb-2 uppercase tracking-wide flex items-center gap-1.5 ${
                post.answerIsExpert ? 'text-amber' : 'text-success'
              }`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 0L7.5 4.5H12L8.5 7L9.8 11.5L6 8.5L2.2 11.5L3.5 7L0 4.5H4.5L6 0Z"/>
                </svg>
                {post.answerIsExpert ? '⭐ Expert Mentor Answer' : 'Official Answer'}
              </p>
              <p className="text-sm text-ink/75 leading-relaxed">{post.answer}</p>

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

              {/* Edit DNA Button */}
              {isAnswer && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      setDnaSteps(post.dna?.steps.join('\n') || '');
                      setDnaTools(post.dna?.tools.join(', ') || '');
                      setDnaTime(post.dna?.timeToComplete || '');
                      setDnaDifficulty(post.dna?.difficulty || 'Moderate');
                      setShowDnaEditor(true);
                    }}
                    className="text-[11px] text-accent/70 hover:text-accent font-medium transition-colors flex items-center gap-1"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
                      <path d="M7.5 1.5L8.5 2.5L3 8L1 8.5L1.5 6.5L7.5 1.5Z" strokeLinejoin="round"/>
                    </svg>
                    {post.dna ? 'Edit DNA' : 'Add DNA'}
                  </button>
                </div>
              )}

              {/* Inline DNA Editor */}
              {showDnaEditor && (
                <div className="mt-3 p-3 rounded-xl border border-accent/20 bg-mist space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-accent">Edit Solution DNA</span>
                    <button onClick={() => setShowDnaEditor(false)} className="text-ink-faint hover:text-ink text-sm">✕</button>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Steps (one per line)</label>
                    <textarea
                      value={dnaSteps}
                      onChange={e => setDnaSteps(e.target.value)}
                      rows={3}
                      placeholder="Enter each step on a new line"
                      className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Tools (comma-separated)</label>
                    <input
                      type="text"
                      value={dnaTools}
                      onChange={e => setDnaTools(e.target.value)}
                      placeholder="e.g., VS Code, Terminal, Git"
                      className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Time to Complete</label>
                      <input
                        type="text"
                        value={dnaTime}
                        onChange={e => setDnaTime(e.target.value)}
                        placeholder="e.g., 30 mins"
                        className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Difficulty</label>
                      <select
                        value={dnaDifficulty}
                        onChange={e => setDnaDifficulty(e.target.value as 'Easy' | 'Moderate' | 'Tricky')}
                        className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
                      >
                        <option value="Easy">Easy</option>
                        <option value="Moderate">Moderate</option>
                        <option value="Tricky">Tricky</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowDnaEditor(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      loading={dnaSaving}
                      onClick={async () => {
                        setDnaSaving(true);
                        try {
                          const dna = {
                            steps: dnaSteps.split('\n').map(s => s.trim()).filter(Boolean),
                            tools: dnaTools.split(',').map(t => t.trim()).filter(Boolean),
                            timeToComplete: dnaTime.trim() || undefined,
                            difficulty: dnaDifficulty,
                          };
                          await api.patch(`/community/${post._id}/dna`, dna);
                          setPost(prev => ({ ...prev, dna }));
                          setShowDnaEditor(false);
                        } catch (e) {
                          console.error(e);
                        } finally {
                          setDnaSaving(false);
                        }
                      }}
                    >
                      Save DNA
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {showResolveForm && (
            <form onSubmit={handleResolve} className="mx-6 mb-4 rounded-xl border border-accent/20 bg-accent-light p-4">
              <label className="block text-xs font-medium text-accent mb-2">Write the official answer</label>
              <textarea
                value={resolveText}
                onChange={(e) => setResolveText(e.target.value)}
                rows={3}
                placeholder="Provide a clear, helpful answer…"
                className="w-full rounded-xl border border-accent/20 bg-card px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              />
              <div className="flex gap-2 mt-2">
                <Button type="submit" size="sm" loading={resolveLoading} disabled={!resolveText.trim()}>
                  Save Answer
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowResolveForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <div className="px-6 pb-2">
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3">
              Comments ({post.comments?.length ?? 0})
            </h3>

            {!post.comments || post.comments.length === 0 ? (
              <p className="text-sm text-ink-faint py-2">No comments yet. Be the first to comment!</p>
            ) : (
              <div className="space-y-3">
                {post.comments.map((c, i) => {
                  const comment = c as Comment;
                  const cUpvotes = comment.upvotes?.length ?? 0;
                  const cDownvotes = comment.downvotes?.length ?? 0;
                  const netScore = cUpvotes - cDownvotes;
                  const hasUpvotedComment = comment.upvotes?.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);
                  const hasDownvotedComment = comment.downvotes?.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);
                  const commentOpacity = netScore >= 0 ? 1 : Math.max(0.15, 1 - (Math.abs(netScore) * 0.2));

                  const handleCommentUpvote = async () => {
                    const previousComments = post.comments || [];
                    const commentToUpdate = previousComments.find(cm => cm._id === comment._id);
                    if (!commentToUpdate) return;

                    const isUpvoted = commentToUpdate.upvotes?.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);

                    // Optimistic update
                    setPost(prev => ({
                      ...prev,
                      comments: (prev.comments as Comment[]).map(cm =>
                        cm._id === comment._id
                          ? {
                              ...cm,
                              upvotes: isUpvoted
                                ? (cm.upvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
                                : [...(cm.upvotes || []), currentUserId],
                              downvotes: (cm.downvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
                            }
                          : cm
                      )
                    }));

                    try {
                      const res = await api.post<{ upvotedByMe: boolean }>(`/community/${post._id}/comments/${comment._id}/upvote`);
                      // Sync with server response
                      setPost(prev => ({
                        ...prev,
                        comments: (prev.comments as Comment[]).map(cm =>
                          cm._id === comment._id
                            ? {
                                ...cm,
                                upvotes: res.data.upvotedByMe
                                  ? [...(commentToUpdate.upvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId), currentUserId]
                                  : (commentToUpdate.upvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId),
                                downvotes: (cm.downvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
                              }
                            : cm
                        )
                      }));
                    } catch (e) {
                      // Rollback
                      setPost(prev => ({ ...prev, comments: previousComments }));
                      setActionError('Comment upvote failed. Please try again.');
                      setTimeout(() => setActionError(null), 3000);
                    }
                  };

                  const handleCommentDownvote = async () => {
                    const previousComments = post.comments || [];
                    const commentToUpdate = previousComments.find(cm => cm._id === comment._id);
                    if (!commentToUpdate) return;

                    const isDownvoted = commentToUpdate.downvotes?.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);

                    // Optimistic update
                    setPost(prev => ({
                      ...prev,
                      comments: (prev.comments as Comment[]).map(cm =>
                        cm._id === comment._id
                          ? {
                              ...cm,
                              downvotes: isDownvoted
                                ? (cm.downvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
                                : [...(cm.downvotes || []), currentUserId],
                              upvotes: (cm.upvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
                            }
                          : cm
                      )
                    }));

                    try {
                      const res = await api.post<{ deleted?: boolean; downvotedByMe: boolean }>(`/community/${post._id}/comments/${comment._id}/downvote`);
                      if (res.data.deleted) {
                        try { new Audio('/fahhhhh.mp3').play(); } catch (_) {}
                        const el = document.getElementById(`comment-${comment._id}`);
                        if (el) {
                          el.style.setProperty('--current-opacity', String(commentOpacity));
                          el.classList.add('comment-dying');
                          setTimeout(() => {
                            setPost(prev => ({ ...prev, comments: (prev.comments as Comment[]).filter(cm => cm._id !== comment._id) }));
                          }, 800);
                        } else {
                          setPost(prev => ({ ...prev, comments: (prev.comments as Comment[]).filter(cm => cm._id !== comment._id) }));
                        }
                        return;
                      }

                      // Sync with server response
                      setPost(prev => ({
                        ...prev,
                        comments: (prev.comments as Comment[]).map(cm =>
                          cm._id === comment._id
                            ? {
                                ...cm,
                                downvotes: res.data.downvotedByMe
                                  ? [...(commentToUpdate.downvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId), currentUserId]
                                  : (commentToUpdate.downvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId),
                                upvotes: (cm.upvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId)
                              }
                            : cm
                        )
                      }));
                    } catch (e) {
                      // Rollback
                      setPost(prev => ({ ...prev, comments: previousComments }));
                      setActionError('Comment downvote failed. Please try again.');
                      setTimeout(() => setActionError(null), 3000);
                    }
                  };

                  return (
                    <div
                      key={comment._id || i}
                      id={`comment-${comment._id}`}
                      className="flex items-start gap-2.5 transition-opacity duration-300 relative"
                      style={{ opacity: commentOpacity }}
                    >
                      <Avatar name={comment.author?.name} size="sm" />
                      <div className="flex-1 bg-mist rounded-xl px-3 py-2.5 relative overflow-hidden">
                        <div className={`comment-fire-glow ${netScore > 2 ? 'active' : ''}`} />
                        <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-ink">{comment.author?.name || 'User'}</span>
                            {comment.verified && <span className="verified-badge">✅ Verified</span>}
                            <span className="text-xs text-ink-faint">{formatDate(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-ink/75 leading-relaxed">{comment.body}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={handleCommentUpvote}
                              className={`comment-vote-btn ${hasUpvotedComment ? 'upvoted' : ''}`}
                              title="Upvote"
                            >
                              <span className="emoji-upvote">{hasUpvotedComment ? '🔥' : '🤌'}</span>
                              <span className="text-xs font-semibold">{cUpvotes > 0 ? cUpvotes : ''}</span>
                            </button>
                            <button
                              onClick={handleCommentDownvote}
                              className={`comment-vote-btn ${hasDownvotedComment ? 'downvoted' : ''}`}
                              title="Downvote"
                            >
                              <span className="emoji-downvote">🥀</span>
                              <span className="text-xs font-semibold">{cDownvotes > 0 ? cDownvotes : ''}</span>
                            </button>
                            {netScore < 0 && (
                              <span className="text-[10px] text-ink-faint ml-1 melting-text">🧊 melting...</span>
                            )}
                            {canResolve && (
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await api.patch<{ verified: boolean }>(`/community/${post._id}/comments/${comment._id}/verify`);
                                    setPost(prev => ({
                                      ...prev,
                                      comments: (prev.comments as Comment[]).map(cm =>
                                        cm._id === comment._id ? { ...cm, verified: res.data.verified } : cm
                                      )
                                    }));
                                  } catch (e) { console.error(e); }
                                }}
                                className="ml-auto text-[10px] text-ink-faint hover:text-accent transition-colors"
                                title={comment.verified ? 'Unverify answer' : 'Mark as verified answer'}
                              >
                                {comment.verified ? 'Unverify' : '✅ Verify'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={handleComment} className="px-6 pt-3 pb-6">
            <div className="flex gap-2 items-start">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                placeholder="Write a comment…"
                className="flex-1 rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!commentLoading) handleComment(e as unknown as React.FormEvent);
                  }
                }}
              />
              <Button
                type="submit"
                size="md"
                disabled={!commentText.trim()}
                loading={commentLoading}
                className="flex-shrink-0 mt-0.5"
              >
                Post
              </Button>
            </div>
            <p className="text-xs text-ink-faint mt-1.5 ml-1">Press Enter to post, Shift+Enter for newline</p>
          </form>
        </div>

        {/* Report Modal */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm">
            <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm mx-4 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Report Post</h3>
                <button onClick={() => { setShowReportModal(false); setReportReason(''); }} className="text-ink-faint hover:text-ink text-sm w-6 h-6 flex items-center justify-center rounded-full hover:bg-border transition-colors">✕</button>
              </div>
              <form onSubmit={handleReport} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-ink-soft mb-1.5 block">Why are you reporting this?</label>
                  <textarea
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    rows={3}
                    placeholder="Describe the issue (spam, harassment, inappropriate content, etc.)"
                    className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button type="button" variant="secondary" size="sm" onClick={() => { setShowReportModal(false); setReportReason(''); }}>Cancel</Button>
                  <Button type="submit" variant="danger" size="sm" loading={reportLoading} disabled={!reportReason.trim()}>Submit Report</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
