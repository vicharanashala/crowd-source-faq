// Admin guidance editor — manage the troubleshooting checklist for
// each issue type. Admin/moderator only.

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listGuidance, updateGuidance } from '../../components/support/api';
import { getIssueIcon } from '../../components/support/icons';
import type { SupportGuidance, SupportIssueType } from '../../components/support/types';
import Spinner from '../../components/ui/Spinner';
import { friendlyError } from '../../utils/api';
import { SUPPORT_ISSUE_OPTIONS } from '../../components/support/api';



function GuidanceInner(): React.ReactElement {
  const [list, setList] = useState<SupportGuidance[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success'): void => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await listGuidance();
      setList(res);
    } catch (err) {
      showToast(friendlyError(err, 'Failed to load guidance.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  function startEdit(g: SupportGuidance): void {
    setEditing(g.issueType);
    setDraft([...g.steps]);
  }

  async function save(): Promise<void> {
    if (!editing) return;
    setSaving(true);
    try {
      await updateGuidance(editing, draft.map((s) => s.trim()).filter(Boolean));
      showToast('Guidance updated.');
      setEditing(null);
      setDraft([]);
      await load();
    } catch (err) {
      showToast(friendlyError(err, 'Failed to save.'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>

      <p className="text-sm text-ink-faint -mt-2">
        Edit the troubleshooting checklist shown to students before they submit a
        session support request. Defaults are seeded automatically.
      </p>

      {loading || !list ? (
        <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <ul className="space-y-3">
          {list.map((g) => (
            <li key={g.issueType} className="admin-card-surface p-5">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-9 h-9 rounded-xl bg-cream text-accent flex items-center justify-center">
                  {getIssueIcon(g.issueType)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{g.label}</p>
                  <p className="text-[11px] text-ink-faint">{g.issueType} · {g.steps.length} {g.steps.length === 1 ? 'step' : 'steps'}</p>

                  {editing === g.issueType ? (
                    <div className="mt-3 space-y-2">
                      {draft.map((step, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[11px] text-ink-faint tabular-nums w-5">{i + 1}.</span>
                          <input
                            value={step}
                            onChange={(e) => setDraft((d) => d.map((s, idx) => idx === i ? e.target.value : s))}
                            className="admin-input flex-1"
                            placeholder={`Step ${i + 1}`}
                            maxLength={300}
                          />
                          <button
                            type="button"
                            onClick={() => setDraft((d) => d.filter((_, idx) => idx !== i))}
                            className="text-ink-faint hover:text-danger px-2"
                            title="Remove step"
                          >✕</button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setDraft((d) => [...d, ''])}
                        className="text-xs text-accent hover:underline"
                      >+ Add step</button>
                      <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                        <button
                          type="button"
                          onClick={save}
                          disabled={saving}
                          className="admin-btn-primary"
                        >{saving ? 'Saving…' : 'Save'}</button>
                        <button
                          type="button"
                          onClick={() => { setEditing(null); setDraft([]); }}
                          className="admin-btn-ghost"
                        >Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ol className="mt-2 space-y-1">
                        {g.steps.map((step, i) => (
                          <li key={i} className="text-sm text-ink-soft flex items-start gap-2">
                            <span className="text-ink-faint tabular-nums text-[11px] mt-0.5">{i + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                        {g.steps.length === 0 && <li className="text-xs text-ink-faint italic">No steps configured.</li>}
                      </ol>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => startEdit(g)}
                          className="text-xs text-accent hover:underline"
                        >Edit checklist</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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

export default function AdminSupportGuidance(): React.ReactElement {
  return <GuidanceInner />;
}
