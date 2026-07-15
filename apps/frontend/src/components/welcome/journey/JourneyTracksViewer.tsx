/**
 * JourneyTracksViewer — the user-facing tab inside Welcome Package.
 *
 * v1.76 — Welcome Package: Journey Tracks.
 *
 * Layout:
 *   - 0 published assigned tracks → render the empty-state copy.
 *   - 1 published assigned track   → render the renderer directly.
 *   - >1 published assigned tracks → render a top-level track
 *     selector + the renderer for the selected one.
 *
 * The renderer is the same one used by the admin preview pane
 * — no program-specific code here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Spinner from '../../ui/Spinner';
import { friendlyError } from '../../../utils/api';
import JourneyTrackRenderer from './JourneyTrackRenderer';
import {
  askJourneyQuestion,
  completeJourneyItem,
  getMyJourney,
  listMyJourneys,
  uncompleteJourneyItem,
} from './api';
import type {
  JourneyItem,
  JourneyProgress,
  JourneySummary,
  JourneyTrack,
} from './types';

export default function JourneyTracksViewer(): React.ReactElement {
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // The currently-rendered track + progress. Fetched on demand
  // when the user picks a track (or the only one auto-loads).
  const [track, setTrack] = useState<JourneyTrack | null>(null);
  const [progress, setProgress] = useState<JourneyProgress | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);

  // Ask-the-AI-about-my-trek state. Lives in this tab because
  // it sources from journey tracks (not onboarding resources).
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState('');
  const [askTracksUsed, setAskTracksUsed] = useState(0);
  const [askBusy, setAskBusy] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const submitAsk = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = askQuestion.trim();
      if (!q) return;
      setAskBusy(true);
      setAskError(null);
      setAskAnswer('');
      setAskTracksUsed(0);
      try {
        const { answer, tracksUsed } = await askJourneyQuestion(q);
        setAskAnswer(answer);
        setAskTracksUsed(tracksUsed);
      } catch (err) {
        setAskError(friendlyError(err, 'Could not reach the AI. Try again.'));
      } finally {
        setAskBusy(false);
      }
    },
    [askQuestion]
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listMyJourneys();
      setJourneys(list);
      if (list.length > 0) {
        setActiveId((cur) => cur ?? list[0]._id);
      } else {
        setActiveId(null);
      }
    } catch (e) {
      setError(friendlyError(e, 'Could not load your journeys.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Load the active track + progress whenever the active id changes.
  useEffect(() => {
    if (!activeId) {
      setTrack(null);
      setProgress(null);
      return;
    }
    let cancelled = false;
    setTrackLoading(true);
    setError(null);
    (async () => {
      try {
        const { track: t, progress: p } = await getMyJourney(activeId);
        if (cancelled) return;
        setTrack(t);
        setProgress(p);
      } catch (e) {
        if (cancelled) return;
        setError(friendlyError(e, 'Could not load this journey.'));
      } finally {
        if (!cancelled) setTrackLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const handleToggle = useCallback(
    async (item: JourneyItem, nextCompleted: boolean) => {
      if (!track) return;
      // Optimistic update — flip the local state immediately so
      // the marker animates without a round-trip.
      setProgress((prev) => {
        if (!prev) return prev;
        const set = new Set(prev.completedItemIds);
        if (nextCompleted) set.add(item._id);
        else set.delete(item._id);
        const done = set.size;
        const required = prev.required;
        return {
          ...prev,
          completedItemIds: Array.from(set),
          done,
          percent: required === 0 ? 0 : Math.round((done / required) * 100),
        };
      });
      try {
        if (nextCompleted) {
          await completeJourneyItem(track._id, item._id);
        } else {
          await uncompleteJourneyItem(track._id, item._id);
        }
        // Re-fetch to keep server-side progress consistent.
        const { progress: fresh } = await getMyJourney(track._id);
        setProgress(fresh);
        // Also refresh the summary list so the % pill updates.
        const list = await listMyJourneys();
        setJourneys(list);
      } catch (e) {
        // Roll back on failure.
        setError(friendlyError(e, 'Could not update progress.'));
        const { progress: fresh } = await getMyJourney(track._id);
        setProgress(fresh);
      }
    },
    [track]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-2xl border border-danger/30 bg-danger-light px-4 py-3 text-sm text-danger"
      >
        {error}
      </div>
    );
  }

  if (journeys.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <span className="text-3xl" aria-hidden>
          🛤️
        </span>
        <h3 className="text-base font-bold text-ink mt-3">No journeys assigned yet</h3>
        <p className="text-sm text-ink-faint mt-1 max-w-md mx-auto">
          When an admin assigns you a Journey, it will show up here as a winding path
          with checkpoints, tasks, and progress. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Track selector when more than one is assigned */}
      {journeys.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-ink-faint font-semibold">
            Your journeys
          </span>
          {journeys.map((j) => {
            const active = j._id === activeId;
            return (
              <button
                key={j._id}
                type="button"
                onClick={() => setActiveId(j._id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-ink-soft hover:text-ink hover:bg-mist/40'
                }`}
                aria-pressed={active}
              >
                <span className="mr-1.5" aria-hidden>
                  {j.icon || '🛤️'}
                </span>
                {j.name}
                <span className="ml-1.5 text-[10px] text-ink-faint">
                  {j.percent}%
                </span>
              </button>
            );
          })}
        </div>
      )}

      {trackLoading && (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      )}

      {track && progress && (
        <JourneyTrackRenderer
          track={track}
          progress={progress}
          interactive
          onToggleItem={(item, next) => void handleToggle(item, next)}
        />
      )}

      {/* Ask the AI about your trek. Visible whenever the user
          has at least one journey — even if none are published,
          the endpoint returns a friendly "no journeys assigned"
          message rather than failing. Keeps the surface area
          consistent: the trek tab always shows its AI box the
          same way the orientation tab shows its AI box. */}
      {journeys.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <header>
            <h3 className="text-base font-bold text-ink">Ask the AI about your trek</h3>
            <p className="text-xs text-ink-soft mt-0.5">
              Questions about your assigned journeys, checkpoints, and tasks — answered
              using your trek content as context.
            </p>
          </header>
          <form onSubmit={submitAsk} className="space-y-2">
            <textarea
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              placeholder="What does Week 1 expect me to do?"
              rows={3}
              disabled={askBusy}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={askBusy || !askQuestion.trim()}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
            >
              {askBusy ? 'Asking…' : 'Ask'}
            </button>
          </form>
          {askError && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger"
            >
              {askError}
            </div>
          )}
          {askAnswer && (
            <div className="bg-bg/60 border border-border rounded-lg p-4 text-sm text-ink whitespace-pre-wrap">
              {askAnswer}
              {askTracksUsed > 0 && (
                <p className="text-[11px] text-ink-faint mt-2">
                  Sourced from {askTracksUsed} trek{askTracksUsed === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
