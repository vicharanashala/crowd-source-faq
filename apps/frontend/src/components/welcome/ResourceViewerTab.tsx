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
import { createPortal } from 'react-dom';
import { useProgram } from '../../context/ProgramContext';
import { resolveAssetUrl } from '../../utils/publicUrl';
import { inlineDangerBanner, communityToastWarn, warningBorder } from '../../styles/style_config';

type ResourceKind = 'video' | 'pdf' | 'pptx' | 'svg' | 'markdown' | 'txt' | 'link';

interface Resource {
  _id: string;
  kind: ResourceKind;
  title: string;
  description: string;
  url: string;
  completionThreshold: number;
  publicId?: string | null;
  pageCount?: number | null;
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

// 1.4 (MEDIUM) — admin-supplied resource URLs go into <a href>,
// <iframe src>, <video src>, <img src>, and fetch(). A `javascript:`
// scheme in any of those becomes an XSS sink (the `rel="noopener
// noreferrer"` attribute does NOT stop `javascript:` in an anchor).
// Reject anything that isn't a safe http(s)/blob/data URL and have
// the row components render a fallback card when this returns null.
function safeResourceUrl(value: string | undefined | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  // Allow http(s), mailto, blob (rare but legitimate), and data: for
  // small embedded resources. Block everything else — most importantly
  // javascript: and vbscript:.
  if (/^(\/(?!\/)|https?:|mailto:|blob:|data:image\/)/i.test(v)) return v;
  return null;
}

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
      const normalized = (resR.data || []).map((r) => ({
        ...r,
        url: resolveAssetUrl(r.url),
      }));
      setResources(normalized);
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
        <div className={inlineDangerBanner + ' text-sm rounded-lg px-4 py-2'}>{error}</div>
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
                completions[r._id] ? 'border-accent/30 bg-accent/10' : 'border-border bg-bg/40'
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
  // 1.4 — sanitize the admin-supplied URL before any of the row
  // renderers consume it. If the URL is unsafe (e.g. javascript:),
  // surface an explicit "Unsupported URL scheme" card rather than
  // render the value into a DOM sink.
  const safeUrl = safeResourceUrl(resource.url);
  if (!safeUrl) {
    return (
      <div className="space-y-2">
        <HeaderRow resource={resource} completed={completed} />
        <div className={warningBorder}>
          <p>Unsupported URL scheme. Admins must publish resource URLs with an http(s) scheme.</p>
        </div>
      </div>
    );
  }
  const safeResource = { ...resource, url: safeUrl };
  switch (safeResource.kind) {
    case 'video':
      return <VideoRow resource={safeResource} completed={completed} onComplete={onComplete} />;
    case 'pdf':
      return <PdfRow resource={safeResource} completed={completed} onComplete={onComplete} />;
    case 'pptx':
      return <PptxRow resource={safeResource} completed={completed} onComplete={onComplete} />;
    case 'svg':
      return <SvgRow resource={safeResource} completed={completed} onComplete={onComplete} />;
    case 'markdown':
      return <MarkdownRow resource={safeResource} completed={completed} onComplete={onComplete} />;
    case 'txt':
      return <TxtRow resource={safeResource} completed={completed} onComplete={onComplete} />;
    case 'link':
      return <LinkRow resource={safeResource} completed={completed} onComplete={onComplete} />;
    default:
      return <UnsupportedRow resource={safeResource} />;
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
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
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
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = resource.pageCount || 1;

  // Start the viewing timer on mount for custom viewer
  useEffect(() => {
    start();
  }, [start]);

  const buildPageUrl = (url: string, pageNum: number) => {
    const base = url.replace(/\.pdf$/i, '.png');
    const marker = '/upload/';
    const idx = base.indexOf(marker);
    if (idx === -1) return base;
    return `${base.slice(0, idx + marker.length)}pg_${pageNum}/${base.slice(idx + marker.length)}`;
  };

  const handlePrev = () => {
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  const handleNext = () => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  };

  const isCloudinary = !!(resource.publicId && resource.url.startsWith('https://res.cloudinary.com/'));

  if (!isCloudinary) {
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

  return (
    <div className="space-y-3">
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
        className="relative flex flex-col items-center rounded-xl border border-border bg-card shadow-lg overflow-hidden"
        onMouseEnter={start}
        onTouchStart={start}
      >
        {/* Main Document Page Image */}
        <div className="w-full flex items-center justify-center p-6 bg-mist/10 min-h-[500px] sm:min-h-[600px]">
          <img
            key={currentPage}
            src={buildPageUrl(resource.url, currentPage)}
            alt={`${resource.title} - Page ${currentPage}`}
            className="max-h-[700px] w-auto object-contain rounded-md shadow-md border border-border/50 select-none transition-all duration-300"
          />
        </div>

        {/* Navigation & Controls */}
        <div className="w-full border-t border-border/80 px-4 py-3 bg-[rgb(var(--bg-primary-rgb))]/90 backdrop-blur-md flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentPage === 1}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border/60 hover:bg-mist/40 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Prev
          </button>

          <div className="flex items-center gap-2">
            <select
              value={currentPage}
              onChange={(e) => setCurrentPage(Number(e.target.value))}
              className="bg-bg border border-border/80 rounded-md px-2.5 py-1 text-xs font-semibold font-mono text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {Array.from({ length: totalPages }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Page {i + 1}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-soft">
              of {totalPages}
            </span>
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border/60 hover:bg-mist/40 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all"
          >
            Next
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>
        </div>
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

  const [imgError, setImgError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [containerHeight, setContainerHeight] = useState<string>('24rem');

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const expandedContainerRef = React.useRef<HTMLDivElement | null>(null);

  const dragStartRef = React.useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0, y: 0, scrollLeft: 0, scrollTop: 0,
  });

  // Calculate and apply optimal scale/height to fit width of container
  const fitWidth = useCallback(() => {
    if (!dimensions) return;
    const container = isExpanded ? expandedContainerRef.current : containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    const targetWidth = containerWidth - 32;
    const targetScale = targetWidth / dimensions.width;
    
    setScale(targetScale);
    
    if (!isExpanded) {
      const targetHeight = dimensions.height * targetScale;
      // Cap height between 320px and 720px
      const finalHeight = Math.min(720, Math.max(320, targetHeight));
      setContainerHeight(`${finalHeight}px`);
    }
    
    container.scrollLeft = 0;
    container.scrollTop = 0;
  }, [dimensions, isExpanded]);

  // Recalculate optimal width-fitting scale on resize or fullscreen toggle
  useEffect(() => {
    if (dimensions) {
      const timer = setTimeout(() => {
        fitWidth();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isExpanded, dimensions, fitWidth]);

  // Non-passive wheel event listener for Ctrl+Scroll zoom on both containers.
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        setScale((s) => Math.max(0.1, Math.min(8, s * factor)));
      }
    };

    const el1 = containerRef.current;
    if (el1) el1.addEventListener('wheel', handleWheel, { passive: false });

    const el2 = expandedContainerRef.current;
    if (el2) el2.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      if (el1) el1.removeEventListener('wheel', handleWheel);
      if (el2) el2.removeEventListener('wheel', handleWheel);
    };
  }, [isExpanded]);

