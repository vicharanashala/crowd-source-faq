/**
 * AdminResourcesTab — additive admin CMS for the generalized
 * Onboarding Resource / Onboarding Knowledge Source system.
 *
 * v1.69 — Welcome Package Management: this is brand-new. It does
 * NOT replace AdminOrientationTab (which continues to render the
 * legacy Orientation upload/edit UI exactly as before). Both can
 * be visible at the same time; admins choose what to use.
 *
 * Features:
 *   - Drag-and-drop list of resources, ordered by `order` field.
 *   - Create form supporting all 7 kinds (video/pdf/pptx/svg/
 *     markdown/txt/link) with kind-specific input modes.
 *   - Visibility toggle (eye icon) — hides a resource from the
 *     student list without deleting it.
 *   - Knowledge Sources section with paste / file upload, plus
 *     AI generation tools (FAQs / quiz / summary / timeline /
 *     flashcards) that produce text the admin can copy out.
 *
 * All network calls go through `adminApi` which already attaches
 * the active-program header via the interceptor installed in
 * AdminLayout. So `?batchId=…` is wired automatically.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import adminApi from '../../utils/adminApi';
import { useCloudinarySvgUpload } from '../../../hooks/useCloudinarySvgUpload';

type ResourceKind = 'video' | 'pdf' | 'pptx' | 'svg' | 'markdown' | 'txt' | 'link';

interface Resource {
  _id: string;
  batchId: string;
  kind: ResourceKind;
  title: string;
  description: string;
  url: string;
  completionThreshold: number;
  order: number;
  visible: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeSource {
  _id: string;
  batchId: string;
  kind: 'pasted' | 'transcript' | 'knowledge_base';
  title: string;
  description: string;
  body: string;
  fileName?: string | null;
  charCount: number;
  indexed: boolean;
  createdAt: string;
  updatedAt: string;
}

type GenKind = 'faqs' | 'quiz' | 'summary' | 'timeline' | 'flashcards';

const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  video: 'Video',
  pdf: 'PDF',
  pptx: 'PowerPoint',
  svg: 'SVG Flowchart',
  markdown: 'Markdown',
  txt: 'Plain text',
  link: 'External link',
};

const RESOURCE_KIND_ICONS: Record<ResourceKind, string> = {
  video: '🎬',
  pdf: '📄',
  pptx: '📊',
  svg: '🔀',
  markdown: '📝',
  txt: '📃',
  link: '🔗',
};

const GEN_KIND_LABELS: Record<GenKind, string> = {
  faqs: 'FAQs',
  quiz: 'Quiz',
  summary: 'Summary',
  timeline: 'Timeline',
  flashcards: 'Flashcards',
};

interface Props {
  /** Optional override; if omitted we read the active program
   *  from the adminApi interceptor. */
  programId?: string | null;
  /** Trigger a refetch whenever this changes (program switch). */
  refreshKey?: string | number;
}

