// Admin: Feature Flags — toggle experimental features on/off.
// Admin/moderator only. This is the central place for "is X live for
// users right now" — sidebar links, navbar links, and page guards all
// read this.

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFeatureFlags, type FeatureFlag } from '../../context/FeatureFlagContext';

function FeaturesInner(): React.ReactElement {
  const { flags, loading, error, refresh, setFlag } = useFeatureFlags();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success'): void => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  async function toggle(f: FeatureFlag): Promise<void> {
    setSavingKey(f.key);
    try {
      const ok = await setFlag(f.key, !f.enabled);
      if (ok) {
        showToast(`${f.label} ${!f.enabled ? 'enabled' : 'disabled'}.`);
        await refresh();
      } else {
        showToast('Failed to update flag.', 'error');
      }
    } finally {
      setSavingKey(null);
    }
  }

  const flagList = Object.values(flags);

  return (
    <div className="space-y-4">
      <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>
      <p className="text-sm text-ink-faint -mt-2">
        Toggle experimental features on or off. Changes take effect immediately
        for all users — no deploy required. Use this to A/B test or roll back
        a feature that isn't earning its keep.
      </p>

      {loading && flagList.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-ink-soft">Loading…</p>
        </div>
      ) : error && flagList.length === 0 ? (
        <div className="p-4 bg-card border border-border rounded-2xl text-sm text-danger">{error}</div>
      ) : (
        <ul className="space-y-3">
          {flagList.map((f) => (
            <li key={f.key} className="admin-card-surface p-5">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-ink">{f.label}</p>
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-cream text-ink-soft font-mono">
                      {f.key}
                    </code>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${
                      f.enabled
                        ? 'bg-success/15 text-success border-success/30'
                        : 'bg-mist text-ink-soft'
                    }`}>
                      {f.enabled ? 'On' : 'Off'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
                    {f.description}
                  </p>
                  {f.firstEnabledAt && (
                    <p className="text-[10px] text-ink-faint mt-2">
                      First enabled {new Date(f.firstEnabledAt).toLocaleString()}
                      {f.lastDisabledAt && (
                        <> · last disabled {new Date(f.lastDisabledAt).toLocaleString()}</>
                      )}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggle(f)}
                  disabled={savingKey === f.key}
                  className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    f.enabled ? 'bg-success' : 'bg-mist'
                  } ${savingKey === f.key ? 'opacity-50' : ''}`}
                  aria-pressed={f.enabled}
                  aria-label={`${f.enabled ? 'Disable' : 'Enable'} ${f.label}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      f.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
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

export default function AdminFeatures(): React.ReactElement {
  return <FeaturesInner />;
}
