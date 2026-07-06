/**
 * v1.69 — Phase 9 admin UI: per-program app settings widget.
 *
 * Mounted in the AdminProgramDetail AppSettings tab. Lets the
 * admin view + edit the per-program Golden Ticket cooldown,
 * SP cost, and penalty multiplier. The values land in
 * `ProgramConfig.appSettings` (Phase 9 storage); the public
 * resolver (`getProgramAppSettings`) reads them on the next
 * read.
 *
 * Reads via GET /api/admin/programs/:id/settings.
 * Writes via PUT /api/admin/programs/:id/settings with body
 * { key, value } — the endpoint was added in Phase 9+.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import adminApi from '../../utils/adminApi';

interface ProgramAppSettings {
  goldenTicketCooldownHours: number;
  goldenTicketSpCost: number;
  penaltyMultiplier: number;
}

const SETTING_LABELS: Record<keyof ProgramAppSettings, string> = {
  goldenTicketCooldownHours: 'Golden Ticket cooldown (hours)',
  goldenTicketSpCost: 'Golden Ticket SP cost',
  penaltyMultiplier: 'Admin award penalty multiplier',
};

const SETTING_HINTS: Record<keyof ProgramAppSettings, string> = {
  goldenTicketCooldownHours: 'Minimum hours between a user submitting Golden Tickets in this program. Range: 0–720 (integer).',
  goldenTicketSpCost: 'SP cost a user pays when submitting a Golden Ticket. Range: 0+ (integer).',
  penaltyMultiplier: 'Multiplier on the points delta when an admin manually awards or deducts points. Range: 0–5.',
};

const SETTING_MIN: Record<keyof ProgramAppSettings, number> = {
  goldenTicketCooldownHours: 0,
  goldenTicketSpCost: 0,
  penaltyMultiplier: 0,
};
const SETTING_MAX: Record<keyof ProgramAppSettings, number> = {
  goldenTicketCooldownHours: 720,
  goldenTicketSpCost: 1_000_000,
  penaltyMultiplier: 5,
};
const SETTING_STEP: Record<keyof ProgramAppSettings, number> = {
  goldenTicketCooldownHours: 1,
  goldenTicketSpCost: 1,
  penaltyMultiplier: 0.1,
};

function SettingRow<K extends keyof ProgramAppSettings>({
  settingKey,
  value,
  savedValue,
  onChange,
  onSave,
  saving,
}: {
  settingKey: K;
  value: number;
  savedValue: number;
  onChange: (next: number) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const dirty = value !== savedValue;
  const tooLow = value < SETTING_MIN[settingKey];
  const tooHigh = value > SETTING_MAX[settingKey];
  const invalid = tooLow || tooHigh;

  return (
    <div className="px-4 py-3 border-b border-border/40 last:border-0">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-ink">{SETTING_LABELS[settingKey]}</p>
            {dirty && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
                Unsaved
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink-soft">{SETTING_HINTS[settingKey]}</p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty || invalid}
          className="text-[11px] font-medium text-accent hover:text-accent-hover disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded transition-colors shrink-0"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={SETTING_MIN[settingKey]}
          max={SETTING_MAX[settingKey]}
          step={SETTING_STEP[settingKey]}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          min={SETTING_MIN[settingKey]}
          max={SETTING_MAX[settingKey]}
          step={SETTING_STEP[settingKey]}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-24 px-2 py-1 rounded text-xs border bg-bg-secondary text-ink font-mono focus:outline-none admin-input"
        />
      </div>
      {invalid && (
        <p className="text-[10px] text-rose-700 mt-1">
          Value must be between {SETTING_MIN[settingKey]} and {SETTING_MAX[settingKey]}.
        </p>
      )}
    </div>
  );
}

export default function ProgramAppSettingsTab({ programId }: { programId: string }) {
  const [saved, setSaved] = useState<ProgramAppSettings | null>(null);
  const [draft, setDraft] = useState<ProgramAppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<keyof ProgramAppSettings | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get<{ settings: ProgramAppSettings; source: string }>(
        `/admin/programs/${programId}/settings`
      );
      const next = res.data.settings;
      setSaved(next);
      setDraft(next);
    } catch (err) {
      setError('Failed to load per-program app settings.');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  const update = (key: keyof ProgramAppSettings, value: number) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const save = async (key: keyof ProgramAppSettings) => {
    if (!draft) return;
    setSavingKey(key);
    try {
      await adminApi.put(`/admin/programs/${programId}/settings`, { key, value: draft[key] });
      // Refresh the saved snapshot so the 'Unsaved' badge
      // clears immediately.
      setSaved((s) => (s ? { ...s, [key]: draft[key] } : s));
      showToast(`${SETTING_LABELS[key]} updated for this program.`);
    } catch (err: any) {
      showToast(
        err.response?.data?.message ?? `Failed to update ${SETTING_LABELS[key]}.`,
        'error'
      );
    } finally {
      setSavingKey(null);
    }
  };

  const hasAnyOverride = useMemo(
    () => !!(saved && saved.goldenTicketCooldownHours != null),
    [saved]
  );

  if (loading && !draft) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-mist/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }
  if (error || !draft || !saved) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error ?? 'Failed to load settings.'}{' '}
        <button type="button" onClick={() => { void load(); }} className="underline">Retry</button>
      </div>
    );
  }

  const keys: Array<keyof ProgramAppSettings> = [
    'goldenTicketCooldownHours',
    'goldenTicketSpCost',
    'penaltyMultiplier',
  ];

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
            <p className="text-sm font-semibold text-ink">Per-program app settings</p>
            <p className="text-[11px] text-ink-soft mt-0.5">
              Golden Ticket cooldown + SP cost + admin-award penalty multiplier.
              Set per-program values here to override the global
              defaults. Each value can be saved independently.
            </p>
          </div>
          <span className={`text-[10px] font-medium uppercase tracking-wider rounded-md px-2 py-0.5 border ${
            hasAnyOverride
              ? 'text-accent bg-accent/10 border-accent/30'
              : 'text-ink-faint bg-mist border-border/60'
          }`}>
            {hasAnyOverride ? '✓ Per-program overrides active' : 'Falling back to global'}
          </span>
        </div>
        <div>
          <AnimatePresence>
            {keys.map((key) => (
              <SettingRow
                key={key}
                settingKey={key}
                value={draft[key]}
                savedValue={saved[key]}
                onChange={(v) => update(key, v)}
                onSave={() => void save(key)}
                saving={savingKey === key}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <p className="text-[10px] text-ink-faint">
        Tip: programmatic API access is also available at
        <code className="ml-1 px-1 py-0.5 rounded bg-mist">
          GET /api/admin/programs/{programId}/settings
        </code>
        {' '}and{' '}
        <code className="px-1 py-0.5 rounded bg-mist">
          PUT /api/admin/programs/{programId}/settings
        </code>
        {' '}body: <code className="px-1 py-0.5 rounded bg-mist">{'{ key, value }'}</code>.
        The public-facing <code>GET /api/public/settings?batchId=...</code>{' '}
        uses the same resolver — your per-program changes take
        effect on the next public read.
      </p>
    </div>
  );
}
