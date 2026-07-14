/**
 * v1.69 — Phase 8 admin UI: per-program feature flag toggle.
 *
 * Interactive widget for the AdminProgramDetail "Features" tab.
 * Lists every known feature flag with its resolved value for
 * this program (per-program override → global default fallback)
 * and a toggle. Flipping the toggle calls
 * PUT /api/admin/programs/:id/feature-flags/:key (or
 * DELETE to clear the override and fall back to global).
 *
 * A "Custom" badge surfaces when the value comes from the
 * per-program override rather than the global default.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import adminApi from '../../utils/adminApi';

interface FlagRow {
  key: string;
  enabled: boolean;
  overridden: boolean;
  updatedAt: string | null;
  source: 'program' | 'env';
}

const FLAG_DESCRIPTIONS: Record<string, string> = {
  goldenTicket: 'Allow users to submit a Golden Ticket support request that fast-tracks admin attention.',
  faqAutosuggest: 'Show AI-suggested FAQs when a user opens a community thread.',
  teaDrops: 'Send "tea drop" notifications for community activity (Phase 3+).',
  discordBot: 'Start the per-program Discord bot (Phase 6).',
  mentorReassignment: 'Let admins reassign mentor pairings mid-program.',
};

const FLAG_LABELS: Record<string, string> = {
  goldenTicket: 'Golden Tickets',
  faqAutosuggest: 'AI FAQ Autosuggest',
  teaDrops: 'Tea Drop Notifications',
  discordBot: 'Per-Program Discord Bot',
  mentorReassignment: 'Mentor Reassignment',
};

function FeatureFlagRow({
  row,
  onToggle,
  saving,
}: {
  row: FlagRow;
  onToggle: (next: boolean) => void;
  saving: boolean;
}) {
  const label = FLAG_LABELS[row.key] ?? row.key;
  const desc = FLAG_DESCRIPTIONS[row.key] ?? '';
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border/40 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-ink">{label}</p>
          {row.overridden && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-accent bg-accent/10 border border-accent/30 rounded-md px-1.5 py-0.5">
              Custom
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-soft">{desc}</p>
        <p className="text-[10px] text-ink-faint mt-1">
          Currently: <span className={row.enabled ? 'text-emerald-700 font-semibold' : 'text-ink-soft font-semibold'}>
            {row.enabled ? 'Enabled' : 'Disabled'}
          </span>
          {' · '}
          Source: {row.source === 'program' ? 'per-program override' : 'global default'}
          {row.updatedAt && ` · updated ${new Date(row.updatedAt).toLocaleDateString()}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onToggle(!row.enabled)}
        disabled={saving}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/30 shrink-0 mt-0.5 ${
          row.enabled ? 'bg-accent' : 'bg-border-medium'
        } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-label={`Toggle ${label}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full shadow-sm transition-transform duration-200 ${
            row.enabled ? 'bg-accent-text translate-x-[18px]' : 'bg-ink-soft translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export default function ProgramFeatureFlagsTab({ programId }: { programId: string }) {
  const [flags, setFlags] = useState<FlagRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      const res = await adminApi.get<{ flags: FlagRow[] }>(`/admin/programs/${programId}/feature-flags`);
      setFlags(res.data.flags ?? []);
    } catch (err) {
      setError('Failed to load per-program feature flags.');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  const overriddenCount = useMemo(
    () => (flags ?? []).filter((f) => f.overridden).length,
    [flags]
  );

  const handleToggle = async (key: string, next: boolean) => {
    setSavingKey(key);
    try {
      if (next) {
        // Setting a non-default value to enabled.
        await adminApi.put(`/admin/programs/${programId}/feature-flags/${key}`, { enabled: next });
        showToast(`${FLAG_LABELS[key] ?? key} enabled for this program.`);
      } else {
        // If we're going FROM the global default to disabled, we
        // need a per-program override (false). If we're going FROM
        // an existing per-program override (true) to disabled, we
        // can either (a) set the per-program override to false or
        // (b) delete the override to fall back to global. We pick
        // (a) so the admin's intent ("disabled in this program")
        // is preserved.
        await adminApi.put(`/admin/programs/${programId}/feature-flags/${key}`, { enabled: next });
        showToast(`${FLAG_LABELS[key] ?? key} disabled for this program.`);
      }
      await load();
    } catch (err) {
      showToast(`Failed to update ${FLAG_LABELS[key] ?? key}.`, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const handleClearOverride = async (key: string) => {
    setSavingKey(key);
    try {
      await adminApi.delete(`/admin/programs/${programId}/feature-flags/${key}`);
      showToast(`${FLAG_LABELS[key] ?? key} override removed — back to global default.`);
      await load();
    } catch (err) {
      showToast(`Failed to clear override on ${FLAG_LABELS[key] ?? key}.`, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading && !flags) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-mist/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }
  if (error || !flags) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error ?? 'Failed to load feature flags.'}{' '}
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
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
        >
          {toast.msg}
        </motion.div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 bg-mist/30 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Per-program feature flags</p>
            <p className="text-[11px] text-ink-soft mt-0.5">
              Each flag resolves per-program → global default. Override a flag
              here to change this program's behaviour without affecting
              other programs.
            </p>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-faint bg-mist border border-border/60 rounded-md px-2 py-0.5">
            {overriddenCount} override{overriddenCount === 1 ? '' : 's'}
          </span>
        </div>
        <div>
          {flags.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-soft text-center">
              No feature flags defined yet.
            </p>
          ) : (
            flags.map((row) => (
              <FeatureFlagRow
                key={row.key}
                row={row}
                saving={savingKey === row.key}
                onToggle={(next) => void handleToggle(row.key, next)}
              />
            ))
          )}
        </div>
      </div>

      {overriddenCount > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">
            Clear per-program overrides
          </p>
          <p className="text-[11px] text-ink-soft mb-3">
            Remove the per-program override for a flag so the program falls
            back to the global default.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {flags.filter((f) => f.overridden).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => void handleClearOverride(f.key)}
                disabled={savingKey === f.key}
                className="text-[10px] font-medium uppercase tracking-wider text-ink-soft bg-mist border border-border/60 rounded-md px-2 py-1 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:opacity-40 transition-colors"
              >
                Clear {FLAG_LABELS[f.key] ?? f.key} override
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-ink-faint">
        Tip: programmatic API access is also available at
        <code className="ml-1 px-1 py-0.5 rounded bg-mist">
          GET /api/admin/programs/{programId}/feature-flags
        </code>
        for read +{' '}
        <code className="px-1 py-0.5 rounded bg-mist">
          PUT /api/admin/programs/{programId}/feature-flags/&lt;key&gt;
        </code>
        {' '}for write.
      </p>
    </div>
  );
}
