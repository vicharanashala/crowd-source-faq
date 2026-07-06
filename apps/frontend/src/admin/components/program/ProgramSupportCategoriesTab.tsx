/**
 * v1.69 — Phase 9 admin UI: per-program SupportCategory CRUD
 * widget. Mounted in the AdminProgramDetail Support tab.
 *
 * Lists every category in this program (per-program overrides
 * + the merged global defaults, with per-program wins on
 * issueType collision). Lets the admin create / edit / delete
 * categories scoped to this program; the body.batchId flows
 * through to the backend so the per-program CRUD hits the
 * right MongoDB doc.
 *
 * For the per-program CRUD, the backend now uses a
 * (batchId, issueType) compound uniqueness key (Phase 9). The
 * same kebab-case key can be reused across programs.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import adminApi from '../../utils/adminApi';

interface SupportCategory {
  _id: string;
  issueType: string;
  label: string;
  shortLabel: string;
  description: string;
  iconKey: string;
  steps: string[];
  isActive: boolean;
  displayOrder: number;
  // v1.69 — Phase 9: when this is set, the doc is a per-program
  // override (not the global default).
  batchId: string | null;
  // The listCategories ?includeOverrides=true response shape
  // tags per-program rows with a perProgram flag so the UI can
  // surface the override.
  perProgram?: boolean;
  fields: { key: string; type: string; label: string; required?: boolean; options?: { value: string; label: string }[] }[];
}

const ICON_KEYS = ['generic', 'wifi', 'device', 'money', 'shield', 'envelope', 'user', 'bug'] as const;
type IconKey = (typeof ICON_KEYS)[number];

function IconGlyph({ iconKey }: { iconKey: string }) {
  // v1.69 — minimal SVG glyphs (real ones live in
  // components/support/icons; this is a stand-in so the
  // listView can render a quick visual without importing
  // the whole icon kit).
  const map: Record<string, string> = {
    wifi: 'M2 8.5C5.5 5 12 5 15.5 8.5',
    device: 'M7 2h10v20H7z',
    money: 'M12 6v12M9 9h6M9 15h6',
    shield: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z',
    envelope: 'M3 7l9 6 9-6M3 7v10h18V7',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0',
    bug: 'M12 4v4M5 7l3 3M19 7l-3 3M4 14h16M4 18h16',
  };
  const d = map[iconKey] ?? 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function CategoryRow({
  cat,
  onEdit,
  onDelete,
  saving,
}: {
  cat: SupportCategory;
  onEdit: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0">
      <span className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-lg text-ink-soft bg-mist shrink-0">
        <IconGlyph iconKey={cat.iconKey ?? 'generic'} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-ink truncate">{cat.label}</p>
          {cat.perProgram && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-accent bg-accent/10 border border-accent/30 rounded-md px-1.5 py-0.5">
              Per-program
            </span>
          )}
          {!cat.isActive && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-faint bg-mist border border-border/60 rounded-md px-1.5 py-0.5">
              Inactive
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-soft truncate">
          <span className="font-mono text-ink-faint">{cat.issueType}</span>
          {cat.shortLabel ? ` · ${cat.shortLabel}` : ''}
          {cat.steps.length > 0 && ` · ${cat.steps.length} step${cat.steps.length === 1 ? '' : 's'}`}
          {cat.fields.length > 0 && ` · ${cat.fields.length} field${cat.fields.length === 1 ? '' : 's'}`}
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] shrink-0">
        <button
          type="button"
          onClick={onEdit}
          disabled={saving}
          className="px-2 py-0.5 rounded text-ink-soft hover:text-ink hover:bg-cream disabled:opacity-40"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={saving}
          className="px-2 py-0.5 rounded text-rose-700/80 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function CategoryForm({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial: Partial<SupportCategory> | null;
  onCancel: () => void;
  onSave: (payload: {
    issueType: string;
    label: string;
    shortLabel: string;
    description: string;
    iconKey: IconKey;
    steps: string[];
  }) => void;
  saving: boolean;
}) {
  const [issueType, setIssueType] = useState(initial?.issueType ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [shortLabel, setShortLabel] = useState(initial?.shortLabel ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [iconKey, setIconKey] = useState<IconKey>((initial?.iconKey as IconKey) ?? 'generic');
  const [stepsText, setStepsText] = useState((initial?.steps ?? []).join('\n'));

  const isEdit = !!initial;

  return (
    <motion.form
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = {
          issueType: issueType.trim().toLowerCase(),
          label: label.trim(),
          shortLabel: shortLabel.trim(),
          description: description.trim(),
          iconKey,
          steps: stepsText.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20),
        };
        onSave(trimmed);
      }}
      className="rounded-2xl border border-border/60 bg-card/70 p-5 space-y-4"
    >
      <h4 className="text-sm font-semibold text-ink">
        {isEdit ? 'Edit category' : 'New category'}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-ink-soft mb-1">
            Issue type <span className="text-ink-faint">(kebab-case, a-z, 0-9, -)</span>
          </label>
          <input
            type="text"
            value={issueType}
            onChange={(e) => setIssueType(e.target.value)}
            disabled={isEdit}
            placeholder="e.g. stipend-issue"
            className="admin-input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-ink-soft mb-1">Icon</label>
          <select
            value={iconKey}
            onChange={(e) => setIconKey(e.target.value as IconKey)}
            className="admin-select w-full"
          >
            {ICON_KEYS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-ink-soft mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Stipend Issue"
            className="admin-input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-ink-soft mb-1">Short label</label>
          <input
            type="text"
            value={shortLabel}
            onChange={(e) => setShortLabel(e.target.value)}
            placeholder="e.g. Stipend"
            className="admin-input w-full"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-medium text-ink-soft mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What this issue type covers, who it affects, etc."
            className="admin-input w-full resize-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-medium text-ink-soft mb-1">
            Troubleshooting steps <span className="text-ink-faint">(one per line, max 20)</span>
          </label>
          <textarea
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            rows={4}
            placeholder={'Restart the device\nCheck your network\nReinstall the app'}
            className="admin-input w-full resize-none font-mono text-xs"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="admin-btn-ghost">Cancel</button>
        <button type="submit" disabled={saving} className="admin-btn-primary">
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create category'}
        </button>
      </div>
    </motion.form>
  );
}

export default function ProgramSupportCategoriesTab({ programId }: { programId: string }) {
  const [categories, setCategories] = useState<SupportCategory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SupportCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get<{ categories: SupportCategory[] }>('/support/categories', {
        params: { batchId: programId, includeOverrides: 'true' },
      });
      setCategories(res.data.categories ?? []);
    } catch (err) {
      setError('Failed to load per-program support categories.');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  const overrideCount = useMemo(
    () => (categories ?? []).filter((c) => c.perProgram).length,
    [categories]
  );

  const handleSave = async (
    payload: {
      issueType: string;
      label: string;
      shortLabel: string;
      description: string;
      iconKey: IconKey;
      steps: string[];
    },
    isEdit: boolean,
    issueTypeForEdit?: string
  ) => {
    setSavingKey(issueTypeForEdit ?? payload.issueType);
    try {
      if (isEdit && issueTypeForEdit) {
        await adminApi.patch(
          `/support/categories/${encodeURIComponent(issueTypeForEdit)}`,
          { ...payload, batchId: programId }
        );
        showToast(`Category '${payload.label}' updated.`);
      } else {
        await adminApi.post('/support/categories', { ...payload, batchId: programId });
        showToast(`Category '${payload.label}' created.`);
      }
      setEditing(null);
      setCreating(false);
      await load();
    } catch (err: any) {
      showToast(
        err.response?.data?.message ?? 'Save failed. Check the form values.',
        'error'
      );
    } finally {
      setSavingKey(null);
    }
  };

  const handleDelete = async (cat: SupportCategory) => {
    if (!window.confirm(
      `Delete category '${cat.label}' (${cat.issueType})? Tickets in this category keep their stored fields but lose the schema reference.`
    )) return;
    setSavingKey(cat.issueType);
    try {
      await adminApi.delete(
        `/support/categories/${encodeURIComponent(cat.issueType)}`,
        { params: { batchId: programId } }
      );
      showToast(`Category '${cat.label}' deleted.`);
      await load();
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Delete failed.', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading && !categories) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-mist/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }
  if (error || !categories) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error ?? 'Failed to load categories.'}{' '}
        <button type="button" onClick={() => { void load(); }} className="underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className={`px-4 py-2.5 rounded-lg text-xs font-medium border ${
            toast.type === 'error'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-accent/10 text-accent border-accent/30'
          }`}
        >
          {toast.msg}
        </motion.div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 bg-mist/30 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Per-program support categories</p>
            <p className="text-[11px] text-ink-soft mt-0.5">
              Each category defines a troubleshooting schema for a
              specific issue type. Override a global category here to
              customise this program's support flow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-ink-faint bg-mist border border-border/60 rounded-md px-2 py-0.5">
              {overrideCount} override{overrideCount === 1 ? '' : 's'} · {categories.length} total
            </span>
            {!creating && !editing && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="admin-btn-primary"
              >
                + New category
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {creating && (
            <CategoryForm
              key="new-form"
              initial={null}
              onCancel={() => setCreating(false)}
              onSave={(payload) => void handleSave(payload, false)}
              saving={savingKey !== null}
            />
          )}
          {editing && (
            <CategoryForm
              key={`edit-form-${editing.issueType}`}
              initial={editing}
              onCancel={() => setEditing(null)}
              onSave={(payload) => void handleSave(payload, true, editing.issueType)}
              saving={savingKey !== null}
            />
          )}
        </AnimatePresence>

        <div>
          {categories.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-soft text-center">
              No support categories yet. Click <span className="font-semibold">+ New category</span> to add one.
            </p>
          ) : (
            categories.map((cat) => (
              <CategoryRow
                key={cat.issueType}
                cat={cat}
                onEdit={() => { setEditing(cat); setCreating(false); }}
                onDelete={() => void handleDelete(cat)}
                saving={savingKey === cat.issueType}
              />
            ))
          )}
        </div>
      </div>

      <p className="text-[10px] text-ink-faint">
        Tip: programmatic API access is also available at
        <code className="ml-1 px-1 py-0.5 rounded bg-mist">
          GET /api/support/categories?batchId={programId}&includeOverrides=true
        </code>
        for read +{' '}
        <code className="px-1 py-0.5 rounded bg-mist">
          POST /api/support/categories
        </code>
        {' '}with <code className="px-1 py-0.5 rounded bg-mist">body.batchId</code> for write.
      </p>
    </div>
  );
}
