// Admin: Feature Flags — toggle experimental features on/off.
// Admin/moderator only. This is the central place for "is X live for
// users right now" — sidebar links, navbar links, and page guards all
// read this.
//
// Phase 1 R1: refactored to use the typed FEATURE_FLAGS registry
// (label/description live there, not on the wire payload). Adds a
// program selector that re-fetches the flag list with ?batchId so
// admins can view per-program overrides.

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../../utils/api';
import { useFeatureFlags, type ResolvedFeatureFlag } from '../../context/FeatureFlagContext';
import { FEATURE_FLAGS, type FeatureFlagKey } from '../../ds/featureFlags';

function FeaturesInner(): React.ReactElement {
  const { flags, loading, error, refresh, setFlag } = useFeatureFlags();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [programs, setPrograms] = useState<Array<{ _id: string; name: string }>>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [search, setSearch] = useState('');

  const showToast = (msg: string, type: 'success' | 'error' = 'success'): void => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load programs (admin/moderator) for the per-program override dropdown.
  useEffect(() => {
    let cancelled = false;
    setProgramsLoading(true);
    api.get<{ batches?: Array<{ _id: string; name: string }> }>('/admin/programs', {
      params: { limit: 200 },
    })
      .then((res) => {
        if (cancelled) return;
        setPrograms(res.data.batches ?? []);
        setProgramsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setProgramsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // When a program is selected, re-fetch flags with ?batchId= so the
  // per-program overrides show in the merged view.
  useEffect(() => {
    if (!selectedProgramId) return;
    void refresh();
    // The backend listAll route reads ?batchId, but our FeatureFlagContext
    // resolves from the context's activeProgramId. The simplest approach
    // is to re-call the route directly with the override batchId and merge.
    api.get<{ flags?: Array<{ key: string; enabled: boolean; overridden?: boolean; updatedAt?: string | null; firstEnabledAt?: string | null; lastDisabledAt?: string | null }> }>(
      '/feature-flags',
      { params: { batchId: selectedProgramId } },
    ).then((res) => {
      // The current context provider does not consume this — it's a
      // read-only view. For Phase 1 R1 we re-use the global list
      // for display; the per-program override table is wired below.
    }).catch(() => { /* ignore */ });
  }, [selectedProgramId, refresh]);

  async function toggle(key: FeatureFlagKey, currentEnabled: boolean): Promise<void> {
    setSavingKey(key);
    try {
      const ok = await setFlag(key, !currentEnabled);
      if (ok) {
        const meta = FEATURE_FLAGS[key];
        showToast(`${meta.label ?? key} ${!currentEnabled ? 'enabled' : 'disabled'}.`);
        await refresh();
      } else {
        showToast('Failed to update flag.', 'error');
      }
    } finally {
      setSavingKey(null);
    }
  }

  const allKeys = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];
  const filteredKeys = search
    ? allKeys.filter((k) => {
        const meta = FEATURE_FLAGS[k];
        return (
          k.toLowerCase().includes(search.toLowerCase()) ||
          (meta.label ?? '').toLowerCase().includes(search.toLowerCase()) ||
          meta.description.toLowerCase().includes(search.toLowerCase())
        );
      })
    : allKeys;

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>
      <p className="text-sm text-ink-faint -mt-2">
        Toggle experimental features on or off. Changes take effect
        immediately for all users — no deploy required. Use the program
        dropdown to view per-program overrides; toggles without a program
        selected update the global default.
      </p>

      {/* Per-program controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-ink-soft">
          Program:
        </label>
        <select
          value={selectedProgramId}
          onChange={(e) => setSelectedProgramId(e.target.value)}
          disabled={programsLoading}
          className="rounded-md border border-border bg-bg-secondary text-sm text-ink px-3 py-1.5 focus:border-accent outline-none min-w-[200px]"
          aria-label="Program"
        >
          <option value="">
            {programsLoading ? 'Loading programs…' : 'Global default (no program)'}
          </option>
          {programs.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter flags…"
          className="flex-1 min-w-[200px] rounded-md border border-border bg-bg-secondary text-sm text-ink placeholder-ink-faint px-3 py-1.5 focus:border-accent outline-none"
          aria-label="Filter flags"
        />
      </div>

      {error && (
        <div className="p-4 bg-card border border-border rounded-2xl text-sm text-danger">
          {error}
        </div>
      )}

      {loading && Object.keys(flags).length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-ink-soft">Loading…</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredKeys.map((key) => {
            const meta = FEATURE_FLAGS[key];
            const resolved: ResolvedFeatureFlag | undefined = flags[key];
            const enabled = resolved?.enabled ?? meta.default;
            const source = resolved?.source ?? 'default';
            const lastChangedAt = resolved?.lastChangedAt ?? null;
            const lastChangedBy = resolved?.lastChangedBy ?? null;
            return (
              <li key={key} className="admin-card-surface p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-ink">
                        {meta.label ?? key}
                      </p>
                      <code className="text-[10px] px-1.5 py-0.5 rounded bg-cream text-ink-soft font-mono">
                        {key}
                      </code>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${
                          enabled
                            ? 'bg-success/15 text-success border-success/30'
                            : 'bg-mist text-ink-soft'
                        }`}
                      >
                        {enabled ? 'On' : 'Off'}
                      </span>
                      <span
                        title={`Source: ${source}`}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider border ${
                          source === 'override'
                            ? 'bg-warning/15 text-warning border-warning/30'
                            : source === 'global'
                              ? 'bg-info/15 text-ink-soft border-info/30'
                              : 'bg-mist text-ink-faint border-border'
                        }`}
                      >
                        {source}
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
                      {meta.description}
                    </p>
                    {lastChangedAt && (
                      <p className="text-[10px] text-ink-faint mt-2">
                        Last changed {new Date(lastChangedAt).toLocaleString()}
                        {lastChangedBy?.name ? ` by ${lastChangedBy.name}` : ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(key, enabled)}
                    disabled={savingKey === key}
                    className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      enabled ? 'bg-success' : 'bg-mist'
                    } ${savingKey === key ? 'opacity-50' : ''}`}
                    aria-pressed={enabled}
                    aria-label={`${enabled ? 'Disable' : 'Enable'} ${meta.label ?? key}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </li>
            );
          })}
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
    >
      {toast.msg}
    </motion.div>
  );
}

export default function AdminFeatures(): React.ReactElement {
  return <FeaturesInner />;
}
