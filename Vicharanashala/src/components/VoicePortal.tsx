import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, MessageSquare } from 'lucide-react';

export const VoicePortal: React.FC = () => {
  const { user, triggerActivity } = useAuth();
  
  // Speech Recognition state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isSpeakingResponse, setIsSpeakingResponse] = useState(false);
  const [statusText, setStatusText] = useState('Standby. Click mic to speak.');
  
  // Audio canvas reference
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);

  // Web Audio nodes for mic visualizer
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
        setStatusText('Yaksha is listening to your voice...');
        setTranscript('');
      };

      rec.onresult = async (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        setStatusText('Transcribed. Seeking response from Yaksha...');
        await handleVoiceQuery(text);
      };

      rec.onerror = (e: any) => {
        console.error('Speech Recognition Error:', e);
        setStatusText('Yaksha misunderstood. Try clicking mic to speak again.');
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    } else {
      setStatusText('Web Speech API is not supported on this browser.');
    }

    return () => {
      // Clean up speech synthesis on unmount
      window.speechSynthesis?.cancel();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      stopMicrophoneStream();
    };
  }, []);

  // Visualizer loop (mic analyzer or mock waveform generator)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      time += 0.05;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Determine waveform source data: actual microphone or simulated wave
      let dataArray = new Uint8Array(0);
      let bufferLength = 0;

      if (analyserRef.current) {
        bufferLength = analyserRef.current.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteTimeDomainData(dataArray);
      }

      // Draw Grid Line
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.15)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Render waves (overlapping sinewaves)
      ctx.lineWidth = 2.5;
      const waveCount = 3;

      for (let w = 0; w < waveCount; w++) {
        // Map wave colors
        if (w === 0) ctx.strokeStyle = 'rgba(124, 58, 237, 0.7)'; // Violet
        else if (w === 1) ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)'; // Cyan
        else ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)'; // Rose

        ctx.beginPath();
        const amplitudeMod = w === 0 ? 1 : w === 1 ? 0.6 : 0.45;
        const frequencyMod = w === 0 ? 0.015 : w === 1 ? 0.025 : 0.009;

        for (let x = 0; x < width; x++) {
          let y = height / 2;

          if (analyserRef.current && dataArray.length > 0) {
            // Render actual Mic Waveform
            const sliceWidth = (width * 1.0) / bufferLength;
            const idx = Math.floor((x / width) * bufferLength);
            const v = dataArray[idx] / 128.0; // scale around 1
            y = (v * height) / 2;
          } else {
            // Render beautiful mock wave generator when idle/speaking
            let amp = 10; // idle wave amplitude
            let speed = time * (w === 0 ? 1.5 : w === 1 ? 1 : 2);

            if (isListening) {
              amp = 45 * amplitudeMod;
            } else if (isSpeakingResponse) {
              amp = 35 * amplitudeMod * (1 + Math.sin(time * 3) * 0.4);
            }

            const sinX = Math.sin(x * frequencyMod + speed);
            y = height / 2 + sinX * amp;
          }

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isListening, isSpeakingResponse]);

  const startMicrophoneStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
    } catch (e) {
      console.warn('Microphone permission not granted for visualizer. Using fallback visual waves.', e);
    }
  };

  const stopMicrophoneStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const startListening = async () => {
    if (!user) {
      alert('Please log in to query Yaksha AI via voice.');
      return;
    }
    if (!recognitionRef.current) {
      alert('Speech recognition is not available in your browser.');
      return;
    }

    // Cancel existing synthesis
    window.speechSynthesis?.cancel();
    setIsSpeakingResponse(false);

    await startMicrophoneStream();
    recognitionRef.current.start();
  };

  const handleVoiceQuery = async (queryText: string) => {
    stopMicrophoneStream();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: queryText }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Server error.');

      setResponse(data.response);
      setStatusText('Response received. Speaking back answers...');
      speakResponse(data.response);

      // Award +10 SP
      await triggerActivity('Ask Yaksha');
    } catch (e: any) {
      setResponse(`Error: ${e.message || 'Yaksha voice link failed.'}`);
      setStatusText('Yaksha connection severed.');
    }
  };

  const speakResponse = (text: string) => {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Choose a custom mystical voice if available, otherwise default
    const voices = window.speechSynthesis.getVoices();
    // Try to find a nice English voice
    const chosenVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices[0];
    if (chosenVoice) utterance.voice = chosenVoice;

    utterance.rate = 1.0;
    utterance.pitch = 0.95; // Slightly lower pitch for mystical tone

    utterance.onstart = () => {
      setIsSpeakingResponse(true);
    };

    utterance.onend = () => {
      setIsSpeakingResponse(false);
      setStatusText('Consultation complete. Click mic to speak again.');
    };

    utterance.onerror = (e) => {
      console.error('Speech Synthesis error:', e);
      setIsSpeakingResponse(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="bg-[#07071c]/90 rounded-2xl border border-slate-800/80 p-8 max-w-3xl mx-auto shadow-2xl relative overflow-hidden text-center space-y-6">
      
      {/* Upper Title */}
      <div>
        <h3 className="font-display font-extrabold text-white text-lg tracking-wide flex items-center justify-center gap-2">
          <Volume2 className="text-[#06B6D4]" size={20} />
          Voice Yaksha Portal
        </h3>
        <p className="text-xs text-slate-400 font-sans mt-0.5">
          Hands-free vocal Q&A with Yaksha. Speak naturally.
        </p>
      </div>

      {/* Waveform Visualization Canvas */}
      <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-4 flex items-center justify-center relative overflow-hidden">
        <canvas 
          ref={canvasRef} 
          width={650} 
          height={180} 
          className="w-full h-44 rounded-lg bg-black/20"
        />
        
        {/* Floating status label inside canvas */}
        <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
          <span className="text-[10px] font-mono tracking-widest text-[#06B6D4] uppercase font-bold bg-slate-950/80 border border-slate-850 px-2.5 py-1 rounded-full shadow-lg">
            {statusText}
          </span>
        </div>
      </div>

      {/* Main Mic Button Controls */}
      <div className="flex justify-center items-center gap-4">
        {isListening ? (
          <button
            onClick={() => recognitionRef.current?.stop()}
            className="w-16 h-16 rounded-full bg-rose-600 border border-rose-500 hover:bg-rose-500 shadow-lg shadow-rose-950/40 text-white flex items-center justify-center transition-all animate-pulse cursor-pointer"
            title="Stop listening"
          >
            <MicOff size={24} />
          </button>
        ) : (
          <button
            onClick={startListening}
            className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#06B6D4] hover:brightness-110 shadow-lg shadow-cyan-950/40 text-white flex items-center justify-center transition-all cursor-pointer border border-[#06B6D4]/30"
            title="Begin voice consultation"
          >
            <Mic size={24} />
          </button>
        )}
      </div>

      {/* Q&A Text boxes below */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left pt-4 border-t border-slate-900">
        
        {/* User Question */}
        <div className="bg-slate-950/65 border border-slate-900 rounded-xl p-4.5 space-y-2">
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-bold flex items-center gap-1">
            <MessageSquare size={12} />
            Transcribed Query
          </span>
          <p className="text-slate-350 text-xs leading-relaxed font-sans min-h-12 italic">
            {transcript || 'No vocal input captured yet. Speak in English.'}
          </p>
        </div>

        {/* Oracle Response */}
        <div className="bg-slate-950/65 border border-slate-900 rounded-xl p-4.5 space-y-2 relative">
          <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-bold flex items-center gap-1">
            <Sparkles size={12} />
            Yaksha Verbal Answer
          </span>
          <p className="text-slate-300 text-xs leading-relaxed font-sans min-h-12 max-h-40 overflow-y-auto scrollbar-thin">
            {response || 'Awaiting spoken query.'}
          </p>
          {isSpeakingResponse && (
            <span className="absolute top-4 right-4 text-[9px] font-bold text-cyan-400 uppercase bg-cyan-950/40 border border-cyan-900/30 px-1.5 py-0.5 rounded animate-pulse">
              Synthesizing Audio
            </span>
          )}
        </div>

      </div>

    </div>
  );
};

export default VoicePortal;
