import { useState, useRef, useEffect } from 'react';

interface CustomWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}

// We use `string | null` instead of plain `string` so we can distinguish:
//   null  → no recording session has completed yet (or was explicitly reset)
//   ''    → session completed with no speech detected
//   'foo' → session completed with transcript "foo"
//
// This is the key fix for the "need to refresh page" bug:
// The AskAIButton useEffect watches [transcript]. If transcript stayed as the
// same string between sessions (e.g., user said "Hello" twice), React saw no
// state change and skipped the effect. By resetting to null before each new
// session and then setting to the new string, the effect always fires.

export function useVoiceTranscription() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Accumulate all final segments across the session (multi-sentence support)
  const finalAccRef = useRef<string>('');

  const startRecording = (): void => {
    const customWindow = window as unknown as CustomWindow;
    const SpeechRecognitionCtor =
      customWindow.SpeechRecognition || customWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      alert('Your browser does not support voice transcription. Please try Google Chrome.');
      return;
    }

    // Stop any lingering session before starting a new one — prevents ghost
    // recognition instances that hold a stale ref and block the mic.
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    // Reset to null so the AskAIButton effect always fires on the new result,
    // even when the user says the exact same phrase as last time.
    setTranscript(null);
    finalAccRef.current = '';
    setIsProcessing(true);

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      // Returns text dynamically AS you speak (live preview while recording)
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            // Accumulate confirmed final sentences across the full session
            finalAccRef.current += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        // Show final + interim combined so the textarea updates in real-time
        setTranscript(finalAccRef.current + interimTranscript || null);
      };

      recognition.onstart = () => {
        setIsRecording(true);
        setIsProcessing(false);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        setIsProcessing(false);
        // Preserve whatever was captured before the error
        if (finalAccRef.current) setTranscript(finalAccRef.current);
      };

      recognition.onend = () => {
        setIsRecording(false);
        setIsProcessing(false);
        // Flush final accumulated text on natural end so AskAIButton picks it up
        if (finalAccRef.current) setTranscript(finalAccRef.current);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start voice stream:', err);
      setIsProcessing(false);
    }
  };

  const stopRecording = (): void => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  /** Call this after the query has been submitted to clear stale transcript. */
  const resetTranscript = (): void => {
    setTranscript(null);
    finalAccRef.current = '';
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  return {
    isRecording,
    isProcessing,
    transcript,
    startRecording,
    stopRecording,
    resetTranscript,
  };
}
