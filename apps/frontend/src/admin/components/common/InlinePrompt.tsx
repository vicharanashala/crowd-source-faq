/**
 * InlinePrompt — small inline form that replaces `window.prompt` for a
 * non-blocking UX. Renders a trigger button; on click expands into a
 * textarea (optional, multiline) + confirm/cancel buttons. Calls
 * `onConfirm(value)` when the user confirms. If the user cancels
 * (button click or empty submit), the form collapses without calling
 * `onConfirm`.
 */
import { useState } from 'react';

export interface InlinePromptProps {
  /** Text shown on the trigger button (e.g. "Reject"). */
  triggerLabel: string;
  /** Optional title shown above the input. */
  title?: string;
  /** Placeholder for the textarea. */
  placeholder?: string;
  /** If true, render a multi-line textarea; else a single-line input. */
  multiline?: boolean;
  /** Label on the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Initial value (rarely used). */
  defaultValue?: string;
  /** Called with the input string when the user confirms. */
  onConfirm(value: string): void;
  /** Optional className for the trigger button. */
  triggerClassName?: string;
}

export default function InlinePrompt({
  triggerLabel,
  title,
  placeholder = '',
  multiline = false,
  confirmLabel = 'Confirm',
  defaultValue = '',
  onConfirm,
  triggerClassName = 'admin-btn admin-btn-ghost text-xs',
}: InlinePromptProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setValue('');
    setOpen(false);
  };

  const handleCancel = () => {
    setValue(defaultValue);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 border border-admin-border rounded-md bg-admin-surface">
      {title && <span className="text-xs font-medium text-ink-soft">{title}</span>}
      {multiline ? (
        <textarea
          autoFocus
          rows={3}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleConfirm();
            } else if (e.key === 'Escape') {
              handleCancel();
            }
          }}
          className="w-full px-2 py-1 text-xs border border-admin-border rounded bg-white text-ink placeholder-ink-soft focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ) : (
        <input
          autoFocus
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            else if (e.key === 'Escape') handleCancel();
          }}
          className="w-full px-2 py-1 text-xs border border-admin-border rounded bg-white text-ink placeholder-ink-soft focus:outline-none focus:ring-1 focus:ring-primary"
        />
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          className="admin-btn admin-btn-ghost text-xs"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-primary text-xs"
          onClick={handleConfirm}
          disabled={!value.trim()}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
