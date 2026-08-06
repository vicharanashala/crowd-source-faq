/**
 * DeleteConfirmationDialog.tsx — Generic, reusable confirmation dialog.
 *
 * Not specific to "delete" mechanically — it just renders a title,
 * description, and Confirm/Cancel buttons — but named for its primary
 * use case in the Community Moderation module (confirming destructive
 * moderator actions).
 *
 * Reuses the existing admin `Modal` shell (overlay, escape-to-close,
 * scroll lock, animation) instead of re-implementing dialog chrome, and
 * the existing `Button` primitive for actions. The component itself owns
 * no state and makes no API calls — `onConfirm` / `onCancel` are the only
 * way it communicates back to the caller, which decides what "confirm"
 * actually does (e.g. call an API, then unmount this dialog).
 *
 * The caller is responsible for conditionally rendering this component
 * (there is no `open` prop by design, per spec) — render it only while
 * the confirmation is active.
 */

import React from 'react';
import Modal from '../../../admin/components/common/Modal';
import Button from '../../ui/Button';

export interface DeleteConfirmationDialogProps {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional label overrides for the action buttons. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional loading state so the caller can disable buttons mid-request. */
  loading?: boolean;
}

export default function DeleteConfirmationDialog({
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  loading = false,
}: DeleteConfirmationDialogProps) {
  return (
    <Modal open onClose={onCancel} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-ink-soft mb-5">{description}</p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
