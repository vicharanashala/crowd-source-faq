/**
 * VoiceInputButton — reusable mic button that converts speech to text
 * via the browser's native Web Speech API.
 *
 * Usage:
 *   <VoiceInputButton onTranscript={(text) => setQuery(text)} />
 *
 * Features:
 *   - Audio waveform ring: real-time scale/opacity ring driven by micLevel.
 *   - Language toggle (EN ↔ HI) displayed when the API is supported.
 *   - Keyboard accessible: Space/Enter toggle, dynamic aria-label,
 *     aria-pressed, and an aria-live region for screen readers.
 *   - Silence auto-stop (configurable via the hook's silenceTimeoutMs).
 *   - Reduced-motion respect: checks prefers-reduced-motion and swaps
 *     the animated ring for a static indicator.
 *   - Graceful inline error messages for unsupported browsers / denied mic.
 *   - Zero new dependencies — uses only Web Speech API + Web Audio API.
 *
 * Tailwind classes follow the project's existing token palette
 * (accent, ink-faint, danger, bg, border, mist, etc.).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useSpeechRecognition,
  type SpeechLang,
} from '../../hooks/useSpeechRecognition';

interface VoiceInputButtonProps {
  /** Called with the final recognised text (may include interim results). */
  onTranscript: (text: string) => void;
  /** Extra classes appended to the outermost wrapper. */
  className?: string;
  /** Disable the button (e.g. while a network request is in flight). */
  disabled?: boolean;
}

/** Inline SVG mic icon — matches the project's icon-weight convention. */
function MicIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

const LANG_LABELS: Record<SpeechLang, string> = {
  'en-IN': 'EN',
  'hi-IN': 'HI',
};

// ---------------------------------------------------------------------------
// Reduced-motion hook (minimal, zero deps)
// ---------------------------------------------------------------------------
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return reduced;
}

export default function VoiceInputButton({
  onTranscript,
  className = '',
  disabled = false,
}: VoiceInputButtonProps) {
  const {
    isListening,
    transcript,
    error,
    lang,
    isSupported,
    micLevel,
    start,
    stop,
    toggleLang,
    reset,
  } = useSpeechRecognition();

  const prefersReducedMotion = usePrefersReducedMotion();

  // Ref to avoid stale closures on `onTranscript`.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Push final transcript to the parent when listening stops.
  const prevListening = useRef(false);
  useEffect(() => {
    if (prevListening.current && !isListening && transcript) {
      onTranscriptRef.current(transcript);
      reset();
    }
    prevListening.current = isListening;
  }, [isListening, transcript, reset]);

  // Track previous listening state for aria-live announcements.
  const [announcement, setAnnouncement] = useState('');
  const prevListeningAria = useRef(false);
  useEffect(() => {
    if (!prevListeningAria.current && isListening) {
      setAnnouncement('Voice input started. Listening…');
    } else if (prevListeningAria.current && !isListening) {
      setAnnouncement(
        transcript
          ? 'Voice input stopped. Text captured.'
          : 'Voice input stopped.',
      );
    }
    prevListeningAria.current = isListening;
  }, [isListening, transcript]);

  const handleClick = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      reset();
      start();
    }
  }, [isListening, stop, reset, start]);

  // Keyboard handler — Space/Enter explicitly toggle, preventDefault on
  // Space to prevent page scroll.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  // Don't render anything in unsupported browsers — the feature just
  // silently disappears rather than showing a broken button.
  if (!isSupported) return null;

  // ── Volume ring styles ──────────────────────────────────────────────────
  // When reduced motion is on, show a static ring with fixed opacity.
  // Otherwise, drive scale + opacity from the real-time micLevel.
  const ringScale = prefersReducedMotion ? 1.35 : 1 + micLevel * 0.6;
  const ringOpacity = prefersReducedMotion ? 0.35 : 0.15 + micLevel * 0.45;

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {/* Language toggle pill */}
      <button
        type="button"
        onClick={toggleLang}
        disabled={disabled}
        title={`Speech language: ${lang === 'en-IN' ? 'English (India)' : 'Hindi'}. Click to switch.`}
        aria-label={`Switch speech language to ${lang === 'en-IN' ? 'Hindi' : 'English'}`}
        className="px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide text-ink-faint hover:text-ink hover:bg-mist border border-transparent hover:border-border transition-all select-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {LANG_LABELS[lang]}
      </button>

      {/* Mic button */}
      <div className="relative">
        {/* Volume-reactive ring (or static ring for reduced-motion) */}
        {isListening && (
          <span
            className="absolute inset-0 rounded-full bg-danger/30 pointer-events-none"
            style={{
              transform: `scale(${ringScale})`,
              opacity: ringOpacity,
              transition: prefersReducedMotion
                ? 'none'
                : 'transform 80ms ease-out, opacity 80ms ease-out',
            }}
          />
        )}
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          title={isListening ? 'Stop listening' : 'Speak your question'}
          aria-label={isListening ? 'Listening… Click to stop voice input' : 'Start voice input'}
          aria-pressed={isListening}
          className={`
            relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center
            transition-all duration-200 ease-smooth
            disabled:opacity-40 disabled:cursor-not-allowed
            ${
              isListening
                ? 'bg-danger text-white shadow-md shadow-danger/30 scale-105'
                : 'bg-accent/10 border border-accent/20 text-accent hover:bg-accent/15 active:scale-95'
            }
          `}
        >
          {isListening ? (
            /* Stop icon (square) while recording */
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <MicIcon />
          )}
        </button>
      </div>

      {/* Visually-hidden aria-live region for screen-reader announcements */}
      <span
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {announcement}
      </span>

      {/* Inline error — appears briefly then the user can retry. */}
      {error && (
        <span className="text-[10px] text-danger max-w-[160px] leading-tight animate-fade-in">
          {error}
        </span>
      )}

      {/* Live interim transcript indicator */}
      {isListening && transcript && (
        <span className="text-[10px] text-ink-soft italic max-w-[120px] truncate animate-fade-in">
          {transcript}
        </span>
      )}
    </div>
  );
}
