/**
 * v1.69 — Admin: per-internship course CRUD.
 *
 * Lets an admin create / edit / archive / hard-delete courses
 * within a single Batch. The form lives inline; same pattern as
 * `AdminBatches`. Each course auto-derives a slug from its name
 * (server side) and gets backfilled into `FAQ.courseId` when
 * archived FAQs are reassigned.
 *
 * Mirrors the public `/courses` endpoint shape so the same
 * `Course` type flows both ways.
 */

import React, { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import adminApi from '../utils/adminApi';
import { useBatch } from '../../context/BatchContext';
import type { Course } from '../../types/course';

interface AdminBatchLite {
  _id: string;
  name: string;
}

interface ToastState { msg: string; type: 'success' | 'error' | 'info'; }
function Toast({ toast }: { toast: ToastState }) {
  const colour =
    toast.type === 'error'   ? 'admin-toast-error'   :
    toast.type === 'info'    ? 'admin-toast-info'    :
                               'admin-toast-success' ;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-xs font-medium border ${colour}`}
    >
      {toast.msg}
    </motion.div>
  );
}

const EMPTY_FORM = {
  batchId: '',
  name: '',
  description: '',
  order: 0,
  icon: '',
};

export default function AdminCoursesPage(): React.ReactElement {
  const { currentBatch } = useBatch();
  const [batches, setBatches] = useState<AdminBatchLite[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filter, setFilter] = useState<string>(''); // batchId filter; '' = all
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formOpen, setFormOpen] = useState(false);

  const showToast = (msg: string, type: ToastState['type'] = 'success'): void => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = async (): Promise<void> => {
    try {
      const [bRes, cRes] = await Promise.all([
        adminApi.get<{ batches: AdminBatchLite[] }>('/batches/admin/all'),
        adminApi.get<{ courses: Course[] }>('/courses/admin/all'),
      ]);
      setBatches(bRes.data.batches ?? []);
      setCourses(cRes.data.courses ?? []);
    } catch {
      showToast('Failed to load courses.', 'error');
    }
  };

  useEffect(() => { void load(); }, []);

  // Default the form to the active batch (if any) when the user
  // first opens the create form.
  useEffect(() => {
    if (formOpen && !form.batchId && currentBatch?._id) {
      setForm((f) => ({ ...f, batchId: currentBatch._id }));
    }
  }, [formOpen, currentBatch?._id, form.batchId]);

  const filtered = useMemo(() => {
    if (!filter) return courses;
    return courses.filter((c) => c.batchId === filter);
  }, [courses, filter]);

  const startCreate = (): void => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, batchId: currentBatch?._id ?? '' });
    setFormOpen(true);
  };

  const startEdit = (c: Course): void => {
    setEditing(c);
    setForm({
      batchId: c.batchId,
      name: c.name,
      description: c.description ?? '',
      order: c.order,
      icon: c.icon ?? '',
    });
    setFormOpen(true);
  };

  const cancel = (): void => {
    setFormOpen(false);
    setEditing(null);
    setForm({ ...EMPTY_FORM });
  };

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!form.batchId) { showToast('Pick a program first.', 'error'); return; }
    if (!form.name.trim()) { showToast('Name is required.', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        batchId: form.batchId,
        name: form.name.trim(),
        description: form.description.trim(),
        order: form.order,
        icon: form.icon.trim() || null,
      };
      if (editing) {
        await adminApi.patch(`/courses/${editing._id}`, payload);
        showToast('Course updated.');
      } else {
        await adminApi.post('/courses', payload);
        showToast('Course created.');
      }
      await load();
      cancel();
    } catch (err) {
      showToast('Save failed. Check the form values.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (c: Course): Promise<void> => {
    if (!window.confirm(`Archive "${c.name}"? It will be hidden from the public but its data is kept.`)) return;
    try {
      await adminApi.post(`/courses/${c._id}/archive`);
      showToast('Course archived.');
      await load();
    } catch { showToast('Archive failed.', 'error'); }
  };
  const reactivate = async (c: Course): Promise<void> => {
    try {
      await adminApi.patch(`/courses/${c._id}`, { isActive: true });
      showToast('Course reactivated.');
      await load();
    } catch { showToast('Reactivate failed.', 'error'); }
  };
  const destroy = async (c: Course): Promise<void> => {
    if (c.faqCount > 0) {
      if (!window.confirm(
        `Delete "${c.name}"? ${c.faqCount} FAQ${c.faqCount === 1 ? '' : 's'} will be unassigned from this course (their courseId set to null). This cannot be undone.`
      )) return;
    } else if (!window.confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      const res = await adminApi.delete<{ deleted: boolean; cascadedFaqs: number }>(`/courses/${c._id}`);
      showToast(`Course deleted. ${res.data.cascadedFaqs} FAQ(s) unassigned.`);
      await load();
    } catch { showToast('Delete failed.', 'error'); }
  };

  return (
    <div className="space-y-5">
      <AnimatePresence>{toast && <Toast key="toast" toast={toast} />}</AnimatePresence>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-ink-faint -mt-2">Courses — selectable training units within an internship (e.g. "Web Foundations", "AI/ML Foundations").</p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={startCreate}
            className="admin-btn-primary"
          >
            + Create course
          </button>
        )}
      </div>

      {/* Batch filter — pick which internship's courses to show. */}
      {!formOpen && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-ink-faint">Program:</span>
          <button
            type="button"
            onClick={() => setFilter('')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${!filter ? 'bg-accent text-accent-text' : 'bg-mist text-ink-soft hover:bg-cream'}`}
          >
            All
          </button>
          {batches.map((b) => (
            <button
              key={b._id}
              type="button"
              onClick={() => setFilter(b._id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${filter === b._id ? 'bg-accent text-accent-text' : 'bg-mist text-ink-soft hover:bg-cream'}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Inline form */}
      {formOpen && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={save}
          className="admin-form space-y-3 p-4 rounded-2xl border border-border/60 bg-card/60"
        >
          <h3 className="text-sm font-semibold text-ink mb-2">{editing ? 'Edit course' : 'New course'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Program</label>
              <select
                value={form.batchId}
                onChange={(e) => setForm({ ...form, batchId: e.target.value })}
                className="admin-select w-full"
                required
                disabled={!!editing}
              >
                <option value="">— select a program —</option>
                {batches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Web Development Foundations"
                className="admin-input w-full"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="admin-input w-full resize-none"
                placeholder="What this course covers, who it's for, prerequisites."
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Order</label>
              <input
                type="number"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })}
                className="admin-input w-full"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">Icon <span className="text-ink-faint">(emoji or short text)</span></label>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                maxLength={16}
                placeholder="📚"
                className="admin-input w-full"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={cancel} className="admin-btn-ghost">Cancel</button>
            <button type="submit" disabled={saving} className="admin-btn-primary">
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create course'}
            </button>
          </div>
        </motion.form>
      )}

      {/* Course list */}
      {!formOpen && (
        filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-ink-soft">
            {filter
              ? `No courses in this program yet.`
              : `No courses yet. Click "+ Create course" to add one.`}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => {
              const batch = batches.find((b) => b._id === c.batchId);
              return (
                <div
                  key={c._id}
                  className={`rounded-2xl border bg-card p-4 ${c.isActive ? 'border-border/60' : 'border-dashed border-border/40 opacity-60'}`}
                >
                  <div className="flex items-start gap-3">
                    {c.icon && <span className="text-2xl shrink-0" aria-hidden="true">{c.icon}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-ink truncate">{c.name}</h3>
                        {!c.isActive && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-ink-faint">archived</span>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-faint mb-2">
                        {batch?.name ?? 'Unknown program'} · {c.faqCount} {c.faqCount === 1 ? 'FAQ' : 'FAQs'}
                      </p>
                      {c.description && (
                        <p className="text-xs text-ink-soft line-clamp-2 mb-3">{c.description}</p>
                      )}
                      <div className="flex items-center gap-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="px-2 py-0.5 rounded text-ink-soft hover:text-ink hover:bg-cream"
                        >
                          Edit
                        </button>
                        {c.isActive ? (
                          <button
                            type="button"
                            onClick={() => archive(c)}
                            className="px-2 py-0.5 rounded text-ink-soft hover:text-ink hover:bg-cream"
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => reactivate(c)}
                            className="px-2 py-0.5 rounded text-admin-green hover:bg-admin-green/10"
                          >
                            Reactivate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => destroy(c)}
                          className="px-2 py-0.5 rounded text-admin-red/80 hover:text-admin-red hover:bg-admin-red/10 ml-auto"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
