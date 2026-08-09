/**
 * EditReminderModal.tsx — Reusable, fully-controlled edit form modal
 * (Title / Description / Category) for the Community Moderation module.
 *
 * Fully controlled: this component holds NO internal form state. Field
 * values come in via `values`, every keystroke is reported to the caller
 * via `onFieldChange`, and Save/Cancel are pure callbacks. The caller
 * owns validation, persistence (API calls), and closing the modal — this
 * component only renders the form and reports intent.
 *
 * Reuses the existing admin `Modal` shell, the `Input` primitive for
 * single-line fields, the shared `textAreaBase` style token (already used
 * by FlagOutdatedButton) for the description textarea, and the `Button`
 * primitive for actions — no new form-control styling introduced.
 */

import React from 'react';
import Modal from '../../../admin/components/common/Modal';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { textAreaBase } from '../../../styles/style_config';

export interface EditReminderFormValues {
  title: string;
  description: string;
  category: string;
}

export type EditReminderField = keyof EditReminderFormValues;

export interface EditReminderModalProps {
  open: boolean;
  values: EditReminderFormValues;
  /** Fired on every field change; caller updates `values` and re-renders. */
  onFieldChange: (field: EditReminderField, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Optional per-field validation messages, rendered under each input. */
  errors?: Partial<Record<EditReminderField, string>>;
  /** Optional list of suggested categories, rendered as a datalist. */
  categoryOptions?: string[];
  /** Disables inputs/buttons and shows a loading state on Save. */
  saving?: boolean;
}

export default function EditReminderModal({
  open,
  values,
  onFieldChange,
  onSave,
  onCancel,
  errors,
  categoryOptions,
  saving = false,
}: EditReminderModalProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave();
  };

  return (
    <Modal open={open} onClose={onCancel} title="Edit Reminder" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="reminder-title"
          label="Title"
          value={values.title}
          onChange={(e) => onFieldChange('title', e.target.value)}
          error={errors?.title}
          disabled={saving}
          placeholder="Reminder title"
        />

        <div>
          <label
            htmlFor="reminder-description"
            className="block text-xs font-medium text-ink-soft mb-1.5"
          >
            Description
          </label>
          <textarea
            id="reminder-description"
            value={values.description}
            onChange={(e) => onFieldChange('description', e.target.value)}
            disabled={saving}
            rows={4}
            placeholder="Reminder description"
            className={textAreaBase}
          />
          {errors?.description && (
            <p className="mt-1.5 text-xs text-danger">{errors.description}</p>
          )}
        </div>

        <Input
          id="reminder-category"
          label="Category"
          value={values.category}
          onChange={(e) => onFieldChange('category', e.target.value)}
          error={errors?.category}
          disabled={saving}
          placeholder="e.g. Deadlines"
          list={categoryOptions?.length ? 'reminder-category-options' : undefined}
        />
        {categoryOptions?.length ? (
          <datalist id="reminder-category-options">
            {categoryOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
