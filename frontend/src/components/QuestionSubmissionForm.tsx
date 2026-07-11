import { FormEvent, useState } from "react";
import { CATEGORIES, Category } from "../types";

interface Props {
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    description: string;
    category: Category;
    tags: string[];
  }) => Promise<void>;
}

export default function QuestionSubmissionForm({ onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("General");
  const [tagsInput, setTagsInput] = useState("");
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const validate = () => {
    const nextErrors: { title?: string; description?: string } = {};
    if (!title.trim()) nextErrors.title = "Title is required";
    if (!description.trim()) nextErrors.description = "Description is required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      setSubmitting(true);
      await onSubmit({ title: title.trim(), description: description.trim(), category, tags });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create discussion");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-lg rounded-card border border-line bg-parchment p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">Start a discussion</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-slate hover:bg-mossLight hover:text-ink"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Question Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summarize your question in one line"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
            />
            {errors.title && <p className="mt-1 text-xs text-clay">{errors.title}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Add details that would help others understand your issue"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-clay">{errors.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                Tags <span className="text-slate">(optional, comma separated)</span>
              </label>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="login, sync, mobile"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
              />
            </div>
          </div>

          {formError && <p className="text-sm text-clay">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate hover:bg-mossLight"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-moss px-5 py-2 text-sm font-semibold text-parchment hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Posting…" : "Post discussion"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
