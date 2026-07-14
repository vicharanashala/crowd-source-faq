/**
 * v1.70 — Admin Dynamic Categories tab.
 *
 * Route: /admin/programs/:id/categories
 *
 * Per-program view of the auto-clustered FAQ categories. Admins
 * can:
 *   - rename a cluster's canonicalName
 *   - edit the alias list (comma-separated)
 *   - toggle the `locked` flag (locked clusters survive the
 *     24h refresh; unlocked clusters get re-clustered + re-named
 *     on the next tick)
 *   - delete a cluster (rejected if locked; unlock first)
 *   - force a recompute now (same path as the 24h cron)
 *
 * The page is intentionally a single-screen editor — the dataset
 * is small (typically 10-30 clusters per program) and the most
 * common edit is "lock this canonical name so the AI stops
 * renaming it", which is one click.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import adminApi from '../utils/adminApi';

interface ClusterRow {
  id: string;
  batchId: string;
  canonicalName: string;
  aliases: string[];
  faqCount: number;
  locked: boolean;
  editedByAdmin: boolean;
  lastRefreshedAt: string;
  updatedAt: string;
}

interface ClusterListResponse {
  clusters: ClusterRow[];
  total: number;
}

interface RecomputeResponse {
  ok: boolean;
  clusters: number;
  preservedLocks: number;
  skipped: string;
}

export default function AdminDynamicCategoriesPage(): React.ReactElement {
  const { id: batchId } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ClusterRow[]>([]);
  // Local edit buffer so the user can type without round-tripping
  // on every keystroke. Each row has its own buffer entry; the
  // save button commits.
  const [edits, setEdits] = useState<Record<string, { canonicalName: string; aliases: string; locked: boolean }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!batchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.get<ClusterListResponse>(
        `/admin/programs/${batchId}/category-clusters`
      );
      setRows(res.data.clusters);
      // Seed the edit buffer for any new rows. Existing
      // buffers are preserved so the user's in-flight edits
      // don't get clobbered by a background refresh.
      setEdits((prev) => {
        const next = { ...prev };
        for (const c of res.data.clusters) {
          if (!next[c.id]) {
            next[c.id] = {
              canonicalName: c.canonicalName,
              aliases: c.aliases.join(', '),
              locked: c.locked,
            };
          }
        }
        return next;
      });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Could not load clusters.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const updateEdit = (id: string, patch: Partial<{ canonicalName: string; aliases: string; locked: boolean }>): void => {
    setEdits((prev) => {
      const existing: { canonicalName: string; aliases: string; locked: boolean } = prev[id] ?? { canonicalName: '', aliases: '', locked: false };
      return { ...prev, [id]: { ...existing, ...patch } };
    });
  };

  const isDirty = (id: string): boolean => {
    const e = edits[id];
    const r = rows.find((x) => x.id === id);
    if (!e || !r) return false;
    return (
      e.canonicalName !== r.canonicalName ||
      e.aliases !== r.aliases.join(', ') ||
      e.locked !== r.locked
    );
  };

  const save = async (id: string): Promise<void> => {
    const e = edits[id];
    if (!e) return;
    setSavingId(id);
    setFeedback(null);
    try {
      const body: Record<string, unknown> = {};
      const r = rows.find((x) => x.id === id);
      if (r && e.canonicalName !== r.canonicalName) body.canonicalName = e.canonicalName;
      if (r && e.aliases !== r.aliases.join(', ')) {
        body.aliases = e.aliases.split(',').map((a) => a.trim()).filter(Boolean);
      }
      if (r && e.locked !== r.locked) body.locked = e.locked;
      if (Object.keys(body).length === 0) {
        setSavingId(null);
        return;
      }
      await adminApi.patch(
        `/admin/programs/${batchId}/category-clusters/${id}`,
        body
      );
      setFeedback({ kind: 'ok', msg: 'Saved.' });
      await refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Save failed.';
      setFeedback({ kind: 'err', msg });
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`Delete cluster "${name}"? This cannot be undone (locked clusters are rejected).`)) return;
    setFeedback(null);
    try {
      await adminApi.delete(`/admin/programs/${batchId}/category-clusters/${id}`);
      setFeedback({ kind: 'ok', msg: 'Deleted.' });
      await refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Delete failed.';
      setFeedback({ kind: 'err', msg });
    }
  };

  const recompute = async (): Promise<void> => {
    setRecomputing(true);
    setFeedback(null);
    try {
      const res = await adminApi.post<RecomputeResponse>(
        `/admin/programs/${batchId}/category-clusters/recompute`
      );
      const { clusters, preservedLocks, skipped } = res.data;
      setFeedback({
        kind: skipped === 'ok' ? 'ok' : 'err',
        msg: skipped === 'ok'
          ? `Refreshed. ${clusters} cluster(s) inserted, ${preservedLocks} locked cluster(s) preserved.`
          : `Refresh skipped: ${skipped}`,
      });
      await refresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Recompute failed.';
      setFeedback({ kind: 'err', msg });
    } finally {
      setRecomputing(false);
    }
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const locked = rows.filter((r) => r.locked).length;
    const editedByAdmin = rows.filter((r) => r.editedByAdmin).length;
    return { total, locked, editedByAdmin };
  }, [rows]);

  if (!batchId) {
    return <div className="p-8 text-sm text-red-600">No program id in URL.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif text-ink">Dynamic Categories</h1>
          <p className="text-sm text-ink-soft mt-1">
            Per-program clusters of FAQ category strings. Recomputed every 24h from the
            live FAQ embeddings; rename, lock, or delete below to override the AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/admin/programs/${batchId}`}
            className="text-xs px-3 py-2 rounded-full border border-border/60 text-ink-soft hover:bg-cream"
          >
            ← Back to program
          </Link>
          <button
            type="button"
            onClick={() => void recompute()}
            disabled={recomputing || loading}
            className="text-xs px-3 py-2 rounded-full bg-accent text-accent-text font-semibold disabled:opacity-50 hover:-translate-y-0.5 transition-all"
          >
            {recomputing ? 'Recomputing…' : 'Recompute now'}
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Total clusters" value={stats.total} />
        <StatCard label="Locked (admin-curated)" value={stats.locked} />
        <StatCard label="Edited by admin" value={stats.editedByAdmin} />
      </div>

      {feedback && (
        <div
          className={`text-xs px-3 py-2 rounded-lg mb-3 ${
            feedback.kind === 'ok'
              ? 'bg-accent/10 text-accent border border-accent/20'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {error && (
        <div className="text-xs px-3 py-2 rounded-lg mb-3 bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-ink-soft py-8 text-center">Loading clusters…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-ink-soft py-8 text-center border border-dashed border-border rounded-lg">
          No clusters yet for this program. Click <strong>Recompute now</strong> to seed.
        </div>
      ) : (
        <div className="border border-border/60 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-ink-faint">Canonical name</th>
                <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-ink-faint">Aliases</th>
                <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-ink-faint text-right">FAQs</th>
                <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-ink-faint text-center">Lock</th>
                <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-ink-faint">Refreshed</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const e = edits[r.id] ?? { canonicalName: r.canonicalName, aliases: r.aliases.join(', '), locked: r.locked };
                const dirty = isDirty(r.id);
                return (
                  <tr key={r.id} className={`border-t border-border/40 ${dirty ? 'bg-accent/5' : ''}`}>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="text"
                        value={e.canonicalName}
                        onChange={(ev) => updateEdit(r.id, { canonicalName: ev.target.value })}
                        className="w-full text-sm bg-transparent border-b border-border/40 focus:border-accent focus:outline-none py-1"
                        maxLength={120}
                      />
                      {r.editedByAdmin && (
                        <span className="text-[10px] uppercase tracking-wide text-accent font-semibold">edited</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="text"
                        value={e.aliases}
                        onChange={(ev) => updateEdit(r.id, { aliases: ev.target.value })}
                        className="w-full text-xs bg-transparent border-b border-border/40 focus:border-accent focus:outline-none py-1"
                        placeholder="comma-separated"
                      />
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums text-ink-soft">{r.faqCount}</td>
                    <td className="px-3 py-2 text-center align-top">
                      <input
                        type="checkbox"
                        checked={e.locked}
                        onChange={(ev) => updateEdit(r.id, { locked: ev.target.checked })}
                        className="accent-accent h-4 w-4"
                        title={e.locked ? 'Locked — survives the 24h refresh' : 'Unlocked — will be re-clustered on next refresh'}
                      />
                    </td>
                    <td className="px-3 py-2 text-[11px] text-ink-faint align-top">
                      {new Date(r.lastRefreshedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void save(r.id)}
                        disabled={!dirty || savingId === r.id}
                        className="text-[11px] px-2 py-1 rounded-full bg-accent text-accent-text font-semibold disabled:opacity-40 disabled:cursor-not-allowed mr-1"
                      >
                        {savingId === r.id ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(r.id, r.canonicalName)}
                        className="text-[11px] px-2 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-ink-faint mt-4">
        Locked rows survive the 24h refresh. Edits set <code>editedByAdmin=true</code> so the
        admin's canonical name is preserved even if the cluster is unlocked and the aliases
        are re-clustered.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="border border-border/60 rounded-lg p-3 bg-card/40">
      <div className="text-2xl font-serif text-ink tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-ink-faint mt-1">{label}</div>
    </div>
  );
}
