import React, { useEffect, useRef, useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import api, { friendlyError } from '../../utils/api';
import { buildGcsTransformedUrl } from '../../utils/gcsTransform';
import type { GcsAsset } from '../../hooks/useGcsUpload';
import type { Post, Comment } from '../../types/ui';
import { idMatches } from '../../utils/idMatch';
import ThreadBookmarkButton from './ThreadBookmarkButton';

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (d: string | undefined) =>
  new Date(d ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const formatTime = (d: string | undefined) =>
  new Date(d ?? Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
interface PostDetailDialogProps {
  post: Post;
  onClose: () => void;
  currentUserId: string;
  userRole: string;
}



// ── Attachment Lightbox ───────────────────────────────────────────────────────
interface LightboxProps { assets: GcsAsset[]; startIndex: number; onClose: () => void; }
function AttachmentLightbox({ assets, startIndex, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(startIndex);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx(i => (i + 1) % assets.length);
      if (e.key === 'ArrowLeft') setIdx(i => (i - 1 + assets.length) % assets.length);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [assets.length, onClose]);
  const a = assets[idx];
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/80 backdrop-blur-sm" onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg font-bold transition-colors" onClick={onClose}>✕</button>
      {assets.length > 1 && <>
        <button className="absolute left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg transition-colors" onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + assets.length) % assets.length); }}>‹</button>
        <button className="absolute right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg transition-colors" onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % assets.length); }}>›</button>
      </>}
      <img
        src={buildGcsTransformedUrl(a.url, 'w_1600,c_limit,q_auto,f_auto')}
        alt={`Attachment ${idx + 1}`}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
        {assets.map((_, i) => (
          <button key={i} onClick={e => { e.stopPropagation(); setIdx(i); }}
            className={`w-2 h-2 rounded-full transition-colors ${i === idx ? 'bg-white' : 'bg-white/40'}`} />
        ))}
      </div>
      <span className="absolute bottom-4 right-4 text-xs text-white/60">{idx + 1} / {assets.length}</span>
    </div>
  );
}

// ── Attachment Grid ───────────────────────────────────────────────────────────
interface AttachmentGridProps { assets: GcsAsset[]; onPreview: (index: number) => void; }
function AttachmentGrid({ assets, onPreview }: AttachmentGridProps) {
  if (!assets.length) return null;
  const visible = assets.slice(0, 4);
  const extra = assets.length - 4;
  return (
    <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: assets.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}>
      {visible.map((a, i) => (
        <button
          key={a.objectPath}
          onClick={() => onPreview(i)}
          className="relative rounded-xl overflow-hidden border border-border bg-mist aspect-video hover:opacity-90 transition-opacity group"
        >
          <img
            src={buildGcsTransformedUrl(a.url, 'w_800,h_450,c_fill,q_auto,f_auto')}
            alt={`Attachment ${i + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-ink/0 group-hover:bg-ink/10 transition-colors flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow">
              <path d="M15 10c0 2.76-2.24 5-5 5s-5-2.24-5-5 2.24-5 5-5 5 2.24 5 5z" stroke="white" strokeWidth="1.5" fill="none"/>
              <path d="M8 7l5 3-5 3V7z" fill="white"/>
            </svg>
          </div>
        </button>
      ))}
      {extra > 0 && (
        <button
          onClick={() => onPreview(4)}
          className="relative rounded-xl overflow-hidden border border-border bg-mist aspect-video hover:bg-border transition-colors flex items-center justify-center"
        >
          <span className="text-lg font-semibold text-ink-soft">+{extra} more</span>
        </button>
      )}
    </div>
  );
}

// ── DNA Strip ─────────────────────────────────────────────────────────────────
function DnaStrip({ dna }: { dna: NonNullable<Post['dna']> }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      <span className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">Solution DNA</span>
      {dna.steps.length > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-xs font-medium text-accent">
          {dna.steps.length} step{dna.steps.length !== 1 ? 's' : ''}
        </span>
      )}
      {dna.tools.slice(0, 3).map((tool, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mist border border-border text-xs text-ink-soft">{tool}</span>
      ))}
      {dna.tools.length > 3 && <span className="text-xs text-ink-faint">+{dna.tools.length - 3}</span>}
      {dna.timeToComplete && (
        <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="5" cy="5" r="4"/><path d="M5 3V5L6.5 6.5" strokeLinecap="round"/>
          </svg>
          {dna.timeToComplete}
        </span>
      )}
      {dna.difficulty && (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
          dna.difficulty === 'Easy' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
          dna.difficulty === 'Moderate' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
          'bg-red-100 text-red-600 border border-red-200'
        }`}>{dna.difficulty}</span>
      )}
    </div>
  );
}