  const onPointerDownGeneric = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement | null>): void => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX, y: e.clientY,
      scrollLeft: el.scrollLeft, scrollTop: el.scrollTop,
    };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMoveGeneric = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement | null>): void => {
    if (!isDragging) return;
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = dragStartRef.current.scrollLeft - (e.clientX - dragStartRef.current.x);
    el.scrollTop = dragStartRef.current.scrollTop - (e.clientY - dragStartRef.current.y);
  };

  const onPointerUpGeneric = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement | null>): void => {
    if (!isDragging) return;
    setIsDragging(false);
    const el = ref.current;
    if (el) {
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth || img.clientWidth || 800;
    const h = img.naturalHeight || img.clientHeight || 400;
    setDimensions({ width: w, height: h });
  };

  const handleDoubleClick = () => {
    if (!dimensions) return;
    const container = isExpanded ? expandedContainerRef.current : containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    const targetWidth = containerWidth - 32;
    const fitScale = targetWidth / dimensions.width;

    // Toggle between fit-to-width and 1.25x zoom for details
    if (Math.abs(scale - fitScale) < 0.05) {
      setScale(1.25);
    } else {
      setScale(fitScale);
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
          <span>Double-click image to zoom · Ctrl+Scroll to zoom {scale !== 1 ? `· ${Math.round(scale * 100)}%` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.1, s / 1.15))}
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
            onClick={fitWidth}
            className="text-[10px] text-ink-soft hover:text-ink underline ml-1"
          >
            Fit Width
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-1 text-[10px] text-accent hover:underline ml-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6"/>
              <path d="M9 21H3v-6"/>
              <path d="M21 3l-7 7M3 21l7-7"/>
            </svg>
            Fullscreen
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="rounded-lg border border-border bg-bg overflow-auto select-none relative flex items-center justify-center"
        style={{
          height: containerHeight,
          cursor: isDragging ? 'grabbing' : 'grab',
          backgroundImage: 'radial-gradient(rgba(100, 110, 120, 0.08) 1.2px, transparent 0)',
          backgroundSize: '16px 16px',
          transition: 'height 0.2s ease-out',
        }}
        onMouseEnter={start}
        onTouchStart={start}
        onPointerDown={(e) => onPointerDownGeneric(e, containerRef)}
        onPointerMove={(e) => onPointerMoveGeneric(e, containerRef)}
        onPointerUp={(e) => onPointerUpGeneric(e, containerRef)}
        onPointerCancel={(e) => onPointerUpGeneric(e, containerRef)}
      >
        <div
          style={{
            minWidth: '100%',
            minHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            boxSizing: 'border-box',
          }}
        >
          {imgError ? null : (
            <img
              src={resource.url}
              alt={resource.title}
              onLoad={handleImageLoad}
              onDoubleClick={handleDoubleClick}
              style={dimensions ? {
                width: `${dimensions.width * scale}px`,
                height: `${dimensions.height * scale}px`,
                display: 'block',
                transition: 'width 0.1s ease-out, height 0.1s ease-out',
                userSelect: 'none',
                maxWidth: 'none',
              } : {
                maxWidth: '100%',
                maxHeight: '100%',
                display: 'block',
              }}
              onError={() => setImgError('Could not load SVG from Cloudinary.')}
            />
          )}
        </div>
      </div>

      {imgError && (
        <div className={communityToastWarn + ' rounded-lg px-3 py-2 text-xs'}>
          <p>Inline preview unavailable: {imgError}</p>
          <a href={resource.url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-accent underline mt-1 inline-block">
            Open SVG in new tab
          </a>
        </div>
      )}

      {/* Fullscreen Overlay Modal */}
      {isExpanded && createPortal(
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[9999] flex flex-col p-4 md:p-6 select-none">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{resource.title}</h3>
              <p className="text-xs text-zinc-400">Drag to pan · Double-click to zoom · Scroll to zoom</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-white/5 rounded-lg border border-white/10 p-1">
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.max(0.1, s / 1.15))}
                  className="p-1.5 hover:bg-white/10 rounded text-zinc-300 hover:text-white transition-colors"
                  title="Zoom Out"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
                <span className="text-xs font-mono text-zinc-300 w-12 text-center select-none">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.min(8, s * 1.15))}
                  className="p-1.5 hover:bg-white/10 rounded text-zinc-300 hover:text-white transition-colors"
                  title="Zoom In"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={fitWidth}
                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-all active:scale-95"
              >
                Fit Width
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="p-2 bg-white/10 hover:bg-red-500/20 hover:text-red-400 rounded-full text-zinc-300 transition-all active:scale-95"
                title="Close Fullscreen"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={expandedContainerRef}
            className="flex-1 w-full bg-zinc-950/60 rounded-xl border border-white/10 overflow-auto relative select-none flex items-center justify-center"
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1.2px, transparent 0)',
              backgroundSize: '20px 20px',
            }}
            onPointerDown={(e) => onPointerDownGeneric(e, expandedContainerRef)}
            onPointerMove={(e) => onPointerMoveGeneric(e, expandedContainerRef)}
            onPointerUp={(e) => onPointerUpGeneric(e, expandedContainerRef)}
            onPointerCancel={(e) => onPointerUpGeneric(e, expandedContainerRef)}
          >
            <div
              style={{
                minWidth: '100%',
                minHeight: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                boxSizing: 'border-box',
              }}
            >
              <img
                src={resource.url}
                alt={resource.title}
                onDoubleClick={handleDoubleClick}
                style={dimensions ? {
                  width: `${dimensions.width * scale}px`,
                  height: `${dimensions.height * scale}px`,
                  display: 'block',
                  transition: 'width 0.1s ease-out, height 0.1s ease-out',
                  userSelect: 'none',
                  maxWidth: 'none',
                } : {
                  maxWidth: '100%',
                  maxHeight: '100%',
                  display: 'block',
                }}
                onError={() => setImgError('Could not load SVG.')}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function TxtRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  const [body, setBody] = useState<string>('');
  // 1.3 (MEDIUM) — fetch() against a CDN may fail with a CORS error
  // that .then() never runs for, leaving the <pre> blank and the user
  // thinking the resource is empty. Track the failure so we can show
  // an "open in new tab" fallback (same UX PptxRow/SvgRow use).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const threshold = Math.max(5, resource.completionThreshold);
  const { elapsed, start } = useElapsedTimer(true, threshold, onComplete);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(resource.url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((txt) => { if (!cancelled) { setBody(txt); setLoading(false); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || 'Could not load this resource. The host may be blocking browser requests.');
        setLoading(false);
      });
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
      {loadError ? (
        // 1.3 — surface the CORS/network failure with a fallback link.
        // Same pattern as the existing SvgRow imgError fallback.
        <div className={warningBorder}>
          <p>Inline preview unavailable: {loadError}</p>
          <a href={resource.url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-accent underline mt-1 inline-block">
            Open text in new tab
          </a>
        </div>
      ) : (
        <div
          className="rounded-lg border border-border bg-bg p-4 max-h-96 overflow-y-auto"
          onMouseEnter={start}
          onTouchStart={start}
        >
          {loading ? (
            <p className="text-xs text-ink-faint">Loading…</p>
          ) : (
            <pre className="text-xs whitespace-pre-wrap">{body}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function MarkdownRow({ resource, completed, onComplete }: RowProps): React.ReactElement {
  const [body, setBody] = useState<string>('');
  // 1.3 (MEDIUM) — same CORS-failure fallback as TxtRow.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const threshold = Math.max(5, resource.completionThreshold);
  const { elapsed, start } = useElapsedTimer(true, threshold, onComplete);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(resource.url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((txt) => { if (!cancelled) { setBody(txt); setLoading(false); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || 'Could not load this resource. The host may be blocking browser requests.');
        setLoading(false);
      });
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
      {loadError ? (
        <div className={warningBorder}>
          <p>Inline preview unavailable: {loadError}</p>
          <a href={resource.url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-accent underline mt-1 inline-block">
            Open markdown in new tab
          </a>
        </div>
      ) : (
        <div
          className="rounded-lg border border-border bg-bg p-4 max-h-96 overflow-y-auto"
          onMouseEnter={start}
          onTouchStart={start}
        >
          {loading ? (
            <p className="text-xs text-ink-faint">Loading…</p>
          ) : (
            <pre className="text-xs whitespace-pre-wrap">{body}</pre>
          )}
        </div>
      )}
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