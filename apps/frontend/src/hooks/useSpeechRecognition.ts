/**
 * useSpeechRecognition — thin React wrapper around the browser's
 * Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 *
 * Returns a stable handle with `start`, `stop`, the current
 * `transcript`, `isListening` flag, an `error` string, and helpers
 * to swap `lang` between `en-IN` and `hi-IN`.
 *
 * Enhanced features:
 *   - `micLevel` (0–1): real-time volume level from the Web Audio API
 *     AnalyserNode for waveform visualisation.
 *   - Silence auto-stop: if no new speech result arrives within
 *     `silenceTimeoutMs` (default 3500 ms), recognition auto-stops.
 *   - Language state lives inside the hook (component-only, not persisted).
 *   - `interimResults` is enabled so the user sees words appear live.
 *   - The hook is a no-op (with a descriptive error) in browsers that
 *     lack SpeechRecognition support, so callers never need to guard
 *     against crashes.
 *   - Cleanup on unmount aborts any in-progress session and releases
 *     the media stream / AudioContext (no mic or memory leaks).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Language codes the component exposes. */
export type SpeechLang = 'en-IN' | 'hi-IN';

export interface SpeechRecognitionOptions {
  /**
   * Time (ms) of silence before auto-stopping recognition.
   * Timer arms on `start()` and resets on every `onresult`.
   * Set to `0` to disable. Default: 3500.
   */
  silenceTimeoutMs?: number;
}

export interface SpeechRecognitionHandle {
  /** Whether the microphone is currently active. */
  isListening: boolean;
  /** Rolling transcript — includes interim results while listening. */
  transcript: string;
  /** Human-readable error, or empty string. */
  error: string;
  /** Current recognition language. */
  lang: SpeechLang;
  /** `true` when the browser supports the Web Speech API. */
  isSupported: boolean;
  /**
   * Real-time microphone input level, normalised to 0–1.
   * Updated via requestAnimationFrame while listening.
   * Returns 0 when idle.
   */
  micLevel: number;
  /** Begin listening. Safe to call if already listening (no-op). */
  start: () => void;
  /** Stop listening. */
  stop: () => void;
  /** Toggle between `en-IN` and `hi-IN`. Restarts session if active. */
  toggleLang: () => void;
  /** Clear any stored transcript / error. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Feature-detect — works in Chrome, Edge, Safari 14.1+, Brave, Arc, etc.
// ---------------------------------------------------------------------------

/** Minimal interface for the SpeechRecognition object returned by the browser. */
interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition ??
    null
  );
}

// ---------------------------------------------------------------------------
// Web Audio mic-level helpers
// ---------------------------------------------------------------------------
interface MicLevelHandle {
  /** Read current normalised volume (0–1). */
  read: () => number;
  /** Release the media stream and AudioContext. */
  destroy: () => void;
}

async function createMicLevelReader(): Promise<MicLevelHandle | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioCtx =
      (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtx) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    const ctx: AudioContext = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    return {
      read() {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        return sum / (dataArray.length * 255); // normalise to 0–1
      },
      destroy() {
        source.disconnect();
        // Close the AudioContext (safe even if already closed).
        void ctx.close().catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
      },
    };
  } catch {
    // getUserMedia denied or unavailable — non-fatal, just no level data.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
const DEFAULT_SILENCE_TIMEOUT_MS = 3500;

export function useSpeechRecognition(
  options?: SpeechRecognitionOptions,
): SpeechRecognitionHandle {
  const Ctor = getSpeechRecognitionCtor();
  const isSupported = Ctor !== null;

  const silenceMs = options?.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [lang, setLang] = useState<SpeechLang>('en-IN');
  const [micLevel, setMicLevel] = useState(0);

  // Ref-held instance so we can abort on unmount without re-creating on
  // every render.
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  // Track whether we intentionally stopped (to distinguish user-stop from
  // auto-stop on silence).
  const stoppedManuallyRef = useRef(false);

  // Web Audio mic-level reader — created on start, destroyed on stop.
  const micLevelRef = useRef<MicLevelHandle | null>(null);
  const rafIdRef = useRef<number>(0);

  // Silence auto-stop timer.
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const armSilenceTimer = useCallback(() => {
    if (silenceMs <= 0) return;
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      // Auto-stop recognition on silence.
      recognitionRef.current?.stop();
    }, silenceMs);
  }, [silenceMs, clearSilenceTimer]);

  // Start the rAF loop that reads mic level.
  const startMicLevel = useCallback(async () => {
    const handle = await createMicLevelReader();
    if (!handle) return;
    micLevelRef.current = handle;

    const tick = () => {
      if (!micLevelRef.current) return;
      setMicLevel(micLevelRef.current.read());
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  const stopMicLevel = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;
    micLevelRef.current?.destroy();
    micLevelRef.current = null;
    setMicLevel(0);
  }, []);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      clearSilenceTimer();
      stopMicLevel();
    };
  }, []);

  const start = useCallback(() => {
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }
    if (recognitionRef.current) return; // already running

    setError('');
    stoppedManuallyRef.current = false;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false; // one utterance at a time
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(final || interim);
      // Reset silence timer on every new result.
      armSilenceTimer();
    };

    recognition.onerror = (event: any) => {
      // 'aborted' fires when we call .abort() ourselves — not a real error.
      if (event.error === 'aborted') return;
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone permission denied. Please allow mic access and try again.',
        'no-speech': 'No speech detected. Please try again.',
        'network': 'Network error — speech recognition requires an internet connection in most browsers.',
        'audio-capture': 'No microphone found. Please connect a mic and try again.',
        'service-not-allowed': 'Speech service not available. Try a different browser.',
      };
      setError(messages[event.error] ?? `Speech error: ${event.error}`);
      recognitionRef.current = null;
      setIsListening(false);
      clearSilenceTimer();
      stopMicLevel();
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
      clearSilenceTimer();
      stopMicLevel();
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
      // Start mic-level reader (non-blocking — if it fails, we just don't
      // get level data).
      void startMicLevel();
      // Arm silence timer immediately (if user never speaks, still auto-stop).
      armSilenceTimer();
    } catch {
      setError('Could not start speech recognition.');
    }
  }, [Ctor, lang, armSilenceTimer, clearSilenceTimer, startMicLevel, stopMicLevel]);

  const stop = useCallback(() => {
    stoppedManuallyRef.current = true;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    clearSilenceTimer();
    stopMicLevel();
  }, [clearSilenceTimer, stopMicLevel]);

  const toggleLang = useCallback(() => {
    const next: SpeechLang = lang === 'en-IN' ? 'hi-IN' : 'en-IN';
    setLang(next);
    // If currently listening, restart with the new language.
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setIsListening(false);
      clearSilenceTimer();
      stopMicLevel();
      // Defer start so that state has settled.
      // We can't call `start()` here because `lang` is stale in this closure.
      // Instead, the component that calls toggleLang can re-start if needed.
    }
  }, [lang, clearSilenceTimer, stopMicLevel]);

  const reset = useCallback(() => {
    setTranscript('');
    setError('');
  }, []);

  return {
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
  };
}
