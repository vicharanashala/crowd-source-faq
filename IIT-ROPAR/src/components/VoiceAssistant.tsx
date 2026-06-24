import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, VolumeX, Sparkles, CornerDownRight, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";
import { faqData, FAQItem } from "../data/faqs.js";

// Audio waveform bars count
const BARS_COUNT = 15;

export default function VoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [statusMessage, setStatusMessage] = useState("Click 'Initiate Portal' to speak to Yaksha AI");
  const [voiceAnswer, setVoiceAnswer] = useState<FAQItem | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [textSpeechSupported, setTextSpeechSupported] = useState(true);
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  
  const recognitionRef = useRef<any>(null);
  const synthesisUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check speech support at startup
  useEffect(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setRecognitionSupported(false);
    }
    if (!("speechSynthesis" in window)) {
      setTextSpeechSupported(false);
    }

    return () => {
      stopVoiceAll();
    };
  }, []);

  const stopVoiceAll = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setIsListening(false);
    setIsSpeaking(false);
  };

  const handleSpeechRecognition = () => {
    stopVoiceAll();

    const SpeechRecObj = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecObj) {
      setRecognitionSupported(false);
      setStatusMessage("Speech Recognition is not supported in this iframe, using simulation mode.");
      simulateRecognition();
      return;
    }

    const rec = new SpeechRecObj();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-IN"; // Set English Indian/General

    rec.onstart = () => {
      setIsListening(true);
      setTranscript("");
      setVoiceAnswer(null);
      setStatusMessage("Yaksha is listening to your query on IIT Ropar internships...");
    };

    rec.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript;
      setTranscript(resultText);
      setStatusMessage(`Received: "${resultText}"`);
      processVoiceSearch(resultText);
    };

    rec.onerror = (err: any) => {
      console.error("Speech Recognition Error:", err);
      // Fallback message
      if (err.error === "not-allowed") {
        setStatusMessage("Microphone permission denied. Try clicking 'Run Simulation'.");
      } else {
        setStatusMessage("Speech capture interrupted. Let's try simulation mode!");
      }
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
  };

  const simulateRecognition = () => {
    setIsListening(true);
    setTranscript("");
    setVoiceAnswer(null);
    setStatusMessage("Yaksha AI is simulating voice capture...");

    const prompts = [
      "how do I upload my NOC document?",
      "where is the Rosetta Journal weekly log?",
      "tell me about Vicharanashala stipend amount",
      "what is the team limit size?",
      "when will I get my internship certificate?"
    ];
    const chosen = prompts[Math.floor(Math.random() * prompts.length)];

    setTimeout(() => {
      setTranscript(chosen);
      setStatusMessage(`Simulated voice: "${chosen}"`);
      setIsListening(false);
      processVoiceSearch(chosen);
    }, 2800);
  };

  const processVoiceSearch = (query: string) => {
    const cleanQuery = query.toLowerCase();

    // Scan faqData for best match
    let bestMatch: FAQItem | null = null;
    let maxMatchCount = 0;

    faqData.forEach((item) => {
      let currentMatches = 0;
      // Simple word token matching
      const queryWords = cleanQuery.split(/\s+/);
      queryWords.forEach((word) => {
        if (word.length > 3) {
          if (item.question.toLowerCase().includes(word) || item.answer.toLowerCase().includes(word)) {
            currentMatches++;
          }
          item.tags.forEach((tag) => {
            if (tag.toLowerCase().includes(word)) {
              currentMatches += 1.5;
            }
          });
        }
      });

      if (currentMatches > maxMatchCount) {
        maxMatchCount = currentMatches;
        bestMatch = item;
      }
    });

    if (bestMatch && maxMatchCount > 0.5) {
      setVoiceAnswer(bestMatch);
      speakResponse((bestMatch as FAQItem).answer);
    } else {
      const fallbackMsg = "I recognized your query, but could not pinpoint a direct matching FAQ. Please ask specifically about NOC, Rosetta logs, Stipends, or Certificates.";
      setStatusMessage(fallbackMsg);
      speakResponse(fallbackMsg);
    }
  };

  const speakResponse = (text: string) => {
    if (!textSpeechSupported || !window.speechSynthesis) {
      return;
    }
    // Cancel prior speech
    window.speechSynthesis.cancel();

    // Clean markdown before speaking
    const plainText = text.replace(/[*#`_\[\]]/g, "").substring(0, 180) + "...";

    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.volume = 1.0;
    utterance.rate = 1.02;
    utterance.pitch = 1.1; // Sligthly scientific high pitch

    // Find female/high quality English voice if possible
    const voices = window.speechSynthesis.getVoices();
    const optimalVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural"))) || voices[0];
    if (optimalVoice) {
      utterance.voice = optimalVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    synthesisUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  // Re-fetch voices if they weren't loaded yet
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  return (
    <div className="glass rounded-2xl p-6 md:p-8 backdrop-blur-xl relative overflow-hidden h-full flex flex-col justify-between shadow-2xl">
      
      {/* Visual background ambient lighting */}
      <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-purple-600/10 blur-3xl -z-10" />
      <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-blue-600/10 blur-3xl -z-10" />

      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="font-mono text-xs text-purple-400 font-bold uppercase tracking-widest">
              VOICE RECONGNITION CHIP v2.0
            </p>
          </div>
          <span className="bg-white/5 text-[10px] text-slate-400 font-mono px-2 py-0.5 rounded border border-white/10">
            {recognitionSupported ? "WEBSPEECH-READY" : "SIMULATION-MODE"}
          </span>
        </div>

        <h3 className="font-display text-2xl font-bold tracking-tight text-white mb-2">
          Ask Yaksha Voice Assistant
        </h3>
        <p className="text-slate-400 text-sm max-w-lg">
          Talk natively to Vicharanashala's portal to instantly lookup parameters. Try saying: 
          <em className="text-slate-200 not-italic block my-1 font-mono text-xs bg-black/40 p-1.5 rounded border border-white/5">
            "What is the stipend policy?" or "Explain the Rosetta Journal requirement."
          </em>
        </p>
      </div>

      {/* Main Interactive Stage */}
      <div className="my-8 flex flex-col items-center justify-center py-6 border border-dashed border-white/10 rounded-xl bg-white/[0.01] p-4">
        
        {/* WAVEFORM VISUALIZER */}
        <div className="h-20 flex items-end justify-center space-x-1.5 mb-6">
          {Array.from({ length: BARS_COUNT }).map((_, idx) => {
            // Random heights for voice listening animation or speaking
            let animStyle = {};
            if (isListening) {
              const delay = idx * 0.1;
              animStyle = {
                animation: `wave-active 1.2s ease-in-out infinite alternate`,
                animationDelay: `${delay}s`,
                height: "100%",
              };
            } else if (isSpeaking) {
              const delay = idx * 0.08;
              animStyle = {
                animation: `wave-speaking 0.8s ease-in-out infinite alternate`,
                animationDelay: `${delay}s`,
                height: "100%",
              };
            } else {
              animStyle = { height: "15%" };
            }

            return (
              <div
                key={idx}
                className={`w-1.5 rounded-full transition-all duration-300 ${
                  isListening
                    ? "bg-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.6)]"
                    : isSpeaking
                    ? "bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                    : "bg-slate-800"
                }`}
                style={{
                  ...animStyle,
                  width: "5px",
                }}
              />
            );
          })}
        </div>

        {/* Dynamic Waveform CSS */}
        <style>{`
          @keyframes wave-active {
            0% { height: 10%; transform: scaleY(1); }
            100% { height: 85%; transform: scaleY(1.3); }
          }
          @keyframes wave-speaking {
            0% { height: 15%; }
            100% { height: 70%; }
          }
        `}</style>

        {/* Status Prompt Information */}
        <div className="text-center max-w-sm">
          <p className="text-slate-300 text-xs font-mono mb-2">
            STATUS: <span className={isListening ? "text-purple-400 animate-pulse font-bold" : isSpeaking ? "text-cyan-400 font-bold" : "text-slate-500"}>
              {isListening ? "LISTENING" : isSpeaking ? "PLAYING AUDIO RESPONSE" : "STANDBY"}
            </span>
          </p>
          <p className="text-slate-400 text-xs bg-[#0F0F12] p-2.5 rounded-lg border border-white/5 inline-block font-medium shadow-md">
            {statusMessage}
          </p>
        </div>

        {/* Transcript read-out */}
        {transcript && (
          <div className="mt-4 w-full bg-[#050505] p-3 rounded-lg border border-white/10 text-left shadow-inner">
            <span className="text-[10px] text-purple-400 font-mono block mb-1">YOU SAID</span>
            <p className="text-slate-200 text-xs font-semibold flex items-center">
              <CornerDownRight className="h-3.5 w-3.5 text-purple-500 mr-1.5 shrink-0" />
              "{transcript}"
            </p>
          </div>
        )}
      </div>

      {/* Answer Output Grid */}
      {voiceAnswer && (
        <div className="bg-[#0F0F12]/95 backdrop-blur-xl rounded-xl p-4 border border-purple-500/35 mb-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-purple-500/10 px-2 py-0.5 text-[9px] text-purple-300 font-mono tracking-wider border-l border-b border-purple-500/20 rounded-bl">
            VOICE ASSISTANT EXCERPT
          </div>
          <span className="bg-white/5 border border-white/10 text-[10px] font-mono px-2 py-0.5 rounded text-purple-300 font-medium uppercase tracking-wider">
            {voiceAnswer.category}
          </span>
          <h4 className="font-display font-bold text-sm text-slate-100 mt-2">
            {voiceAnswer.question}
          </h4>
          <p className="text-slate-300 text-xs leading-relaxed mt-1.5 border-t border-white/5 pt-2">
            {voiceAnswer.answer}
          </p>
          
          <div className="flex items-center justify-between mt-3 text-[10px] text-slate-500 font-mono">
            <span>ID: {voiceAnswer.id}</span>
            <div className="flex items-center space-x-2 text-purple-400">
              <Volume2 className="h-3 w-3 animate-bounce" />
              <span>Speaking answer...</span>
            </div>
          </div>
        </div>
      )}

      {/* Trigger Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        
        {/* Microphone Trigger */}
        <button
          onClick={handleSpeechRecognition}
          disabled={isListening}
          className={`w-full sm:w-auto flex items-center justify-center space-x-2.5 px-6 py-3 font-display text-xs font-bold rounded-xl transition-all duration-300 cursor-pointer ${
            isListening 
              ? "bg-purple-600/20 text-purple-400 border border-purple-500/30 cursor-not-allowed" 
              : "accent-gradient text-white shadow-[0_4px_20px_rgba(139,92,246,0.35)] shadow-purple-500/20 hover:opacity-95"
          }`}
        >
          {isListening ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Yaksha is Capturing...</span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              <span>Talk to Yaksha AI</span>
            </>
          )}
        </button>

        {/* Cancel speech button */}
        {(isListening || isSpeaking) && (
          <button
            onClick={stopVoiceAll}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-3 text-xs font-bold rounded-xl border border-white/5 bg-white/5 text-slate-200 hover:bg-white/10 cursor-pointer"
          >
            <MicOff className="h-4 w-4 text-red-400" />
            <span>Mute / Interrupt</span>
          </button>
        )}

        {/* Demo/Simulate query button */}
        <button
          onClick={simulateRecognition}
          disabled={isListening}
          className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-5 py-3 text-xs font-bold rounded-xl border border-white/5 bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:bg-white/10 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isListening ? "animate-spin" : ""}`} />
          <span>Run Simulation</span>
        </button>

      </div>

    </div>
  );
}
