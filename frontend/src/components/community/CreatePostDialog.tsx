import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import api from '../../utils/api';
import type { Post } from '../../types/ui';
import { useCloudinaryUpload, buildTransformedUrl, type CloudinaryAsset } from '../../hooks/useCloudinaryUpload';

interface CreatePostDialogProps {
  onClose: () => void;
  onCreated: (post: Post, dupResult?: { isDuplicate: boolean; dupCount: number; faqMatches: number }) => void;
  prefillTitle?: string;
}

export default function CreatePostDialog({ onClose, onCreated, prefillTitle = '' }: CreatePostDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const DRAFT_KEY = 'yaksha_post_draft';

  // ── Cloudinary attachments ──
  const { upload: uploadAttachment, uploading: attaching, error: attachmentError } = useCloudinaryUpload('posts');
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<CloudinaryAsset[]>([]);
  const MAX_ATTACHMENTS = 4;
  const handlePickAttachment = () => attachmentInputRef.current?.click();
  const handleAttachmentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const file of files) {
      if (attachments.length >= MAX_ATTACHMENTS) break;
      try {
        const asset = await uploadAttachment(file);
        setAttachments((prev) => [...prev, asset].slice(0, MAX_ATTACHMENTS));
      } catch {
        // Error already set on the hook; just stop this batch.
        break;
      }
    }
  };
  const removeAttachment = (publicId: string) => {
    setAttachments((prev) => prev.filter((a) => a.publicId !== publicId));
  };

  // Restore draft from sessionStorage on mount
  const [title, setTitle] = useState(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) {
        const { t } = JSON.parse(draft);
        return t || prefillTitle || '';
      }
    } catch {}
    return prefillTitle || '';
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
    // Block only if match is a high-confidence FAQ match (score >= 0.85).
    // Low-confidence / tangential matches are shown as suggestions — posting is allowed.
    const highConfidenceFaqMatch = duplicateMatch?.matches?.find(
      (m: any) => m.source === 'faq' && m.score >= 0.85
    );
    if (highConfidenceFaqMatch) {
      setError('This question is already answered in our FAQ. Please check the FAQ page first.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ post: Post }>('/community', {
        title: title.trim(),
        body: body.trim(),
        tags,
        // Send only the persisted fields the backend expects. The full
        // Cloudinary response has more (eager, etc.) that we don't save.
        attachments: attachments.map((a) => ({
          url: a.url,
          publicId: a.publicId,
          width: a.width,
          height: a.height,
          format: a.format,
          bytes: a.bytes,
        })),
      });
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

  // Only block submission for high-confidence FAQ matches (score >= 0.85).
  // Low-confidence matches are informational only — posting is always allowed.
  const hasHighConfidenceFaqMatch = duplicateMatch?.matches?.some(
    (m: any) => m.source === 'faq' && m.score >= 0.85
  );
  const isSubmitDisabled = !title.trim() || !body.trim() || hasHighConfidenceFaqMatch || checkingDuplicates || loading;

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
              Tags <span className="text-ink-faint font-normal">(optional — max 3, press Enter or comma to add)</span>
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
                    if (newTag && !tags.includes(newTag) && tags.length < 3) setTags([...tags, newTag]);
                    setTagInput('');
                  }
                }}
                placeholder={tags.length === 0 ? "e.g. NOC, ViBe, Timetable" : ""}
                className="flex-1 min-w-[120px] bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none"
              />
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">
              Attachments <span className="text-ink-faint font-normal">(optional — up to {MAX_ATTACHMENTS} images)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.publicId} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-mist group">
                  <img
                    src={buildTransformedUrl(a.url, 'w_120,h_120,c_fill,q_auto,f_auto')}
                    alt="attachment preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.publicId)}
                    aria-label="Remove attachment"
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
              {attachments.length < MAX_ATTACHMENTS && (
                <button
                  type="button"
                  onClick={handlePickAttachment}
                  disabled={attaching}
                  className="w-16 h-16 rounded-lg border border-dashed border-border bg-mist flex flex-col items-center justify-center text-ink-faint hover:border-accent/50 hover:text-accent transition-colors disabled:opacity-50"
                >
                  {attaching ? (
                    <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <path d="M21 15l-5-5L5 21"/>
                      </svg>
                      <span className="text-[9px] font-semibold mt-0.5">Add</span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={attachmentInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleAttachmentFile}
                className="hidden"
              />
            </div>
            {attachmentError && (
              <p className="text-xs text-danger mt-1">{attachmentError}</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">{error}</p>
          )}

          {toast && (
            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl text-sm font-medium shadow-float border animate-fade-in
              ${toast.type === 'success' ? 'bg-accent-light border-accent/30 text-accent' :
                toast.type === 'warn' ? 'bg-warning-light border-warning/30 text-warning' :
                'bg-accent-light border-accent/30 text-accent'}`}>
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
