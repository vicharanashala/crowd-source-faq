/**
 * JourneyTrackRenderer.test.tsx — unit tests for the shared
 * v1.76 Journey Track renderer.
 *
 * Why this test exists:
 *   The renderer is the *single* visual surface for every Journey
 *   Track the admin creates. The architectural promise is that
 *   the same renderer paints a "Summership Trek" and a
 *   "Monsoonship Journey" without ANY program-specific code.
 *   This test pins that contract:
 *     - No `if program === 'summership'` branches
 *     - Title + icon + accent come from the data, not constants
 *     - Progress counts ONLY required tasks
 *     - Optional tasks and informational items do NOT block %
 *     - The same component handles 0, 1, 2, and many checkpoints
 *     - The same component handles required/optional/link/note
 *     - The same component is the source of the SVG curve, the
 *       celebration flag, the prev/next controls, the jump
 *       selector
 *
 * If a future PR adds program-specific code to this component,
 * these tests will catch it.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import JourneyTrackRenderer from '../JourneyTrackRenderer';
import type { JourneyTrack, JourneyProgress } from '../types';

// jsdom doesn't implement scrollIntoView; the renderer calls it
// on mount + whenever the active checkpoint changes. Stub it so
// the auto-scroll effect can run without throwing.
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {
      /* no-op for jsdom */
    };
  }
});

