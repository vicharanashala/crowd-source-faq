import { useState, useRef, useEffect, useCallback } from 'react';

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: any) => any) | null;
  onerror: ((this: SpeechRecognition, ev: any) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface CustomWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}

// After this many ms of silence (no new speech), auto-stop.
const SILENCE_TIMEOUT_MS = 1200;

export interface UseVoiceTranscriptionOptions {
  /**
   * Fires on EVERY interim result with the current live text.
   * Use this to write directly to a DOM node (zero React render lag).
   */
  onInterimResult?: (liveText: string) => void;
  /**
   * Fired once when recognition ends with the final committed text.
   * Use this to auto-submit the search.
   */
  onSpeechEnd?: (finalText: string) => void;
  /**
   * Fired when an error occurs, with a human-readable message.
   */
  onError?: (message: string) => void;
}

export function useVoiceTranscription(options: UseVoiceTranscriptionOptions = {}) {
  const [isRecording,   setIsRecording]   = useState(false);
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [transcript,    setTranscript]    = useState<string | null>(null);

  const recognitionRef   = useRef<SpeechRecognition | null>(null);
  const micStreamRef     = useRef<MediaStream | null>(null);   // keep mic warm
  const finalAccRef      = useRef('');
  const silenceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef   = useRef(false);  // sync ref (no stale closure)

  // Stable callback refs
  const onInterimResultRef = useRef(options.onInterimResult);
  const onSpeechEndRef     = useRef(options.onSpeechEnd);
  const onErrorRef         = useRef(options.onError);
  useEffect(() => { onInterimResultRef.current = options.onInterimResult; }, [options.onInterimResult]);
  useEffect(() => { onSpeechEndRef.current     = options.onSpeechEnd;     }, [options.onSpeechEnd]);
  useEffect(() => { onErrorRef.current         = options.onError;         }, [options.onError]);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  };

  const stopAll = useCallback((commit = true) => {
    clearSilenceTimer();
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    // Release the mic stream so the browser stops showing the red dot
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setIsRecording(false);
    setIsProcessing(false);
    if (commit) {
      const final = finalAccRef.current.trim();
      if (final) {
        setTranscript(final);
        setTimeout(() => onSpeechEndRef.current?.(final), 60);
      }
    }
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    const win = window as unknown as CustomWindow;
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!Ctor) {
      onErrorRef.current?.('Voice search requires Google Chrome or Microsoft Edge. Please switch browsers.');
      return;
    }

    // ── Step 1: Request mic permission explicitly ─────────────────────────────
    // This shows the browser permission prompt if not already granted, AND
    // warms up the audio hardware so recognition starts faster.
    try {
      setIsProcessing(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // Keep the stream alive during the session so mic stays "warm"
      micStreamRef.current = stream;
    } catch (permErr) {
      setIsProcessing(false);
      const msg = (permErr as Error).name === 'NotAllowedError'
        ? 'Microphone access was denied. Please allow microphone access in your browser and try again.'
        : `Could not access microphone: ${(permErr as Error).message}`;
      onErrorRef.current?.(msg);
      return;
    }

    // Stop any existing recognition session
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    clearSilenceTimer();

    setTranscript(null);
    finalAccRef.current = '';
    isRecordingRef.current = true;

    // ── Step 2: Create and configure SpeechRecognition ───────────────────────
    const r = new Ctor();
    r.continuous      = true;   // keep listening across multiple sentences
    r.interimResults  = true;   // fire onresult on every partial word
    r.maxAlternatives = 1;      // fastest: don't compute alternatives
    r.lang            = 'en-US';

    r.onstart = () => {
      setIsRecording(true);
      setIsProcessing(false);
    };

    r.onresult = (event: SpeechRecognitionEvent) => {
      // Reset silence timer: auto-stop after SILENCE_TIMEOUT_MS of no speech
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) stopAll(true);
      }, SILENCE_TIMEOUT_MS);

      // Build the live text (final segments + current interim)
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalAccRef.current += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const live = (finalAccRef.current + interim).trim();
      // Zero-latency: write directly to DOM via callback (no React re-render)
      if (live) onInterimResultRef.current?.(live);
    };

    r.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[voice] error:', event.error, event.message);

      if (event.error === 'no-speech') {
        // Browser fired no-speech but we're still recording — just ignore,
        // the recognition will keep listening (continuous = true handles this).
        return;
      }

      const messages: Record<string, string> = {
        'not-allowed'    : 'Microphone permission denied. Click the lock icon in your browser address bar and allow microphone access.',
        'audio-capture'  : 'No microphone found. Please connect a microphone and try again.',
        'network'        : 'Network error. Voice search needs an internet connection (audio is processed by the browser\'s speech service).',
        'aborted'        : '',  // silent — triggered by our own abort()
        'service-not-allowed': 'Speech recognition service is blocked. Try using HTTPS or check browser settings.',
      };

      const msg = messages[event.error] ?? `Voice error: ${event.error}`;
      if (msg) onErrorRef.current?.(msg);

      stopAll(true);
    };

    r.onend = () => {
      // onend fires after abort() too — only commit if we weren't manually stopped
      if (isRecordingRef.current) {
        stopAll(true);
      }
    };

    recognitionRef.current = r;

    try {
      r.start();
    } catch (startErr) {
      console.error('[voice] r.start() failed:', startErr);
      onErrorRef.current?.(`Failed to start voice recognition: ${(startErr as Error).message}`);
      stopAll(false);
    }
  }, [stopAll]);

  const stopRecording = useCallback(() => stopAll(true), [stopAll]);
  const resetTranscript = useCallback(() => {
    setTranscript(null);
    finalAccRef.current = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isRecording, isProcessing, transcript, startRecording, stopRecording, resetTranscript };
}
