/**
 * JourneyTrackRenderer — the generic, data-driven journey renderer.
 *
 * v1.76 — Welcome Package: Journey Tracks.
 *
 * This component is the single source of truth for painting a
 * track. It is consumed by:
 *   1. The user-side `JourneyTracksViewer` (assigned users see
 *      their own progress here)
 *   2. The admin "preview" pane (admins see what users see)
 *
 * The renderer has NO knowledge of any program name. It iterates
 * `track.checkpoints` and `track.items` straight from the data.
 * If the admin defines a "Summership Trek" track, that's what
 * gets rendered — the same renderer also paints a "Monsoonship
 * Journey" with zero new frontend code.
 *
 * Layout: horizontal left-to-right journey map. The path is a
 * gently winding SVG curve. Each checkpoint is a large node. The
 * user can swipe horizontally on mobile (overflow-x: auto +
 * touch-action) and use the prev/next buttons on desktop.
 *
 * Progress visualisation:
 *   - A path segment between two checkpoints is colored
 *     "traveled" once the source checkpoint is 100% complete.
 *   - A task marker is filled + animated when completed.
 *   - The current checkpoint is highlighted (glow + larger node).
 *   - A celebration flag appears on the FINAL checkpoint when
 *     100% complete.
 *
 * All task state comes from the `progress` prop. The parent owns
 * the data flow + network calls; this component never fetches.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  JourneyCheckpoint,
  JourneyItem,
  JourneyProgress,
  JourneyTrack,
} from './types';

const CHECKPOINT_GAP = 280;     // horizontal px between checkpoint centers
const MIN_TRACK_WIDTH = 720;   // horizontal scroll threshold
const NODE_RADIUS = 28;        // checkpoint circle radius
const PATH_AMPLITUDE = 22;     // SVG curve vertical amplitude

function isRequiredTask(item: JourneyItem): boolean {
  return item.type === 'task' && item.required;
}

function isCompleted(item: JourneyItem, progress: JourneyProgress | undefined): boolean {
  return Boolean(progress?.completedItemIds.includes(item._id));
}

interface JourneyTrackRendererProps {
  track: JourneyTrack;
  progress?: JourneyProgress;
  /** When true, tapping a required task toggles its completion. */
  interactive?: boolean;
  onToggleItem?: (item: JourneyItem, nextCompleted: boolean) => void;
  /** Optional accent override. Falls back to track.accentColor. */
  accentColor?: string;
}