export default function AdminResourcesTab({ programId, refreshKey }: Props): React.ReactElement {
  const [resources, setResources] = useState<Resource[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Cloudinary SVG upload hook (only used when kind === 'svg')
  const { upload: uploadSvg, uploading: svgUploading, error: svgError } = useCloudinarySvgUpload();

  // Create form state
  const [kind, setKind] = useState<ResourceKind>('pdf');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [completionThreshold, setCompletionThreshold] = useState<number>(90);
  const [visible, setVisible] = useState(true);
  const [tags, setTags] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Knowledge form state
  const [kTitle, setKTitle] = useState('');
  const [kDescription, setKDescription] = useState('');
  const [kKind, setKKind] = useState<'pasted' | 'transcript' | 'knowledge_base'>('pasted');
  const [kBody, setKBody] = useState('');
  const [kFile, setKFile] = useState<File | null>(null);
  const [kBusy, setKBusy] = useState(false);

  // Generation state
  const [genSourceId, setGenSourceId] = useState<string | null>(null);
  const [genKind, setGenKind] = useState<GenKind>('faqs');
  const [genCount, setGenCount] = useState<number>(8);
  const [genOutput, setGenOutput] = useState<string>('');
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const fetchAll = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const [resR, resK] = await Promise.all([
        adminApi.get<Resource[]>('/admin/welcome/resources', { params: { includeHidden: 'true' } }),
        adminApi.get<KnowledgeSource[]>('/admin/welcome/knowledge'),
      ]);
      setResources(resR.data || []);
      setKnowledge(resK.data || []);
    } catch (err) {
      setError('Could not load resources.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll, refreshKey, programId]);

  const resetCreate = (): void => {
    setTitle('');
    setDescription('');
    setCompletionThreshold(90);
    setVisible(true);
    setTags('');
    setExternalUrl('');
    setFile(null);
  };

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (kind === 'link') {
      if (!/^https?:\/\//i.test(externalUrl)) {
        setError('External link must start with http:// or https://');
        return;
      }
    } else if (kind === 'svg') {
      if (!file) {
        setError('Pick an SVG file to upload.');
        return;
      }
    } else if (!file) {
      setError('Pick a file to upload.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === 'svg') {
        // v1.70: SVG flowcharts upload directly to Cloudinary via the
        // signed-URL flow. We get back { url, publicId } and POST those
        // as plain JSON fields (not multipart).
        //
        // The Cloudinary upload runs browser→Cloudinary (not via our
        // backend), so a `TypeError: Failed to fetch` here is almost
        // always a CSP block (helmet's `connect-src` doesn't allow
        // api.cloudinary.com) — see apps/backend/src/bootstrap/middleware.ts.
        // We map that to a friendly UI message instead of dumping the raw
        // browser error onto the page.
        let uploaded;
        try {
          uploaded = await uploadSvg(file!);
        } catch (uploadErr) {
          const msg = (uploadErr as Error).message;
          if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            setError(
              'Upload blocked by browser security policy. Reload the page and retry, or contact an admin if it persists.'
            );
            return;
          }
          throw uploadErr;
        }
        const { url, publicId } = uploaded;
        await adminApi.post('/admin/welcome/resources', {
          kind: 'svg',
          title: title.trim(),
          description,
          completionThreshold,
          visible,
          url,
          publicId,
          ...(tags.trim() ? { tags } : {}),
        });
      } else {
        // All other kinds (video/pdf/pptx/markdown/txt): multipart upload.
        const formData = new FormData();
        formData.append('kind', kind);
        formData.append('title', title.trim());
        formData.append('description', description);
        formData.append('completionThreshold', String(completionThreshold));
        formData.append('visible', visible ? 'true' : 'false');
        if (tags.trim()) formData.append('tags', tags);
        if (kind === 'link') {
          formData.append('url', externalUrl);
        } else if (file) {
          formData.append('file', file);
        }
        await adminApi.post('/admin/welcome/resources', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      resetCreate();
      await fetchAll();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to create resource.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm('Delete this resource?')) return;
    try {
      await adminApi.delete(`/admin/welcome/resources/${id}`);
      await fetchAll();
    } catch (err) {
      setError('Failed to delete resource.');
    }
  };

  const handleToggleVisibility = async (r: Resource): Promise<void> => {
    try {
      await adminApi.put(`/admin/welcome/resources/${r._id}/visibility`, { visible: !r.visible });
      setResources((prev) =>
        prev.map((x) => (x._id === r._id ? { ...x, visible: !r.visible } : x))
      );
    } catch (err) {
      setError('Failed to toggle visibility.');
    }
  };

  // Drag-and-drop reorder — uses HTML5 DnD on the row handle.
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDragStart =
    (id: string) =>
    (e: React.DragEvent): void => {
      setDraggingId(id);
      e.dataTransfer.effectAllowed = 'move';
    };
  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop =
    (targetId: string) =>
    async (e: React.DragEvent): Promise<void> => {
      e.preventDefault();
      if (!draggingId || draggingId === targetId) {
        setDraggingId(null);
        return;
      }
      // Optimistic local reorder.
      const reordered = [...resources];
      const fromIdx = reordered.findIndex((r) => r._id === draggingId);
      const toIdx = reordered.findIndex((r) => r._id === targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      // Re-assign `order` 0..n.
      const withNewOrder = reordered.map((r, i) => ({ ...r, order: i }));
      setResources(withNewOrder);
      setDraggingId(null);
      // Persist.
      try {
        await adminApi.put('/admin/welcome/resources/reorder', {
          order: withNewOrder.map((r) => ({ id: r._id, order: r.order })),
        });
      } catch (err) {
        setError('Failed to persist new order.');
        await fetchAll();
      }
    };

  const handleCreateKnowledge = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!kTitle.trim()) {
      setError('Knowledge title is required.');
      return;
    }
    if (kKind === 'pasted' && !kBody.trim()) {
      setError('Paste some text or upload a file.');
      return;
    }
    if (kKind !== 'pasted' && !kFile) {
      setError('Upload a file for this knowledge kind.');
      return;
    }
    setKBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('kind', kKind);
      formData.append('title', kTitle.trim());
      formData.append('description', kDescription);
      if (kKind === 'pasted') {
        formData.append('body', kBody);
      } else if (kFile) {
        formData.append('file', kFile);
      }
      await adminApi.post('/admin/welcome/knowledge', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setKTitle('');
      setKDescription('');
      setKBody('');
      setKFile(null);
      await fetchAll();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to create knowledge source.');
    } finally {
      setKBusy(false);
    }
  };

  const handleDeleteKnowledge = async (id: string): Promise<void> => {
    if (!confirm('Delete this knowledge source?')) return;
    try {
      await adminApi.delete(`/admin/welcome/knowledge/${id}`);
      if (genSourceId === id) setGenSourceId(null);
      await fetchAll();
    } catch (err) {
      setError('Failed to delete knowledge source.');
    }
  };

  const handleGenerate = async (): Promise<void> => {
    if (!genSourceId) {
      setGenError('Pick a knowledge source first.');
      return;
    }
    setGenBusy(true);
    setGenError(null);
    setGenOutput('');
    try {
      const res = await adminApi.post<{ kind: GenKind; count: number; generated: string }>(
        `/admin/welcome/knowledge/${genSourceId}/generate`,
        { kind: genKind, count: genCount }
      );
      setGenOutput(res.data.generated || '');
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setGenError(msg || 'Generation failed.');
    } finally {
      setGenBusy(false);
    }
  };

  const handleCopyGen = async (): Promise<void> => {
    if (!genOutput) return;
    try {
      await navigator.clipboard.writeText(genOutput);
    } catch {
      // ignore — older browsers
    }
  };

  const sortedResources = useMemo(
    () => [...resources].sort((a, b) => a.order - b.order),
    [resources]
  );

  return (
    <div className="space-y-8">
      {(error || svgError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error || svgError}
        </div>
      )}

      {/* ── Create Resource ─────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-ink mb-1">Add onboarding resource</h2>
        <p className="text-xs text-ink-soft mb-4">
          Add PDFs, slides, flowcharts, markdown, transcripts, or external links alongside your
          existing orientation video. Each kind tracks completion differently — video uses watch %,
          others use time-on-page.
        </p>
        <form onSubmit={handleCreate} className="space-y-4 max-w-3xl">
          <div>
            <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
              Resource type
            </label>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(RESOURCE_KIND_LABELS) as ResourceKind[]).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setKind(k)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    kind === k
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-ink-soft hover:text-ink hover:bg-mist/40'
                  }`}
                >
                  <span className="mr-1">{RESOURCE_KIND_ICONS[k]}</span>
                  {RESOURCE_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="onboarding, day-1"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
            />
          </div>

          {kind === 'link' ? (
            <div>
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
                External URL
              </label>
              <input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
                Upload file ({RESOURCE_KIND_LABELS[kind]})
              </label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
                {kind === 'video' ? 'Watch % to complete' : 'Seconds on page to complete'}
              </label>
              <input
                type="number"
                min={1}
                max={kind === 'video' ? 100 : 86400}
                value={completionThreshold}
                onChange={(e) => setCompletionThreshold(Number(e.target.value || 0))}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => setVisible(e.target.checked)}
                />
                Visible to students
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || (kind === 'svg' && svgUploading)}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy
              ? 'Adding…'
              : kind === 'svg' && svgUploading
                ? 'Uploading to Cloudinary…'
                : 'Add resource'}
          </button>
        </form>
      </section>

      {/* ── Resource List ───────────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-ink mb-1">Resources ({sortedResources.length})</h2>
        <p className="text-xs text-ink-soft mb-4">
          Drag the handle to reorder. Click the eye to toggle visibility.
        </p>
        {loading && <p className="text-sm text-ink-soft">Loading…</p>}
        {!loading && sortedResources.length === 0 && (
          <p className="text-sm text-ink-soft">No resources yet. Add one above.</p>
        )}
        <ul className="space-y-2">
          {sortedResources.map((r) => (
            <li
              key={r._id}
              draggable
              onDragStart={handleDragStart(r._id)}
              onDragOver={handleDragOver}
              onDrop={handleDrop(r._id)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                draggingId === r._id
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-bg/40 hover:bg-mist/30'
              }`}
            >
              <span className="cursor-grab text-ink-faint select-none">⠿</span>
              <span className="text-lg">{RESOURCE_KIND_ICONS[r.kind]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{r.title}</p>
                <p className="text-[11px] text-ink-soft">
                  {RESOURCE_KIND_LABELS[r.kind]} · order {r.order} · {r.completionThreshold}
                  {r.kind === 'video' ? '%' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleToggleVisibility(r);
                }}
                title={r.visible ? 'Hide from students' : 'Show to students'}
                className="px-2 py-1 text-xs rounded-md border border-border hover:bg-mist"
              >
                {r.visible ? '👁 Visible' : '🚫 Hidden'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDelete(r._id);
                }}
                className="px-2 py-1 text-xs rounded-md border border-border text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Knowledge Sources ───────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-ink mb-1">Knowledge sources ({knowledge.length})</h2>
        <p className="text-xs text-ink-soft mb-4">
          Indexed text the AI uses when students ask questions. Each source is chunked + embedded on
          save.
        </p>
        <form onSubmit={handleCreateKnowledge} className="space-y-4 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
                Source kind
              </label>
              <select
                value={kKind}
                onChange={(e) =>
                  setKKind(e.target.value as 'pasted' | 'transcript' | 'knowledge_base')
                }
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
              >
                <option value="pasted">Pasted text</option>
                <option value="transcript">Transcript (.txt)</option>
                <option value="knowledge_base">Knowledge base (.md/.txt)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
                Title
              </label>
              <input
                type="text"
                value={kTitle}
                onChange={(e) => setKTitle(e.target.value)}
                required
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
              Description
            </label>
            <input
              type="text"
              value={kDescription}
              onChange={(e) => setKDescription(e.target.value)}
              placeholder="Optional context for admins"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
            />
          </div>
          {kKind === 'pasted' ? (
            <div>
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
                Paste text
              </label>
              <textarea
                value={kBody}
                onChange={(e) => setKBody(e.target.value)}
                rows={8}
                placeholder="Paste the source content here…"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink font-mono"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
                Upload {kKind === 'transcript' ? 'transcript' : 'knowledge base'} file
              </label>
              <input
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                onChange={(e) => setKFile(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={kBusy}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {kBusy ? 'Indexing…' : 'Add knowledge source'}
          </button>
        </form>

        <div className="mt-6">
          {knowledge.length === 0 ? (
            <p className="text-xs text-ink-soft">No knowledge sources yet.</p>
          ) : (
            <ul className="space-y-2">
              {knowledge.map((k) => (
                <li
                  key={k._id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-bg/40 px-3 py-2"
                >
                  <span className="text-sm font-mono text-ink-soft w-24 truncate">{k.kind}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{k.title}</p>
                    <p className="text-[11px] text-ink-soft">
                      {k.charCount.toLocaleString()} chars · {k.indexed ? 'indexed' : 'paused'}
                      {k.fileName && ` · ${k.fileName}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGenSourceId(k._id)}
                    className={`px-2 py-1 text-xs rounded-md border ${
                      genSourceId === k._id
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border hover:bg-mist'
                    }`}
                  >
                    Use for AI
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeleteKnowledge(k._id);
                    }}
                    className="px-2 py-1 text-xs rounded-md border border-border text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── AI generation tools ─────────────────────────────────────── */}
      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-ink mb-1">AI generation tools</h2>
        <p className="text-xs text-ink-soft mb-4">
          Generate FAQs, quizzes, summaries, timelines, or flashcards from an indexed knowledge
          source.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
              Source
            </label>
            <select
              value={genSourceId ?? ''}
              onChange={(e) => setGenSourceId(e.target.value || null)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
            >
              <option value="">Select a knowledge source…</option>
              {knowledge.map((k) => (
                <option key={k._id} value={k._id}>
                  {k.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
              Output kind
            </label>
            <select
              value={genKind}
              onChange={(e) => setGenKind(e.target.value as GenKind)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
            >
              {(Object.keys(GEN_KIND_LABELS) as GenKind[]).map((k) => (
                <option key={k} value={k}>
                  {GEN_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1">
              Count
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={genCount}
              onChange={(e) => setGenCount(Number(e.target.value || 1))}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleGenerate();
            }}
            disabled={genBusy || !genSourceId}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {genBusy ? 'Generating…' : `Generate ${GEN_KIND_LABELS[genKind]}`}
          </button>
          {genOutput && (
            <button
              type="button"
              onClick={() => {
                void handleCopyGen();
              }}
              className="px-3 py-2 rounded-lg border border-border text-ink-soft hover:bg-mist text-xs"
            >
              Copy output
            </button>
          )}
        </div>

        {genError && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
            {genError}
          </div>
        )}

        {genOutput && (
          <pre className="mt-4 max-h-96 overflow-y-auto bg-bg/60 border border-border rounded-lg p-4 text-xs font-mono whitespace-pre-wrap">
            {genOutput}
          </pre>
        )}
      </section>
    </div>
  );
}
