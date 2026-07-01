/**
 * ResourceViewerTab — student-facing view of the generalized
 * OnboardingResource collection.
 *
 * v1.69 — Welcome Package Management: additive. Co-exists with
 * the legacy OrientationTab (which continues to render the
 * orientation video). Both are mounted in the public welcome page;
 * the legacy orientation appears first, then this component shows
 * every visible resource of any kind below.
 *
 * Completion contract:
 *   - video: client tracks `timeupdate` events, sends
 *     `POST /welcome/resources/:id/complete` with `durationSeconds`
 *     = watch-time once watched ≥ completionThreshold%.
 *   - pdf / pptx / svg / markdown / txt: client tracks elapsed time
 *     on the resource. Sends complete when elapsed ≥
 *     `completionThreshold` (interpreted as seconds).
 *   - link: client sends complete immediately on "Mark as read".
 *
 * Server stores the completion timestamp + durationSeconds per
 * (user, resource). The progress bar is cosmetic — actual
 * eligibility check happens on submit.
 *
 * The student-facing ask-the-AI box calls
 * `POST /welcome/resources/ask` which uses the same indexed
 * knowledge sources the admin created in AdminResourcesTab.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { useProgram } from '../../context/ProgramContext';

type ResourceKind = 'video' | 'pdf' | 'pptx' | 'svg' | 'markdown' | 'txt' | 'link';

interface Resource {
  _id: string;
  kind: ResourceKind;
  title: string;
  description: string;
  url: string;
  completionThreshold: number;
}

interface CompletionMap {
  [resourceId: string]: { completedAt: string; durationSeconds: number };
}

const KIND_LABELS: Record<ResourceKind, string> = {
  video: 'Video',
  pdf: 'PDF',
  pptx: 'Slides',
  svg: 'Flowchart',
  markdown: 'Markdown',
  txt: 'Text',
  link: 'External link',
};

interface Props {
  /** Optional: if omitted, the active program header is used. */
  refreshKey?: string | number;
}

