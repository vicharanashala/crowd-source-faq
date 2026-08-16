import React, { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import api, { friendlyError } from '../../utils/api';
import { useBatch } from '../../context/BatchContext';
import { useCategories } from '../explore/usePublicFaqApi';
import type { ThreadPost } from './ThreadDetail';

interface PromoteToFaqDialogProps {
  post: ThreadPost;
  onClose: () => void;
  onPromoted: (updatedPost: any) => void;
}

export default function PromoteToFaqDialog({ post, onClose, onPromoted }: PromoteToFaqDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { currentBatch } = useBatch();
  const { data: categoriesData } = useCategories(currentBatch?._id ?? null, null);
  const categories: string[] = [...(categoriesData?.categories?.map((c: any) => c.name as string) || [])].sort((a, b) => a.localeCompare(b));

  const [question, setQuestion] = useState(post.title);
  const [answer, setAnswer] = useState(() => {
    if (post.answer) return post.answer;
    // Fallback to accepted comment if found
    const acceptedComment = post.comments?.find((c: any) => c.verified);
    return acceptedComment?.body || '';
  });
  
  const [categoryOption, setCategoryOption] = useState(() => {
    const primaryTag = post.tags?.[0] || '';
    if (primaryTag && categories.includes(primaryTag)) {
      return primaryTag;
    }
    return '';
  });
  
  const [customCategory, setCustomCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target === dialog) {
        dialog.close();
      }
    };
    dialog.addEventListener('click', handleBackdropClick);

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [onClose]);

  // Sync category prefill if categories load late
  useEffect(() => {
    const primaryTag = post.tags?.[0] || '';
    if (primaryTag && categories.length > 0) {
      if (categories.includes(primaryTag)) {
        setCategoryOption(primaryTag);
      } else {
        setCategoryOption('__other__');
        setCustomCategory(primaryTag);
      }
    }
  }, [categoriesData, post.tags]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const finalCategory = categoryOption === '__other__' ? customCategory.trim() : categoryOption;

    if (!question.trim()) {
      setError('Question text is required.');
      return;
    }
    if (!answer.trim()) {
      setError('Answer text is required.');
      return;
    }
    if (!finalCategory) {
      setError('Please select or enter a category.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ message: string; faq: any; post: any }>(
        `/community/${post._id}/convert-to-faq`,
        {
          question: question.trim(),
          answer: answer.trim(),
          category: finalCategory,
        }
      );
      onPromoted(res.data.post || { ...post, lifecycle: { ...post.lifecycle, status: 'converted_to_faq' } });
      dialogRef.current?.close();
    } catch (err) {
      setError(friendlyError(err, 'Failed to promote post to FAQ. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-lg rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm transition-all duration-300"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-ink">Promote to Official FAQ</h2>
            <p className="text-xs text-ink-soft mt-0.5">Customize the question and answer before publishing to the FAQ page.</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">
              Question Title <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="E.g. Is attendance mandatory for all sessions?"
              required
              className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">
              Official Answer <span className="text-danger">*</span>
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Provide the official answer..."
              rows={4}
              required
              className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1.5">
              FAQ Category <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <select
                value={categoryOption}
                onChange={(e) => setCategoryOption(e.target.value)}
                className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all appearance-none cursor-pointer"
              >
                <option value="">Select a category</option>
                {categories.filter(Boolean).map((cat: string) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="__other__">Other (Create new)...</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-ink-soft">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>

            {categoryOption === '__other__' && (
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Enter custom category name..."
                required
                className="w-full mt-2 rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all"
              />
            )}
          </div>

          {error && (
            <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              loading={loading}
              className="flex-1"
            >
              Promote to FAQ
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