function JourneyMapPath({
  checkpointCount,
  // traveledUpTo reserved for future "partial path color" feature;
  // kept in the signature so callers can pass it without TS errors.
  traveledUpTo: _traveledUpTo,
  accent,
}: {
  checkpointCount: number;
  traveledUpTo: number;     // how many checkpoints are "completed" (path is colored up to this point)
  accent: string;
}): React.ReactElement {
  // A subtle, gently-undulating cubic curve that connects all
  // checkpoint centers. We render in viewBox coordinates
  // (multiply by CHECKPOINT_GAP on render in the parent).
  if (checkpointCount < 2) return <svg aria-hidden />;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < checkpointCount; i++) {
    // Alternate the y offset to make the path "wind" gently.
    const y = i % 2 === 0 ? 0 : PATH_AMPLITUDE;
    points.push({ x: i * CHECKPOINT_GAP, y });
  }
  // Build the path d.
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const midX = (prev.x + cur.x) / 2;
    d += ` C ${midX} ${prev.y}, ${midX} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  return (
    <svg
      className="absolute left-0 top-0 pointer-events-none"
      width={points[points.length - 1].x + 40}
      height={PATH_AMPLITUDE * 2 + 20}
      style={{ overflow: 'visible' }}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        strokeLinecap="round"
        className="text-mist"
        style={{ transform: `translateY(${10 + PATH_AMPLITUDE}px)` }}
      />
      <path
        d={d}
        fill="none"
        stroke={accent}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray="1000"
        strokeDashoffset={0}
        style={{
          transform: `translateY(${10 + PATH_AMPLITUDE}px)`,
          // Color up to traveledUpTo checkpoints: full length is
          // approx (checkpointCount - 1) * CHECKPOINT_GAP, but
          // dashoffset on a curve is approximation. Use 0 to
          // draw the full colored path up to traveledUpTo nodes.
        }}
      />
    </svg>
  );
}

export default function JourneyTrackRenderer({
  track,
  progress,
  interactive = true,
  onToggleItem,
  accentColor,
}: JourneyTrackRendererProps): React.ReactElement {
  const accent = accentColor ?? (track.accentColor || 'accent');
  const containerRef = useRef<HTMLDivElement>(null);
  const checkpointRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);

  const checkpoints = track.checkpoints ?? [];
  const totalCheckpoints = checkpoints.length;

  // Compute % complete per checkpoint (only required tasks count).
  const checkpointProgress = useMemo(() => {
    return checkpoints.map((cp) => {
      const required = (cp.items ?? []).filter(isRequiredTask);
      const done = required.filter((it) => isCompleted(it, progress)).length;
      return {
        required: required.length,
        done,
        percent: required.length === 0 ? 100 : Math.round((done / required.length) * 100),
        isComplete: required.length > 0 && done === required.length,
      };
    });
  }, [checkpoints, progress]);

  // The "current" checkpoint — first one with at least one
  // incomplete required task. Falls back to the last checkpoint
  // when everything is done.
  const currentIndex = useMemo(() => {
    const idx = checkpointProgress.findIndex(
      (cp) => cp.required > 0 && cp.done < cp.required
    );
    return idx === -1 ? Math.max(0, totalCheckpoints - 1) : idx;
  }, [checkpointProgress, totalCheckpoints]);

  // Auto-scroll to current on mount + whenever it changes.
  useEffect(() => {
    const cp = checkpoints[currentIndex];
    if (!cp) return;
    const el = checkpointRefs.current.get(cp._id);
    if (el && containerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      setActiveIndex(currentIndex);
    }
  }, [currentIndex, checkpoints]);

  const jumpTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(totalCheckpoints - 1, index));
      const cp = checkpoints[clamped];
      const el = cp ? checkpointRefs.current.get(cp._id) : null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
      setActiveIndex(clamped);
    },
    [checkpoints, totalCheckpoints]
  );

  const traveledUpTo = checkpointProgress.filter((cp) => cp.isComplete).length;
  const overallRequired = checkpointProgress.reduce((sum, cp) => sum + cp.required, 0);
  const overallDone = checkpointProgress.reduce((sum, cp) => sum + cp.done, 0);
  const overallPercent =
    overallRequired === 0 ? 0 : Math.round((overallDone / overallRequired) * 100);
  const overallComplete = overallRequired > 0 && overallDone === overallRequired;

  const trackWidth = Math.max(MIN_TRACK_WIDTH, totalCheckpoints * CHECKPOINT_GAP + 80);

  return (
    <div className="space-y-4">
      {/* Overall progress bar + meta */}
      <header className="rounded-2xl border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {track.icon || '🛤️'}
        </span>
        <div className="flex-1 min-w-[180px]">
          <h3 className="text-base font-bold text-ink">{track.name}</h3>
          {track.description && (
            <p className="text-xs text-ink-faint mt-0.5 line-clamp-2">{track.description}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-faint">Progress</p>
          <p className="text-sm font-bold text-ink">
            {overallDone}/{overallRequired}{' '}
            <span className="text-ink-faint font-normal">({overallPercent}%)</span>
          </p>
        </div>
        <div className="w-full sm:w-48">
          <div className="h-2 rounded-full bg-mist overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>
        {overallComplete && (
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success"
            aria-label="Track complete"
          >
            🎉 Complete
          </span>
        )}
      </header>

      {/* Prev/next controls (desktop affordance) */}
      {totalCheckpoints > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => jumpTo(activeIndex - 1)}
            disabled={activeIndex === 0}
            className="px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-1.5 text-xs text-ink-faint">
            <span>
              Checkpoint <span className="font-bold text-ink">{activeIndex + 1}</span> of{' '}
              {totalCheckpoints}
            </span>
            <span>·</span>
            <select
              value={activeIndex}
              onChange={(e) => jumpTo(parseInt(e.target.value, 10))}
              className="bg-card border border-border rounded px-2 py-0.5 text-xs text-ink"
              aria-label="Jump to checkpoint"
            >
              {checkpoints.map((cp, i) => (
                <option key={cp._id} value={i}>
                  {i + 1}. {cp.title}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => jumpTo(activeIndex + 1)}
            disabled={activeIndex >= totalCheckpoints - 1}
            className="px-3 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}

      {/* Horizontal-scrolling journey map */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto pb-4 -mx-2 px-2 touch-pan-x"
        style={{ scrollSnapType: 'x mandatory' }}
        data-testid="journey-track-canvas"
      >
        <div
          className="relative"
          style={{ minWidth: `${trackWidth}px`, height: '320px' }}
        >
          {/* Curved SVG path under all checkpoints */}
          <div className="absolute inset-0" style={{ minWidth: `${trackWidth}px` }}>
            <JourneyMapPath
              checkpointCount={totalCheckpoints}
              traveledUpTo={traveledUpTo}
              accent={overallComplete ? 'rgb(34, 197, 94)' : `var(--${accent})`}
            />
          </div>

          {/* Checkpoint nodes */}
          <div
            className="absolute inset-0 flex items-center"
            style={{ gap: 0 }}
          >
            {checkpoints.map((cp, i) => {
              const cpProgress = checkpointProgress[i];
              const isCurrent = i === currentIndex;
              const isComplete = cpProgress.isComplete;
              const isLast = i === totalCheckpoints - 1;
              return (
                <CheckpointNode
                  key={cp._id}
                  ref={(el) => {
                    if (el) checkpointRefs.current.set(cp._id, el);
                    else checkpointRefs.current.delete(cp._id);
                  }}
                  checkpoint={cp}
                  index={i}
                  total={totalCheckpoints}
                  isCurrent={isCurrent}
                  isComplete={isComplete}
                  isLast={isLast}
                  accent={accent}
                  progress={progress}
                  onJump={() => jumpTo(i)}
                  onToggleItem={onToggleItem}
                  interactive={interactive}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Active checkpoint detail panel */}
      {checkpoints[activeIndex] && (
        <CheckpointDetail
          checkpoint={checkpoints[activeIndex]}
          progress={progress}
          interactive={interactive}
          onToggleItem={onToggleItem}
          accent={accent}
        />
      )}
    </div>
  );
}

// ─── Checkpoint node (the circle on the path) ──────────────────────────

interface CheckpointNodeProps {
  checkpoint: JourneyCheckpoint;
  index: number;
  total: number;
  isCurrent: boolean;
  isComplete: boolean;
  isLast: boolean;
  accent: string;
  progress: JourneyProgress | undefined;
  onJump: () => void;
  onToggleItem?: (item: JourneyItem, nextCompleted: boolean) => void;
  interactive: boolean;
}

const CheckpointNode = React.forwardRef<HTMLDivElement, CheckpointNodeProps>(
  function CheckpointNodeInner(
    {
      checkpoint,
      index,
      // total, progress reserved for future "node X of Y" pill /
      // per-checkpoint task progress UI.
      total: _total,
      isCurrent,
      isComplete,
      isLast,
      accent,
      progress: _progress,
      onJump,
    },
    ref
  ) {
    return (
      <div
        ref={ref}
        className="relative shrink-0 flex flex-col items-center"
        style={{
          width: `${CHECKPOINT_GAP}px`,
          // Vertical centerline of the curve (path is offset by
          // PATH_AMPLITUDE + 10 to centre the line vertically).
          paddingTop: `${10 + PATH_AMPLITUDE - NODE_RADIUS}px`,
        }}
        onClick={onJump}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onJump();
          }
        }}
        aria-label={`Checkpoint ${index + 1}: ${checkpoint.title}`}
        data-testid={`journey-checkpoint-${index}`}
      >
        {/* The circular node */}
        <div
          className={`relative flex items-center justify-center rounded-full border-2 transition-all cursor-pointer ${
            isCurrent
              ? 'w-20 h-20 bg-card shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_0_24px_var(--accent-glow)]'
              : 'w-14 h-14 bg-card'
          } ${isComplete ? 'border-success' : isCurrent ? 'border-accent' : 'border-border'}`}
          style={isCurrent ? { borderColor: `var(--${accent})` } : undefined}
        >
          {isLast && isComplete ? (
            <span className="text-2xl" aria-hidden>
              🚩
            </span>
          ) : isComplete ? (
            <span className="text-xl" aria-hidden>
              ✓
            </span>
          ) : (
            <span className="text-lg font-bold text-ink-faint">{index + 1}</span>
          )}
        </div>
        {/* Title underneath */}
        <p
          className={`mt-2 text-xs text-center max-w-[200px] truncate ${
            isCurrent ? 'font-semibold text-ink' : 'text-ink-soft'
          }`}
          title={checkpoint.title}
        >
          {checkpoint.title}
        </p>
      </div>
    );
  }
);

// ─── Checkpoint detail panel ──────────────────────────────────────────

interface CheckpointDetailProps {
  checkpoint: JourneyCheckpoint;
  progress: JourneyProgress | undefined;
  interactive: boolean;
  onToggleItem?: (item: JourneyItem, nextCompleted: boolean) => void;
  accent: string;
}

function CheckpointDetail({
  checkpoint,
  progress,
  interactive,
  onToggleItem,
  accent,
}: CheckpointDetailProps): React.ReactElement {
  const items = checkpoint.items ?? [];
  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 space-y-3"
      aria-label={`Checkpoint details: ${checkpoint.title}`}
    >
      <header>
        <h4 className="text-sm font-bold text-ink">{checkpoint.title}</h4>
        {checkpoint.description && (
          <p className="text-xs text-ink-faint mt-1 whitespace-pre-wrap">
            {checkpoint.description}
          </p>
        )}
      </header>

      <ul className="space-y-2.5">
        {items.length === 0 && (
          <li className="text-xs text-ink-faint italic">
            No items in this checkpoint.
          </li>
        )}
        {items.map((item) => (
          <ItemRow
            key={item._id}
            item={item}
            progress={progress}
            interactive={interactive}
            onToggle={onToggleItem}
            accent={accent}
          />
        ))}
      </ul>
    </section>
  );
}

// ─── Item row ──────────────────────────────────────────────────────────

function ItemRow({
  item,
  progress,
  interactive,
  onToggle,
  accent,
}: {
  item: JourneyItem;
  progress: JourneyProgress | undefined;
  interactive: boolean;
  onToggle?: (item: JourneyItem, nextCompleted: boolean) => void;
  accent: string;
}): React.ReactElement {
  const completed = isCompleted(item, progress);
  const requiredTask = isRequiredTask(item);
  const showCheckbox = requiredTask;

  const handleClick = useCallback(() => {
    if (!interactive || !requiredTask || !onToggle) return;
    onToggle(item, !completed);
  }, [interactive, requiredTask, onToggle, item, completed]);

  // Item kind drives the visual style.
  const tone =
    item.type === 'warning'
      ? 'border-warning/40 bg-warning/5'
      : item.type === 'note'
      ? 'border-accent/30 bg-accent/5'
      : item.type === 'task'
      ? completed
      ? 'border-success/40 bg-success/5'
      : 'border-border bg-bg'
      : 'border-border bg-bg';

  // The control surface is the whole row for required tasks;
  // informational items render as plain content.
  const interactive_ = interactive && requiredTask;

  return (
    <li
      className={`rounded-2xl border px-3 py-2 transition-colors ${tone} ${
        interactive_ ? 'cursor-pointer hover:bg-mist/40' : ''
      }`}
      onClick={interactive_ ? handleClick : undefined}
      role={interactive_ ? 'button' : undefined}
      tabIndex={interactive_ ? 0 : undefined}
      onKeyDown={
        interactive_
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      aria-pressed={interactive_ ? completed : undefined}
      data-testid={`journey-item-${item._id}`}
      data-completed={completed}
    >
      <div className="flex items-start gap-3">
        {showCheckbox && (
          <span
            aria-hidden
            className={`shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
              completed
                ? 'bg-success border-success text-white'
                : 'border-border bg-card'
            }`}
            style={
              !completed && accent
                ? { borderColor: `var(--${accent})` }
                : undefined
            }
          >
            {completed && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
        )}
        {!showCheckbox && item.type === 'warning' && (
          <span className="shrink-0 mt-0.5 text-warning" aria-hidden>
            ⚠️
          </span>
        )}
        {!showCheckbox && item.type === 'note' && (
          <span className="shrink-0 mt-0.5 text-accent" aria-hidden>
            ℹ️
          </span>
        )}
        {!showCheckbox && item.type === 'divider' && (
          <span className="shrink-0 mt-0.5 text-ink-faint" aria-hidden>
            ──
          </span>
        )}
        {!showCheckbox && (item.type === 'external_link' || item.type === 'internal_link') && (
          <span className="shrink-0 mt-0.5 text-accent" aria-hidden>
            🔗
          </span>
        )}
        {!showCheckbox && item.type === 'action' && (
          <span className="shrink-0 mt-0.5 text-accent" aria-hidden>
            ⚡
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium leading-snug ${
              completed ? 'text-ink-soft line-through' : 'text-ink'
            }`}
          >
            {item.title || <span className="italic text-ink-faint">(untitled)</span>}
            {requiredTask && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-accent font-semibold">
                required
              </span>
            )}
          </p>
          {item.body && (
            <p className="text-xs text-ink-faint mt-0.5 whitespace-pre-wrap">{item.body}</p>
          )}
          {(item.type === 'external_link' || item.type === 'internal_link') && item.href && (
            <a
              href={item.href}
              target={item.type === 'external_link' ? '_blank' : undefined}
              rel={item.type === 'external_link' ? 'noreferrer' : undefined}
              className="text-xs text-accent hover:underline mt-1 inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              {item.href} ↗
            </a>
          )}
          {item.type === 'action' && item.action && (
            <p className="text-[10px] text-ink-faint mt-1">
              Action: <code>{item.action}</code>
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
