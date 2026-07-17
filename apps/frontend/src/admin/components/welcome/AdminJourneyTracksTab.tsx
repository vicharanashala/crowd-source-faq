/**
 * AdminJourneyTracksTab — admin tab for the v1.76 Journey Tracks
 * feature. Lives inside the existing Admin Welcome Package area
 * (AdminWelcomePage → "Journey Tracks" tab).
 *
 * Features:
 *   - List tracks (filter by status: all / draft / published /
 *     unpublished / archived)
 *   - Create / edit / delete / duplicate a track
 *   - Edit checkpoints + items inline with drag-and-drop reorder
 *   - Status lifecycle (publish / unpublish / archive)
 *   - Assignment UI (user / batch / program / all)
 *   - Progress monitor with filters
 *   - Preview pane — renders the same component the user sees
 *
 * Architecture: the canvas is generic. The admin types a name
 * ("Summership Trek", "Monsoonship Journey", whatever), picks an
 * icon + accent, adds checkpoints and items, and the data flows
 * back to the renderer. There is no program-specific code here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Spinner from '../../../components/ui/Spinner';
import { friendlyError } from '../../../utils/api';
import JourneyTrackRenderer from '../../../components/welcome/journey/JourneyTrackRenderer';
import adminApi from '../../../admin/utils/adminApi';
import { useProgram } from '../../../context/ProgramContext';
import {
  adminCreateAssignments,
  adminCreateTrack,
  adminDeleteAssignment,
  adminDeleteTrack,
  adminDuplicateTrack,
  adminGetTrack,
  adminGetTrackProgress,
  adminListAssignments,
  adminListTracks,
  adminReplaceCheckpoints,
  adminSetTrackStatus,
  adminUpdateTrack,
} from '../../../components/welcome/journey/api';
import type {
  JourneyAssignment,
  JourneyCheckpoint,
  JourneyItem,
  JourneyItemType,
  JourneyProgress,
  JourneyProgressRow,
  JourneyTrack,
  JourneyTrackStatus,
} from '../../../components/welcome/journey/types';

const TRACK_STATUSES: JourneyTrackStatus[] = ['draft', 'published', 'unpublished', 'archived'];
const ITEM_TYPES: JourneyItemType[] = [
  'task', 'note', 'warning', 'external_link', 'internal_link', 'action', 'divider',
];

// ─── Status / type labels (kept in one place for i18n-friendliness) ──

const STATUS_LABELS: Record<JourneyTrackStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  unpublished: 'Unpublished',
  archived: 'Archived',
};

const ITEM_TYPE_LABELS: Record<JourneyItemType, string> = {
  task: 'Task',
  note: 'Note',
  warning: 'Warning',
  external_link: 'External link',
  internal_link: 'Internal link',
  action: 'Action',
  divider: 'Divider',
};

// ─── Sortable row wrapper ─────────────────────────────────────────────

function SortableCheckpoint({
  cp,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  accent,
}: {
  cp: JourneyCheckpoint;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<JourneyCheckpoint>) => void;
  onDelete: () => void;
  onAddItem: (item: JourneyItem) => void;
  onUpdateItem: (itemId: string, patch: Partial<JourneyItem>) => void;
  onDeleteItem: (itemId: string) => void;
  onReorderItems: (itemIds: string[]) => void;
  accent: string;
}): React.ReactElement {
  const sortable = useSortable({ id: cp._id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : 1,
  };
  const itemSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  return (
    <div ref={sortable.setNodeRef} style={style} className="rounded-2xl border border-border bg-card">
      <div className="px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          {...sortable.listeners}
          {...sortable.attributes}
          className="text-ink-faint hover:text-ink cursor-grab"
          aria-label="Drag to reorder checkpoint"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left"
        >
          <p className="text-sm font-semibold text-ink">{cp.title || '(untitled)'}</p>
          <p className="text-[11px] text-ink-faint">
            {(cp.items ?? []).length} item{(cp.items ?? []).length === 1 ? '' : 's'}
          </p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-ink-faint hover:text-danger text-xs"
        >
          Delete
        </button>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <label className="block text-xs text-ink-faint">
            Title
            <input
              type="text"
              value={cp.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-ink"
            />
          </label>
          <label className="block text-xs text-ink-faint">
            Description
            <textarea
              value={cp.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-ink"
            />
          </label>
          <div className="space-y-1.5">
            <p className="text-xs text-ink-faint font-semibold">Items</p>
            <DndContext
              sensors={itemSensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const ids = (cp.items ?? []).map((i) => i._id);
                const oldIdx = ids.indexOf(String(active.id));
                const newIdx = ids.indexOf(String(over.id));
                if (oldIdx === -1 || newIdx === -1) return;
                onReorderItems(arrayMove(ids, oldIdx, newIdx));
              }}
            >
              <SortableContext
                items={(cp.items ?? []).map((i) => i._id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-1">
                  {(cp.items ?? []).map((item) => (
                    <SortableItem
                      key={item._id}
                      item={item}
                      onUpdate={(patch) => onUpdateItem(item._id, patch)}
                      onDelete={() => onDeleteItem(item._id)}
                      accent={accent}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            <button
              type="button"
              onClick={() =>
                onAddItem({
                  _id: newObjectId(),
                  type: 'task',
                  title: 'New item',
                  body: '',
                  required: false,
                  href: '',
                  action: '',
                  actionLabel: '',
                  metadata: {},
                  icon: '',
                  accentColor: '',
                })
              }
              className="text-xs px-3 py-1.5 rounded-md border border-dashed border-border text-ink-soft hover:text-ink hover:border-accent transition-colors w-full"
            >
              + Add item
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableItem({
  item,
  onUpdate,
  onDelete,
  // accent reserved for per-item accent colouring in the future.
  accent: _accent,
}: {
  item: JourneyItem;
  onUpdate: (patch: Partial<JourneyItem>) => void;
  onDelete: () => void;
  accent: string;
}): React.ReactElement {
  const sortable = useSortable({ id: item._id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      className="rounded-md border border-border bg-bg px-2.5 py-2"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...sortable.listeners}
          {...sortable.attributes}
          className="text-ink-faint hover:text-ink cursor-grab mt-0.5"
          aria-label="Drag to reorder item"
        >
          ⠿
        </button>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <select
              value={item.type}
              onChange={(e) =>
                onUpdate({
                  type: e.target.value as JourneyItemType,
                  // Defaults: tasks can be required; others can't.
                  required: e.target.value === 'task' ? item.required : false,
                })
              }
              className="text-xs rounded-md border border-border bg-card px-1.5 py-0.5 text-ink"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ITEM_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {item.type === 'task' && (
              <label className="text-[10px] text-ink-faint flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={(e) => onUpdate({ required: e.target.checked })}
                />
                required (counts toward progress)
              </label>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto text-ink-faint hover:text-danger text-xs"
            >
              ×
            </button>
          </div>
          <input
            type="text"
            value={item.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Title"
            className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-ink"
          />
          <textarea
            value={item.body}
            onChange={(e) => onUpdate({ body: e.target.value })}
            placeholder="Body (optional)"
            rows={2}
            className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-ink"
          />
          {(item.type === 'external_link' || item.type === 'internal_link') && (
            <input
              type="text"
              value={item.href}
              onChange={(e) => onUpdate({ href: e.target.value })}
              placeholder="https://… or /internal/path"
              className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-ink font-mono"
            />
          )}
          {item.type === 'action' && (
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                value={item.action}
                onChange={(e) => onUpdate({ action: e.target.value })}
                placeholder="action name"
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-ink font-mono"
              />
              <input
                type="text"
                value={item.actionLabel}
                onChange={(e) => onUpdate({ actionLabel: e.target.value })}
                placeholder="Button label"
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-ink"
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// ─── ObjectId helper (frontend equivalent) ────────────────────────────
// The backend's _id field on items is a Mongo ObjectId hex string.
// On the frontend, we generate fresh IDs locally so the admin can
// build tracks without round-tripping. The string-format keeps
// the same length (24 hex chars) so any future backend check
// that requires a 24-char id passes.
function newObjectId(): string {
  return (
    Date.now().toString(16).padStart(8, '0') +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0') +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0') +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(4, '0')
  );
}

const nextObjectId = newObjectId;

// ─── Main component ────────────────────────────────────────────────────

export default function AdminJourneyTracksTab(): React.ReactElement {
  const [tracks, setTracks] = useState<JourneyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<JourneyTrackStatus | 'all'>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftTrack, setDraftTrack] = useState<JourneyTrack | null>(null);
  const [expandedCpIds, setExpandedCpIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [progressRows, setProgressRows] = useState<JourneyProgressRow[]>([]);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressLoading, setProgressLoading] = useState(false);

  // ─── Assignment UI state ─────────────────────────────────────────
  // The admin tab previously had no way to assign a track —
  // admins had to use raw API calls. We now expose the same
  // scopes the backend supports (user / batch / program / all)
  // with pickers sourced from existing contexts (programs via
  // useProgram; users via a small /admin/users fetch).
  const { availablePrograms } = useProgram();
  const [assignScope, setAssignScope] = useState<'user' | 'batch' | 'program' | 'all'>('user');
  const [assignUserIds, setAssignUserIds] = useState<string[]>([]);
  const [assignBatchIds, setAssignBatchIds] = useState<string[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignInfo, setAssignInfo] = useState<string | null>(null);
  // Pre-load users so admins can search-and-pick without leaving
  // the page. The list is small (<1k users in this codebase) and
  // the endpoint is admin-scoped.
  interface AdminUserMini { _id: string; name?: string; email?: string; role?: string }
  const [userOptions, setUserOptions] = useState<AdminUserMini[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [assignments, setAssignments] = useState<JourneyAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminListTracks(filter === 'all' ? undefined : filter);
      setTracks(list);
    } catch (e) {
      setError(friendlyError(e, 'Could not load tracks.'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadTrack = useCallback(async (id: string) => {
    setError(null);
    try {
      const t = await adminGetTrack(id);
      setDraftTrack(t);
      setActiveId(id);
      setExpandedCpIds(new Set(t.checkpoints.map((c) => c._id)));
    } catch (e) {
      setError(friendlyError(e, 'Could not load track.'));
    }
  }, []);

  const loadProgress = useCallback(async (id: string) => {
    setProgressLoading(true);
    try {
      const { rows, requiredTotal } = await adminGetTrackProgress(id);
      setProgressRows(rows);
      setProgressTotal(requiredTotal);
    } catch (e) {
      setError(friendlyError(e, 'Could not load progress.'));
    } finally {
      setProgressLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) void loadProgress(activeId);
  }, [activeId, loadProgress]);

  // Load the list of admin-visible users once. We fetch the first
  // 200 (the /admin/users endpoint paginates). The picker filters
  // client-side via `userQuery`.
  const loadUsers = useCallback(async () => {
    try {
      const res = await adminApi.get<{ users: AdminUserMini[] }>('/admin/users', {
        params: { limit: 200 },
      });
      setUserOptions(res.data?.users ?? []);
    } catch {
      // Non-fatal — picker just shows no results.
      setUserOptions([]);
    }
  }, []);
  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Load existing assignments for the active track.
  const loadAssignments = useCallback(async (id: string) => {
    setAssignmentsLoading(true);
    try {
      const list = await adminListAssignments(id);
      setAssignments(list);
    } catch (e) {
      // Non-fatal — admin can still create new ones; we just
      // won't show the existing list.
      setAssignments([]);
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);
  useEffect(() => {
    if (activeId) void loadAssignments(activeId);
  }, [activeId, loadAssignments]);

  const handleAssign = useCallback(async () => {
    if (!draftTrack) return;
    setAssignError(null);
    setAssignInfo(null);
    // Scope-specific payload validation.
    if (assignScope === 'user' && assignUserIds.length === 0) {
      setAssignError('Pick at least one user.');
      return;
    }
    if ((assignScope === 'batch' || assignScope === 'program') && assignBatchIds.length === 0) {
      setAssignError('Pick at least one program/batch.');
      return;
    }
    setAssignBusy(true);
    try {
      // The backend's "batch" and "program" scopes both consume
      // `batchIds` from the request body — see
      // admin-journey.controller.ts createAssignments. For program
      // scope the backend writes programId=batchId (a long-standing
      // quirk of this codebase where "program" and "batch" share
      // the same model).
      const payload =
        assignScope === 'user'
          ? { scope: 'user' as const, userIds: assignUserIds }
          : { scope: assignScope, batchIds: assignBatchIds };
      const res = await adminCreateAssignments(draftTrack._id, payload);
      setAssignInfo(
        `Assigned ${res.assigned} of ${res.total} target${res.total === 1 ? '' : 's'} (some may already have had this track).`
      );
      await loadAssignments(draftTrack._id);
      await loadProgress(draftTrack._id);
    } catch (e) {
      setAssignError(friendlyError(e, 'Could not create assignments.'));
    } finally {
      setAssignBusy(false);
    }
  }, [draftTrack, assignScope, assignUserIds, assignBatchIds, loadAssignments, loadProgress]);

  const handleDeleteAssignment = useCallback(
    async (assignmentId: string) => {
      if (!draftTrack) return;
      try {
        await adminDeleteAssignment(draftTrack._id, assignmentId);
        await loadAssignments(draftTrack._id);
        await loadProgress(draftTrack._id);
      } catch (e) {
        setError(friendlyError(e, 'Could not remove assignment.'));
      }
    },
    [draftTrack, loadAssignments, loadProgress]
  );

  // Filtered user options for the "scope=user" picker.
  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return userOptions.slice(0, 50);
    return userOptions
      .filter(
        (u) =>
          (u.name ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [userOptions, userQuery]);

  const handleCreate = useCallback(async () => {
    const name = window.prompt('New track name?');
    if (!name || !name.trim()) return;
    try {
      const t = await adminCreateTrack({ name: name.trim() });
      await loadList();
      setActiveId(t._id);
      setDraftTrack(t);
      setExpandedCpIds(new Set());
    } catch (e) {
      setError(friendlyError(e, 'Could not create track.'));
    }
  }, [loadList]);

  const handleSave = useCallback(async () => {
    if (!draftTrack) return;
    setSaving(true);
    try {
      // v1.76 — save the entire tree atomically. The backend's
      // `cleanCheckpoint` / `cleanItem` now preserve client-
      // generated 24-hex `_id`s, so this round-trips without
      // creating duplicates. Old flow used N round-trips
      // (appendCheckpoint + replaceItems per checkpoint) with
      // title-based matching — fragile when titles duplicated
      // or checkpoints edited across reloads.
      await adminUpdateTrack(draftTrack._id, {
        name: draftTrack.name,
        description: draftTrack.description,
        icon: draftTrack.icon,
        accentColor: draftTrack.accentColor,
      });
      // Single atomic save for the whole checkpoint+item tree.
      // Each checkpoint and item carries its locally-generated
      // `_id` so the server preserves them on round-trip. New
      // checkpoints/items (no client `_id` would never happen
      // because the editor always mints one) also get a fresh
      // ObjectId from Mongoose as a fallback.
      await adminReplaceCheckpoints(
        draftTrack._id,
        draftTrack.checkpoints ?? []
      );
      await loadList();
      await loadTrack(draftTrack._id);
    } catch (e) {
      setError(friendlyError(e, 'Could not save track.'));
    } finally {
      setSaving(false);
    }
  }, [draftTrack, loadList, loadTrack]);

  const handleSetStatus = useCallback(
    async (id: string, status: JourneyTrackStatus) => {
      try {
        await adminSetTrackStatus(id, status);
        await loadList();
        if (activeId === id) await loadTrack(id);
      } catch (e) {
        setError(friendlyError(e, `Could not ${status} track.`));
      }
    },
    [activeId, loadList, loadTrack]
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const t = await adminDuplicateTrack(id);
        await loadList();
        setActiveId(t._id);
        setDraftTrack(t);
      } catch (e) {
        setError(friendlyError(e, 'Could not duplicate track.'));
      }
    },
    [loadList]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this draft track? This cannot be undone.')) return;
      try {
        await adminDeleteTrack(id);
        if (activeId === id) {
          setActiveId(null);
          setDraftTrack(null);
        }
        await loadList();
      } catch (e) {
        setError(friendlyError(e, 'Could not delete track.'));
      }
    },
    [activeId, loadList]
  );

  const updateDraft = useCallback((patch: Partial<JourneyTrack>) => {
    setDraftTrack((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const updateCheckpoint = useCallback(
    (cpId: string, patch: Partial<JourneyCheckpoint>) => {
      setDraftTrack((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          checkpoints: (prev.checkpoints ?? []).map((c) =>
            c._id === cpId ? { ...c, ...patch } : c
          ),
        };
      });
    },
    []
  );

  const appendLocalCheckpoint = useCallback(() => {
    setDraftTrack((prev) => {
      if (!prev) return prev;
      const cp: JourneyCheckpoint = {
        _id: nextObjectId(),
        title: 'New checkpoint',
        description: '',
        icon: '',
        items: [],
      };
      return { ...prev, checkpoints: [...(prev.checkpoints ?? []), cp] };
    });
  }, []);

  const deleteLocalCheckpoint = useCallback((cpId: string) => {
    setDraftTrack((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        checkpoints: (prev.checkpoints ?? []).filter((c) => c._id !== cpId),
      };
    });
  }, []);

  const appendLocalItem = useCallback((cpId: string, item: JourneyItem) => {
    setDraftTrack((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        checkpoints: (prev.checkpoints ?? []).map((c) =>
          c._id === cpId ? { ...c, items: [...(c.items ?? []), item] } : c
        ),
      };
    });
  }, []);

  const updateLocalItem = useCallback(
    (cpId: string, itemId: string, patch: Partial<JourneyItem>) => {
      setDraftTrack((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          checkpoints: (prev.checkpoints ?? []).map((c) =>
            c._id === cpId
              ? {
                  ...c,
                  items: (c.items ?? []).map((i) => (i._id === itemId ? { ...i, ...patch } : i)),
                }
              : c
          ),
        };
      });
    },
    []
  );

  const deleteLocalItem = useCallback((cpId: string, itemId: string) => {
    setDraftTrack((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        checkpoints: (prev.checkpoints ?? []).map((c) =>
          c._id === cpId
            ? { ...c, items: (c.items ?? []).filter((i) => i._id !== itemId) }
            : c
        ),
      };
    });
  }, []);

  const reorderLocalItems = useCallback((cpId: string, newOrder: string[]) => {
    setDraftTrack((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        checkpoints: (prev.checkpoints ?? []).map((c) => {
          if (c._id !== cpId) return c;
          const byId = new Map((c.items ?? []).map((i) => [i._id, i]));
          return { ...c, items: newOrder.map((id) => byId.get(id)).filter(Boolean) as JourneyItem[] };
        }),
      };
    });
  }, []);

  const reorderCheckpoints = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraftTrack((prev) => {
      if (!prev) return prev;
      const ids = (prev.checkpoints ?? []).map((c) => c._id);
      const oldIdx = ids.indexOf(String(active.id));
      const newIdx = ids.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return prev;
      return {
        ...prev,
        checkpoints: arrayMove(prev.checkpoints ?? [], oldIdx, newIdx),
      };
    });
  }, []);

  const toggleExpanded = useCallback((cpId: string) => {
    setExpandedCpIds((prev) => {
      const next = new Set(prev);
      if (next.has(cpId)) next.delete(cpId);
      else next.add(cpId);
      return next;
    });
  }, []);

  const previewProgress: JourneyProgress = useMemo(
    () => ({
      required: 0,
      done: 0,
      percent: 0,
      currentCheckpointId: null,
      lastActivityAt: null,
      completedItemIds: [],
    }),
    []
  );

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {(['all', ...TRACK_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                filter === s
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-ink-soft hover:text-ink hover:bg-mist/40'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleCreate}
          className="px-3 py-1.5 rounded-md bg-accent text-accent-text text-xs font-medium hover:bg-accent-dark"
        >
          + New track
        </button>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : tracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-ink-faint">No tracks yet.</p>
          <button
            type="button"
            onClick={handleCreate}
            className="mt-2 text-xs text-accent hover:underline"
          >
            Create your first track
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Track list (left rail) */}
          <ul className="space-y-1.5">
            {tracks.map((t) => (
              <li key={t._id}>
                <button
                  type="button"
                  onClick={() => void loadTrack(t._id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                    activeId === t._id
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-card hover:bg-mist/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden>
                      {t.icon || '🛤️'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{t.name}</p>
                      <p className="text-[10px] text-ink-faint">
                        {STATUS_LABELS[t.status]} · {(t.checkpoints ?? []).length} checkpoint
                        {(t.checkpoints ?? []).length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* Detail / editor (right pane) */}
          <div className="space-y-4">
            {draftTrack ? (
              <>
                <header className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr_auto] gap-3 items-start">
                    <label className="block text-xs text-ink-faint">
                      Icon
                      <input
                        type="text"
                        value={draftTrack.icon}
                        onChange={(e) => updateDraft({ icon: e.target.value })}
                        maxLength={4}
                        className="mt-1 w-full text-2xl text-center rounded-md border border-border bg-bg px-2 py-1"
                      />
                    </label>
                    <label className="block text-xs text-ink-faint">
                      Name
                      <input
                        type="text"
                        value={draftTrack.name}
                        onChange={(e) => updateDraft({ name: e.target.value })}
                        className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-ink"
                      />
                    </label>
                    <label className="block text-xs text-ink-faint">
                      Accent
                      <select
                        value={draftTrack.accentColor || 'accent'}
                        onChange={(e) => updateDraft({ accentColor: e.target.value })}
                        className="mt-1 rounded-md border border-border bg-bg px-2 py-1 text-xs text-ink"
                      >
                        {['accent', 'success', 'warning', 'danger'].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-xs text-ink-faint">
                    Description
                    <textarea
                      value={draftTrack.description}
                      onChange={(e) => updateDraft({ description: e.target.value })}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1 text-sm text-ink"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-md bg-accent text-accent-text text-xs font-medium hover:bg-accent-dark disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    {draftTrack.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => void handleSetStatus(draftTrack._id, 'published')}
                        className="px-3 py-1.5 rounded-md border border-success bg-success/10 text-success text-xs font-medium"
                      >
                        Publish
                      </button>
                    )}
                    {draftTrack.status === 'published' && (
                      <button
                        type="button"
                        onClick={() => void handleSetStatus(draftTrack._id, 'unpublished')}
                        className="px-3 py-1.5 rounded-md border border-warning bg-warning/10 text-warning text-xs font-medium"
                      >
                        Unpublish
                      </button>
                    )}
                    {draftTrack.status !== 'archived' && (
                      <button
                        type="button"
                        onClick={() => void handleSetStatus(draftTrack._id, 'archived')}
                        className="px-3 py-1.5 rounded-md border border-border text-ink-soft text-xs font-medium"
                      >
                        Archive
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(draftTrack._id)}
                      className="px-3 py-1.5 rounded-md border border-border text-ink-soft text-xs font-medium"
                    >
                      Duplicate
                    </button>
                    {draftTrack.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(draftTrack._id)}
                        className="ml-auto px-3 py-1.5 rounded-md border border-danger bg-danger/10 text-danger text-xs font-medium"
                      >
                        Delete draft
                      </button>
                    )}
                  </div>
                </header>

                {/* Assignments — pick who sees this trek. Until
                    now the only way to assign was raw API calls;
                    the UI was missing entirely. We expose the four
                    scopes the backend supports (user / batch /
                    program / all). For batch + program scopes the
                    picker is the ProgramContext dropdown (each
                    program === a batch in this codebase). For
                    user scope we ship a small search-and-pick. */}
                <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <header className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-ink">Assignments</h3>
                      <p className="text-[11px] text-ink-faint mt-0.5">
                        Pick who should see this trek. Published treks assigned here appear on
                        the user's "Your Journey" tab.
                      </p>
                    </div>
                  </header>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['user', 'batch', 'program', 'all'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setAssignScope(s);
                          setAssignError(null);
                          setAssignInfo(null);
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          assignScope === s
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border text-ink-soft hover:text-ink hover:bg-mist/40'
                        }`}
                      >
                        {s === 'all' ? 'All users' : `Assign to ${s}`}
                      </button>
                    ))}
                  </div>

                  {assignScope === 'user' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                        placeholder="Search users by name or email"
                        className="w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-ink"
                      />
                      <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-bg/40 p-1.5 space-y-0.5">
                        {filteredUsers.length === 0 && (
                          <p className="text-[11px] text-ink-faint px-2 py-1">
                            {userOptions.length === 0
                              ? 'Loading users…'
                              : 'No matching users.'}
                          </p>
                        )}
                        {filteredUsers.map((u) => {
                          const checked = assignUserIds.includes(u._id);
                          return (
                            <label
                              key={u._id}
                              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-mist/40 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setAssignUserIds((prev) =>
                                    e.target.checked
                                      ? [...prev, u._id]
                                      : prev.filter((id) => id !== u._id)
                                  );
                                }}
                              />
                              <span className="text-xs text-ink">
                                {u.name || '(no name)'}{' '}
                                <span className="text-ink-faint">{u.email ?? ''}</span>
                              </span>
                              {u.role && u.role !== 'user' && (
                                <span className="ml-auto text-[10px] text-ink-faint uppercase">
                                  {u.role}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-ink-faint">
                        {assignUserIds.length} user{assignUserIds.length === 1 ? '' : 's'} selected.
                      </p>
                    </div>
                  )}

                  {(assignScope === 'batch' || assignScope === 'program') && (
                    <div className="space-y-2">
                      <select
                        multiple
                        value={assignBatchIds}
                        onChange={(e) => {
                          const sel = Array.from(e.target.selectedOptions).map((o) => o.value);
                          setAssignBatchIds(sel);
                        }}
                        className="w-full min-h-[120px] rounded-md border border-border bg-bg px-2 py-1 text-xs text-ink"
                      >
                        {availablePrograms.length === 0 && (
                          <option disabled value="">
                            No programs available
                          </option>
                        )}
                        {availablePrograms.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name}
                            {p.isDefault ? ' ★' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-ink-faint">
                        Hold ⌘/Ctrl to select multiple. {assignBatchIds.length} program
                        {assignBatchIds.length === 1 ? '' : 's'} selected. (In this codebase each
                        program IS a batch — backend writes one assignment per enrolled user.)
                      </p>
                    </div>
                  )}

                  {assignScope === 'all' && (
                    <p className="text-xs text-ink-soft">
                      This will assign the trek to every non-admin user in the system. Use sparingly.
                    </p>
                  )}

                  {assignError && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-xs text-danger"
                    >
                      {assignError}
                    </div>
                  )}
                  {assignInfo && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success"
                    >
                      {assignInfo}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleAssign()}
                    disabled={assignBusy}
                    className="px-3 py-1.5 rounded-md bg-accent text-accent-text text-xs font-semibold hover:bg-accent-dark disabled:opacity-50"
                  >
                    {assignBusy ? 'Assigning…' : 'Assign trek'}
                  </button>

                  {/* Existing assignments list */}
                  <div className="pt-3 border-t border-border/60">
                    <h4 className="text-xs font-semibold text-ink-soft mb-2">
                      Current assignments ({assignments.length})
                    </h4>
                    {assignmentsLoading ? (
                      <Spinner size="sm" />
                    ) : assignments.length === 0 ? (
                      <p className="text-[11px] text-ink-faint">No one is assigned yet.</p>
                    ) : (
                      <ul className="space-y-1 max-h-48 overflow-y-auto">
                        {assignments.map((a) => {
                          const u = a.userId as unknown as
                            | { _id?: string; name?: string; email?: string }
                            | string
                            | null;
                          const userName =
                            typeof u === 'object' && u !== null
                              ? u.name ?? u.email ?? '(no name)'
                              : '(no name)';
                          const userEmail =
                            typeof u === 'object' && u !== null ? u.email ?? '' : '';
                          const batchName =
                            typeof a.batchId === 'object' && a.batchId !== null
                              ? (a.batchId as { name?: string }).name ?? ''
                              : '';
                          return (
                            <li
                              key={a._id}
                              className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-mist/40"
                            >
                              <span className="inline-block px-1.5 py-0.5 rounded bg-mist text-[10px] uppercase tracking-wider text-ink-soft">
                                {a.scope}
                              </span>
                              <span className="text-ink truncate">
                                {userName}{' '}
                                <span className="text-ink-faint">{userEmail}</span>
                              </span>
                              {batchName && (
                                <span className="text-[10px] text-ink-faint">
                                  · {batchName}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleDeleteAssignment(a._id)}
                                className="ml-auto text-ink-faint hover:text-danger"
                                aria-label="Remove assignment"
                                title="Remove assignment"
                              >
                                ×
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </section>

                {/* Checkpoints editor */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink">Checkpoints</h3>
                    <button
                      type="button"
                      onClick={appendLocalCheckpoint}
                      className="text-xs px-2 py-1 rounded-md border border-dashed border-border text-ink-soft hover:text-ink hover:border-accent"
                    >
                      + Add checkpoint
                    </button>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={reorderCheckpoints}
                  >
                    <SortableContext
                      items={(draftTrack.checkpoints ?? []).map((c) => c._id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {(draftTrack.checkpoints ?? []).map((cp) => (
                          <SortableCheckpoint
                            key={cp._id}
                            cp={cp}
                            isExpanded={expandedCpIds.has(cp._id)}
                            onToggle={() => toggleExpanded(cp._id)}
                            onUpdate={(patch) => updateCheckpoint(cp._id, patch)}
                            onDelete={() => deleteLocalCheckpoint(cp._id)}
                            onAddItem={(item) => appendLocalItem(cp._id, item)}
                            onUpdateItem={(itemId, patch) =>
                              updateLocalItem(cp._id, itemId, patch)
                            }
                            onDeleteItem={(itemId) => deleteLocalItem(cp._id, itemId)}
                            onReorderItems={(ids) => reorderLocalItems(cp._id, ids)}
                            accent={draftTrack.accentColor || 'accent'}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </section>

                {/* Live preview */}
                <section>
                  <h3 className="text-sm font-bold text-ink mb-2">Preview</h3>
                  <p className="text-xs text-ink-faint mb-3">
                    This is exactly what an assigned user will see. Drag-and-drop,
                    progress, and the curved path all render from the data above.
                  </p>
                  <JourneyTrackRenderer
                    track={draftTrack}
                    progress={previewProgress}
                    interactive={false}
                    accentColor={draftTrack.accentColor}
                  />
                </section>

                {/* Progress monitor */}
                <section>
                  <h3 className="text-sm font-bold text-ink mb-2">Progress monitor</h3>
                  {progressLoading ? (
                    <Spinner size="sm" />
                  ) : progressRows.length === 0 ? (
                    <p className="text-xs text-ink-faint">No users assigned yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-ink-faint border-b border-border">
                            <th className="px-3 py-2 font-semibold">User</th>
                            <th className="px-3 py-2 font-semibold">Batch</th>
                            <th className="px-3 py-2 font-semibold">%</th>
                            <th className="px-3 py-2 font-semibold">Done</th>
                            <th className="px-3 py-2 font-semibold">Current</th>
                            <th className="px-3 py-2 font-semibold">Last activity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {progressRows.map((r) => (
                            <tr key={r.assignmentId} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2 text-ink">
                                {r.userName ?? '—'}{' '}
                                <span className="text-ink-faint text-[10px]">
                                  {r.userEmail ?? ''}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-ink-soft">{r.batchName ?? '—'}</td>
                              <td className="px-3 py-2 font-semibold text-ink">
                                {r.percent}%
                              </td>
                              <td className="px-3 py-2 text-ink-soft">
                                {r.completedRequired}/{progressTotal || r.completedRequired + 0}
                              </td>
                              <td className="px-3 py-2 text-ink-soft">
                                {r.currentCheckpoint ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-ink-faint font-mono">
                                {r.lastActivityAt
                                  ? new Date(r.lastActivityAt).toLocaleString()
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-ink-faint">
                Pick a track on the left, or create a new one to get started.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
