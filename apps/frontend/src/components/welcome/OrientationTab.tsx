import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';

interface Orientation {
  _id: string;
  title: string;
  description: string;
  videoUrl: string;
  transcript: string;
  // v1.68 — onboarding CMS (PR #62) added the transcript
  // AI assistant tab; the schema sets this to true when
  // the orientation has a non-empty transcript. Frontend
  // gates the "Transcript AI Active" badge on this flag
  // (OrientationTab.tsx:322).
  transcriptAvailable: boolean;
  completionThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TranscriptLine {
  timeSeconds: number;
  text: string;
}

function parseTranscript(raw: string): TranscriptLine[] {
  const lines = raw.split('\n');
  const result: TranscriptLine[] = [];
  const regex = /^\[(\d{2}):(\d{2})\]\s*(.*)$/;
  
  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      result.push({
        timeSeconds: minutes * 60 + seconds,
        text: match[3]
      });
    } else if (line.trim()) {
      result.push({ timeSeconds: 0, text: line });
    }
  }
  return result.sort((a, b) => a.timeSeconds - b.timeSeconds);
}

export default function OrientationTab() {
  const { isAuthenticated } = useAuth();
  const [orientation, setOrientation] = useState<Orientation | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [asking, setAsking] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const { fetchUser, user } = useAuth();
  
  const completedRef = useRef(false);
  const lastTimeRef = useRef(0);
  const watchedSecondsRef = useRef(0);
  const lastPromptedSecondsRef = useRef(-1);

  const parsedTranscript = useMemo(() => {
    if (!orientation?.transcript) return [];
    return parseTranscript(orientation.transcript);
  }, [orientation]);

  // Active line calculation
  const activeLineIndex = useMemo(() => {
    if (parsedTranscript.length === 0) return -1;
    for (let i = parsedTranscript.length - 1; i >= 0; i--) {
      if (currentTime >= parsedTranscript[i].timeSeconds) {
        return i;
      }
    }
    return 0;
  }, [currentTime, parsedTranscript]);

  useEffect(() => {
    // Auto scroll transcript
    if (transcriptRef.current && activeLineIndex !== -1) {
      const activeEl = transcriptRef.current.children[activeLineIndex] as HTMLElement;
      if (activeEl) {
        transcriptRef.current.scrollTo({
          top: activeEl.offsetTop - transcriptRef.current.offsetHeight / 2 + activeEl.offsetHeight / 2,
          behavior: 'smooth'
        });
      }
    }
  }, [activeLineIndex]);

  useEffect(() => {
    const fetchOrientation = async () => {
      try {
        const res = await api.get('/welcome/orientation');
        setOrientation(res.data);
      } catch (error) {
        console.error('Error fetching orientation', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrientation();
  }, []);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      const duration = videoRef.current.duration;
      
      const delta = time - lastTimeRef.current;
      const isSecondViewing = localStorage.getItem('orientationAttempted') === 'true';
      
      if (isSecondViewing) {
        // Just track highest time seen, natively supporting skipping and scrubbing
        watchedSecondsRef.current = Math.max(watchedSecondsRef.current, time);
      } else {
        // Only accumulate if the delta is positive and less than 1.5 seconds (prevents seeking on first try)
        if (delta > 0 && delta < 1.5) {
          watchedSecondsRef.current += delta;
        }
      }

      lastTimeRef.current = time;
      setCurrentTime(time);
      
      // Check completion threshold. If second viewing, we don't strictly enforce new watch progress.
      const threshold = orientation?.completionThreshold ? orientation.completionThreshold / 100 : 0.9;
      if (
        duration && 
        watchedSecondsRef.current >= duration * threshold && 
        !completedRef.current && 
        !user?.orientationCompleted && 
        (isSecondViewing || watchedSecondsRef.current > lastPromptedSecondsRef.current + 10)
      ) {
        completedRef.current = true;
        setShowCompleteModal(true);
        videoRef.current.pause();
      }
    }
  };

  const handleCompleteYes = async () => {
    try {
      await api.post('/welcome/orientation-complete');
      await fetchUser(); // Update user context, which will trigger the Project Selection in parent
      setShowCompleteModal(false);
    } catch (error) {
      console.error('Error completing orientation', error);
      alert('Failed to complete orientation. Please try again.');
    }
  };

  const handleCompleteNo = () => {
    setShowCompleteModal(false);
    completedRef.current = false; // allow it to trigger again later if needed
    watchedSecondsRef.current = 0; // reset watch progress for this attempt
    lastPromptedSecondsRef.current = 0;
    lastTimeRef.current = 0;
    localStorage.setItem('orientationAttempted', 'true'); // Flag second viewing
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  };

  const jumpToTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  const handleAskQuestion = async (e: React.FormEvent | string) => {
    if (typeof e !== 'string') e.preventDefault();
    const userQ = typeof e === 'string' ? e : question;
    if (!userQ.trim() || !orientation) return;
    
    setQuestion('');
    setChatHistory(prev => [...prev, { role: 'user', text: userQ.trim() }]);
    setAsking(true);

    try {
      const res = await api.post('/welcome/orientation/ask', {
        orientationId: orientation._id,
        question: userQ.trim()
      });
      setChatHistory(prev => [...prev, { role: 'ai', text: res.data.answer }]);
    } catch (error) {
      console.error('Error asking question', error);
      setChatHistory(prev => [...prev, { role: 'ai', text: 'Sorry, there was an error processing your question.' }]);
    } finally {
      setAsking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!orientation) {
    return <div className="text-center py-20 text-ink-soft">No active orientation found.</div>;
  }

  const videoSource = orientation.videoUrl.startsWith('http') 
    ? orientation.videoUrl 
    : `http://localhost:6767${orientation.videoUrl}`;

  const suggestions = [
    "How does the contribution process work?",
    "What is the first step for new contributors?",
    "Who reviews the pull requests?"
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      
      {/* LEFT COLUMN: Media Player & Transcript */}
      <div className="flex-1 space-y-6">
        
        {/* Glass Video Player */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="spatial-glass p-2 rounded-[32px]"
        >
          <div className="relative rounded-[28px] overflow-hidden bg-[rgb(var(--bg-primary-rgb))]/60 aspect-video group shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] border border-[rgb(var(--border-rgb))]/5">
            <video 
              ref={videoRef}
              src={videoSource}
              onTimeUpdate={handleTimeUpdate}
              controls
              className="w-full h-full object-contain"
              controlsList="nodownload"
            />
          </div>
          <div className="p-4 sm:p-6 pb-2">
            <h2 className="text-2xl font-serif font-bold text-ink mb-2 text-glow-spatial">{orientation.title}</h2>
            <p className="text-ink-soft text-sm mb-4 leading-relaxed ">{orientation.description}</p>
            <div className="flex flex-wrap gap-2">
              <span className="spatial-glass-subtle px-3 py-1 text-xs text-ink-soft rounded-full">
                {new Date(orientation.createdAt).toLocaleDateString()}
              </span>
              <span className="spatial-glass-subtle px-3 py-1 text-xs text-accent rounded-full border border-accent/30 shadow-[0_0_10px_rgb(var(--accent-rgb)_/_0.2)]">
                Official Onboarding
              </span>
            </div>
          </div>
        </motion.div>

        {/* Synced Transcript */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="spatial-glass rounded-[32px] p-6 flex flex-col h-[350px]"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-ink-soft uppercase tracking-widest flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_10px_rgb(var(--accent-rgb)_/_0.6)]" />
              Spatial Transcript
            </h3>
          </div>
          
          <div 
            ref={transcriptRef}
            className="flex-1 overflow-y-auto pr-4 space-y-4 scroll-smooth"
            style={{ scrollbarWidth: 'thin' }}
          >
            {parsedTranscript.map((line, idx) => {
              const isActive = idx === activeLineIndex;
              return (
                <div 
                  key={idx} 
                  onClick={() => jumpToTime(line.timeSeconds)}
                  className={`group w-full flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition-all duration-300 ${
                    isActive ? 'spatial-glass-subtle bg-[rgb(var(--text-primary-rgb))]/5 border border-[rgb(var(--border-rgb))]/20 shadow-[0_10px_30px_rgba(0,0,0,0.3)]' : 'hover:bg-[rgb(var(--text-primary-rgb))]/5 border border-transparent'
                  }`}
                >
                  <span className={`text-xs font-mono mt-0.5 ${isActive ? 'text-accent font-bold text-glow-accent-spatial' : 'text-ink-soft'}`}>
                    {Math.floor(line.timeSeconds / 60).toString().padStart(2, '0')}:
                    {(line.timeSeconds % 60).toString().padStart(2, '0')}
                  </span>
                  <p className={`text-sm leading-relaxed transition-colors duration-400  ${isActive ? 'text-ink text-glow-spatial' : 'text-ink-soft'}`}>
                    {line.text}
                  </p>
                </div>
              );
            })}
            {parsedTranscript.length === 0 && (
              <p className="text-ink-soft text-sm">No transcript available.</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* RIGHT COLUMN: AI Chat */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="w-full lg:w-[420px] flex flex-col"
      >
        <div className="spatial-glass rounded-[32px] flex flex-col h-[650px] lg:h-full overflow-hidden relative shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          
          <div className="p-6 border-b border-[rgb(var(--border-rgb))]/10 bg-[rgb(var(--text-primary-rgb))]/5 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/30 to-transparent flex items-center justify-center text-accent shadow-[0_0_20px_rgb(var(--accent-rgb)_/_0.4)] border border-accent/30 relative">
                <div className="absolute inset-0 rounded-full border border-accent/20 animate-ping opacity-20"></div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                  <path d="M12 12 2.1 16.9" />
                  <path d="M12 12l9.9 4.9" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-serif font-bold text-ink text-glow-spatial leading-tight">AI Assistant</h3>
                {orientation.transcriptAvailable && (
                <div className="text-[11px] text-accent flex items-center gap-1.5 mt-1 font-semibold uppercase tracking-widest text-glow-accent-spatial">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></div>
                  Transcript AI Active
                </div>
              )}</div>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto space-y-6 flex flex-col">
            <AnimatePresence>
              {chatHistory.map((chat, idx) => (
                <motion.div 
                  key={idx} 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] rounded-[24px] px-5 py-4 text-[14px] leading-relaxed  ${
                    chat.role === 'user' 
                      ? 'spatial-chat-user text-ink rounded-tr-sm' 
                      : 'spatial-chat-ai text-ink rounded-tl-sm shadow-[0_10px_20px_rgb(var(--accent-rgb)_/_0.1)]'
                  }`}>
                    {chat.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {asking && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="spatial-chat-ai rounded-[24px] rounded-tl-sm px-6 py-5 flex items-center gap-2">
                  <div className="w-2 h-2 bg-accent rounded-full animate-bounce shadow-[0_0_8px_rgb(var(--accent-rgb)_/_0.8)]" />
                  <div className="w-2 h-2 bg-accent rounded-full animate-bounce delay-75 shadow-[0_0_8px_rgb(var(--accent-rgb)_/_0.8)]" />
                  <div className="w-2 h-2 bg-accent rounded-full animate-bounce delay-150 shadow-[0_0_8px_rgb(var(--accent-rgb)_/_0.8)]" />
                </div>
              </motion.div>
            )}

            {chatHistory.length === 0 && !asking && (
              <div className="flex-1 flex flex-col justify-center items-center">
                <p className="text-ink font-medium text-sm mb-8">Ask me anything about the video.</p>
                <div className="flex flex-col gap-3 w-full">
                  {suggestions.map((sug, i) => (
                    <button
                      key={i}
                      onClick={() => handleAskQuestion(sug)}
                      className="spatial-glass-subtle py-3 px-5 text-[13px] text-ink text-left rounded-2xl hover:bg-[rgb(var(--text-primary-rgb))]/10 transition-all border border-[rgb(var(--border-rgb))]/10 hover:border-[rgb(var(--border-rgb))]/30 hover:shadow-[0_10px_20px_rgba(0,0,0,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isAuthenticated ? (
            <div className="p-5 border-t border-[rgb(var(--border-rgb))]/20 bg-[rgb(var(--bg-primary-rgb))]/80 backdrop-blur-2xl">
              <form onSubmit={handleAskQuestion} className="relative flex items-center">
                <input
                  type="text"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full spatial-glass-subtle bg-[rgb(var(--text-primary-rgb))]/5 border border-[rgb(var(--border-rgb))]/20 rounded-full pl-6 pr-14 py-4 text-sm text-ink placeholder-[rgb(var(--text-primary-rgb))]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus:bg-[rgb(var(--text-primary-rgb))]/10 transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)]"
                  disabled={asking}
                />
                <button
                  type="submit"
                  disabled={!question.trim() || asking}
                  className="absolute right-2 w-10 h-10 flex items-center justify-center bg-accent text-[rgb(var(--bg-primary-rgb))] rounded-full hover:bg-[rgb(var(--text-primary-rgb))] hover:text-[rgb(var(--bg-primary-rgb))] disabled:opacity-20 disabled:hover:bg-accent transition-all shadow-[0_0_15px_rgb(var(--accent-rgb)_/_0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--bg-primary-rgb))] focus-visible:ring-accent"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            </div>
          ) : (
            <div className="p-6 border-t border-[rgb(var(--border-rgb))]/20 bg-[rgb(var(--bg-primary-rgb))]/80 text-center backdrop-blur-2xl">
              <p className="text-sm text-ink-soft">Please sign in to use the AI assistant.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Orientation Complete Modal */}
      <AnimatePresence>
        {showCompleteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-[rgb(var(--bg-card-rgb))] border border-[rgb(var(--border-rgb))]/40 rounded-2xl shadow-2xl p-8 text-center"
            >
              <h2 className="text-2xl font-serif text-ink mb-4">Orientation Complete?</h2>
              <p className="text-ink-soft mb-8">
                Have you finished watching the orientation?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleCompleteYes}
                  className="w-full py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors"
                >
                  Yes, I am done
                </button>
                <button
                  onClick={handleCompleteNo}
                  className="w-full py-3 bg-bg border border-border text-ink-soft font-medium rounded-lg hover:bg-bg/80 transition-colors"
                >
                  Not yet
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