// ── Answer Card ───────────────────────────────────────────────────────────────
function AnswerCard({ post, currentUserId, userRole, onPostUpdate }: {
  post: Post; currentUserId: string; userRole: string; onPostUpdate: (p: Post) => void;
}) {
  const [showDnaEditor, setShowDnaEditor] = useState(false);
  const [dnaSteps, setDnaSteps] = useState('');
  const [dnaTools, setDnaTools] = useState('');
  const [dnaTime, setDnaTime] = useState('');
  const [dnaDifficulty, setDnaDifficulty] = useState<'Easy' | 'Moderate' | 'Tricky'>('Moderate');
  const [dnaSaving, setDnaSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isAnswer = userRole === 'admin' || userRole === 'moderator' || post.answerAuthorId === currentUserId;

  return (
    <div className={`rounded-2xl border p-5 ${
      post.answerIsExpert ? 'bg-amber-light border-amber/20' : 'bg-success-light border-success/20'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <svg width="14" height="14" viewBox="0 0 14 14" fill={post.answerIsExpert ? '#D97706' : '#5a9a6b'}>
          <path d="M7 1L8.5 5H13L9.5 7.5L10.8 12L7 9.5L3.2 12L4.5 7.5L1 5H5.5L7 1Z"/>
        </svg>
        <span className={`text-xs font-semibold uppercase tracking-wide ${
          post.answerIsExpert ? 'text-amber' : 'text-success'
        }`}>
          {post.answerIsExpert ? '⭐ Expert Mentor Answer' : 'Official Answer'}
        </span>
        {post.answerAuthorId && (
          <span className="ml-auto text-xs text-ink-faint">Staff</span>
        )}
      </div>
      <p className="text-sm text-ink/80 leading-relaxed">{post.answer}</p>
      {post.dna && <DnaStrip dna={post.dna} />}
      {isAnswer && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => {
              setDnaSteps(post.dna?.steps.join('\n') || '');
              setDnaTools(post.dna?.tools.join(', ') || '');
              setDnaTime(post.dna?.timeToComplete || '');
              setDnaDifficulty(post.dna?.difficulty || 'Moderate');
              setShowDnaEditor(v => !v);
            }}
            className="text-[11px] text-accent/70 hover:text-accent font-medium flex items-center gap-1 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M7.5 1.5L8.5 2.5L3 8L1 8.5L1.5 6.5L7.5 1.5Z" strokeLinejoin="round"/>
            </svg>
            {post.dna ? 'Edit DNA' : 'Add DNA'}
          </button>
        </div>
      )}
      {showDnaEditor && (
        <div className="mt-3 p-3 rounded-xl border border-accent/20 bg-card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-accent">Solution DNA</span>
            <button onClick={() => setShowDnaEditor(false)} className="text-ink-faint hover:text-ink text-sm">✕</button>
          </div>
          <div>
            <label className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Steps (one per line)</label>
            <textarea value={dnaSteps} onChange={e => setDnaSteps(e.target.value)} rows={3}
              placeholder="Step 1: Do this\nStep 2: Then do that"
              className="mt-1 w-full rounded-lg border border-border bg-mist px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"/>
          </div>
          <div>
            <label className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Tools (comma-separated)</label>
            <input type="text" value={dnaTools} onChange={e => setDnaTools(e.target.value)}
              placeholder="VS Code, Git, Terminal"
              className="mt-1 w-full rounded-lg border border-border bg-mist px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"/>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Time</label>
              <input type="text" value={dnaTime} onChange={e => setDnaTime(e.target.value)}
                placeholder="30 mins" className="mt-1 w-full rounded-lg border border-border bg-mist px-2.5 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"/>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-medium text-ink-soft uppercase tracking-wider">Difficulty</label>
              <select value={dnaDifficulty} onChange={e => setDnaDifficulty(e.target.value as 'Easy' | 'Moderate' | 'Tricky')}
                className="mt-1 w-full rounded-lg border border-border bg-mist px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30">
                <option>Easy</option><option>Moderate</option><option>Tricky</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowDnaEditor(false)}>Cancel</Button>
            <Button type="button" size="sm" loading={dnaSaving}
              onClick={async () => {
                setDnaSaving(true);
                try {
                  const dna = {
                    steps: dnaSteps.split('\n').map((s: string) => s.trim()).filter(Boolean),
                    tools: dnaTools.split(',').map((t: string) => t.trim()).filter(Boolean),
                    timeToComplete: dnaTime.trim() || undefined,
                    difficulty: dnaDifficulty,
                  };
                  await api.patch(`/community/${post._id}/dna`, dna);
                  onPostUpdate({ ...post, dna });
                  setShowDnaEditor(false);
                } catch (e) {
                  const msg = friendlyError(e, 'Failed to save DNA.');
                  setActionError(msg);
                  setTimeout(() => setActionError(null), 3000);
                }
                finally { setDnaSaving(false); }
              }}>
              Save DNA
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Comment Item ──────────────────────────────────────────────────────────────
function CommentItem({ comment, post, currentUserId, userRole, onUpdate }: {
  comment: Comment;
  post: Post;
  currentUserId: string;
  userRole: string;
  onUpdate: (comments: Comment[]) => void;
}) {
  const cUpvotes = comment.upvotes?.length ?? 0;
  const cDownvotes = comment.downvotes?.length ?? 0;
  const netScore = cUpvotes - cDownvotes;
  const hasUpvoted = comment.upvotes?.some(
    u => idMatches(u, currentUserId)
  ) ?? false;
  const hasDownvoted = comment.downvotes?.some(
    u => idMatches(u, currentUserId)
  ) ?? false;
  const commentOpacity = netScore >= 0 ? 1 : Math.max(0.15, 1 - (Math.abs(netScore) * 0.2));
  const canResolve = userRole === 'admin' || userRole === 'moderator';
  const isPostAuthor = post.author?._id === currentUserId;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleUpvote = async () => {
    const res = await api.post<{ upvotedByMe: boolean }>(
      `/community/${post._id}/comments/${comment._id}/upvote`
    );
    onUpdate((post.comments as Comment[]).map(c =>
      c._id === comment._id ? {
        ...c,
        upvotes: res.data.upvotedByMe
          ? [...(c.upvotes || []), currentUserId]
          : (c.upvotes || []).filter(u => idMatches(u, currentUserId)),
        downvotes: (c.downvotes || []).filter(u => idMatches(u, currentUserId)),
      } : c
    ));
  };

  const handleDownvote = async () => {
    const res = await api.post<{ deleted?: boolean; downvotedByMe: boolean }>(
      `/community/${post._id}/comments/${comment._id}/downvote`
    );
    if (res.data.deleted) {
      try { new Audio('/fahhhhh.mp3').play(); } catch (_) { void 0 }
      onUpdate((post.comments as Comment[]).filter(c => c._id !== comment._id));
      return;
    }
    onUpdate((post.comments as Comment[]).map(c =>
      c._id === comment._id ? {
        ...c,
        downvotes: res.data.downvotedByMe
          ? [...(c.downvotes || []), currentUserId]
          : (c.downvotes || []).filter(u => idMatches(u, currentUserId)),
        upvotes: (c.upvotes || []).filter(u => idMatches(u, currentUserId)),
      } : c
    ));
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setReplyLoading(true);
    try {
      const res = await api.post<{ comment: Comment }>(
        `/community/${post._id}/comments`,
        { body: replyText, parentId: comment._id }
      );
      onUpdate([...((post.comments as Comment[]) || []), res.data.comment]);
      setReplyText('');
      setReplyOpen(false);
    } catch (e) {
      const msg = friendlyError(e, 'Reply failed.');
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    }
    finally { setReplyLoading(false); }
  };

  const handleVerify = async () => {
    try {
      const res = await api.patch<{ verified: boolean }>(
        `/community/${post._id}/comments/${comment._id}/verify`
      );
      onUpdate((post.comments as Comment[]).map(c =>
        c._id === comment._id ? { ...c, verified: res.data.verified } : c
      ));
    } catch (e) {
      const msg = friendlyError(e, 'Failed to update verified status.');
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    }
  };

  const handleAccept = async () => {
    try {
      const res = await api.patch<{ post: Post; comments?: unknown[] }>(
        `/community/${post._id}/comments/${comment._id}/accept-answer`
      );
      onUpdate((res.data.comments || []) as unknown as import('../../types/ui').Comment[]);
    } catch (e) {
      const msg = friendlyError(e, 'Failed to accept answer.');
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    }
  };

  return (
    <div className="flex items-start gap-3 transition-opacity duration-300"
      style={{ opacity: commentOpacity }}
    >
      <Avatar name={comment.author?.name} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="bg-mist rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-medium text-ink">{comment.author?.name || 'User'}</span>
            {comment.verified && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-success">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 0L6.2 3.1H9.5L6.9 5L7.8 8.1L5 6.3L2.2 8.1L3.1 5L0.5 3.1H3.8L5 0Z"/></svg>
                Verified
              </span>
            )}
            {comment.isFirstResponder && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber">
                🏅 First Responder
              </span>
            )}
            <span className="text-xs text-ink-faint">{formatDate(comment.createdAt)}</span>
            {comment.createdAt && (
              <span className="text-[10px] text-ink-faint">· {formatTime(comment.createdAt)}</span>
            )}
          </div>
          <p className="text-sm text-ink/80 leading-relaxed">{comment.body}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <button onClick={handleUpvote}
              className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                hasUpvoted ? 'text-accent' : 'text-ink-faint hover:text-ink'
              }`}>
              <span className="text-base">{hasUpvoted ? '🔥' : '👍'}</span>
              {cUpvotes > 0 && <span>{cUpvotes}</span>}
            </button>
            <button onClick={handleDownvote}
              className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                hasDownvoted ? 'text-danger' : 'text-ink-faint hover:text-ink'
              }`}>
              <span className="text-base">{hasDownvoted ? '💀' : '👎'}</span>
              {cDownvotes > 0 && <span>{cDownvotes}</span>}
            </button>
            {currentUserId && (
              <button onClick={() => setReplyOpen(v => !v)}
                className="text-xs text-ink-faint hover:text-ink transition-colors flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 2.5C1 1.67 1.67 1 2.5 1h7C10.33 1 11 1.67 11 2.5v5C11 8.33 10.33 9 9.5 9H7l-2 2V9H2.5C1.67 9 1 8.33 1 7.5v-5z" strokeLinejoin="round"/>
                </svg>
                Reply
              </button>
            )}
            {canResolve && (
              <button onClick={handleVerify}
                className="ml-auto text-[10px] text-ink-faint hover:text-success transition-colors">
                {comment.verified ? 'Unverify' : '✅ Verify'}
              </button>
            )}
            {!post.answer && (isPostAuthor || userRole === 'admin' || userRole === 'moderator') && (
              <button onClick={handleAccept}
                className="text-[10px] text-ink-faint hover:text-success transition-colors flex items-center gap-0.5">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 5.5L4 8L8.5 2"/>
                </svg>
                Accept
              </button>
            )}
          </div>
          {replyOpen && (
            <form onSubmit={handleReply} className="mt-3 flex gap-2">
              <input value={replyText} onChange={e => setReplyText(e.target.value)}
                placeholder="Write a reply…"
                className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none"/>
              <Button type="submit" size="sm" loading={replyLoading} disabled={!replyText.trim()} className="flex-shrink-0">Reply</Button>
            </form>
          )}
        </div>
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 ml-4 pl-4 border-l-2 border-border space-y-2">
            {comment.replies.map(r => (
              <div key={r._id} className="flex items-start gap-2">
                <Avatar name={r.author?.name} size="xs" />
                <div className="flex-1 bg-mist/60 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[11px] font-medium text-ink">{r.author?.name || 'User'}</span>
                    <span className="text-[10px] text-ink-faint">{formatDate(r.createdAt)}</span>
                  </div>
                  <p className="text-xs text-ink/80">{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// ── Main Export ────────────────────────────────────────────────────────────────
export default function PostDetailDialog({ post: initialPost, onClose, currentUserId, userRole }: PostDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const commentFormRef = useRef<HTMLFormElement>(null);
  // H6 — ref-based in-flight guard. State guards race: between the Enter
  // keypress and `setCommentLoading(true)` committing, a second Enter can
  // pass the `commentLoading` check. A ref doesn't.
  const commentInFlightRef = useRef(false);
  const [post, setPost] = useState<Post>(initialPost);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [upvoteLoading] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolveText, setResolveText] = useState('');
  const [resolveLoading, setResolveLoading] = useState(false);
  const [expertHelpLoading, setExpertHelpLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [lightboxAssets, setLightboxAssets] = useState<GcsAsset[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showShareMenu] = useState(false);
  const isAnswered = post.status === 'answered';
  const upvoteCount = post.upvotes?.length ?? 0;
  const hasUpvoted = post.upvotes?.some(
    id => idMatches(id, currentUserId)
  ) ?? false;
  const canResolve = userRole === 'admin' || userRole === 'moderator';
  const attachments = (post as Post & { attachments?: GcsAsset[] }).attachments ?? [];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdrop = (e: MouseEvent) => {
        if (e.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const inside = rect.top <= e.clientY && e.clientY <= rect.top + rect.height
          && rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
        if (!inside) dialog.close();
      };
      dialog.addEventListener('click', handleBackdrop);
      return () => { dialog.removeEventListener('close', handleClose); dialog.removeEventListener('click', handleBackdrop); };
    }
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  useBodyScrollLock(true);

  const handlePostUpdate = (updated: Post) => setPost(updated);

  const handleUpvote = async () => {
    const prev = post.upvotes || [];
    const isUpvoted = prev.some(id => idMatches(id, currentUserId));
    const next = isUpvoted
      ? prev.filter(id => idMatches(id, currentUserId))
      : [...prev, currentUserId];
    setPost(p => ({ ...p, upvotes: next }));
    try {
      const res = await api.post<{ upvotedByMe: boolean }>(`/community/${post._id}/upvote`);
      setPost(p => ({ ...p, upvotes: res.data.upvotedByMe
        ? [...prev.filter(id => idMatches(id, currentUserId)), currentUserId]
        : prev.filter(id => idMatches(id, currentUserId))
      }));
    } catch {
      setPost(p => ({ ...p, upvotes: prev }));
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    // H6 — guard with ref. State-based guard has a race window where
    // two Enter presses both pass the check before `setCommentLoading(true)`
    // commits. Refs don't re-render, so the second invocation sees the
    // updated value synchronously.
    if (!commentText.trim() || commentLoading || commentInFlightRef.current) return;
    commentInFlightRef.current = true;
    setCommentLoading(true);
    try {
      const res = await api.post<{ comment: Comment }>(`/community/${post._id}/comments`, { body: commentText });
      setPost(p => ({ ...p, comments: [...(p.comments || []), res.data.comment] }));
      setCommentText('');
    } catch (e) {
      const msg = friendlyError(e, 'Comment failed.');
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally {
      commentInFlightRef.current = false;
      setCommentLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveText.trim() || resolveLoading) return;
    setResolveLoading(true);
    try {
      const res = await api.patch<{ post: Post }>(`/community/${post._id}/resolve`, { answer: resolveText });
      setPost(res.data.post);
      setShowResolveForm(false);
      setResolveText('');
    } catch (e) {
      const msg = friendlyError(e, 'Could not mark as resolved.');
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally { setResolveLoading(false); }
  };

  const handleRequestExpert = async () => {
    if (expertHelpLoading) return;
    setExpertHelpLoading(true);
    try { await api.post(`/community/${post._id}/request-expert`); }
    catch (e) {
      const msg = friendlyError(e, 'Request failed. Please try again.');
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    }
    finally { setExpertHelpLoading(false); }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim()) return;
    setReportLoading(true);
    try {
      await api.post(`/community/${post._id}/report`, { reason: reportReason });
      setShowReportModal(false);
      setReportReason('');
      const banner = document.createElement('div');
      banner.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium shadow-lg';
      banner.textContent = 'Report submitted. Thank you.';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 3000);
    } catch (e) {
      const msg = friendlyError(e, 'Failed to submit report.');
      setActionError(msg);
      setTimeout(() => setActionError(null), 4000);
    } finally { setReportLoading(false); }
  };

  const isBookmarked = Boolean(
    post.bookmarks?.some(
      b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId
    )
  );

  const handleBookmark = async () => {
    const prev = post.bookmarks || [];
    const currentlyBookmarked = prev.some(
      b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() === currentUserId
    );
    const next = currentlyBookmarked
      ? prev.filter(b => (typeof b === 'object' ? (b as { _id?: string })._id : b)?.toString() !== currentUserId)
      : [...prev, currentUserId];

    setPost(p => ({ ...p, bookmarks: next }));
    try {
      await api.post(`/community/${post._id}/bookmark`);
      const b = document.createElement('div');
      b.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 bg-card border border-border rounded-xl text-xs text-ink font-medium shadow-lg';
      b.textContent = currentlyBookmarked ? 'Bookmark removed' : 'Bookmarked';
      document.body.appendChild(b);
      setTimeout(() => b.remove(), 2000);
    } catch (e) {
      setPost(p => ({ ...p, bookmarks: prev }));
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/csfaq/community?post=${post._id}`;
    if (navigator.share) {
      navigator.share({ title: post.title, url });
    } else {
      navigator.clipboard.writeText(url);
      const banner = document.createElement('div');
      banner.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 bg-card border border-border rounded-xl text-sm text-ink font-medium shadow-lg';
      banner.textContent = 'Link copied to clipboard!';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 2500);
    }
  };

  const LIFECYCLE_CONFIG: Record<string, { label: string; cls: string }> = {
    open:               { label: 'Open',              cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    answered:           { label: 'Solved',            cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    community_accepted: { label: 'Community ✓',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    ai_validated:       { label: 'AI Validated',      cls: 'bg-purple-50 text-purple-700 border-purple-200' },
    admin_accepted:     { label: 'Admin Approved',    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    converted_to_faq:   { label: 'Official FAQ',      cls: 'bg-stone-100 text-stone-700 border-stone-300' },
  };

  return (
    <>
      <dialog ref={dialogRef} closedby="any" aria-labelledby="post-dialog-title"
        className="dialog-shell dialog-panel rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm max-w-2xl w-[95vw] max-h-[90vh]">
        {/* Fixed Header */}
        <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-3 flex-1 min-w-0">
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
            <div className="min-w-0">
              <h2 id="post-dialog-title" className="text-base font-semibold text-ink leading-snug">{post.title}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {(() => {
                  const programName = typeof post.batchId === 'object' && post.batchId !== null && 'name' in post.batchId
                    ? (post.batchId as { name: string }).name
                    : null;
                  if (!programName) return null;
                  return (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-accent/10 border border-accent/25 text-[9px] font-bold text-accent uppercase tracking-wider">
                      {programName}
                    </span>
                  );
                })()}
                <Badge variant={isAnswered ? 'success' : 'warning'}>{isAnswered ? '✓ Answered' : '○ Open'}</Badge>
                <span className="text-xs text-ink-soft">by {post.author?.name || 'Student'}</span>
                <span className="text-xs text-ink-faint">·</span>
                <span className="text-xs text-ink-soft">{formatDate(post.createdAt)}</span>
                {post.lifecycle?.status && LIFECYCLE_CONFIG[post.lifecycle.status] && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${LIFECYCLE_CONFIG[post.lifecycle.status].cls}`}>
                    {LIFECYCLE_CONFIG[post.lifecycle.status].label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => dialogRef.current?.close()}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-mist flex items-center justify-center text-ink-soft hover:text-ink hover:bg-border transition-all">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="dialog-scroll">
          <div className="px-6 py-5">
          {/* Question Card */}
          <div className="bg-mist/60 rounded-2xl border border-border p-4">
            <p className="text-sm text-ink/75 leading-relaxed whitespace-pre-wrap">{post.body}</p>
            <AttachmentGrid assets={attachments} onPreview={(i) => { setLightboxIndex(i); setLightboxAssets(attachments); }} />
          </div>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {post.tags.map((tag: string) => (
                <span key={tag} className="inline-flex items-center px-2.5 py-1 rounded-full bg-accent/8 border border-accent/20 text-xs font-medium text-accent">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Action Bar */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button onClick={handleUpvote} disabled={upvoteLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200
                ${hasUpvoted ? 'bg-accent-light text-accent' : 'bg-mist text-ink-soft hover:bg-border hover:text-ink'}
                disabled:opacity-50`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill={hasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M7 1L8.8 4.8H13L9.8 7.6L11 12L7 9.2L3 12L4.2 7.6L1 4.8H5.2L7 1Z" strokeLinejoin="round"/>
              </svg>
              {upvoteCount}
            </button>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-ink-soft bg-mist">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 3C1 2.17 1.67 1.5 2.5 1.5h9C12.33 1.5 13 2.17 13 3v6C13 9.83 12.33 10.5 11.5 10.5H8.5L5.5 13V10.5H2.5C1.67 10.5 1 9.83 1 9V3z" strokeLinejoin="round"/>
              </svg>
              {post.comments?.length ?? 0}
            </div>
            {currentUserId && (
              <ThreadBookmarkButton
                isBookmarked={isBookmarked}
                onToggle={handleBookmark}
              />
            )}
            <button onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-ink-soft bg-mist hover:bg-border transition-all">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="2.5" r="1.5"/><circle cx="3" cy="7" r="1.5"/><circle cx="11" cy="11.5" r="1.5"/>
                <path d="M4.5 6.3L9.5 3.2M4.5 7.7L9.5 10.8" strokeLinecap="round"/>
              </svg>
              Share
            </button>
            {canResolve && !isAnswered && (
              <Button variant="primary" size="sm" onClick={() => setShowResolveForm(v => !v)}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 6L5 9L10 3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Mark Resolved
              </Button>
            )}
            {!canResolve && !isAnswered && currentUserId && post.author?._id !== currentUserId && (
              <Button variant="secondary" size="sm" onClick={handleRequestExpert} loading={expertHelpLoading}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 1L7.5 4.5H11.5L8.5 7.5L9.5 11L6 8.5L2.5 11L3.5 7.5L0.5 4.5H4.5L6 1Z"/></svg>
                Request Expert
              </Button>
            )}
            {currentUserId && post.author?._id !== currentUserId && (
              <button onClick={() => setShowReportModal(true)}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs text-red-400/70 hover:text-red-500 transition-colors">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 1L7.5 4.5H11.5L8.5 7.5L9.5 11L6 8.5L2.5 11L3.5 7.5L0.5 4.5H4.5L6 1Z"/></svg>
                Report
              </button>
            )}
          </div>

          {/* Time-Trial Banner */}
          {post.timeTrialStatus === 'pending' && (
            <div className="mt-3 px-4 py-2.5 rounded-xl bg-amber-light border border-amber/20 flex items-center gap-2">
              <span className="text-sm">⏱ First Responder active</span>
            </div>
          )}
          {post.timeTrialStatus === 'awarded' && (
            <div className="mt-3 px-4 py-2.5 rounded-xl bg-yellow-light border border-yellow/20 flex items-center gap-2">
              <span className="text-sm">🏅 Awarded to First Responder</span>
            </div>
          )}

          {/* Answer */}
          {isAnswered && post.answer && (
            <div className="mt-5">
              <AnswerCard post={post} currentUserId={currentUserId} userRole={userRole} onPostUpdate={handlePostUpdate} />
            </div>
          )}

          {/* Resolve Form */}
          {showResolveForm && (
            <form onSubmit={handleResolve} className="mt-4 rounded-xl border border-accent/20 bg-accent-light p-4">
              <label className="block text-xs font-semibold text-accent mb-2">Write the official answer</label>
              <textarea value={resolveText} onChange={e => setResolveText(e.target.value)} rows={3}
                placeholder="Provide a clear, helpful answer..."
                className="w-full rounded-xl border border-accent/20 bg-card px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"/>
              <div className="flex gap-2 mt-2">
                <Button type="submit" size="sm" loading={resolveLoading} disabled={!resolveText.trim()}>Save Answer</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowResolveForm(false)}>Cancel</Button>
              </div>
            </form>
          )}

          {/* Comments */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3">
              {post.comments?.length ?? 0} Comment{post.comments?.length !== 1 ? 's' : ''}
            </h3>
            {!post.comments || post.comments.length === 0 ? (
              <p className="text-sm text-ink-faint py-2">No comments yet. Be the first!</p>
            ) : (
              <div className="space-y-4">
                {post.comments.map((c, i) => (
                  <CommentItem key={c._id || i} comment={c as Comment} post={post}
                    currentUserId={currentUserId} userRole={userRole}
                    onUpdate={comments => setPost(p => ({ ...p, comments }))} />
                ))}
              </div>
            )}
          </div>

          {/* Comment Input */}
          {currentUserId && (
            <form ref={commentFormRef} onSubmit={handleComment} className="mt-4">
              <div className="flex gap-2 items-start">
                <Avatar name={undefined} size="sm" />
                <textarea value={commentText} onChange={e => setCommentText(e.target.value)} rows={2}
                  placeholder="Add a comment..."
                  className="flex-1 rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
                  onKeyDown={e => {
                    // H6 — submit via form.requestSubmit() so the form's
                    // own onSubmit handler runs (no React.FormEvent cast).
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (commentText.trim()) commentFormRef.current?.requestSubmit();
                    }
                  }}/>
                <Button type="submit" size="md" disabled={!commentText.trim()} loading={commentLoading} className="flex-shrink-0 mt-0.5">Post</Button>
              </div>
              <p className="text-xs text-ink-faint mt-1.5 ml-9">Enter to post · Shift+Enter for newline</p>
            </form>
          )}
        </div>
        </div>

        {/* Report Modal — rendered outside dialog-scroll (position:fixed, portal-like) */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm" onClick={() => setShowReportModal(false)}>
            <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Report Post</h3>
                <button onClick={() => { setShowReportModal(false); setReportReason(''); }}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-ink-faint hover:text-ink hover:bg-border text-sm transition-colors">✕</button>
              </div>
              <form onSubmit={handleReport} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-ink-soft mb-1.5 block">Why are you reporting this?</label>
                  <textarea value={reportReason} onChange={e => setReportReason(e.target.value)} rows={3}
                    placeholder="Spam, harassment, inappropriate content..."
                    className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none" autoFocus/>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button type="button" variant="secondary" size="sm" onClick={() => { setShowReportModal(false); setReportReason(''); }}>Cancel</Button>
                  <Button type="submit" variant="danger" size="sm" loading={reportLoading} disabled={!reportReason.trim()}>Submit</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </dialog>

      {/* Lightbox — rendered outside dialog entirely (position:fixed, full viewport) */}
      {lightboxAssets.length > 0 && (
        <AttachmentLightbox assets={lightboxAssets} startIndex={lightboxIndex} onClose={() => setLightboxAssets([])} />
      )}
    </>
  );
}