export default function ResourceViewerTab({ refreshKey }: Props): React.ReactElement {
  const { currentProgram } = useProgram();
  const [resources, setResources] = useState<Resource[]>([]);
  const [completions, setCompletions] = useState<CompletionMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ask-the-AI state
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState('');
  const [askSourcesUsed, setAskSourcesUsed] = useState<number>(0);
  const [askBusy, setAskBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      // v1.69 — Welcome Package fix: pass the active program's
      // batchId as a query param. The backend already accepts the
      // `x-program-id` header set by the api interceptor, but
      // passing it explicitly removes a race condition where the
      // interceptor reads localStorage before ProgramContext has
      // populated it.
      const params = currentProgram?._id ? { batchId: currentProgram._id } : {};
      const [resR, resC] = await Promise.all([
        api.get<Resource[]>('/welcome/resources', { params }),
        api.get<CompletionMap>('/welcome/resources/completions'),
      ]);
      setResources(resR.data || []);
      setCompletions(resC.data || {});
    } catch (err) {
      setError('Could not load resources.');
    } finally {
      setLoading(false);
    }
  }, [currentProgram?._id]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const sendComplete = async (resourceId: string, durationSeconds: number): Promise<void> => {
    try {
      const res = await api.post<{ ok: boolean }>(`/welcome/resources/${resourceId}/complete`, {
        durationSeconds,
      });
      if (res.data?.ok) {
        setCompletions((prev) => ({
          ...prev,
          [resourceId]: {
            completedAt: new Date().toISOString(),
            durationSeconds,
          },
        }));
      }
    } catch (err) {
      // Non-fatal — admins can re-collect analytics from the server logs.
    }
  };

  const askAI = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!askQuestion.trim()) return;
    setAskBusy(true);
    setAskAnswer('');
    setAskSourcesUsed(0);
    try {
      const res = await api.post<{ answer: string; sourcesUsed: number }>('/welcome/resources/ask', {
        question: askQuestion.trim(),
      });
      setAskAnswer(res.data?.answer ?? 'No answer.');
      setAskSourcesUsed(res.data?.sourcesUsed ?? 0);
    } catch (err) {
      setAskAnswer('Could not reach the AI. Try again.');
    } finally {
      setAskBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}

      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-ink mb-1">Onboarding resources</h2>
        <p className="text-xs text-ink-soft mb-4">
          Work through each resource below. Mark complete to record your progress — admins use this for analytics.
        </p>
        {loading && <p className="text-sm text-ink-soft">Loading…</p>}
        {!loading && resources.length === 0 && (
          <p className="text-sm text-ink-soft">No resources published.</p>
        )}
        <ul className="space-y-3">
          {resources.map((r) => (
            <li
              key={r._id}
              className={`rounded-xl border p-4 transition-colors ${
                completions[r._id] ? 'border-green-200 bg-green-50/40' : 'border-border bg-bg/40'
              }`}
            >
              <ResourceRow
                resource={r}
                completed={!!completions[r._id]}
                onComplete={(secs) => { void sendComplete(r._id, secs); }}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-ink mb-1">Ask the AI</h2>
        <p className="text-xs text-ink-soft mb-4">
          Ask any question — the answer is grounded in the indexed knowledge sources your admin uploaded.
        </p>
        <form onSubmit={askAI} className="space-y-3">
          <textarea
            value={askQuestion}
            onChange={(e) => setAskQuestion(e.target.value)}
            placeholder="What does the program cover on day 1?"
            rows={3}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink"
          />
          <button
            type="submit"
            disabled={askBusy || !askQuestion.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {askBusy ? 'Asking…' : 'Ask'}
          </button>
        </form>
        {askAnswer && (
          <div className="mt-4 bg-bg/60 border border-border rounded-lg p-4 text-sm text-ink whitespace-pre-wrap">
            {askAnswer}
            {askSourcesUsed > 0 && (
              <p className="text-[11px] text-ink-faint mt-2">
                Sourced from {askSourcesUsed} knowledge chunk{askSourcesUsed === 1 ? '' : 's'}.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Per-kind renderer ────────────────────────────────────────────────────

interface RowProps {
  resource: Resource;
  completed: boolean;
  onComplete: (durationSeconds: number) => void;
}

function ResourceRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  switch (resource.kind) {
    case 'video':
      return <VideoRow resource={resource} completed={completed} onComplete={onComplete} />;
    case 'pdf':
      return <PdfRow resource={resource} completed={completed} onComplete={onComplete} />;
    case 'pptx':
      return <PptxRow resource={resource} completed={completed} onComplete={onComplete} />;
    case 'svg':
      return <SvgRow resource={resource} completed={completed} onComplete={onComplete} />;
    case 'markdown':
      return <MarkdownRow resource={resource} completed={completed} onComplete={onComplete} />;
    case 'txt':
      return <TxtRow resource={resource} completed={completed} onComplete={onComplete} />;
    case 'link':
      return <LinkRow resource={resource} completed={completed} onComplete={onComplete} />;
    default:
      return <UnsupportedRow resource={resource} />;
  }
}

function HeaderRow({ resource, completed, children }: { resource: Resource; completed: boolean; children?: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{resource.title}</h3>
          <span className="text-[10px] uppercase font-bold tracking-wider text-ink-faint px-2 py-0.5 rounded-full border border-border bg-bg/40">
            {KIND_LABELS[resource.kind]}
          </span>
          {completed && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
              ✓ Completed
            </span>
          )}
        </div>
        {resource.description && (
          <p className="text-xs text-ink-soft mt-1">{resource.description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function useElapsedTimer(active: boolean, thresholdSec: number, onComplete: (seconds: number) => void): {
  elapsed: number;
  start: () => void;
  stop: () => void;
} {
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = React.useRef<number | null>(null);

  const start = useCallback(() => {
    if (startedAtRef.current != null) return;
    startedAtRef.current = Date.now();
    const tick = (): void => {
      if (startedAtRef.current == null) return;
      const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(sec);
      if (thresholdSec > 0 && sec >= thresholdSec) {
        onComplete(sec);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    (startedAtRef as unknown as { _id?: number })._id = id;
  }, [thresholdSec, onComplete]);

  const stop = useCallback(() => {
    if (startedAtRef.current != null) {
      const id = (startedAtRef as unknown as { _id?: number })._id;
      if (id) window.clearInterval(id);
      startedAtRef.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { elapsed, start, stop };
}

function VideoRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [watched, setWatched] = useState(0);

  const onTimeUpdate = useCallback(() => {
    if (!videoRef) return;
    setWatched(videoRef.currentTime);
    const dur = videoRef.duration || 0;
    if (dur > 0 && videoRef.currentTime / dur >= resource.completionThreshold / 100) {
      onComplete(Math.floor(videoRef.currentTime));
    }
  }, [videoRef, resource.completionThreshold, onComplete]);

  const pct = useMemo(() => {
    if (duration <= 0) return 0;
    return Math.min(100, Math.round((watched / duration) * 100));
  }, [watched, duration]);

  return (
    <div className="space-y-2">
      <HeaderRow resource={resource} completed={completed} />
      <video
        ref={setVideoRef}
        src={resource.url}
        controls
        className="w-full rounded-lg border border-border bg-black"
        onLoadedMetadata={(e) => setDuration((e.currentTarget as HTMLVideoElement).duration || 0)}
        onTimeUpdate={onTimeUpdate}
      />
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-border/40 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] text-ink-soft font-mono w-24 text-right">
          {pct}% / {resource.completionThreshold}% to complete
        </span>
      </div>
    </div>
  );
}

function PdfRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  const threshold = Math.max(5, resource.completionThreshold);
  const { elapsed, start } = useElapsedTimer(true, threshold, onComplete);
  return (
    <div className="space-y-2">
      <HeaderRow
        resource={resource}
        completed={completed}
        children={
          <span className="text-[11px] text-ink-soft font-mono">
            {elapsed}s / {threshold}s
          </span>
        }
      />
      <div
        className="rounded-lg border border-border overflow-hidden bg-mist/30 h-[480px]"
        onMouseEnter={start}
        onTouchStart={start}
      >
        <iframe src={resource.url} title={resource.title} className="w-full h-full" />
      </div>
    </div>
  );
}

function PptxRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  const threshold = Math.max(5, resource.completionThreshold);
  const { elapsed, start } = useElapsedTimer(true, threshold, onComplete);
  // Browsers can't render PPTX directly. We render the resource as
  // a download link + an explanatory note about time-on-page. Admins
  // who want a richer viewer can swap this out for an embedded
  // viewer; the contract is unchanged.
  return (
    <div className="space-y-2">
      <HeaderRow
        resource={resource}
        completed={completed}
        children={
          <span className="text-[11px] text-ink-soft font-mono">
            {elapsed}s / {threshold}s
          </span>
        }
      />
      <div
        className="rounded-lg border border-border bg-mist/30 px-4 py-6 flex flex-col items-center gap-3 text-center"
        onMouseEnter={start}
        onTouchStart={start}
      >
        <p className="text-sm text-ink">This is a PowerPoint deck. Click below to open or download.</p>
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-semibold"
        >
          Open slides
        </a>
      </div>
    </div>
  );
}

function SvgRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  const threshold = Math.max(3, resource.completionThreshold);
  const { elapsed, start } = useElapsedTimer(true, threshold, onComplete);

  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load SVG from backend.
  useEffect(() => {
    let cancelled = false;
    setSvgMarkup(null);
    setError(null);
    fetch(resource.url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((txt) => {
        if (cancelled) return;
        const trimmed = txt.trim();
        if (!trimmed.toLowerCase().startsWith('<svg') && !trimmed.toLowerCase().includes('<svg')) {
          throw new Error('Response is not an SVG document.');
        }
        setSvgMarkup(trimmed);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message || 'Could not load SVG.');
      });
    return () => { cancelled = true; };
  }, [resource.url]);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = React.useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0, y: 0, scrollLeft: 0, scrollTop: 0,
  });

  // Non-passive wheel event listener registered directly on the container.
  // We only intercept/preventDefault when zooming (Ctrl / Cmd held down).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        setScale((s) => Math.max(0.25, Math.min(8, s * factor)));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent): void => {
    // Only drag with left mouse button click
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!isDragging) return;
    const el = containerRef.current;
    if (!el) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    el.scrollLeft = dragStartRef.current.scrollLeft - dx;
    el.scrollTop = dragStartRef.current.scrollTop - dy;
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    if (!isDragging) return;
    setIsDragging(false);
    const el = containerRef.current;
    if (el) {
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };

  const reset = (): void => {
    setScale(1);
    const el = containerRef.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  };

  return (
    <div className="space-y-2">
      <HeaderRow
        resource={resource}
        completed={completed}
        children={
          <span className="text-[11px] text-ink-soft font-mono">
            {elapsed}s / {threshold}s
          </span>
        }
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
          <span>Ctrl+Scroll to zoom · Drag to pan</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.25, s / 1.15))}
            className="text-[10px] text-ink-soft hover:text-ink border border-border px-1.5 py-0.5 rounded bg-bg-card hover:bg-bg-pill transition-colors"
          >
            Zoom Out
          </button>
          <span className="text-[10px] text-ink-soft font-mono w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(8, s * 1.15))}
            className="text-[10px] text-ink-soft hover:text-ink border border-border px-1.5 py-0.5 rounded bg-bg-card hover:bg-bg-pill transition-colors"
          >
            Zoom In
          </button>
          <button
            type="button"
            onClick={reset}
            className="text-[10px] text-ink-soft hover:text-ink underline ml-1"
          >
            Reset
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="rounded-lg border border-border bg-bg overflow-auto select-none"
        style={{ height: '24rem', cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseEnter={start}
        onTouchStart={start}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          style={{
            width: `${100 * scale}%`,
            transition: 'width 0.1s ease-out',
            display: 'block',
          }}
          dangerouslySetInnerHTML={{
            __html: svgMarkup ? wrapSvgForContainer(svgMarkup) : '',
          }}
        />
      </div>
      {!svgMarkup && !error && (
        <p className="text-[11px] text-ink-soft text-center py-4">Loading SVG…</p>
      )}
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p>Inline preview unavailable: {error}</p>
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent underline mt-1 inline-block"
          >
            Open SVG in new tab
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * wrapSvgForContainer — takes the raw SVG markup returned by the
 * backend and prepends a CSS transform that scales / pans it
 * according to the current zoom/pan state. We don't need to
 * post-process the <svg> element itself — its viewBox already
 * encodes aspect ratio. The wrapping transform is what we control.
 *
 * We embed the responsive sizing + transform in the SVG root's
 * style attribute so it works the moment React commits the DOM, no
 * follow-up effect needed. The .yaksha-svg-pan class is included
 * for any stylesheet-level hooks a future design pass might want;
 * it does nothing on its own today.
 */
function wrapSvgForContainer(svg: string): string {
  return svg.replace(
    /<svg\b([^>]*)>/,
    `<svg$1 class="yaksha-svg-pan" style="width: 100%; height: auto; display: block;">`,
  );
}

function MarkdownRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  const [body, setBody] = useState<string>('');
  const threshold = Math.max(5, resource.completionThreshold);
  const { elapsed, start } = useElapsedTimer(true, threshold, onComplete);

  useEffect(() => {
    let cancelled = false;
    fetch(resource.url)
      .then((r) => r.text())
      .then((txt) => { if (!cancelled) setBody(txt); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [resource.url]);

  return (
    <div className="space-y-2">
      <HeaderRow
        resource={resource}
        completed={completed}
        children={
          <span className="text-[11px] text-ink-soft font-mono">
            {elapsed}s / {threshold}s
          </span>
        }
      />
      <div
        className="rounded-lg border border-border bg-bg p-4 max-h-96 overflow-y-auto"
        onMouseEnter={start}
        onTouchStart={start}
      >
        <pre className="text-xs font-mono whitespace-pre-wrap">{body}</pre>
      </div>
    </div>
  );
}

function TxtRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  const [body, setBody] = useState<string>('');
  const threshold = Math.max(5, resource.completionThreshold);
  const { elapsed, start } = useElapsedTimer(true, threshold, onComplete);

  useEffect(() => {
    let cancelled = false;
    fetch(resource.url)
      .then((r) => r.text())
      .then((txt) => { if (!cancelled) setBody(txt); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [resource.url]);

  return (
    <div className="space-y-2">
      <HeaderRow
        resource={resource}
        completed={completed}
        children={
          <span className="text-[11px] text-ink-soft font-mono">
            {elapsed}s / {threshold}s
          </span>
        }
      />
      <div
        className="rounded-lg border border-border bg-bg p-4 max-h-96 overflow-y-auto"
        onMouseEnter={start}
        onTouchStart={start}
      >
        <pre className="text-xs whitespace-pre-wrap">{body}</pre>
      </div>
    </div>
  );
}

function LinkRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <HeaderRow resource={resource} completed={completed} />
      <div className="flex items-center gap-3">
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-md bg-accent text-white text-xs font-semibold"
        >
          Open external link
        </a>
        {!completed && (
          <button
            type="button"
            onClick={() => onComplete(0)}
            className="px-3 py-2 rounded-md border border-border text-ink-soft hover:bg-mist text-xs"
          >
            Mark as read
          </button>
        )}
      </div>
    </div>
  );
}

function UnsupportedRow({ resource }: { resource: Resource }): React.ReactElement {
  return (
    <HeaderRow resource={resource} completed={false}>
      <p className="text-xs text-ink-soft">No viewer available for this kind.</p>
    </HeaderRow>
  );
}