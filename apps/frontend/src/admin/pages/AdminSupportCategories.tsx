// AdminSupportCategories — manage per-category schemas. The page
// lists all categories, lets admins add/edit/remove fields on each,
// and includes a small "+ New category" form to add new program
// types (e.g. "Stipend Issue", "Certificate Problem"). Admin only.

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  addField,
  updateField,
  archiveField,
} from '../../components/support/api';
import { getIssueIcon } from '../../components/support/icons';
import {
  SUPPORT_FIELD_TYPES,
  type SupportCategory,
  type SupportContextFieldDefinition,
  type SupportFieldType,
} from '../../components/support/types';
import Spinner from '../../components/ui/Spinner';
import { friendlyError } from '../../utils/api';

const ICON_KEYS = [
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'camera', label: 'Camera' },
  { value: 'mic', label: 'Microphone' },
  { value: 'device', label: 'Device' },
  { value: 'power', label: 'Power' },
  { value: 'generic', label: 'Generic' },
] as const;

function CategoriesInner(): React.ReactElement {
  const [cats, setCats] = useState<SupportCategory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editField, setEditField] = useState<{ cat: SupportCategory; field: SupportContextFieldDefinition | null } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success'): void => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await listCategories();
      setCats(res);
    } catch (err) {
      showToast(friendlyError(err, 'Failed to load categories.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // ─── New-category form state ─────────────────────────────
  const [newCat, setNewCat] = useState<{
    issueType: string; label: string; shortLabel: string; description: string; iconKey: string;
  }>({ issueType: '', label: '', shortLabel: '', description: '', iconKey: 'generic' });
  const [creatingBusy, setCreatingBusy] = useState(false);

  async function handleCreate(): Promise<void> {
    setCreatingBusy(true);
    try {
      await createCategory(newCat);
      showToast('Category created.');
      setNewCat({ issueType: '', label: '', shortLabel: '', description: '', iconKey: 'generic' });
      setCreating(false);
      await load();
    } catch (err) {
      showToast(friendlyError(err, 'Failed to create category.'), 'error');
    } finally {
      setCreatingBusy(false);
    }
  }

  async function handleArchive(issueType: string): Promise<void> {
    if (!confirm(`Delete the "${issueType}" category? Existing tickets keep their stored context-fields but lose the schema reference.`)) return;
    try {
      await deleteCategory(issueType);
      showToast('Category deleted.');
      await load();
    } catch (err) {
      showToast(friendlyError(err, 'Failed to delete.'), 'error');
    }
  }

  async function handleToggleActive(cat: SupportCategory): Promise<void> {
    try {
      await updateCategory(cat.issueType, { isActive: !cat.isActive });
      await load();
    } catch (err) {
      showToast(friendlyError(err, 'Failed to update.'), 'error');
    }
  }

  async function handleFieldSave(issueType: string, field: SupportContextFieldDefinition, payload: Partial<SupportContextFieldDefinition>): Promise<void> {
    try {
      await updateField(issueType, field.key, payload);
      showToast('Field updated.');
      setEditField(null);
      await load();
    } catch (err) {
      showToast(friendlyError(err, 'Failed to update field.'), 'error');
    }
  }

  async function handleFieldAdd(issueType: string, payload: any): Promise<void> {
    try {
      await addField(issueType, payload);
      showToast('Field added.');
      setEditField(null);
      await load();
    } catch (err) {
      showToast(friendlyError(err, 'Failed to add field.'), 'error');
    }
  }

  async function handleFieldArchive(issueType: string, field: SupportContextFieldDefinition): Promise<void> {
    if (!confirm(`Archive the field "${field.label}"? It stops appearing on new submissions, but existing tickets keep their values.`)) return;
    try {
      await archiveField(issueType, field.key);
      showToast('Field archived.');
      await load();
    } catch (err) {
      showToast(friendlyError(err, 'Failed to archive.'), 'error');
    }
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>

      <header className="flex items-baseline justify-between">
        <p className="text-sm text-ink-faint -mt-2">
          Manage the per-category schema. Each category owns a checklist and a list of
          custom context fields shown to users. Admins can also add new categories.
        </p>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="admin-btn-primary"
        >
          {creating ? '− Cancel' : '+ New category'}
        </button>
      </header>

      {creating && (
        <div className="admin-card-surface p-5 space-y-3">
          <p className="text-sm font-semibold text-ink">Add a new category</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="admin-label">issueType (key, kebab-case)</label>
              <input
                value={newCat.issueType}
                onChange={(e) => setNewCat((c) => ({ ...c, issueType: e.target.value.toLowerCase().trim() }))}
                placeholder="e.g. stipend-issue"
                className="admin-input"
              />
            </div>
            <div>
              <label className="admin-label">Label (display name)</label>
              <input
                value={newCat.label}
                onChange={(e) => setNewCat((c) => ({ ...c, label: e.target.value }))}
                placeholder="e.g. Stipend Issue"
                className="admin-input"
              />
            </div>
            <div>
              <label className="admin-label">Short label</label>
              <input
                value={newCat.shortLabel}
                onChange={(e) => setNewCat((c) => ({ ...c, shortLabel: e.target.value }))}
                placeholder="e.g. Stipend"
                className="admin-input"
              />
            </div>
            <div>
              <label className="admin-label">Icon</label>
              <select
                value={newCat.iconKey}
                onChange={(e) => setNewCat((c) => ({ ...c, iconKey: e.target.value }))}
                className="admin-select w-full"
              >
                {ICON_KEYS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="admin-label">Description (admin-only, optional)</label>
            <input
              value={newCat.description}
              onChange={(e) => setNewCat((c) => ({ ...c, description: e.target.value }))}
              className="admin-input"
              placeholder="Internal note for admins."
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={
                creatingBusy ||
                !newCat.issueType || !/^[a-z0-9][a-z0-9-]*$/.test(newCat.issueType) ||
                !newCat.label || !newCat.shortLabel
              }
              className="admin-btn-primary"
            >
              {creatingBusy ? 'Creating…' : 'Create category'}
            </button>
          </div>
        </div>
      )}

      {loading || !cats ? (
        <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
      ) : cats.length === 0 ? (
        <div className="admin-card-surface p-8 text-center text-sm text-ink-soft">
          No categories yet. The first 6 defaults (Internet / Camera / Microphone / Device / Power / Other) are seeded automatically on first run.
        </div>
      ) : (
        <ul className="space-y-3">
          {cats.map((cat) => (
            <CategoryCard
              key={cat._id}
              cat={cat}
              onToggleActive={() => handleToggleActive(cat)}
              onArchive={() => handleArchive(cat.issueType)}
              onEditField={(field) => setEditField({ cat, field })}
              onAddField={() => setEditField({ cat, field: null })}
              onArchiveField={(field) => handleFieldArchive(cat.issueType, field)}
            />
          ))}
        </ul>
      )}

      {/* Field edit modal */}
      <AnimatePresence>
        {editField && (
          <FieldModal
            cat={editField.cat}
            field={editField.field}
            onClose={() => setEditField(null)}
            onSave={(payload) => {
              if (editField.field) {
                void handleFieldSave(editField.cat.issueType, editField.field, payload);
              } else {
                void handleFieldAdd(editField.cat.issueType, payload);
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoryCard({
  cat,
  onToggleActive,
  onArchive,
  onEditField,
  onAddField,
  onArchiveField,
}: {
  cat: SupportCategory;
  onToggleActive: () => void;
  onArchive: () => void;
  onEditField: (f: SupportContextFieldDefinition) => void;
  onAddField: () => void;
  onArchiveField: (f: SupportContextFieldDefinition) => void;
}): React.ReactElement {
  const activeFields = cat.fields.filter((f) => !f.archived);
  const archivedFields = cat.fields.filter((f) => f.archived);

  return (
    <li className="admin-card-surface p-5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-cream text-accent flex items-center justify-center">
          {getIssueIcon(cat.issueType)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-ink">{cat.label}</p>
            <code className="text-[10px] px-1.5 py-0.5 rounded bg-cream text-ink-soft font-mono">
              {cat.issueType}
            </code>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${
              cat.isActive
                ? 'bg-success/15 text-success border-success/30'
                : 'bg-mist text-ink-soft'
            }`}>
              {cat.isActive ? 'Active' : 'Inactive'}
            </span>
            <span className="text-[10px] text-ink-faint">
              · {cat.steps.length} {cat.steps.length === 1 ? 'checklist step' : 'checklist steps'} · {activeFields.length} {activeFields.length === 1 ? 'field' : 'fields'}
            </span>
          </div>
          {cat.description && <p className="text-xs text-ink-soft mt-1">{cat.description}</p>}

          {/* Active fields */}
          {activeFields.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {activeFields.map((f) => (
                <li
                  key={f.key}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-cream/40 transition-colors group"
                >
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-mist text-ink-soft font-mono shrink-0">
                    {f.type}
                  </span>
                  <span className="text-sm text-ink-soft flex-1 min-w-0 truncate">
                    {f.label}
                    {f.required && <span className="text-danger ml-0.5">*</span>}
                    <code className="text-[10px] text-ink-faint ml-1.5">{f.key}</code>
                  </span>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditField(f)}
                      className="text-[11px] text-accent hover:underline"
                    >Edit</button>
                    <button
                      type="button"
                      onClick={() => onArchiveField(f)}
                      className="text-[11px] text-ink-faint hover:text-danger"
                    >Archive</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {archivedFields.length > 0 && (
            <details className="mt-2 text-[11px] text-ink-faint">
              <summary className="cursor-pointer hover:text-ink-soft">
                {archivedFields.length} archived field{archivedFields.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-1 space-y-0.5 pl-3">
                {archivedFields.map((f) => (
                  <li key={f.key}>{f.label} <code className="font-mono">{f.key}</code></li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button type="button" onClick={onAddField} className="text-xs text-accent hover:underline">
              + Add field
            </button>
            <button type="button" onClick={onToggleActive} className="text-xs text-ink-soft hover:text-ink">
              {cat.isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button type="button" onClick={onArchive} className="text-xs text-ink-faint hover:text-danger">
              Delete category
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function FieldModal({
  cat,
  field,
  onClose,
  onSave,
}: {
  cat: SupportCategory;
  field: SupportContextFieldDefinition | null;
  onClose: () => void;
  onSave: (payload: any) => void;
}): React.ReactElement {
  const isEdit = !!field;
  const [label, setLabel] = useState(field?.label ?? '');
  const [type, setType] = useState<SupportFieldType>(field?.type ?? 'text');
  const [required, setRequired] = useState(field?.required ?? false);
  const [placeholder, setPlaceholder] = useState(field?.placeholder ?? '');
  const [helpText, setHelpText] = useState(field?.helpText ?? '');
  const [options, setOptions] = useState<{ value: string; label: string }[]>(
    field?.options ?? [{ value: '', label: '' }],
  );

  const autoKey = label.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  function save(): void {
    if (!label.trim()) return;
    const payload: any = {
      label: label.trim(),
      type,
      required,
      placeholder: placeholder.trim(),
      helpText: helpText.trim(),
    };
    if (!isEdit) payload.key = autoKey;
    if (type === 'dropdown') {
      const cleaned = options
        .map((o) => ({ value: o.value.trim(), label: o.label.trim() }))
        .filter((o) => o.value && o.label);
      if (cleaned.length === 0) return;
      payload.options = cleaned;
    }
    onSave(payload);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
        className="bg-card rounded-2xl border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-ink mb-3">
          {isEdit ? `Edit "${field?.label}"` : `Add field to ${cat.label}`}
        </p>

        <div className="space-y-3">
          <div>
            <label className="admin-label">Label</label>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="admin-input w-full"
              placeholder="e.g. Operating system"
              maxLength={120}
            />
            {!isEdit && autoKey && (
              <p className="text-[10px] text-ink-faint mt-1">key: <code className="font-mono">{autoKey}</code></p>
            )}
          </div>

          <div>
            <label className="admin-label">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SupportFieldType)}
              disabled={isEdit}
              className="admin-select w-full"
            >
              {SUPPORT_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {isEdit && <p className="text-[10px] text-ink-faint mt-1">Type is immutable after creation.</p>}
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border text-accent focus:ring-accent"
            />
            Required
          </label>

          {(type === 'text' || type === 'textarea') && (
            <div>
              <label className="admin-label">Placeholder</label>
              <input
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
                className="admin-input w-full"
                maxLength={200}
              />
            </div>
          )}

          <div>
            <label className="admin-label">Help text</label>
            <input
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              className="admin-input w-full"
              placeholder="Optional grey text shown below the field"
              maxLength={500}
            />
          </div>

          {type === 'dropdown' && (
            <div>
              <label className="admin-label">Options</label>
              <ul className="space-y-2">
                {options.map((o, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <input
                      value={o.value}
                      onChange={(e) => setOptions((opts) => opts.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))}
                      placeholder="value"
                      className="admin-input flex-1"
                    />
                    <input
                      value={o.label}
                      onChange={(e) => setOptions((opts) => opts.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                      placeholder="Display label"
                      className="admin-input flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setOptions((opts) => opts.filter((_, idx) => idx !== i))}
                      className="text-ink-faint hover:text-danger px-2"
                      title="Remove option"
                      disabled={options.length === 1}
                    >✕</button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setOptions((opts) => [...opts, { value: '', label: '' }])}
                className="text-xs text-accent hover:underline mt-1"
              >+ Add option</button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/60 mt-4">
          <button type="button" onClick={onClose} className="admin-btn-ghost">Cancel</button>
          <button
            type="button"
            onClick={save}
            disabled={!label.trim() || (type === 'dropdown' && options.filter((o) => o.value && o.label).length === 0)}
            className="admin-btn-primary"
          >
            {isEdit ? 'Save' : 'Add field'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Toast({ toast }: { toast: { msg: string; type: 'success' | 'error' } }): React.ReactElement {
  const colour = toast.type === 'error' ? 'admin-toast-error' : 'admin-toast-success';
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${colour}`}
    >{toast.msg}</motion.div>
  );
}

export default function AdminSupportCategories(): React.ReactElement {
  return <CategoriesInner />;
}
