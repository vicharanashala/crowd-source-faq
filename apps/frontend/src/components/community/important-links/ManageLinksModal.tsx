/**
 * ManageLinksModal.tsx — Admin-only Add/Edit/Delete modal for Important
 * Links.
 *
 * Callbacks only: this component makes NO API calls. `onAdd` / `onEdit` /
 * `onDelete` are invoked with plain data and it's entirely up to the
 * caller what happens next (call an API, update local state, etc). The
 * modal only keeps the transient UI state needed to drive its own form
 * (which link is being edited, the current draft values, which row's
 * delete confirmation is open) — none of that is persisted data.
 *
 * Reuses:
 *  - `Modal` (admin/components/common/Modal) for the shell
 *  - `Input` (ui/Input) for text fields
 *  - `Button` (ui/Button) for actions
 *  - `DeleteConfirmationDialog` (community/moderation) for delete
 *    confirmation — same reusable dialog built for Community Moderation
 *  - `textAreaBase` style token for the description field
 *  - `IMPORTANT_LINK_CATEGORIES` for the category <select>
 */

import React, { useState } from 'react';
import Modal from '../../../admin/components/common/Modal';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import DeleteConfirmationDialog from '../moderation/DeleteConfirmationDialog';
import { textAreaBase } from '../../../styles/style_config';
import {
  IMPORTANT_LINK_CATEGORIES,
  type ImportantLink,
  type ImportantLinkDraft,
} from './types';

const EMPTY_DRAFT: ImportantLinkDraft = {
  icon: '🔗',
  title: '',
  description: '',
  category: 'Other',
  url: '',
  isOfficial: false,
};

export interface ManageLinksModalProps {
  open: boolean;
  links: ImportantLink[];
  onAdd: (draft: ImportantLinkDraft) => void;
  onEdit: (id: string, draft: ImportantLinkDraft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** Disables inputs/buttons while a parent-owned persistence call is in flight. */
  saving?: boolean;
}

type ViewMode = 'list' | 'form';

export default function ManageLinksModal({
  open,
  links,
  onAdd,
  onEdit,
  onDelete,
  onClose,
  saving = false,
}: ManageLinksModalProps) {
  const [view, setView] = useState<ViewMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportantLinkDraft>(EMPTY_DRAFT);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const resetToList = () => {
    setView('list');
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const startAdd = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setView('form');
  };

  const startEdit = (link: ImportantLink) => {
    const { id, ...rest } = link;
    setDraft(rest);
    setEditingId(id);
    setView('form');
  };

  const handleFieldChange = <K extends keyof ImportantLinkDraft>(
    field: K,
    value: ImportantLinkDraft[K]
  ) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      onEdit(editingId, draft);
    } else {
      onAdd(draft);
    }
    resetToList();
  };

  const handleClose = () => {
    resetToList();
    onClose();
  };

  const linkPendingDelete = links.find((l) => l.id === confirmDeleteId) ?? null;

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={view === 'list' ? 'Manage Important Links' : editingId ? 'Edit Link' : 'Add Link'}
        maxWidth="max-w-lg"
      >
        {view === 'list' ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="primary" size="sm" onClick={startAdd}>
                <span aria-hidden="true">➕</span>
                <span>Add New Link</span>
              </Button>
            </div>

            {links.length === 0 ? (
              <p className="text-sm text-ink-faint text-center py-6">
                No important links yet.
              </p>
            ) : (
              <ul className="divide-y divide-border max-h-96 overflow-y-auto">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg flex-shrink-0" aria-hidden="true">
                        {link.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{link.title}</p>
                        <p className="text-xs text-ink-faint truncate">{link.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(link)}
                        title="Edit"
                      >
                        ✏️
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger-light"
                        onClick={() => setConfirmDeleteId(link.id)}
                        title="Delete"
                      >
                        🗑️
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="link-icon"
              label="Icon"
              value={draft.icon}
              onChange={(e) => handleFieldChange('icon', e.target.value)}
              placeholder="🔗"
              maxLength={4}
              disabled={saving}
            />
            <Input
              id="link-title"
              label="Title"
              value={draft.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              placeholder="Link title"
              disabled={saving}
              required
            />

            <div>
              <label htmlFor="link-description" className="block text-xs font-medium text-ink-soft mb-1.5">
                Description
              </label>
              <textarea
                id="link-description"
                value={draft.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                rows={3}
                placeholder="What this link is for"
                className={textAreaBase}
                disabled={saving}
              />
            </div>

            <div>
              <label htmlFor="link-category" className="block text-xs font-medium text-ink-soft mb-1.5">
                Category
              </label>
              <select
                id="link-category"
                value={draft.category}
                onChange={(e) => handleFieldChange('category', e.target.value as ImportantLinkDraft['category'])}
                disabled={saving}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent transition-all duration-200 ease-smooth"
              >
                {IMPORTANT_LINK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <Input
              id="link-url"
              label="URL"
              type="url"
              value={draft.url}
              onChange={(e) => handleFieldChange('url', e.target.value)}
              placeholder="https://..."
              disabled={saving}
              required
            />

            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={draft.isOfficial ?? false}
                onChange={(e) => handleFieldChange('isOfficial', e.target.checked)}
                disabled={saving}
                className="rounded border-border"
              />
              Mark as Official
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="sm" onClick={resetToList} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={saving}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {linkPendingDelete && (
        <DeleteConfirmationDialog
          title="Delete this link?"
          description={`"${linkPendingDelete.title}" will be removed from Important Links.`}
          onConfirm={() => {
            onDelete(linkPendingDelete.id);
            setConfirmDeleteId(null);
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </>
  );
}
