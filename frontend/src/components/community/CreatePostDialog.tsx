import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import api from '../../utils/api';
import type { Post } from '../../types/ui';

interface CreatePostDialogProps {
  onClose: () => void;
  onCreated: (post: Post, dupResult?: { isDuplicate: boolean; dupCount: number; faqMatches: number }) => void;
}

export default function CreatePostDialog({ onClose, onCreated }: CreatePostDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const DRAFT_KEY = 'yaksha_post_draft';

  // Restore draft from sessionStorage on mount
  const [title, setTitle] = useState(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) {
        const { t } = JSON.parse(draft);
        return t || '';
      }
    } catch {}
    return '';
  });
  const [body, setBody] = useState(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) {
        const { b } = JSON.parse(draft);
        return b || '';
      }
    } catch {}
    return '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [duplicateMatch, setDuplicateMatch] = useState<{ isDuplicate: boolean; matches: any[] } | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [floatAway, setFloatAway] = useState(false);
  const duplicateCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warn' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'warn' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Save draft on field changes
  const handleTitleChange = (val: string) => {
    setTitle(val);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ t: val, b: body })); } catch {}
  };
  const handleBodyChange = (val: string) => {
    setBody(val);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ t: title, b: val })); } catch {}
  };

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

  useEffect(() => {
    if (duplicateCheckTimerRef.current) clearTimeout(duplicateCheckTimerRef.current);
    const q = title.trim();
    if (q.length < 10) {
      setDuplicateMatch(null);
      setCheckingDuplicates(false);
      return;
    }
    setCheckingDuplicates(true);
    duplicateCheckTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.post<{ isDuplicate: boolean; matches: any[] }>('/community/check-duplicate', { query: q });
        setDuplicateMatch(res.data);
      } catch {
        setDuplicateMatch(null);
      } finally {
        setCheckingDuplicates(false);
      }
    }, 600);
    return () => { if (duplicateCheckTimerRef.current) clearTimeout(duplicateCheckTimerRef.current); };
  }, [title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim() || !body.trim()) {
      setError('Both title and description are required.');
      return;
    }
    // Block only if match is an FAQ (already answered in FAQ)
    // Community matches are suggestions — allow posting
    const faqMatch = duplicateMatch?.matches?.find((m: any) => m.source === 'faq');
    if (faqMatch) {
      setError('This question is already answered in our FAQ. Please check the FAQ page first.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ post: Post }>('/community', { title: title.trim(), body: body.trim(), tags });
      // Clear draft on success
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      // Show toast with duplicate check result
      const dupCount = duplicateMatch?.matches?.length ?? 0;
      if (dupCount > 0) {
        const faqMatches = duplicateMatch?.matches?.filter((m: any) => m.source === 'faq').length ?? 0;
        if (faqMatches > 0) {
          showToast(`⚠️ Similar FAQ found — your question has been linked.`, 'warn');
        } else {
          showToast(`🔍 ${dupCount} similar discussion${dupCount > 1 ? 's' : ''} found — good to cross-reference.`, 'info');
        }
      } else {
        showToast(`✅ Your question has been posted to the community!`, 'success');
      }
      const dupResult = { isDuplicate: duplicateMatch?.isDuplicate ?? false, dupCount, faqMatches: duplicateMatch?.matches?.filter((m: any) => m.source === 'faq').length ?? 0 };
      onCreated(res.data.post, dupResult);
      dialogRef.current?.close();
    } catch (err) {
      const errObj = err as { response?: { data?: { message?: string } } };
      setError(errObj.response?.data?.message || 'Failed to post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const faqMatch = duplicateMatch?.matches?.some((m: any) => m.source === 'faq');
  const isSubmitDisabled = !title.trim() || !body.trim() || faqMatch || checkingDuplicates || loading;

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="create-post-title"
      className={`m-auto w-full max-w-lg rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm transition-all duration-300${floatAway ? " opacity-60 scale-[0.98]" : ""}`}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 id="create-post-title" className="text-base font-semibold text-ink">Ask a Question</h2>
            <p className="text-xs text-ink-soft mt-0.5">Share your question with the community</p>
          </div>
          <button
            onClick={() => dialogRef.current?.close()}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full bg-mist flex items-center justify-center text-ink-soft hover:text-ink hover:bg-border transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={`space-y-4${floatAway ? ' animate-float-away' : ''}`}>
          <div>
            <label htmlFor="post-title" className="block text-xs font-medium text-ink-soft mb-1.5">
              Title <span className="text-danger">*</span>
            </label>
            <input
              id="post-title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="E.g. How do I request leave during the internship?"
              maxLength={150}
              required
              className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all"
            />
            <div className="flex items-center justify-between mt-1">
              <div>
                {checkingDuplicates && (
                  <span className="text-xs text-ink-faint flex items-center gap-1">
                    <span className="w-3 h-3 border border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                    Checking duplicates...
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-faint text-right">{title.length}/150</p>
            </div>
          </div>

          {duplicateMatch && duplicateMatch.isDuplicate && duplicateMatch.matches.length > 0 && (
            <div className="faq-match-banner">
              <span>📖</span>
              <div>
                <p className="font-medium">Similar question found!</p>
                {duplicateMatch.matches.slice(0, 3).map((m: any, i: number) => (
                  <p key={i} className="text-xs mt-0.5 opacity-80">
                    {m.source === 'faq' ? '📋 FAQ' : '💬 Community'}: <strong>"{m.question || m.title}"</strong>
                    {m.score && <span className="text-ink-faint"> ({(m.score * 100).toFixed(0)}% match)</span>}
                  </p>
                ))}
                {duplicateMatch.matches.some((m: any) => m.source === 'faq') && (
                  <a href="/faq" className="text-xs mt-1 inline-block">→ Check FAQ for answer</a>
                )}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="post-body" className="block text-xs font-medium text-ink-soft mb-1.5">
              Description <span className="text-danger">*</span>
            </label>
            <textarea
              id="post-body"
              value={body}
              onChange={(e) => handleBodyChange(e.target.value)}
              rows={5}
              placeholder="Describe your question in detail. Include any context that might be helpful…"
              maxLength={2000}
              required
              className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
            />
            <p className={`text-xs mt-1 text-right ${body.length > 1800 ? 'text-danger font-semibold' : 'text-ink-faint'}`}>{body.length}/2000</p>
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="post-tags" className="block text-xs font-medium text-ink-soft mb-1.5">
              Tags <span className="text-ink-faint font-normal">(optional — press Enter or comma to add)</span>
            </label>
            <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-border bg-mist focus-within:ring-2 focus-within:ring-accent/25 focus-within:bg-card transition-all">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="hover:text-danger"
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="post-tags"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                    e.preventDefault();
                    const newTag = tagInput.trim().replace(/,/g, '');
                    if (newTag && !tags.includes(newTag)) setTags([...tags, newTag]);
                    setTagInput('');
                  }
                }}
                placeholder={tags.length === 0 ? "e.g. NOC, ViBe, Timetable" : ""}
                className="flex-1 min-w-[120px] bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">{error}</p>
          )}

          {toast && (
            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl text-sm font-medium shadow-float border animate-fade-in
              ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                toast.type === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                'bg-blue-50 border-blue-200 text-blue-700'}`}>
              {toast.msg}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              loading={loading}
              disabled={isSubmitDisabled}
              className="flex-1"
            >
              Post Question
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