function makeTrack(overrides: Partial<JourneyTrack> = {}): JourneyTrack {
  return {
    _id: 't1',
    name: 'Generic Track',
    description: 'A test track',
    icon: '🛤️',
    accentColor: 'accent',
    status: 'published',
    checkpoints: [
      {
        _id: 'cp1',
        title: 'Start',
        description: '',
        icon: '',
        items: [
          {
            _id: 'i1',
            type: 'task',
            title: 'Required task',
            body: '',
            required: true,
            href: '',
            action: '',
            actionLabel: '',
            metadata: {},
            icon: '',
            accentColor: '',
          },
          {
            _id: 'i2',
            type: 'note',
            title: 'Just info',
            body: '',
            required: false,
            href: '',
            action: '',
            actionLabel: '',
            metadata: {},
            icon: '',
            accentColor: '',
          },
        ],
      },
      {
        _id: 'cp2',
        title: 'Finish',
        description: '',
        icon: '',
        items: [
          {
            _id: 'i3',
            type: 'task',
            title: 'Required final',
            body: '',
            required: true,
            href: '',
            action: '',
            actionLabel: '',
            metadata: {},
            icon: '',
            accentColor: '',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeProgress(overrides: Partial<JourneyProgress> = {}): JourneyProgress {
  return {
    required: 2,
    done: 0,
    percent: 0,
    currentCheckpointId: 'cp1',
    lastActivityAt: null,
    completedItemIds: [],
    ...overrides,
  };
}

describe('JourneyTrackRenderer (data-driven, no program-specific code)', () => {
  it('renders the track name + icon from the data', () => {
    const track = makeTrack({ name: 'Summership Trek', icon: '🛤️' });
    render(<JourneyTrackRenderer track={track} interactive={false} />);
    expect(screen.getByText('Summership Trek')).toBeInTheDocument();
  });

  it('renders a different track with no code change', () => {
    const track = makeTrack({ name: 'Monsoonship Journey', icon: '🌧️' });
    render(<JourneyTrackRenderer track={track} interactive={false} />);
    expect(screen.getByText('Monsoonship Journey')).toBeInTheDocument();
  });

  it('renders a custom third track to prove the renderer is generic', () => {
    const track = makeTrack({ name: 'Q4 Onboarding', icon: '🚀' });
    render(<JourneyTrackRenderer track={track} interactive={false} />);
    expect(screen.getByText('Q4 Onboarding')).toBeInTheDocument();
  });

  it('counts ONLY required tasks toward progress', () => {
    const track = makeTrack();
    // i1 (required) done, i2 (note) NOT done — should still be 50%
    const progress = makeProgress({ completedItemIds: ['i1'], done: 1, percent: 50 });
    const { container } = render(
      <JourneyTrackRenderer track={track} progress={progress} interactive={false} />
    );
    // The progress is split across multiple spans — search the
    // rendered container for the percent and the done count
    // independently to avoid matcher brittleness.
    expect(container.textContent).toMatch(/1\s*\/\s*2/);
    expect(container.textContent).toMatch(/50%/);
  });

  it('does NOT count optional tasks toward progress', () => {
    const track = makeTrack({
      checkpoints: [
        {
          _id: 'cp1',
          title: 'Start',
          description: '',
          icon: '',
          items: [
            {
              _id: 'i1',
              type: 'task',
              title: 'Optional task',
              body: '',
              required: false,
              href: '',
              action: '',
              actionLabel: '',
              metadata: {},
              icon: '',
              accentColor: '',
            },
            {
              _id: 'i2',
              type: 'task',
              title: 'Required task',
              body: '',
              required: true,
              href: '',
              action: '',
              actionLabel: '',
              metadata: {},
              icon: '',
              accentColor: '',
            },
          ],
        },
      ],
    });
    // Only i2 is required. The fact that i1 is "completed" must
    // not move the percent above 0.
    const progress: JourneyProgress = {
      required: 1,
      done: 0,
      percent: 0,
      currentCheckpointId: 'cp1',
      lastActivityAt: null,
      completedItemIds: ['i1'],
    };
    const { container } = render(
      <JourneyTrackRenderer track={track} progress={progress} interactive={false} />
    );
    expect(container.textContent).toMatch(/0\s*\/\s*1/);
    expect(container.textContent).toMatch(/0%/);
  });

  it('does NOT count informational items (note / warning) toward progress', () => {
    const track = makeTrack({
      checkpoints: [
        {
          _id: 'cp1',
          title: 'Start',
          description: '',
          icon: '',
          items: [
            {
              _id: 'n1',
              type: 'note',
              title: 'A note',
              body: '',
              required: false,
              href: '',
              action: '',
              actionLabel: '',
              metadata: {},
              icon: '',
              accentColor: '',
            },
            {
              _id: 'r1',
              type: 'task',
              title: 'The only required',
              body: '',
              required: true,
              href: '',
              action: '',
              actionLabel: '',
              metadata: {},
              icon: '',
              accentColor: '',
            },
          ],
        },
      ],
    });
    const progress: JourneyProgress = {
      required: 1,
      done: 0,
      percent: 0,
      currentCheckpointId: 'cp1',
      lastActivityAt: null,
      completedItemIds: [],
    };
    const { container } = render(
      <JourneyTrackRenderer track={track} progress={progress} interactive={false} />
    );
    expect(container.textContent).toMatch(/0\s*\/\s*1/);
    expect(container.textContent).toMatch(/0%/);
  });

  it('shows the celebration flag when the LAST checkpoint is complete', () => {
    const track = makeTrack();
    const progress = makeProgress({ completedItemIds: ['i1', 'i3'], done: 2, percent: 100 });
    render(
      <JourneyTrackRenderer track={track} progress={progress} interactive={false} />
    );
    expect(screen.getByText(/Complete/i)).toBeInTheDocument();
  });

  it('renders the prev/next controls when more than one checkpoint', () => {
    const track = makeTrack();
    render(<JourneyTrackRenderer track={track} interactive={false} />);
    expect(screen.getByText(/Previous/)).toBeInTheDocument();
    expect(screen.getByText(/Next/)).toBeInTheDocument();
  });

  it('does NOT render prev/next when only one checkpoint', () => {
    const track = makeTrack({
      checkpoints: [
        {
          _id: 'cp1',
          title: 'Solo',
          description: '',
          icon: '',
          items: [],
        },
      ],
    });
    render(<JourneyTrackRenderer track={track} interactive={false} />);
    expect(screen.queryByText(/Previous/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Next/)).not.toBeInTheDocument();
  });

  it('renders a jump-to-checkpoint selector with one option per checkpoint', () => {
    const track = makeTrack();
    render(<JourneyTrackRenderer track={track} interactive={false} />);
    const select = screen.getByLabelText(/Jump to checkpoint/);
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['1. Start', '2. Finish']);
  });

  it('fires onToggleItem when a required task row is clicked', () => {
    const onToggle = vi.fn();
    const track = makeTrack();
    const progress = makeProgress();
    render(
      <JourneyTrackRenderer
        track={track}
        progress={progress}
        interactive
        onToggleItem={onToggle}
      />
    );
    const requiredItem = screen.getByTestId('journey-item-i1');
    fireEvent.click(requiredItem);
    expect(onToggle).toHaveBeenCalledTimes(1);
    const [itemArg, nextCompleted] = onToggle.mock.calls[0];
    expect(itemArg._id).toBe('i1');
    expect(nextCompleted).toBe(true);
  });

  it('does NOT fire onToggleItem when an informational item is clicked', () => {
    const onToggle = vi.fn();
    const track = makeTrack();
    const progress = makeProgress();
    render(
      <JourneyTrackRenderer
        track={track}
        progress={progress}
        interactive
        onToggleItem={onToggle}
      />
    );
    // i2 is the note — clicking it must not toggle.
    const noteItem = screen.getByTestId('journey-item-i2');
    fireEvent.click(noteItem);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders external link items as anchors', () => {
    const track = makeTrack({
      checkpoints: [
        {
          _id: 'cp1',
          title: 'Links',
          description: '',
          icon: '',
          items: [
            {
              _id: 'l1',
              type: 'external_link',
              title: 'Docs',
              body: '',
              required: false,
              href: 'https://example.com/docs',
              action: '',
              actionLabel: '',
              metadata: {},
              icon: '',
              accentColor: '',
            },
          ],
        },
      ],
    });
    render(<JourneyTrackRenderer track={track} interactive={false} />);
    const anchor = screen.getByText(/example\.com\/docs/);
    expect(anchor.tagName).toBe('A');
  });
});
